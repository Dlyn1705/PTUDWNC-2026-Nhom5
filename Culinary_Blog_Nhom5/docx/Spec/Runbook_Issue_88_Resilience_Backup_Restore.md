# Runbook #88 — Resilience, backup và restore

## Contract vận hành

- `/health/live`: HTTP process còn sống, không truy cập dependency.
- `/health/ready`: PostgreSQL + Redis, giữ nguyên contract #81; 503 nếu một dependency lỗi. `/health`: thêm MinIO.
- `/health/traffic`: chỉ PostgreSQL, dùng cho gateway admission; Redis lỗi vẫn cho public read fallback DB. Đây là contract mở rộng cần Ân review, không thay semantics readiness cũ.
- Mỗi dependency health có deadline 2 giây; Docker/proxy poll mỗi 10 giây. Docker unhealthy không tự restart service chỉ vì Redis down. Nginx controller dùng `/health/traffic`, kiểm tra config trước reload, DNS Docker IPv4/TTL 10 giây và không replay mutation.
- Trong tối đa một chu kỳ phát hiện, request có thể nhận lỗi upstream/500 khi DB vừa down; sau phát hiện gateway trả 503 + Retry-After 10. Khi phục hồi traffic được nhận lại tự động.

## Cache và DB

`ResilientCache` là decorator scoped của `IDistributedCache`, không sửa PublicContentCache của #74/#83. Cache operation có budget mặc định 300 ms (`Reliability:CacheTimeoutMs`, 50–2000); lỗi cache chuyển cả scope sang bypass. Client cancellation vẫn được propagate. Scope mới thử cache lại, dùng StackExchange.Redis reconnect với `abortConnect=false` trong overlay.

Migration `20261102000100_AddDurableCacheEpoch` tạo bảng `cache_epoch` và trigger trên Recipes/Categories/Ingredients/Steps/Images/Users. Mutation commit cùng generation mới; rollback không đổi generation. Mỗi scope lấy committed generation trước lần cache read đầu, ghi lại đúng namespace đó. Mutation cạnh tranh khiến ghi của scope cũ không còn truy cập được, thay vì làm bẩn namespace mới. Generation ở PostgreSQL nên không mất khi API restart/Redis down và được hai instance cùng quan sát.

Đánh đổi: thêm một SELECT nhỏ vào DB cho mỗi cache scope; generation toàn cục làm giảm cache hit khi nội dung thay đổi thường xuyên, và hàng generation có thể tạo contention khi ghi nhiều. Đây là lựa chọn consistency cho quy mô hiện tại, chưa công bố đạt performance SLO tải cao; cần benchmark trước scale-out. Hangfire heartbeat không xoay namespace. Bản ghi cache namespace cũ hết hạn theo TTL hiện có.

Npgsql retry 3 lần, delay tối đa 1 giây; command timeout mặc định 5 giây (`Reliability:DatabaseCommandTimeoutSeconds`, 1–30). Connection Timeout phải đặt trong connection string (overlay 3 giây). Không nhân retry bên ngoài transaction strategy hoặc retry POST ở proxy. Startup production chờ DB healthy, không tự migrate; nếu cold-start storage Hangfire thất bại, restart policy thử lại process. Request runtime DB lỗi không được làm crash process.

## Chuẩn bị deployment riêng

Không trộn overlay vào stack development đang có. Giữ đúng project/volume đã định danh; không đổi tên `pgdata` hoặc `minio_community_data` khi upgrade. Không dùng `down -v` trên môi trường có dữ liệu.

1. Chuẩn bị .NET 10/Node 20+/Docker Compose và PowerShell 7 cho orchestration host. Kiểm tra disk space.
2. Tạo env file bảo vệ ngoài Git và ACL chỉ operations account đọc. Các giá trị bắt buộc: `POSTGRES_PASSWORD`, `JWT_KEY`, `PUBLIC_ORIGIN` (HTTP(S), không slash cuối), `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `BACKUP_BUCKET`, `BACKUP_AGE_RECIPIENT`, `BACKUP_DIRECTORY`, `BACKUP_DSN_FILE`, `S3_ACCESS_KEY_FILE`, `S3_SECRET_KEY_FILE`, `ALERTMANAGER_CONFIG_FILE`, `ALERT_WEBHOOK_URL_FILE`. Paths trong Compose nên tuyệt đối.
3. Các secret files chứa raw giá trị, không phải tên biến; DSN backup theo libpq, ví dụ `host=postgres dbname=culinary_blog_db user=backup sslmode=require`. Không ghi password ví dụ thật trong repo/log. DB account cần quyền đọc đầy đủ public/Identity/Hangfire và extensions liên quan. S3 backup account cần list/get; restore account tách riêng.
4. `PUBLIC_ORIGIN` được đưa vào build frontend vì Next inlines NEXT_PUBLIC_API_URL; đổi origin cần rebuild. API_INTERNAL_URL chỉ server-side. TLS terminate bằng reverse proxy bên ngoài gateway localhost:8088; không công bố HTTP nội bộ hoặc DB/MinIO admin ra Internet. Cấu hình trust proxy/cookie/CORS theo môi trường thực.
5. Build images, chạy migration từ bước deployment có kiểm soát trước bật API. Ví dụ ở root repo: `dotnet tool restore`, rồi `dotnet ef database update --project Culinary_Blog_Nhom5/src/CulinaryBlog.Infrastructure --startup-project Culinary_Blog_Nhom5/src/CulinaryBlog.API`, với ConnectionStrings/Jwt/Cors qua environment/User Secrets. Không đưa password vào lệnh.
6. Lệnh Compose mẫu (đặt `$opsEnv` là đường dẫn env file đã bảo vệ):

```powershell
docker compose --project-name culinary-production --env-file $opsEnv -f docker-compose.yml -f compose.reliability.yml build api frontend gateway backup
docker compose --project-name culinary-production --env-file $opsEnv -f docker-compose.yml -f compose.reliability.yml up -d postgres redis minio api frontend gateway
```

Overlay có biến bắt buộc cho monitoring/backup ngay khi Compose parse, dù chưa bật profile. Dùng thông tin credential khớp dữ liệu MinIO hiện có, không tự thay root credential trên volume đang dùng. Không chạy lệnh mẫu trên project chưa xác minh. Production cần backup ngoài failure domain chính và access control mạng; Compose local không tự tạo chứng nhận/TLS hoặc tài khoản operations production.

## Backup tự động 03:00 UTC, retention 30 ngày

### Tính nhất quán và quyền

`Backup-Stack.ps1` dừng API nguồn với grace 60 giây (cũng dừng in-process Hangfire workers), kiểm tra API không còn running, chạy backup container và start lại API trong finally. Không cho writer/worker ngoài stack dùng cùng DB/bucket trong cửa sổ này. Không dựa vào marker đơn thuần khi vẫn có writer. Nếu tách workers sau này, phải mở rộng orchestration để pause/drain mọi writer trước snapshot. Thời gian pause này được tính vào availability, cần đo và thông báo maintenance; gateway có thể trả 503 cho API trong cửa sổ backup.

Một bundle gồm pg_dump custom format (public, Identity, Hangfire và schema dữ liệu khác có trong DB), snapshot object của bucket, Content-Type/custom metadata và manifest SHA-256/count. Inventory count/digest xác minh public và hangfire. Không backup URL ảnh bên ngoài MinIO do ứng dụng không sở hữu. Không coi ETag là checksum dữ liệu.

Bundle được mã hóa bằng age public recipient; private identity **không** đặt trong thư mục backup hoặc image production. Bản `.age` + `.json` chỉ công bố sau khi dump/list/object/hash/encryption đều thành công. File/dir dùng umask 077; Windows host phải đặt ACL thư mục mount cho operations account. Dùng disk/remote mount ngoài host dữ liệu hoặc sao chép bản encrypted đã hoàn tất tới storage độc lập; local named volume trong drill chỉ kiểm chứng cơ chế, chưa phải DR ngoài site.

Scheduler độc lập với DB/Hangfire; lock không cho hai backup process cùng ghi. Retention chỉ xóa bundle complete quá 30 ngày UTC, giữ bản tốt mới nhất, không prune khi backup hiện tại thất bại. File `.partial` không được restore; kiểm tra, xử lý riêng khi có đợt thất bại.

### Chạy và đăng ký lịch

```powershell
./infra/reliability/Backup-Stack.ps1 -Project culinary-production -EnvironmentFile $opsEnv
./infra/reliability/Register-BackupTask.ps1 -Project culinary-production -EnvironmentFile $opsEnv
```

Lệnh thứ hai tạo Windows Scheduled Task, StartBoundary UTC, daily 03:00, start missed run và không overlap. Chạy dưới tài khoản operations có quyền Docker + đọc secret files; cấu hình thực thi khi logged out theo máy triển khai. Docker Desktop của người dùng không thay thế daemon production luôn sẵn sàng. Lần triển khai này không đăng ký task trên máy development hoặc dùng dữ liệu development làm nguồn backup.

Trên Linux, dùng PowerShell 7 và cặp `culinary-backup.service.example`/`.timer.example`: chỉnh đường dẫn/User/env file, cài ở `/etc/systemd/system`, enable timer. `OnCalendar=*-*-* 03:00:00 UTC`, Persistent=true. Hoặc chạy `backup.py schedule` trong scheduler riêng với quiesce/resume hooks JSON argv thực sự pause/drain writers; không dùng hooks `["true"]` cho nguồn đang ghi. Hook không có hoặc thất bại thì backup phải thất bại.

Pg client 16 dùng cho PostgreSQL 16 trong Compose; nâng DB major phải nâng tool và test restore trước. Roles/globals không nằm trong per-DB dump; target tạo roles/extension prerequisites theo deployment manifest. `--no-owner --no-acl` làm target owner là account restore; không tự cấp lại quyền production.

## Restore cô lập

1. Chọn backup ID, xác minh `.json` complete và hash `.age`, chuẩn bị private identity qua secret file bảo vệ. Không restore trực tiếp đè lên DB/bucket đang phục vụ.
2. Tạo DB **rỗng** `issue88_restore_<8..32 hex>` và bucket target **chưa tồn tại** `issue88-restore-<8..32 hex>` trong cluster/storage test riêng. Script từ chối tên khác, DB có bảng public/hangfire hoặc bucket đã tồn tại. DB source khác target.
3. Cấp `RESTORE_DSN_FILE`, `RESTORE_S3_ENDPOINT`, `RESTORE_S3_ACCESS_KEY_FILE`, `RESTORE_S3_SECRET_KEY_FILE`, `RESTORE_BUCKET`, `RESTORE_AGE_IDENTITY_FILE`. Mount identity read-only vào ops container. Chạy `backup.py restore --root /backups --id <backup-id>` trong image ops, không mount Docker socket.
4. Script kiểm tra archive member path/type, checksum dump và mọi object trước khi restore; pg_restore single transaction/fail-on-error; upload object rồi tải lại để so SHA-256/size/Content-Type/metadata. So count/digest tất cả bảng public/hangfire. Lỗi object giữa chừng có thể để lại target một phần; giữ target để điều tra rồi xóa **đúng target test** hoặc tạo target mới, không retry vào bucket đã tồn tại.
5. Giữ worker/email/purge disabled khi xác minh: `Hangfire__Server__Enabled=false`, `Hangfire__RecurringJobs__Enabled=false`, `Hangfire__Dashboard__Enabled=false`, `Email__Enabled=false`; các công tắc Hangfire mặc định true để giữ hành vi deployment cũ. Test host không có Hangfire Server. Không bật worker trên restored job thật trước khi đánh giá side effects và secrets. RefreshToken hashes phục hồi cùng DB; không ghi nội dung token/user trong report.
6. Dữ liệu URL giữ nguyên để digest khớp. Trước smoke ở origin mới, lập mapping **source origin + bucket → restore origin + bucket** cho Original/Medium/Thumbnail/ImageUrl bằng migration/script có phạm vi target test; kiểm tra số dòng và lưu evidence riêng sau mapping. Không tự rewrite tất cả chuỗi trong DB. Tạo bucket read policy hoặc signed URL theo policy đích; restore mặc định không tự public bucket hay sao chép ACL nhạy cảm.
7. Dùng namespace Redis mới hoặc xóa đúng namespace của môi trường restore trước bật API; generation trong dump có thể trùng Redis của hệ thống nguồn. Không restore Redis production làm nguồn nghiệp vụ. Smoke API/ảnh/auth fixture; sau nghiệm thu mới lập cutover/rollback production để nhóm trưởng duyệt.

## Monitoring, SLA và maintenance notice

Copy `alertmanager.example.yml` vào file bảo vệ, URL receiver nằm trong secret `alert_webhook_url`. Bật profile monitoring sau cấu hình:

```powershell
docker compose --project-name culinary-production --env-file $opsEnv -f docker-compose.yml -f compose.reliability.yml --profile monitoring up -d prometheus blackbox alertmanager backup-metrics
```

Prometheus probe/scrape mỗi 10 giây. Rules: down ≥1 phút (lần evaluate kế tiếp khi đã vượt 1 phút), probe mất, backup thất bại, không success quá 25 giờ/mất metrics, backup disk thấp. Alertmanager forward webhook, receiver phải được operations xác nhận nhận được thông báo test. `monitor_drill.py` chỉ gửi vào receiver local, không gửi người dùng thật. Production cần thêm monitor ở **ngoài host/cluster** (Uptime Robot/Better Uptime hoặc equivalent) đo public HTTPS và alert sau >1 phút: monitoring cùng host không báo được khi cả host chết. Không claim đã cấu hình tài khoản dịch vụ bên ngoài khi chưa có credential/endpoint của đơn vị vận hành.

SLO availability ≥99.5%, cửa sổ 30 ngày, đo bên ngoài gateway từ HTTP outcome, timeout/missing probe tính unavailable. Error budget 30 ngày =216 phút; 365 ngày ≈43.8 giờ. SRS trang 43 ghi “3.65 giờ/năm” không khớp phép tính 99.5%; dùng tỷ lệ 99.5% làm căn cứ, cần nhóm xác nhận sửa chú thích. Recording rule `availability_30d` chỉ là local sampled indicator, cần đối chiếu external monitor; không chứng minh SLA tháng/năm từ một drill ngắn. Maintenance tính downtime trừ khi có thỏa thuận SLA khác bằng văn bản.

`MAINTENANCE_NOTICE_JSON` là config server-only có `announcedAt`, `startsAt`, `endsAt` (ISO8601 UTC), `message`. Notice chỉ hiển thị sau announcedAt và trước endsAt, startsAt phải sau announcedAt ≥48 giờ. Banner accessible, React escape text, hiển thị UTC và tự ẩn khi hết hạn. Cấu hình notice sớm cho lịch bảo trì đã biết; không sửa announcedAt giả để hợp thức hóa thông báo muộn. Lịch backup hàng ngày có pause API cũng phải tính vào kế hoạch availability/maintenance; khi cần zero-downtime backup, triển khai writer-drain + snapshot/versioning phù hợp trước.

## Kiểm thử tái lập

Tại root repository, Docker và .NET 10 sẵn sàng:

```powershell
dotnet build Culinary_Blog_Nhom5/tests/CulinaryBlog.Reliability.E2E
docker build -f infra/reliability/Dockerfile -t culinary-issue88-ops .
docker build -f infra/reliability/gateway/Dockerfile -t culinary-issue88-gateway .
docker run --rm -v "${PWD}/infra/reliability:/ops:ro" --entrypoint python culinary-issue88-ops -m unittest -v test_backup
python infra/reliability/drill.py
python infra/reliability/monitor_drill.py
```

Frontend smoke tùy chọn sau `npm run build -- --webpack` tại frontend: đặt `ISSUE88_FRONTEND_SMOKE=1`, chạy lại drill; cần Python trên host và Edge hoặc Playwright Chromium (`BROWSER_CHANNEL`). Driver tạo project/container/DB/bucket/volume GUID, không stop service chung. Trên Linux thêm host-gateway để Docker truy cập test host; Windows dùng Docker Desktop host.docker.internal. Cleanup kiểm tra prefix + danh sách tên chính xác trước remove. Không chạy song song nhiều instance drill trên cùng file report; mỗi run có thư mục riêng.

Evidence nằm `build/issue88-*/report.json`, screenshot `culinary-blog-web/build/reliability/maintenance-mobile.png`. Artifact CI upload report JSON và `gateway.log`, không dump, key hoặc env. Report kỹ thuật của #88 tóm tắt bằng chứng được phép chia sẻ; plan/báo cáo cá nhân vẫn local. Workflow riêng `reliability.yml` tránh sửa job CI đang dùng của #83/#84.

Nếu Linux CI dừng ở lần chờ gateway đầu tiên, kiểm tra `gateway.log`. Với `proxy_pass` dùng biến, Nginx tra Docker DNS và không đọc ánh xạ `--add-host` trong `/etc/hosts`. Controller chuyển riêng `host.docker.internal` thành IPv4 bằng system resolver trước khi tạo config; các service name `api`/`frontend` vẫn dùng runtime DNS để hỗ trợ recreate. Chạy hồi quy bằng `python -m unittest discover -s infra/reliability/gateway -p 'test_*.py' -v`.

## Giới hạn nghiệm thu production

Mã/scripts/config và drill cô lập không tự đăng ký scheduler production, tạo external alert account hoặc chứng minh SLA dài hạn. Trước rollout: operations cấu hình secret/ACL/storage độc lập, receiver bên ngoài host, lịch chạy và xác nhận lần backup tự động đầu tiên; test restore trên dataset production đã được phép xử lý; đo maintenance pause/RPO/RTO và review health extension với Ân. Mục tiêu đề xuất RPO≤24 giờ/RTO≤60 phút cần đo/chốt; không phải cam kết đạt với mọi dung lượng dữ liệu.
