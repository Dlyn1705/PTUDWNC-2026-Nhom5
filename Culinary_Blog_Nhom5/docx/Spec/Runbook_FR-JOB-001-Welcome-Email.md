# Vận hành FR-JOB-001 — Welcome Email

## Luồng và trạng thái

Local register và Google tạo user nội bộ lần đầu ghi `WelcomeEmailDeliveries` trong transaction user/role/refresh token. Login, refresh và Google liên kết user đã có không tạo thêm intent. Request đăng ký không gọi SMTP hoặc Hangfire enqueue. Dispatcher `dispatch-welcome-emails` chạy mỗi phút trên Hangfire hiện có, batch 100, queue `default`.

`Pending → Processing → Sent`; lỗi transport về Pending với backoff 60/300/900 giây, lần gọi thứ tư lỗi thành Failed. Sent là SMTP chấp nhận, không bảo đảm inbox. Failed không tự reset khi bấm Retry job. Tài khoản mất/inactive/email thay đổi thành Skipped. Processing có lease; worker khác chỉ nhận lại khi lease hết hạn. SMTP timeout tổng 30 giây, lease mặc định 180 giây. Unique `(UserId, MessageType)` và lease giảm trùng; crash sau SMTP nhận trước ghi Sent vẫn có thể gây thư lặp.

Không có FK từ delivery tới user: xóa user không chặn cleanup tài khoản; job thấy user mất sẽ Skipped. Không sửa `EmailConfirmed` của user local.

## Cấu hình development

Mặc định `Email:Enabled=false`: vẫn lưu Pending, không gửi/đếm attempt/đánh Sent. Để bật trong terminal chạy API:

```powershell
# Tại gốc repo; bỏ qua nếu đã có mail capture chiếm 1025/8025.
docker compose -f compose.mail.yml up -d
$env:ASPNETCORE_ENVIRONMENT='Development'
$env:Email__Enabled='true'
$env:Email__Host='127.0.0.1'
$env:Email__Port='1025'
$env:Email__SecurityMode='None'
$env:Email__FromAddress='welcome@culinary.test'
$env:Email__PublicWebBaseUrl='http://localhost:3000'
# Cung cấp ConnectionStrings__DefaultConnection, Jwt__Key, Minio credentials theo README.
dotnet ef database update --project Culinary_Blog_Nhom5/src/CulinaryBlog.Infrastructure --startup-project Culinary_Blog_Nhom5/src/CulinaryBlog.API
dotnet run --project Culinary_Blog_Nhom5/src/CulinaryBlog.API
```

MailHog UI: http://localhost:8025. Dùng địa chỉ giả `@welcome.test`, không dùng mailbox người thật. Compose riêng bind SMTP/UI vào loopback, không đổi compose hạ tầng chung. API chạy trong container phải dùng hostname mail capture trên cùng Docker network, không dùng loopback của container.

Options thực tế nằm trực tiếp dưới `Email` (không có lớp `Smtp` hoặc `Provider`): Enabled, Host, Port, Username, Password, SecurityMode, FromAddress, FromName, PublicWebBaseUrl, TimeoutSeconds, LeaseSeconds, RetentionDays. Chỉ có một transport SMTP. Username/Password phải cùng có hoặc cùng vắng; secret đưa qua environment/User Secrets (`Email__Password`), không commit.

Production bắt buộc SecurityMode `StartTls` hoặc `SslOnConnect`, URL HTTPS, sender hợp lệ. Không tắt TLS certificate validation. `None` chỉ cho Development/Testing; `Auto` không được chấp nhận. Timeout 1–60 giây; lease ít nhất `3 × timeout + 30` giây; retention 1–365 ngày. Cấu hình bật nhưng sai sẽ dừng startup. MailHog chỉ dùng local, không phải SMTP provider production.

## Quan sát và xử lý lỗi

- Log an toàn: EmailMessageId, UserId, JobId, Attempt, ErrorCategory, Elapsed; không recipient, body, credential, token hoặc exception SMTP gốc. Hangfire arguments chỉ GUID và cancellation token hạ tầng, không email/name.
- Theo dõi `Status`, `AttemptCount`, `LastErrorCode`, `NextAttemptAt`, `LeaseExpiresAt`, `UpdatedAt`, `HangfireJobId` trong DB. Cảnh báo vận hành khi có Failed hoặc Pending quá lâu; chưa thêm hệ thống cảnh báo tự động/metric exporter riêng.
- SMTP down: sửa kết nối/credential rồi để retry/recovery chạy. Enqueue lỗi: intent vẫn Pending, dispatcher thử lại. API chết sau commit: không mất intent. Lease còn sống: chờ hết hạn, không force gửi chồng.
- Sent/Skipped cũ hơn RetentionDays (mặc định 30) được xóa. Failed giữ tombstone/attempt cap nhưng xóa snapshot RecipientEmail sau retention. Pending/Processing không xóa. Tắt Email cũng dừng dispatcher/retention; cần bật lại hoặc cleanup có kiểm soát khi ngừng tính năng lâu dài. PII trong bảng users tuân chính sách tài khoản riêng.
- Hangfire Dashboard được map tại `/hangfire` và chỉ Admin được truy cập. Không map anonymous; operator phải đăng nhập bằng tài khoản có role Admin.

## Retry thủ công có kiểm soát

Không có public resend API. Failed không gửi lại chỉ bằng retry Hangfire. Operator phải kiểm tra SMTP/provider và rủi ro thư lặp, ghi audit ticket (operator, thời điểm, message id, lý do), rồi thao tác đúng **một** message. Ví dụ SQL qua DB client bảo mật, thay giá trị UUID được kiểm tra, thực hiện trong transaction:

```sql
BEGIN;
SELECT "Id", "Status", "AttemptCount", "LastErrorCode"
FROM "WelcomeEmailDeliveries" WHERE "Id" = '<message-uuid>' FOR UPDATE;

-- Chỉ sau khi đã kiểm tra account hiện hành và ghi audit bên ngoài DB:
UPDATE "WelcomeEmailDeliveries" AS d
SET "Status" = 'Pending', "AttemptCount" = 0,
    "RecipientEmail" = u."Email", "NextAttemptAt" = now(), "UpdatedAt" = now(),
    "HangfireJobId" = NULL, "LeaseToken" = NULL, "LeaseExpiresAt" = NULL,
    "LastErrorCode" = 'OperatorRetry'
FROM "AspNetUsers" AS u
WHERE d."Id" = '<message-uuid>' AND d."Status" = 'Failed'
  AND u."Id" = d."UserId" AND u."IsActive" = TRUE
  AND u."Email" IS NOT NULL
  AND (d."RecipientEmail" = '' OR lower(d."RecipientEmail") = lower(u."Email"));
-- Kiểm tra affected rows = 1; khác 1 thì ROLLBACK, không đổi sang recipient mới tùy ý.
COMMIT;
```

Việc reset mở một chu kỳ 4 attempts mới do operator chủ động, không thuộc retry tự động. Snapshot bị scrub chỉ được khôi phục theo chính sách và audit của operator, không qua request người dùng. Không bulk reset, không reset Sent/Skipped, không enqueue trực tiếp với email.

## Kiểm thử

Test project độc lập để giảm thay đổi solution chung:

```powershell
$env:WELCOME_EMAIL_TEST_CONNECTION='Host=localhost;Port=5433;Username=postgres;Password=<local-secret>'
dotnet test Culinary_Blog_Nhom5/tests/CulinaryBlog.WelcomeEmail.Tests/CulinaryBlog.WelcomeEmail.Tests.csproj
```

Yêu cầu PostgreSQL local có quyền tạo/xóa database tạm, MailHog localhost:1025/8025. Mỗi test tạo `fr_job001_test_<guid>`, áp dụng migration rồi xóa đúng DB đó khi xong; test SMTP chỉ tìm/xóa thư tới recipient GUID riêng. Không chạy với DB/server production. Không cấu hình biến kết nối thì integration tests thất bại rõ ràng, không âm thầm skip.
