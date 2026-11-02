# Nghiệm thu #84 — Recipe, media và background jobs

Phụ trách: Phan Thị Bảo Trâm (2312778). Đối chiếu FR-RCP-003/004/007/008/009/010 và FR-JOB-001/002.

## Chạy dependency thật trên môi trường sạch

Yêu cầu Docker Desktop đang chạy, Docker Compose v2 có `--wait`, .NET SDK 10 và PowerShell 5.1 trở lên. Từ thư mục gốc repository:

```powershell
.\Culinary_Blog_Nhom5\tests\run-integration.ps1
```

Runner dùng `tests/compose.integration.yml`: PostgreSQL 16, MinIO và MailHog. Tên project `culinary-issue84-<random>` riêng cho mỗi lần chạy; không dùng `container_name`/volume development. Cổng host được Docker cấp ngẫu nhiên, chỉ bind `127.0.0.1`. Password được tạo ngẫu nhiên trong process, không ghi `.env`, không in connection string. Hangfire server thật chạy trong test host, PostgreSQL storage nằm trong database riêng của từng test; không cần container Hangfire hay dashboard công khai. Các test không cần Redis/Seq.

Runner kiểm tra readiness rồi chạy tuần tự RecipeCreation, RecipeUpdate, RecipeDeletion, RecipeImages, ImageProcessing, WelcomeEmail, Ingredients và Steps. Không bỏ qua suite lỗi; tổng hợp lỗi và trả thất bại nếu bất kỳ suite nào lỗi. TRX nằm ở `tests/TestResults/culinary-issue84-<random>/` (Git ignore). Nếu lần đầu chưa có image/package, cần Internet để Docker/NuGet tải dependency.

## Cô lập và cleanup

Các fixture tạo database/bucket có GUID và tự cleanup. `finally` của runner luôn gọi `docker compose -p <đúng-project-vừa-tạo> -f <compose.integration.yml> down --volumes --remove-orphans`; dữ liệu PostgreSQL/MinIO dùng tmpfs. Ngay cả khi test lỗi, tài nguyên trong project này được dọn. Các biến môi trường của process được khôi phục giá trị trước đó. Runner không xóa database/bucket/container development và không dùng `prune`.

Nếu tiến trình bị kill cưỡng bức/mất điện khiến `finally` không chạy, lấy chính xác tên project từ đầu log, kiểm tra `docker compose ls`, rồi dọn đúng project đó:

```powershell
docker compose -p culinary-issue84-<id-trong-log> -f .\Culinary_Blog_Nhom5\tests\compose.integration.yml down --volumes --remove-orphans
```

Không dùng tên project của môi trường đang phục vụ ứng dụng. Các biến mẫu cho cách chạy thủ công ở `tests/integration-test.env.example` chỉ có placeholder. Test vẫn mặc định hỗ trợ MinIO 9000 và SMTP 1025/MailHog 8025; runner ghi đè `RECIPE_TEST_MINIO_ENDPOINT`, `WELCOME_EMAIL_TEST_SMTP_PORT`, `WELCOME_EMAIL_TEST_MAILHOG_URL` bằng cổng cô lập. Môi trường này chỉ dùng local, không trỏ fixture vào hệ thống production.

## Contract ảnh bước nấu

1. Lưu recipe Draft để có `recipeId`. Bản nháp chưa tạo recipe không upload tệp mồ côi.
2. Trong StepManager, chọn “Bước nhận ảnh”, tải thư viện để chọn ảnh Completed hoặc dùng FileUploadDropzone chung.
3. Dropzone gọi `POST /api/v1/recipes/{id}/images` bằng multipart (`file`, `altText` tùy chọn). Tiến độ lấy từ upload transport; khi server lưu original, chờ trạng thái terminal qua `GET .../images/{imageId}`. Chỉ Completed mới tự điền URL, không báo thành công khi vẫn Pending/Processing.
4. URL lưu ở `Step.ImageUrl` là `originalUrl` của ảnh trong gallery cùng recipe. Vẫn hỗ trợ URL HTTP/HTTPS tối đa 500 ký tự, không chứa credentials theo contract FR-RCP-010. Backend không tải URL ngoài. Chọn ảnh chỉ thay bản nháp; bấm “Lưu bước” để ghi qua POST/PUT steps với strong `If-Match`.
5. Upload làm đổi RowVersion aggregate. Khi upload/kết thúc/cancel/reconciliation, StepManager đọc lại steps + ETag, so persisted steps với baseline trước upload. Nếu không có người khác sửa steps thì nhận version mới mà không reset nội dung đang nhập. Nếu persisted steps đổi hoặc không đọc được kết quả, giữ bản nháp và chặn save đến khi người dùng tải lại có xác nhận.
6. Đang upload thì chặn lưu/xóa/reorder bước và đổi bước nhận ảnh; nút Hủy của dropzone vẫn dùng được. Cancel chỉ hủy request/poll tại client, không khẳng định server đã xóa original. Sau timeout không xác định, kiểm tra thư viện trước khi upload lại; ảnh đã lưu có thể được chọn thủ công khi Completed.
7. Ảnh thuộc gallery chung. Xóa bước chỉ bỏ liên kết, không tự xóa object dùng chung. Xóa gallery tuân thủ image deletion job; xóa recipe giữ object trong thời gian retention rồi purge an toàn.

## Contract welcome sau đăng ký

Backend hiện trả auth session ở HTTP 201 khi đăng ký; frontend setSession theo contract mới rồi chuyển `/auth/welcome`, giữ callback nội bộ an toàn. Chỉ HTTP 201 tạo receipt UI trong sessionStorage (userId + timestamp, hết hạn 10 phút); không chứa email/password/token. `/auth/welcome` yêu cầu session và receipt khớp user. Đăng nhập thường, logout hoặc receipt hết hạn không hiển thị welcome; `?registered=true` trên login không tạo thông báo thành công giả. Đây chỉ là điều kiện hiển thị UI; quyền API vẫn do backend kiểm tra.

Nếu trình duyệt chặn sessionStorage, đăng ký vẫn thành công và chuyển về dashboard thay vì kẹt ở welcome. Banner giải thích email chỉ để chào mừng, không phải kích hoạt tài khoản. Frontend không gửi/resend email; transaction tạo tài khoản/outbox và Hangfire retry/recovery được kiểm tra ở WelcomeEmail suite. Email job lỗi không rollback đăng ký hoặc chặn đăng nhập.

## Kiểm tra frontend

```powershell
cd .\Culinary_Blog_Nhom5\culinary-blog-web
npm ci
npm run lint
npm run typecheck
npm run build
npm run test:auth
npm run test:file-api
npm run test:recipe-editor
npm run test:api
npm run test:lab6-editor
```

E2E dùng Chrome cài trên máy (CI có thể đặt `E2E_BROWSER_CHANNEL=bundled` sau khi cài Playwright Chromium). Script có tên lịch sử `test:lab6-editor` nhưng bao gồm nghiệm thu editor/onboarding/media #84. E2E chạy production Next với HTTP API fixture để tái hiện lỗi và cạnh tranh một cách xác định; đây không phải tuyên bố trình duyệt đã chạy qua API production. Các suite .NET bên trên dùng PostgreSQL/MinIO/SMTP/Hangfire thật để xác minh nghiệp vụ và storage/worker.
