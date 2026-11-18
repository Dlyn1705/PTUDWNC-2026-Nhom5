# Runbook triển khai và vận hành HT-10

- Phiên bản: 1.0
- Ngày cập nhật: 2026-11-16
- Phạm vi: topology production của Culinary Blog, migration, secrets, health, backup và phục hồi.

## Topology chuẩn

TLS kết thúc tại load balancer hoặc reverse proxy do đơn vị triển khai quản lý. Proxy chuyển HTTP nội bộ tới `gateway`; gateway phân luồng `/api`, `/health` và `/hangfire` tới API, các route còn lại tới Next.js. API dùng PostgreSQL, Redis và MinIO qua mạng nội bộ. SMTP và Google là dịch vụ ngoài. Chỉ reverse proxy được public; PostgreSQL, Redis, MinIO, API và frontend không công khai cổng quản trị.

`PUBLIC_ORIGIN` là origin HTTPS duy nhất nhìn từ browser, ví dụ `https://culinary.example.edu`. `API_INTERNAL_URL=http://api:8080` chỉ dùng từ Next.js server. `NEXT_PUBLIC_API_URL` trỏ tới public origin/reverse proxy và không chứa secret. Cookie refresh có `HttpOnly`, `Secure`, `SameSite=Lax`; topology phải giữ frontend và API cùng site. Nếu hai thành phần nằm khác site, dừng triển khai và mở quyết định thiết kế mới thay vì tự đổi cookie sang `SameSite=None`.

Overlay [compose.reliability.yml](../../compose.reliability.yml) là cấu hình tham chiếu. Cổng gateway mặc định chỉ bind loopback `127.0.0.1:8088`; reverse proxy production nằm phía trước cổng này. Seq và MailHog chỉ dùng cho development.

## Secrets và cấu hình bắt buộc

Lưu secret trong secret manager hoặc file chỉ tài khoản dịch vụ đọc được. Không đưa secret vào Git, image, log hay biến `NEXT_PUBLIC_*`.

Các giá trị bắt buộc gồm `POSTGRES_PASSWORD`, `JWT_KEY` tối thiểu 32 byte, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `PUBLIC_ORIGIN`, DSN backup, S3 backup credentials, `BACKUP_AGE_RECIPIENT` và khóa giải mã age được lưu tách khỏi kho backup. Khi bật SMTP cần host/port/TLS/from-address và credentials. Khi bật Google cần Client ID/Client Secret và callback HTTPS đã đăng ký đúng public origin.

Trước mỗi release, chạy secret scan, xác nhận CORS chỉ chứa origin HTTPS cụ thể, kiểm tra cookie thực tế qua `Set-Cookie`, kiểm tra refresh/logout từ origin hợp lệ và từ origin ngoài allowlist. Google và SMTP phải được thử bằng tài khoản/hộp thư nghiệm thu; fixture hoặc MailHog chỉ là bằng chứng integration local.

## Quy trình release và migration

1. Chốt commit/image digest, lưu bản migration list và chụp backup PostgreSQL/MinIO đã mã hóa.
2. Chạy migration bằng một release task duy nhất với cùng image API. Production giữ `Database__MigrateOnStartup=false` để nhiều replica không tranh migration.
3. Kiểm tra schema/migration thành công rồi mới rollout API. Không chạy API phiên bản cũ sau migration nếu migration thay đổi giao thức worker/job.
4. Rollout API và frontend, sau đó gateway. Kiểm tra `/health/live`, `/health/ready`, `/health`, đăng nhập, public list/detail và một mutation có quyền.
5. Theo dõi tỷ lệ 5xx, latency, dependency health, Hangfire failed jobs và cache failures. Rollback image khi contract còn tương thích; không rollback schema bằng cách xóa dữ liệu.

## Health và suy giảm có kiểm soát

- `/health/live` chỉ xác nhận process còn sống và dùng cho liveness.
- `/health/ready` kiểm tra điều kiện nhận traffic và dùng cho readiness.
- `/health` cung cấp trạng thái dependency chi tiết cho vận hành, không public thông tin nhạy cảm.
- Redis lỗi: public read fallback database; mutation đã commit không trả 5xx chỉ vì invalidation lỗi. Theo dõi tải database trong thời gian fallback.
- SMTP/Google lỗi: trả lỗi provider đã chuẩn hóa; không làm mất tài khoản hoặc dữ liệu nghiệp vụ đã commit.
- MinIO lỗi: chặn upload/variant cần storage; public nội dung không phụ thuộc ảnh mới vẫn phục vụ được.
- PostgreSQL lỗi: readiness phải fail để proxy loại instance khỏi traffic.

## Backup, lịch và retention

Job backup chạy hằng ngày lúc 03:00 UTC bằng tài khoản chỉ đủ quyền đọc database và bucket nguồn. Backup PostgreSQL và manifest MinIO được mã hóa bằng age trước khi ghi vào kho backup tách khỏi volume nguồn. Retention mặc định 30 ngày; kho backup không được mount ghi từ API/frontend. Cảnh báo khi backup quá hạn, file thiếu, checksum sai hoặc purge thất bại.

Trên Windows có thể đăng ký task bằng `infra/reliability/Register-BackupTask.ps1`; trên Linux dùng các mẫu `culinary-backup.service.example` và `culinary-backup.timer.example`. Sau khi cài, lưu bằng chứng task/timer enabled, lần chạy gần nhất, owner, retention policy và ACL của thư mục/bucket.

## Restore drill

Restore luôn dùng PostgreSQL, bucket và network cô lập. Không chạy restore đè lên development hoặc production.

1. Chọn một backup đã mã hóa trong retention window và xác minh checksum/manifest.
2. Dùng khóa age từ kho tách biệt để giải mã vào thư mục tạm có ACL hạn chế.
3. Restore PostgreSQL vào database mới, restore object vào bucket mới.
4. Khởi động API/frontend trỏ vào bản phục hồi, chạy health và kiểm tra user/category/recipe/step/ingredient/image cùng các trạng thái Published/Draft/Archived.
5. So sánh số bản ghi, object và checksum sentinel với manifest; chạy một read và một mutation cô lập.
6. Hủy môi trường drill, giữ report không chứa credentials hoặc dữ liệu người dùng.

`python infra/reliability/drill.py` tự dựng nguồn, tạo backup mã hóa, phục hồi vào đích cô lập, kiểm tra dữ liệu và fault recovery. Kết quả local chứng minh công cụ; môi trường nghiệm thu vẫn cần bằng chứng lịch đã cài, quyền kho backup và restore từ backup do lịch đó tạo.

## Uptime

Mục tiêu 99,5% được tính trên cửa sổ nghiệm thu đã thống nhất từ probe bên ngoài TLS, không suy ra từ một fault drill. Report phải ghi tổng phút quan sát, phút không sẵn sàng, maintenance được loại trừ theo thỏa thuận và công thức `availability = (total - downtime) / total`. Fault drill, restart và failover là bằng chứng phục hồi riêng.

