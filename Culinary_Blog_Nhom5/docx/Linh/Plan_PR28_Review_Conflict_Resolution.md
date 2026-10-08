# Kế hoạch chỉnh sửa và xử lý xung đột PR #28

## 1. Phạm vi

- Review PR #28 của repository `Dlyn1705/PTUDWNC-2026-Nhom5`.
- Đối chiếu với `docx/Spec/Culinary_Blog_Spec.md`.
- Hợp nhất PR với `origin/main`, giữ các thay đổi mới hơn của `main` và các chức năng hợp lệ của PR.
- Không đụng vào các thay đổi cục bộ đang có sẵn trong workspace chính.

## 2. Kết quả xử lý xung đột

### `src/CulinaryBlog.API/Endpoints/RecipeEndpoints.cs`

- Giữ validation mới của `main`: chuẩn hóa `title`, `description`, `instructions`, kiểm tra độ dài và `CategoryId` bắt buộc.
- Giữ validation của PR: giới hạn số lượng ingredients/steps, không cho tên ingredient hoặc mô tả step rỗng, và không cho `Quantity` âm.
- Giữ cơ chế sinh slug duy nhất theo hậu tố `-2`, `-3`, … phù hợp với filtered unique index trong đặc tả.
- Giữ việc tạo nutrition, ingredients và steps trong cùng aggregate/transaction; `StepNumber` và `OrderIndex` được backend sinh theo thứ tự request.
- Giữ optimistic concurrency của `main` cho cập nhật recipe qua `RowVersion`/`If-Match`.

### `src/CulinaryBlog.API/Program.cs`

- Gộp các `using` trùng và giữ `Microsoft.AspNetCore.Mvc` cùng `Microsoft.EntityFrameworkCore`.
- Giữ Google authentication/configuration, policy `AuthorPolicy` và `AdminOnly`, cùng Admin endpoint/seed của PR.
- Giữ migration tự động trong Development hoặc khi `Database:MigrateOnStartup` bật; nếu seed database bật thì `DatabaseSeeder` tự migrate và seed trước.
- Chạy Admin seed sau bước migration/seed chính.
- Giữ recurring job phục hồi xóa ảnh và job purge recipe soft-delete sau 30 ngày theo đặc tả.

## 3. Tiêu chí kiểm tra theo đặc tả

- Guest chỉ xem recipe Published; owner/Admin mới xem recipe chưa publish.
- Author/Admin được tạo recipe; ownership và policy phải được kiểm tra ở workflow.
- Recipe mới bắt đầu ở Draft; publish yêu cầu ít nhất một step.
- Delete recipe là soft delete, chuyển Archived và giữ ảnh để Hangfire purge sau 30 ngày.
- Slug recipe dùng filtered unique index để recipe đã soft-delete không chặn slug mới.
- Cập nhật recipe phải kiểm tra concurrency và trả lỗi conflict khi `RowVersion` không khớp.
- Refresh token phải nằm trong HttpOnly/Secure/SameSite cookie; Admin role chỉ cấp qua seed hoặc quy trình quản trị.

## 4. Kiểm thử

- `dotnet restore`: đạt.
- `dotnet build Culinary_Blog_Nhom5/Culinary_Blog_Nhom5.sln --no-restore`: đạt, 0 warning/0 error.
- `dotnet test Culinary_Blog_Nhom5/Culinary_Blog_Nhom5.sln --no-build --no-restore`: đạt 35/35.
- `npm run build`: đạt.
- `npm run lint`: chưa đạt do dependency tree của ESLint (`object.fromentries` yêu cầu `es-abstract/2024/AddEntriesFromIterable` nhưng module không tồn tại); cần chuẩn hóa lockfile/package dependency trước khi đưa vào CI.

## 5. Việc cần làm trước khi merge/push

- Cấu hình `AdminSeed:Email`, `AdminSeed:Password` bằng User Secrets hoặc environment ở môi trường dùng chung; không dùng mật khẩu mẫu trong production.
- Khởi động PostgreSQL/Redis/MinIO và chạy integration/E2E cho login, phân quyền Admin/Author, tạo recipe, publish, soft delete và purge.
- Chuẩn hóa dependency frontend rồi chạy lại `npm run lint`.

## 6. Bản hợp nhất

- Commit xử lý xung đột trong worktree review: `d1eae01` (`fix: resolve PR 28 conflicts against main`).
