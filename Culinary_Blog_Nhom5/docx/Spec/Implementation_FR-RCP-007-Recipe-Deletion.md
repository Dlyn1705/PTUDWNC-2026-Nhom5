# FR-RCP-007 — Hoàn thiện xóa công thức

Ngày kiểm tra: 17/10/2026.

## Căn cứ và phạm vi

- Đặc tả: [Culinary_Blog_Spec.md](Culinary_Blog_Spec.md), mục 3.7, bảng API Recipes và checklist xóa công thức.
- Làm tiếp trên nhánh có sẵn `2312778-PhanThiBaoTram-quanlycongthuc`, đã cập nhật `origin/main` tại `a93215a`; đổi tên thành `2312778-PhanThiBaoTram-xoacongthuc` theo yêu cầu bàn giao.
- API giữ nguyên `DELETE /api/v1/recipes/{id}`. Không đổi request contract, không thêm migration hoặc sửa các interface repository/UnitOfWork dùng chung.

## Kết quả rà soát và sửa lỗi

| Nội dung | Trước khi sửa | Hành vi sau khi sửa |
|---|---|---|
| Phân quyền | Endpoint yêu cầu Author/Admin; handler kiểm tra owner | Kiểm tra thêm phiên đăng nhập và vai trò ở Application; chỉ Author sở hữu hoặc Admin được xóa |
| Công thức thuộc danh mục đã xóa | Truy vấn chi tiết Include Category có thể làm công thức bị ẩn bởi filter của danh mục | Đọc riêng Recipe để chủ sở hữu vẫn xóa được; công thức đã xóa hoặc ID không tồn tại trả 404 |
| Xóa mềm | Đã có `Recipe.SoftDelete()` | Giữ `IsDeleted=true`, `Status=Archived`, `UpdatedAt=UTC`; trả 204, giữ nguyên ảnh/nguyên liệu/bước và kiểm thử ba trạng thái Draft/Published/Archived |
| Cache | Handler chưa vô hiệu hóa cache | Sau khi SaveChanges thành công, gọi `IRecipeCacheInvalidator` theo ID/slug và version của tập kết quả; không gọi nếu phân quyền hoặc lưu DB thất bại |
| Cache giao diện | Xóa từ editor chưa invalidation danh sách; HTML công khai cho phép cache 60 giây và stale thêm 300 giây | Invalidate React Query `managed-recipes`, replace về danh sách và refresh; HTML chứa công thức ở trang chủ/recipes/search/categories/sitemap dùng `private, no-store` |
| Xung đột dữ liệu | UnitOfWork đã chuyển EF concurrency thành ConflictException | Giữ cơ chế đó, công bố 409 trong metadata endpoint; frontend yêu cầu người dùng tải lại, không tự ghi đè |
| Dọn dữ liệu | Chỉ lấy 100 công thức trong mỗi lần chạy; dùng chung tracker cho cả lô | Duyệt hết các lô 100; context mới cho từng bản ghi và từng execution-strategy retry; lỗi một công thức không làm công thức khác bị lưu/xóa ngoài ý muốn |
| An toàn purge | Chọn công thức rồi xóa file và DB | Khóa hàng Recipe trong transaction và kiểm tra lại điều kiện đã xóa/quá 30 ngày trước khi xóa file; lấy cả metadata ảnh đã xóa mềm; xóa các URL original/medium/thumbnail duy nhất rồi cascade DB |
| Retry | Hangfire đã retry 3 lần | Giữ retry 3 lần và lịch tuần; giữ metadata nếu storage/DB lỗi, xử lý các công thức khác rồi báo AggregateException; có thể gọi lại khi object đã bị xóa |
| Hộp thoại | Overlay tự dựng; dễ gửi lặp | Dùng AlertDialog có quản lý focus/bàn phím; Hủy/Escape trước khi gửi; khóa xác nhận/hủy khi đang gửi; ref chặn hai click trước khi React render |
| Editor | IngredientManager và ImageGalleryManager cùng key `recipeId` | Dùng key có tiền tố riêng, tránh nhân đôi khối nguyên liệu khi mở/đóng hộp thoại hoặc xử lý lỗi xóa |

## Kiểm thử đã thực hiện

### Backend — PostgreSQL và MinIO thật

Project mới `tests/CulinaryBlog.RecipeDeletion.Tests`: **14 test đạt, không skip**.

- 401 khi chưa đăng nhập; 403 với Reader hoặc tác giả khác; Owner/Admin xóa thành công.
- HTTP 204 không có body; cập nhật cờ/trạng thái/thời điểm; giữ nguyên children; GET bằng ID/slug và DELETE lại trả 404.
- Có thể tạo công thức mới cùng slug sau xóa mềm nhờ partial unique index.
- Danh mục đã xóa không ngăn xóa công thức.
- Hai context sửa cùng Recipe gây 409, không xóa và không invalidation cache.
- Giữ công thức mới xóa, không purge công thức chỉ Archived; xóa cascade Steps/Ingredients/Images của công thức quá hạn, kể cả ảnh có IsDeleted=true.
- Lô 102 công thức vẫn dọn đủ các bản ghi hợp lệ khi một bản ghi lỗi; storage khôi phục thì retry thành công.
- Trigger PostgreSQL gây lỗi DELETE ở một công thức: transaction rollback và metadata giữ lại, công thức khác vẫn được dọn, lần chạy sau thành công.
- Upload ba object vào bucket MinIO tên ngẫu nhiên: sau DELETE và purge trước hạn vẫn đọc đủ; sau khi đặt thời điểm xóa quá 31 ngày, purge trả 404 cho cả ba object; chạy lại an toàn.

API integration dùng TestServer và authentication handler chỉ trong project test; vẫn chạy authorization policy, MediatR, UnitOfWork, EF interceptor và PostgreSQL thật. Kiểm tra cache của handler dùng recording invalidator; không giả định đã kiểm thử Redis outage. Schema test được tạo bằng EnsureCreated trong database mới, không phải kiểm thử nâng cấp migration trên dữ liệu cũ.

Mỗi test tạo database `fr_rcp007_test_<guid>` riêng rồi tự xóa. Test MinIO chỉ dùng/xóa bucket `fr-rcp007-test-<guid>` của chính nó. Không đụng dữ liệu nghiệp vụ hay bucket ứng dụng.

### Frontend — Chrome và Next.js production

Runner mới `culinary-blog-web/tests/recipe-deletion.e2e.cjs` chạy thành công:

- Hủy xóa từ danh sách; Hủy và Escape từ editor không gửi DELETE.
- Thông báo 403/404/409/500; đóng modal sau lỗi để thấy thông báo và có thể thử lại.
- Hai click đồng thời chỉ tạo một request; chặn Hủy/Escape trong lúc request đang chờ.
- 204 chuyển về danh sách rỗng và refetch danh sách đã có trong React Query cache.
- Không nhân đôi IngredientManager sau nhiều lần render lỗi.
- Response trang tìm kiếm có `Cache-Control: no-store`.
- Không có JavaScript pageerror. Đã xem ảnh xác nhận xóa và kiểm tra bố cục.

Runner khởi động server Next riêng ở cổng ngẫu nhiên, dùng session mã hóa bằng secret ngẫu nhiên của test và mock HTTP recipe API tại browser. Đây là E2E giao diện thực, không phải một bài full-stack nối browser trực tiếp vào PostgreSQL/MinIO; phần backend/storage được kiểm tra riêng ở trên. Không thêm đường tắt xác thực vào production.

### Build và hồi quy

- Backend solution build: **0 warning, 0 error**.
- Observability/API regression: **44/44 đạt**.
- Backend security: **10/10 đạt**.
- Frontend security/cache unit: **24/24 đạt**, gồm 7 URL công khai không cache công thức đã xóa.
- Frontend logging: **9/9 đạt**.
- Frontend lint, TypeScript và production build: đạt.
- `git diff --check`: đạt.

Tổng cộng **101 test tự động đạt**, cộng runner Chrome cho FR-RCP-007.

## Chạy lại

Tại thư mục gốc repository, cung cấp connection PostgreSQL có quyền tạo database thử nghiệm và thông tin MinIO cục bộ qua biến môi trường; không commit giá trị bí mật:

```powershell
$env:RECIPE_DELETION_TEST_CONNECTION = '<connection PostgreSQL thử nghiệm>'
$env:RECIPE_DELETION_TEST_MINIO_USER = '<MinIO access key thử nghiệm>'
$env:RECIPE_DELETION_TEST_MINIO_PASSWORD = '<MinIO secret key thử nghiệm>'
dotnet test .\Culinary_Blog_Nhom5\tests\CulinaryBlog.RecipeDeletion.Tests\CulinaryBlog.RecipeDeletion.Tests.csproj
dotnet build .\Culinary_Blog_Nhom5\Culinary_Blog_Nhom5.sln

Set-Location .\Culinary_Blog_Nhom5\culinary-blog-web
npm run lint
npm run test:security
npm run test:logging
npm run build
node tests/recipe-deletion.e2e.cjs
```

Runner mặc định dùng Chrome đã cài. CI có thể cài Playwright Chromium và đặt `E2E_BROWSER_CHANNEL=bundled`. Ảnh sinh ra ở `culinary-blog-web/build/recipe-deletion-e2e/` được ignore, không commit. Project test mới chạy bằng lệnh riêng ở trên; không sửa solution dùng chung để hạn chế xung đột.

## Lưu ý vận hành và tích hợp

- Lịch tuần `purge-deleted-recipes` trong Program.cs và retry 3 lần đã có, giữ nguyên. Điều kiện là quá 30 ngày, không hứa xóa vật lý đúng thời điểm tròn ngày thứ 30.
- Tiếp tục dùng UpdatedAt làm thời điểm xóa theo model hiện tại; không bổ sung API khôi phục công thức đã xóa. Archive/Unarchive là chức năng khác và không được xem như xóa mềm.
- DELETE không bổ sung If-Match bắt buộc; đặc tả yêu cầu version cho cập nhật Recipe. EF phát hiện cạnh tranh xảy ra giữa lúc đọc và lưu DELETE, trả 409 để người dùng kiểm tra lại.
- Query công thức hiện đọc DB, global filter loại IsDeleted. Cache invalidator dùng contract ID/slug/version hiện có. Nếu bổ sung Redis query caching sau này phải dùng cùng contract/version; không cache lại các trang HTML chứa Recipe nếu chưa có cơ chế invalidation đồng bộ.
- `no-store` ngăn lưu các response mới; nếu đã có CDN cache từ bản triển khai cũ, cần purge cache của bản cũ khi phát hành. Các trình duyệt khác đang mở trang sẵn không tự cập nhật theo thời gian thực.
- Đã đồng bộ main trước khi sửa; thay đổi tập trung vào xóa công thức, không thay dependency hay migration. Khi ghép PR cập nhật công thức cần giữ cả logic sửa của FR-RCP-004 lẫn khóa gửi xóa, cache invalidation và key riêng của hai child manager. Không chọn nguyên file ours/theirs nếu có overlap.
- Trước khi commit/push: fetch lại origin/main, xử lý thay đổi mới nếu có và chạy kiểm tra phù hợp. Không thể bảo đảm không có conflict với các commit tương lai của nhóm.

Nhánh bàn giao: `2312778-PhanThiBaoTram-xoacongthuc`. Commit chức năng theo Conventional Commits, push nhánh và gửi PR vào `main` để nhóm review; không tự merge.
