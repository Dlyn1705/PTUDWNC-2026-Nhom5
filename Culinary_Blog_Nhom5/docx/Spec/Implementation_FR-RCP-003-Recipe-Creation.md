# FR-RCP-003 — Rà soát và hoàn thiện tạo công thức

Ngày kiểm tra: 16/10/2026. Nhánh: `2312778-phanthibaotram-taocongthuc`, xuất phát từ `origin/main` tại `0452d23`.

## Đối chiếu đặc tả

Áp dụng mục 3.2–3.3, bảng API Recipes và FR-RCP-003 trong `Culinary_Blog_Spec.md`:

- Author/Admin tạo mới; tác giả lấy từ phiên đăng nhập, không lấy từ request.
- Luôn tạo Draft, chưa có PublishedAt; không nhận slug/trạng thái do client tự gán.
- Ingredients, Steps, Nutrition là tùy chọn khi lưu Draft. Điều kiện có bước thuộc thao tác Publish.
- Category phải tồn tại và chưa xóa mềm.
- Slug tiếng Việt không dấu, duy nhất trong các công thức chưa xóa; trùng thêm `-2`, `-3`...
- Recipe và dữ liệu con được lưu trong cùng transaction.

## Các lỗi đã sửa

1. Endpoint cũ chỉ kiểm tra một phần dữ liệu, không kiểm tra Difficulty hợp lệ, giới hạn tên/đơn vị/ghi chú nguyên liệu, tiêu đề/nội dung/timer bước, precision/range dinh dưỡng; Quantity = 0 được chấp nhận. Phần tử null trong danh sách có thể gây lỗi 500.
2. Sinh slug cũ thiếu chuyển `đ` và có thể trùng khi tạo đồng thời. Thiếu giới hạn slug và fallback khi tiêu đề chỉ có ký hiệu.
3. Logic tạo nằm trong endpoint, thiếu bảo vệ quyền ở use case Application.
4. Giao diện bắt nhập nguyên liệu/bước dù Draft được phép bỏ trống; giới hạn title/description không khớp API; số lẻ thời gian và các giá trị không hợp lệ có thể được gửi đi.
5. Giao diện không hiển thị danh sách lỗi validation từ API và chỉ chặn gửi lặp bằng state bất đồng bộ.

## Thay đổi

- Thêm `CreateRecipeCommand`, validator, handler và contract `IRecipeCreationStore`. Handler kiểm tra đăng nhập và vai trò Author/Admin. Không bổ sung yêu cầu xác minh email ngoài đặc tả đang áp dụng.
- Endpoint POST giữ request và response tương thích: `201`, Location theo slug thực tế, JSON gồm message/id/slug/rowVersion. Bổ sung mô tả lỗi 404/409/422.
- `RecipeCreationStore` dùng PostgreSQL transaction, giữ khóa đọc category/user trong lúc lưu, kiểm tra tài khoản còn hoạt động, khóa advisory theo slug gốc và unique index hiện có. Collision từ writer cũ được thử lại có giới hạn. EF execution strategy dùng context mới mỗi lần thử; ID aggregate ổn định để nhận ra lần commit đã thành công nhưng mất acknowledgement.
- Lưu dữ liệu con bằng một lần SaveChanges. StepNumber được cấp 1..n, Title bước trống tự gán “Bước n”. OrderIndex nguyên liệu giữ quy ước 1..n của luồng tạo trên main.
- Validator kiểm tra số lượng danh sách tối đa 100, độ dài sau trim, số lượng nguyên liệu dương và phù hợp decimal(10,3), nutrition không âm và phù hợp decimal(8,2), thời gian không âm, servings dương và enum hợp lệ.
- Thêm kiểm tra form tách riêng: bỏ placeholder hoàn toàn trống, chặn nguyên liệu nhập dở, số sai và độ dài vượt giới hạn. Cho phép Draft chưa có bước/nguyên liệu. Không nhân bản toàn bộ Steps vào trường Instructions cũ để tránh giới hạn 10.000 ký tự không cần thiết; các bước lưu trong bảng RecipeSteps.
- Form hỗ trợ submit, khóa gửi đồng thời bằng ref, giữ dữ liệu sau lỗi, hiển thị lỗi API và slug thực tế. Sau khi lưu có liên kết chỉnh sửa và tiếp tục tải ảnh bằng component hiện có.
- Layout server chặn người không có vai trò Author/Admin vào trang tạo; API và Application vẫn tự kiểm tra quyền.
- Không thay đổi migration, schema, cấu hình bí mật, luồng update/publish hoặc xử lý ảnh. Draft không đi vào public listing/search; không thêm cơ chế invalidation giả khi main chưa có pipeline cache tags chung.

## Kiểm chứng

Đã chạy thành công trên mã hiện tại:

| Kiểm tra | Kết quả |
|---|---|
| `dotnet build Culinary_Blog_Nhom5/Culinary_Blog_Nhom5.sln --no-restore` | Thành công, không warning/error |
| RecipeCreation.Tests | 12/12 đạt |
| Observability.Tests | 35/35 đạt |
| `npx tsc --noEmit` | Đạt |
| `npm run lint` | Đạt |
| `npm run build` | Đạt, route tạo được build dạng dynamic |
| `node tests/createRecipe.cjs --browser` | Payload và Chrome component checks đạt |
| `git diff --check` | Không lỗi whitespace |

Integration test dùng JWT được ký và PostgreSQL thật trong database tạm riêng, chạy migration hiện có và xóa database sau kiểm tra. Bao phủ 401/403, Author/Admin 201, chống client gán owner/status/slug, owner xem Draft/Guest 404, bản nháp tối thiểu, aggregate đầy đủ, dữ liệu lỗi/null, danh mục thiếu/xóa mềm, tài khoản không hoạt động, slug tiếng Việt/ký hiệu/200 ký tự, 5 request cùng tiêu đề chạy đồng thời, tái sử dụng slug xóa mềm, rollback khi insert bước thất bại và retry sau SQLSTATE 40001 không tạo trùng aggregate.

Chrome test chạy component React thật với API và upload được stub: chặn Quantity = 0, giữ dữ liệu và hiện lỗi 422, lưu Draft bỏ trống dữ liệu con, hai submit liên tiếp chỉ gửi một request, nhận slug thực tế và mở phần upload. Đây là kiểm thử component; chưa phải E2E đăng nhập/MinIO qua trình duyệt.

Chạy lại backend:

```powershell
# Cung cấp connection admin PostgreSQL local qua biến môi trường, không ghi credential vào repository.
# RECIPE_CREATE_TEST_CONNECTION chỉ được phép trỏ localhost/127.0.0.1.
dotnet test Culinary_Blog_Nhom5/tests/CulinaryBlog.RecipeCreation.Tests/CulinaryBlog.RecipeCreation.Tests.csproj
dotnet test Culinary_Blog_Nhom5/tests/CulinaryBlog.Observability.Tests/CulinaryBlog.Observability.Tests.csproj
```

Chạy lại frontend tại `Culinary_Blog_Nhom5/culinary-blog-web`:

```powershell
node tests/createRecipe.cjs
# Với Playwright đã cài: có thể đặt PLAYWRIGHT_MODULE thành đường dẫn module nếu không nằm trong node_modules.
node tests/createRecipe.cjs --browser
npm run lint
npm run build
```

## Phạm vi commit và tích hợp các nhánh đang mở

Commit chỉ bao gồm các file thuộc FR-RCP-003; test/build output nằm trong thư mục đã ignore. Phần lớn mã mới ở file riêng, ba file chung chỉ thay phần tạo mới và một đăng ký DI.

Đã thử ghép ba chiều các file chung bằng `git merge-file` với merge-base thực tế, không thay đổi index/HEAD:

- Nhánh quản lý ảnh, Welcome Email và Image Resize: các file chung ghép được tự động ở các ref hiện kiểm tra.
- Nhánh `origin/2312778-phanthibaotram-quanlynguyenlieu`: còn chồng lấn tại `RecipeEndpoints.cs` và `new/page.tsx`, vì nhánh đó cũng sửa chính logic tạo nguyên liệu trong FR-RCP-003. Đã dời đăng ký DI sang vị trí riêng để tránh conflict ở file DI.

Cách giải quyết khi ghép nhánh nguyên liệu:

1. Giữ endpoint POST gửi `CreateRecipeCommand` của FR-RCP-003; bỏ validation/tạo aggregate trực tiếp cũ. Validator mới đã bao phủ tên, quantity, unit, notes và giới hạn số lượng. Giữ import/endpoint quản lý nguyên liệu khác của FR-RCP-009.
2. Giữ `IngredientManager`, `ingredientFormSchema`/`ingredientPayload` và kiểu `IngredientDraft` của FR-RCP-009. Giữ submit/ref/error/success và validation phần recipe của FR-RCP-003. Khi chuyển sang IngredientManager, chuyển đủ Notes vào command; không làm mất Notes bằng cách chỉ map name/quantity/unit. Chuyển OrderIndex tạo mới sang 0..n-1 để thống nhất quy ước quản lý nguyên liệu của nhánh đó.
3. Giữ cả hai đăng ký `IRecipeIngredientStore` và `IRecipeCreationStore`.
4. Chạy lại cả hai bộ integration test và frontend sau ghép. Không chọn toàn bộ ours/theirs cho hai file này vì sẽ làm mất một trong hai chức năng.

Kiểm tra này chỉ phản ánh các remote ref hiện có; không bảo đảm các commit tương lai tự merge được. Khi chuẩn bị PR cần fetch lại và đối chiếu main mới nhất theo CONTRIBUTING.md.
