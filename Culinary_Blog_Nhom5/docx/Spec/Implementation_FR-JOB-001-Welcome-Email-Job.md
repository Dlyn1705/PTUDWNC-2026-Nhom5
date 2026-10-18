# Kết quả triển khai FR-JOB-001 — Welcome Email Job

**Ngày:** 16/10/2026. **Nhánh:** `2312778-phanthibaotram-fr-job-001-welcomeemail`.

**Nền triển khai:** `origin/main` commit `0452d23`; fetch lại main trước bàn giao, chưa có commit mới. Không gộp thay đổi ảnh/nguyên liệu từ PR riêng, chuẩn bị commit/push theo yêu cầu tiếp theo của người dùng.

## Chức năng hoàn thành

- Local register ghi welcome intent atomic với user, role Author và refresh token; chỉ thêm hai điểm ghi intent trong AuthService cho local và Google tạo user mới. Không chờ SMTP trong request. Giữ HTTP 201, access token, refresh cookie HttpOnly và điều kiện đăng nhập hiện có.
- Google login lặp, liên kết email có sẵn, login/refresh không tạo thêm intent. Replay transaction có stable user/token không tạo user, token hay welcome trùng.
- Bảng `WelcomeEmailDeliveries`: unique UserId/MessageType, trạng thái Pending/Processing/Sent/Failed/Skipped, attempt cap DB 0–4, lease và indexes phục vụ recovery. Migration mới `20261016025646_AddWelcomeEmailDeliveries`; không chỉnh migration cũ. Snapshot chỉ bổ sung entity mới.
- SMTP MailKit, email HTML/plain text tiếng Việt, encode tên, link từ cấu hình server. Welcome không phải verification; không đổi EmailConfirmed local, không chứa password/token hoặc link kích hoạt.
- Dispatcher mỗi phút/batch 100, dùng Hangfire PostgreSQL và queue default hiện có. Không thêm server/storage/dashboard độc lập. Queue lỗi vẫn giữ intent; worker dừng hoặc lease hết hạn có recovery.
- Claim dùng row lock ngắn, SMTP ngoài transaction; cập nhật Sent/Failed bằng LeaseToken. Job trùng không gửi đồng thời, Sent/Skipped/Failed không tự gửi lại. Retry Hangfire 3 lần sau lần đầu với 60/300/900 giây; attempt bền vững giới hạn tổng 4 lần kể cả nhiều job trùng.
- Missing/inactive/changed-email account được Skipped; Email.Enabled=false giữ Pending và không đếm attempt. Cấu hình bật sai bị báo ở startup; production yêu cầu TLS và HTTPS.
- Safe logging thêm các trường chẩn đoán cần thiết; job args chỉ GUID và cancellation token của Hangfire. Không persist exception SMTP gốc vào failure details.
- Retention mặc định 30 ngày: xóa Sent/Skipped cũ, scrub RecipientEmail của Failed và giữ tombstone/attempt cap; giữ Pending/Processing. Có runbook retry thủ công từng message kèm audit.
- WelcomeBanner tại `/login?registered=true`, giữ redirect cũ, hướng dẫn đăng nhập ngay và khám phá công thức. Không gọi resend/polling từ frontend; cập nhật Frontend_Spec để bỏ lời hứa kích hoạt tài khoản.
- `compose.mail.yml` riêng dùng MailHog local pin `v1.0.1`, SMTP/UI chỉ bind loopback; hướng dẫn cấu hình và test trong [runbook](./Runbook_FR-JOB-001-Welcome-Email.md) và README.
- Hangfire Dashboard được map tại `/hangfire` trong API và bảo vệ bằng role `Admin`; không mở anonymous.

## Bằng chứng kiểm thử

| Kiểm tra | Kết quả |
|---|---|
| `dotnet build Culinary_Blog_Nhom5/Culinary_Blog_Nhom5.sln --no-restore` | Đạt, 0 warning/0 error |
| `dotnet test …/tests/CulinaryBlog.WelcomeEmail.Tests/CulinaryBlog.WelcomeEmail.Tests.csproj --no-restore` | **27/27 đạt**, không skip |
| `dotnet test …/tests/CulinaryBlog.Observability.Tests/CulinaryBlog.Observability.Tests.csproj --no-restore` | **35/35 đạt** |
| Frontend `npm run lint` | Đạt |
| Frontend `npm run build` | Đạt, bao gồm TypeScript và generation 12 static pages |
| Frontend `npx tsc --noEmit` | Đạt |
| Render WelcomeBanner qua ReactDOMServer | Đúng role=status, link /recipes và thông báo không phải chờ thư |
| `git diff --check` | Đạt |
| Merge thử ba chiều các file chung với nhánh ảnh và nguyên liệu | 2/2 file chung với ảnh và 3/3 file chung với nguyên liệu ghép sạch sau điều chỉnh Program |

Integration tests dùng PostgreSQL thật, áp dụng toàn bộ migrations trên DB `fr_job001_test_<guid>` riêng từng test, Hangfire PostgreSQL thật và worker thật. SMTP smoke test dùng MailKit gửi vào MailHog localhost, đọc MIME để xác nhận subject, recipient giả, HTML/text UTF-8 và encode tên. Gửi lại job Sent không thêm thư. Chỉ xóa mail của recipient GUID riêng và database do chính test tạo; không gửi ra hộp thư người thật hay dùng DB ứng dụng.

Phạm vi lỗi đã kiểm tra: invalid/duplicate registration; lỗi outbox rollback user/token; simulated committed-core replay; nhánh Google sau bước xác minh token (không gọi Google thật); hai worker claim cùng message; transport fail/backoff/cap; job Failed enqueue lại; disabled/re-enable; tài khoản inactive/mất/đổi email; queue outage; dispatcher song song; job bị xóa; lease live/expired và stale worker completion; retention; cancellation; SMTP kết nối thất bại thật; worker Hangfire chuyển Scheduled khi lỗi; transport accepted nhưng ghi Sent thất bại.

## Giới hạn và triển khai

1. Chưa bật gửi trên ứng dụng mặc định: `Email:Enabled=false` an toàn; cần áp dụng migration và cấu hình SMTP theo runbook để vận hành. API development tự migrate theo cơ chế hiện có; production phải migrate trước khi phục vụ đăng ký. Không sửa schema/dữ liệu DB ứng dụng trong phiên kiểm thử này.
2. Không cam kết exactly-once hoặc thư tới inbox. Test lỗi ghi Sent sau transport acceptance thể hiện Processing được giữ; sau hết lease, recovery có thể gửi lại một thư. Lease chỉ giảm gửi chồng, không tạo transaction chung DB/SMTP.
3. Kiểm tra frontend bằng build/lint/typecheck và render markup; chưa kiểm thử tương tác đăng ký bằng trình duyệt. Google được kiểm thử ở transaction core sau token validation, chưa kiểm thử đăng nhập Google qua nhà cung cấp thật. Không chờ đủ 1/5/15 phút bằng đồng hồ thực: backoff/cap dùng clock test, còn worker thật xác nhận Scheduled sau lần lỗi đầu.
4. Runbook có hướng dẫn quan sát Failed/Pending; chưa tích hợp dịch vụ cảnh báo tự động riêng. Failed có snapshot scrub sau retention cần operator kiểm tra chính sách và audit trước khi khôi phục/retry.
5. Kiểm tra merge phản ánh nội dung main và hai nhánh ảnh/nguyên liệu hiện tại, không bảo đảm các thay đổi tương lai không xung đột. Cần fetch/main và chạy lại kiểm tra trước push/PR; không tự merge PR.

Dependency SMTP dùng [MailKit 4.17.0](https://www.nuget.org/packages/MailKit/4.17.0). Pin transitive crypto dependency `System.Security.Cryptography.Pkcs` 10.0.13 để tránh bản 10.0.0 kéo theo từ MimeKit; bản vá tham chiếu [advisory GHSA-846f-f764-76mx](https://github.com/advisories/GHSA-846f-f764-76mx). Không nâng đồng loạt các dependency khác.
