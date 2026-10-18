# FR-RCP-004 — Hoàn thiện cập nhật công thức và phân quyền

Ngày kiểm tra: 16/10/2026.
Nhánh bàn giao: `2312778-PhanThiBaoTram-capnhatcongthuc` (nhánh cũ theo yêu cầu của người dùng).
Bản sửa ban đầu dựa trên `origin/main` tại `0452d23`; sau đó được chuyển nguyên commit vào nhánh cũ. Nhánh cũ đã ghép main mới nhất và giữ commit `120c94e` của người dùng. Chồng lấn trang tạo mới được giải quyết bằng cách giữ luồng tạo sẵn có trên nhánh cũ; UnitOfWork giữ cách xử lý giao dịch/context mới từ main.

## Căn cứ và phạm vi

Đối chiếu `Culinary_Blog_Spec.md`: mục 2 (RBAC, ownership tại Application), 3.2 (vòng đời và slug), 3.7 (RowVersion), 4 (cache), 6 (API và mã lỗi), 7.3.6 và checklist 12.

- Author chỉ sửa công thức của mình; Admin sửa được công thức của tác giả khác.
- Guest bị chặn; tài khoản có vai trò khác không được cập nhật.
- Vi phạm ownership trả 403; công thức thiếu/xóa mềm trả 404.
- Cập nhật phải có RowVersion qua body hoặc If-Match. Phiên bản cũ trả 409, không ghi đè dữ liệu mới.
- Chỉ sửa Title, Description, Instructions legacy, PrepTime, CookTime, Servings, Difficulty và CategoryId.
- Giữ nguyên ID, tác giả, slug, trạng thái, PublishedAt, thời gian tạo và toàn bộ nguyên liệu/bước/ảnh/dinh dưỡng. Đổi tên công thức Published không đổi URL.
- Không tự publish/unpublish khi lưu nội dung; Draft, Published và Archived đều giữ nguyên trạng thái hiện tại.

## Phát hiện trước khi sửa

1. Endpoint đã có AuthorPolicy và kiểm tra owner nhưng use case chưa bảo vệ quyền tại Application như đặc tả yêu cầu.
2. Chưa kiểm tra enum Difficulty. Việc parse version ưu tiên body và bỏ qua If-Match khi cả hai khác nhau; chưa kiểm soát rõ wildcard, weak ETag và nhiều ETag.
3. API tải cả aggregate với các collection để sửa vài trường cơ bản. Chưa giữ category khỏi bị xóa mềm giữa bước kiểm tra và ghi dữ liệu.
4. Giao diện cho nhập Category ID thủ công, thiếu validation đầy đủ và trạng thái lưu thành công; 409 chỉ báo lỗi, chưa có thao tác tải bản mới.
5. Chưa chặn submit kép ngay lập tức, thay đổi field trong khi request đang lưu và hiển thị form sửa bài Published của tác giả khác.

## Hiện thực

### Backend

- Thêm `UpdateRecipeCommand`, validator, handler, `RecipeUpdateVersion` và contract `IRecipeUpdateStore` trong thư mục use case riêng.
- Handler kiểm tra đăng nhập, Author/Admin và ownership; kiểm tra quyền trước khi parse version của resource. Admin bypass ownership, không thay AuthorId.
- Validator kiểm tra title sau trim 3–200 ký tự, description tối đa 2.000, instructions tối đa 10.000, category khác Guid.Empty, Difficulty hợp lệ, thời gian không âm và servings dương. Thời gian/servings dùng số nguyên của contract hiện có.
- Version được giải mã Base64 có giới hạn kích thước. Header nhận một strong ETag có dấu nháy kép; từ chối `*`, weak ETag, danh sách ETag và Base64 sai. Nếu body/header cùng có mặt thì phải cùng phiên bản. Lỗi version đầu vào trả 422; phiên bản hợp lệ nhưng cũ trả 409.
- `RecipeUpdateStore` chỉ đọc root và owned nutrition, không tải các collection khi cập nhật. Mỗi lần retry dùng context/transaction mới; kiểm tra RowVersion hiện tại và vẫn đặt OriginalValue để EF bảo vệ race xảy ra sau lần đọc.
- Kiểm tra actor còn hoạt động và category tồn tại/chưa xóa mềm trong transaction; giữ khóa đọc hàng actor/category đến khi commit. Chỉ copy các trường được sửa, không attach hoặc thay thế dữ liệu con do client gửi.
- Giữ version vừa ghi để có thể nhận ra lần commit trước đã thành công nhưng acknowledgement bị mất. Kiểm thử tự động đã bao phủ retry SQLSTATE 40001; nhánh mất acknowledgement chưa được fault-inject riêng.
- Endpoint PUT gửi command qua MediatR, trả success wrapper `{ data: { message, id, slug, rowVersion } }` theo API contract và ETag mới. HTTP 200/401/403/404/409/422 giữ tương thích.
- Detail GET theo ID/slug và search trả `Cache-Control: no-store` để không phục vụ dữ liệu cũ qua HTTP shared cache sau khi sửa. Main hiện chưa có pipeline Redis cache tags chung; thay đổi này không giả lập việc invalidate tag hay tuyên bố đã hoàn thiện cache Redis toàn hệ thống. SearchVector tiếp tục được PostgreSQL trigger hiện có cập nhật.
- Đồng bộ schema/migration cho `Instructions` nullable theo đặc tả; không thay luồng tạo, child CRUD hoặc publish/archive/delete.

### Frontend

- Thêm layout kiểm tra phiên/role tại server và kiểm tra owner/Admin trước khi hiển thị form ở client. Quyền quyết định cuối cùng vẫn thuộc API/Application.
- Thêm `validateRecipeUpdate` dùng trước khi gửi request; giữ mọi truy cập API trong module `lib/api` hiện có.
- Thay Category ID bằng danh sách chọn, có báo lỗi tải danh mục và xử lý danh mục hiện tại không còn khả dụng.
- Form hỗ trợ submit; dùng ref chống gửi kép ngay trong cùng lượt xử lý; khóa field trong khi lưu và tránh lưu đồng thời với thao tác xóa.
- Hiển thị lỗi RFC 7807, lỗi 401/403/404/409 và thông báo lưu thành công. Giữ dữ liệu đang nhập khi API báo lỗi.
- Sau 409, khóa lưu tiếp cho đến khi người dùng chủ động chọn “Tải bản mới (bỏ thay đổi đang nhập)”. Không tự lấy version mới rồi ghi đè bằng form cũ.
- Sau lưu thành công, giữ version mới cho lần lưu sau và đồng bộ lại snapshot nội dung. Bỏ qua response lưu nếu người dùng đã chuyển sang recipe khác.

## Kết quả kiểm chứng

| Kiểm tra | Kết quả |
|---|---|
| Backend solution build | Thành công, không warning/error |
| `CulinaryBlog.RecipeUpdate.Tests` | 20/20 đạt |
| Bộ hồi quy `CulinaryBlog.Observability.Tests` | 35/35 đạt |
| Frontend payload + Chrome component checks | Đạt |
| Frontend lint | Đạt |
| Frontend production build | Đạt |
| `git diff --check` | Không lỗi whitespace |

Integration test dùng JWT ký thật, PostgreSQL thật, database tạm tên `fr_rcp004_test_<guid>` và migration hiện có; chỉ cho phép kết nối localhost/127.0.0.1, xóa database tạm sau test. Bao phủ:

- Guest 401, role khác 403, Author khác 403, owner cập nhật và Admin sửa bài người khác thành công.
- Body version/header version, header/body không khớp, thiếu/sai version, stale version và hai PUT đồng thời chỉ một request thành công.
- Validation enum/title/servings, category thiếu/xóa mềm, tài khoản không hoạt động và recipe xóa mềm.
- Giữ nguyên owner/slug/status/PublishedAt và child data khi client gửi các trường giả mạo.
- Lưu các trạng thái Published/Archived/Draft không đổi trạng thái; đọc lại nhận nội dung mới và no-store.
- Rollback khi trigger UPDATE báo lỗi; retry giao dịch sau SQLSTATE 40001.

Chrome chạy component React thật với API/Auth/Router được stub: owner/Admin xem form, Author khác không có form; chặn số phút lẻ; hiện lỗi 422 và giữ input; 409 chặn lưu, tải bản mới rồi lưu bằng version mới; submit kép chỉ một request; lần lưu kế tiếp dùng version response trước. Đây là kiểm thử component, chưa phải E2E đăng nhập với backend/MinIO thật.

Lần build đầu bị chặn tải Google Fonts trong sandbox mạng; đã build lại với quyền mạng. Kết quả ghép thử tạm từng mang đuôi `.tsx` bị TypeScript quét nhầm; đã đổi sang `.txt` trong thư mục build được ignore và build lại thành công. Không sửa cấu hình TypeScript để che lỗi.

## Chạy lại

Tại repository root, cung cấp kết nối admin PostgreSQL cục bộ qua biến môi trường `RECIPE_UPDATE_TEST_CONNECTION`, không ghi credential vào repository:

```powershell
dotnet test Culinary_Blog_Nhom5/tests/CulinaryBlog.RecipeUpdate.Tests/CulinaryBlog.RecipeUpdate.Tests.csproj
dotnet test Culinary_Blog_Nhom5/tests/CulinaryBlog.Observability.Tests/CulinaryBlog.Observability.Tests.csproj
dotnet build Culinary_Blog_Nhom5/Culinary_Blog_Nhom5.sln
```

Tại `Culinary_Blog_Nhom5/culinary-blog-web`:

```powershell
node tests/updateRecipe.cjs
# Playwright cần được cài sẵn; có thể đặt PLAYWRIGHT_MODULE thành đường dẫn module nếu dùng runtime ngoài project.
node tests/updateRecipe.cjs --browser
npm run lint
npm run build
```

Project test mới chạy bằng lệnh riêng ở trên; không thay solution để tránh chồng lấn với các project test của nhánh khác.

## Kiểm tra chồng lấn và hướng tích hợp

Các thay đổi được giữ trên nhánh riêng từ main. Phần lớn logic mới nằm trong file riêng, phần PUT trong endpoint cũ được thay bằng delegate đến use case. Đăng ký DI đặt cạnh AuditInterceptor để không chồng với đăng ký use case tạo, ingredient hoặc Welcome Email.

Đã dùng `git merge-file` với merge-base thực tế để kiểm tra ba file chung: RecipeEndpoints, DependencyInjection và trang edit. Không merge các chức năng khác vào nhánh này, không thay index/HEAD trong bước kiểm tra:

| Nhánh remote đang mở | Các file chung ở ref đã kiểm tra |
|---|---|
| FR-RCP-003 tạo công thức | Ghép tự động được |
| FR-JOB-001 Welcome Email | Ghép tự động được |
| FR-JOB-002 Image Resize | Ghép tự động được |
| Quản lý ảnh công thức | Còn chồng lấn editor và một dòng cache search |
| Quản lý nguyên liệu | Còn chồng lấn editor |

Khi ghép nhánh ảnh/nguyên liệu:

1. Giữ `ImageGalleryManager`/`IngredientManager`, callback quản lý version và các API child tương ứng. Giữ validation, role/ownership guard, xử lý 409, chống submit kép, thông báo lưu và chọn category của FR-RCP-004.
2. Trong effect tải recipe, giữ `activeRecipeId` và thêm reset loading/error/conflict khi tải lại; dependencies gồm `params, reload`. Giữ cleanup xóa activeRecipeId. Kết hợp import của hai phía.
3. Trong save, dùng payload đã validation; cập nhật cả form version và snapshot nội dung bằng payload này. Callback child không được tự thay version cho form nếu phát hiện nội dung recipe đã đổi ở nơi khác; trường hợp đó phải yêu cầu tải lại.
4. Nếu child manager có form riêng, đặt manager ngoài form sửa thông tin cơ bản để không tạo nested form. Giữ snapshot và ref của cùng recipe khi xử lý callback bất đồng bộ.
5. Cache search giữ `no-store`; không chọn lại `public, max-age=60`/header yếu hơn trong khi chưa có invalidation chung. API PUT giữ command và toàn bộ các endpoint quản lý ảnh/nguyên liệu của nhánh kia.
6. Chạy lại test của cả hai chức năng, backend build, frontend lint/build sau ghép. Không chọn toàn bộ ours/theirs làm mất chức năng.

Đây là kết quả tại các remote ref hiện có; không bảo đảm commit tương lai không gây conflict. Trước khi push/PR cần fetch và đối chiếu lại origin/main theo CONTRIBUTING.md; chỉ stage file thuộc FR-RCP-004, không stage build/obj/bin, credential hoặc cấu hình cá nhân.
