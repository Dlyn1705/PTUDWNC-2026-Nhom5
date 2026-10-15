# Kết quả triển khai FR-RCP-008 — Quản lý ảnh công thức

**Ngày:** 15/10/2026.
**Căn cứ:** `Plan_FR-RCP-008-Recipe-Image-Management.md`.
**Trạng thái:** Đã triển khai backend/frontend và kiểm thử tự động; chưa thực hiện kiểm tra giao diện thủ công trên trình duyệt đăng nhập.

## 1. Chức năng đã triển khai

- GET `/api/v1/recipes/{recipeId}/images`: Owner/Admin đọc toàn bộ ảnh chưa xóa theo OrderIndex/CreatedAt/Id. Có kiểm tra quyền trong Application; collection rỗng trả danh sách rỗng.
- PATCH `/api/v1/recipes/{recipeId}/images/{imageId}/primary`: đặt ảnh chính duy nhất, idempotent, trả `ApiResponse<RecipeImageDto>`. Ảnh không thuộc recipe trả 404.
- GET trạng thái ảnh từng ảnh dùng chung Application query thay vì tự kiểm tra quyền trong endpoint.
- Upload, delete và set-primary dùng `IRecipeImageMutations`/`RecipeImageMutations`: khóa hàng Recipe bằng PostgreSQL `FOR UPDATE`, đọc lại dữ liệu dưới khóa, transaction tách bước hạ primary cũ/nâng primary mới. Không giữ khóa trong lúc truyền file lên MinIO.
- Upload đồng thời tính lại OrderIndex từ DB, ảnh đầu tự là primary; delete chọn replacement từ DB mới nhất; xóa ảnh cuối hợp lệ. Constraint hiện có vẫn được giữ.
- Cập nhật UpdatedAt của Recipe; AuditInterceptor hiện có quay vòng RowVersion. Editor cập nhật version sau thao tác ảnh khi nội dung nền vẫn khớp; không âm thầm chấp nhận nội dung đã được người khác sửa.
- Migration dữ liệu `20261015000000_RepairMissingRecipeImagePrimary` chọn ảnh đầu cho gallery cũ thiếu primary. Không sửa schema/model snapshot hoặc migration đã áp dụng.
- Upload trả ảnh đã lưu ngay, không chờ resize. Nếu enqueue lỗi, giữ metadata Pending và original; `RecipeImageProcessingRecoveryJob` quét Pending quá 5 phút mỗi 5 phút để enqueue lại.
- Resize dùng AutoOrient, resize phủ khung rồi crop giữa: medium đúng 800×600, thumbnail đúng 300×300, không kéo méo tỉ lệ. Job chống chạy chồng, giữ retry 3 lần.
- Gallery hiển thị ảnh đã lưu, AltText, primary, trạng thái resize; có tải lại, đặt primary và xác nhận xóa. Sau mutation refetch server state; polling có giới hạn và được hủy khi rời gallery.
- Tích hợp gallery vào trang sửa, trang tạo sau khi lưu được recipe và trang quản lý ảnh bằng UUID hiện có. Chặn upload khi đang Archived trong editor; backend tiếp tục kiểm tra trạng thái cho mọi đường vào.
- Sửa multipart upload để ghi đè Content-Type JSON mặc định của axiosClient; trình duyệt tự cấp boundary.

## 2. Quyết định tích hợp

| Chủ đề | Cách triển khai |
|---|---|
| Archived | Giữ quy tắc đang có: chặn upload; cho phép set-primary/delete nếu recipe chưa soft-delete. |
| Kích thước file | Tối đa 5 MiB; giữ MIME/magic bytes/extension validation hiện có. |
| Contract frontend | Gallery dùng contract `RecipeImageDto` export từ `lib/api/fileApi.ts` trên main. `types/recipe.types.ts` là view model public `{id,url,isPrimary,alt}` khớp DTO public của backend, không đổi thành DTO upload vì hai mục đích khác nhau. |
| Cache | Không tìm thấy Redis/OutputCache/response cache cho các truy vấn recipe trong mã hiện tại. Không thêm tầng cache mới. GET gallery/status dùng `no-store`; search đổi `public,max-age=60` thành `no-cache` để revalidate dữ liệu chứa ảnh. Các API đang đọc DB trực tiếp. |
| Xóa ảnh và recipe | Giữ deletion job/recovery hiện có cho ảnh đơn lẻ. Không nối luồng xóa ảnh vào soft-delete recipe; không thay chính sách giữ ảnh 30 ngày. |
| Migration | Chỉ backfill dữ liệu thiếu primary, không thay index. `Down` không hạ primary trở lại trạng thái sai. |
| Test project | Project ảnh độc lập, chạy bằng đường dẫn csproj bên dưới; không sửa solution/package lock để giảm điểm va chạm với công việc khác. |

## 3. Bằng chứng kiểm thử

| Kiểm tra | Kết quả |
|---|---|
| Build solution backend | Thành công, 0 lỗi và 0 cảnh báo trong lần build solution đã chạy. |
| `CulinaryBlog.RecipeImages.Tests` | **7/7 pass** trên PostgreSQL và MinIO cục bộ, lần chạy cuối sau sửa code backend. |
| `CulinaryBlog.Observability.Tests` | **35/35 pass** trên nhánh tạo từ `origin/main`; lần kiểm tra trước trên nhánh bảo mật là 36/36. |
| TypeScript | `tsc --noEmit --incremental false` thành công. |
| ESLint | `npm run lint` toàn frontend thành công trên nhánh tạo từ `origin/main`. |
| Frontend production build | `npm run build` thành công. Lần đầu bị chặn tải Google Font do mạng sandbox; chạy lại có quyền truy cập mạng đã thành công, không sửa cấu hình font. |
| Git diff | Không có entry unmerged; `git diff --check` không báo lỗi whitespace. |

Nội dung test ảnh:

- Quyền owner/Admin và từ chối người khác/không đăng nhập; kiểm thử các route API thật qua ASP.NET TestServer. Authentication scheme riêng cho test, không thay cấu hình xác thực sản phẩm.
- Hai upload đầu đồng thời, hai set-primary đồng thời, set-primary lặp, xóa primary/phụ/cuối, delete lặp, upload và delete đồng thời.
- Gallery reload, ảnh không tồn tại, Archived chặn upload, soft-delete recipe chặn quản lý ảnh; SQL migration backfill chạy trên PostgreSQL thật.
- Upload/resize/delete thực tế trên MinIO với JPEG, PNG, WebP, AVIF; đo kích thước biến thể, chạy job lặp; HTTP kiểm tra cả ba object trả 404 sau cleanup.
- Giả lập queue lỗi: upload vẫn thành công và lưu Pending. Ảnh có chữ ký hợp lệ nhưng dữ liệu hỏng: resize thất bại, trạng thái Failed và giữ original.
- Từ chối file sai magic bytes/quá dung lượng. Xóa mềm cả recipe vẫn đọc được original.

Database/bucket test có tên sinh riêng với prefix `fr_rcp008_test_` / `fr-rcp008-test-`, được dọn sau test. Test không ghi vào database/bucket ứng dụng.

## 4. Cách chạy

Chạy PostgreSQL, MinIO và các dịch vụ local theo cấu hình dự án. API phải có connection string, MinIO credentials và cấu hình xác thực hợp lệ như trước. Ở Development, API hiện có bước migrate lúc startup; môi trường khác bật `Database:MigrateOnStartup` theo quy trình triển khai của dự án hoặc chạy lệnh EF cập nhật database.

```powershell
dotnet build Culinary_Blog_Nhom5/Culinary_Blog_Nhom5.sln
dotnet test Culinary_Blog_Nhom5/tests/CulinaryBlog.Observability.Tests/CulinaryBlog.Observability.Tests.csproj

# Cấp giá trị từ cấu hình local; không commit credentials.
$env:RECIPE_IMAGES_TEST_CONNECTION = '<connection string PostgreSQL local, tài khoản có quyền tạo database test>'
$env:RECIPE_IMAGES_TEST_MINIO_USER = '<MinIO local access key>'
$env:RECIPE_IMAGES_TEST_MINIO_PASSWORD = '<MinIO local secret key>'
dotnet test Culinary_Blog_Nhom5/tests/CulinaryBlog.RecipeImages.Tests/CulinaryBlog.RecipeImages.Tests.csproj

Set-Location Culinary_Blog_Nhom5/culinary-blog-web
npx tsc --noEmit --incremental false
npm run build
```

Test tích hợp mặc định dùng PostgreSQL theo connection string, MinIO tại `localhost:9000`. Chạy typecheck và build lần lượt vì build có thể tạo lại `.next/types`.

## 5. Rà soát giao diện khi bàn giao

Đăng nhập owner, mở `/dashboard/recipes/{id}/edit`: upload hai ảnh, reload trang, đổi ảnh chính, xóa ảnh chính, kiểm tra ảnh thay thế, xóa ảnh cuối. Kiểm tra lại card/hero sau tải lại trang; thử bằng Admin và tài khoản khác. Kiểm tra bằng bàn phím và khi chuyển trang trong lúc polling.

Các kiểm tra trình duyệt này chưa được thực hiện trong phiên triển khai; build/typecheck/API test không thay thế kiểm tra tương tác trực tiếp. Không cam kết không có merge conflict với commit tương lai. Nhánh `2312778-phanthibaotram-quanlyanhcongthuc` được tạo từ `origin/main`, chỉ chuyển thay đổi chức năng ảnh sang; không mang theo commit bảo mật của nhánh trước. Build/lint/test đã chạy lại trên nền main này.
