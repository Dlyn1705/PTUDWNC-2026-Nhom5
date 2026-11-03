# Báo cáo nghiệm thu kỹ thuật #88 — Backup, restore và failure drill

**Ngày:** 02/11/2026 (UTC và UTC+7 được ghi rõ trong evidence).
**Nhánh:** `2300003-NguyenLeAnhTuan-resilience-backup-88`, từ main `ff66cd1`.
**Phạm vi:** mã/cấu hình, test và drill môi trường cô lập; chưa rollout production.
**Bằng chứng:** [JSON đầy đủ](./evidence/issue88/drill-evidence.json), [ảnh banner 320 px](./evidence/issue88/maintenance-mobile.png), [runbook](./Runbook_Issue_88_Resilience_Backup_Restore.md).

## 1. Kết quả theo sáu tiêu chí Issue #88

| Tiêu chí | Kết quả kiểm chứng | Phạm vi/giới hạn |
|---|---|---|
| PostgreSQL/Redis failure graceful, process không crash | **Đạt drill**: refused, blackhole, network disconnect/reconnect; unhandled exception trả 500 an toàn, live vẫn 200; cùng PID API phục vụ lại sau DB recovery | Fault endpoints chỉ có trong test project, không có trên API production |
| Redis down đọc database, tự phục hồi | **Đạt drill**: list/detail/category/search, mutation và invalidation trong outage; restart API khi Redis down; hai instance thấy đúng dữ liệu sau recovery; cache hit lại; race write không làm bẩn namespace mới, cancellation được propagate | Epoch PostgreSQL bổ sung một DB read/scope và contention khi ghi; chưa benchmark tải production |
| Backup tự động, retention 30 ngày và failure alert | **Đạt scripts/config/tests**: pg_dump thực + object copy + age encryption; task daily 03:00 UTC được kiểm tra định nghĩa, stop/backup/resume cả khi lỗi, retention 29/30/31 ngày và lock; failure/missed-success rules, Alertmanager receiver local nhận thông báo | Chưa đăng ký task/timer trên máy production hoặc chờ lần chạy 03:00 thực tế. Cần cấu hình credentials/storage/operations account trước rollout |
| Restore cô lập count/checksum | **Đạt drill**: database và bucket mới, pg_restore, SHA-256/count mọi bảng public/hangfire và 4 object original/medium/thumbnail/step; kiểm tra size/Content-Type/metadata; bundle bị hỏng bị từ chối | Dataset synthetic nhỏ; chưa chứng minh thời gian restore của dữ liệu production. Bucket policy/origin mapping là bước cutover riêng |
| Restart không mất database/object/job storage | **Đạt drill**: stop/remove/recreate PostgreSQL, Redis và MinIO với cùng named volumes; DB/table digest và queued Hangfire job còn; object checksum/metadata khớp; Redis AOF key còn | Không stop hoặc xóa volume/container dùng chung của người dùng; chưa mô phỏng hỏng phần cứng/host disk |
| Readiness/SLA/monitoring và failure drill | **Đạt cấu hình/drill**: health contract cũ giữ nguyên, traffic admission riêng, poll 10 giây, gateway withdraw/re-admit; Redis-only outage vẫn public 200; promtool kiểm tra trước/sau 1 phút; banner ≥48 giờ/axe/320 px | SLA ≥99.5% là mục tiêu dài hạn. External monitor ngoài host và receiver production chưa được provision; traffic contract cần Ân review |

## 2. Số liệu từ lần chạy đầy đủ

Run `issue88-drill-0730139ee792` có tất cả giai đoạn thành công, trong khoảng 16:33–16:35 UTC:

- Redis blackhole: public read fallback thành công khoảng **0.375 giây**.
- PostgreSQL refused/reconnect: lỗi 500 an toàn sau **10.439 giây**, process sống; gateway chuyển 503 rồi phục hồi 200.
- PostgreSQL blackhole: lỗi hữu hạn sau **10.346 giây**, process sống.
- MinIO down: `/health` 503, `/health/ready` 200 và public traffic 200; MinIO trở lại health phục hồi.
- Quiesce source API trước snapshot; backup `backup-20261102T163453Z-d2854f71` mã hóa thành công.
- Restore bundle vào target mới: **1.755 giây** cho giai đoạn restore/verify trong script, không bao gồm provision/build container hoặc cutover.

Run bổ sung `issue88-drill-a8aa3ca3ca12` xác minh checksum object sau recreate và **image API production** đọc DB restore khi `Hangfire:Server:Enabled=false` và `Hangfire:RecurringJobs:Enabled=false`. Restore/verify ở run này **2.620 giây**; queued job không được worker thực thi trong giai đoạn kiểm chứng.

Manifest phục hồi chứa 1 recipe, 1 user, 1 category, 1 ingredient, 1 step, 1 RecipeImage, 1 RefreshToken và 1 queued Hangfire job; object snapshot gồm 4 tệp PNG fixture và metadata. Count/digest của cả các bảng rỗng cũng được so sánh. Không dùng user/token thật; không kiểm thử đăng nhập tài khoản thật, không khẳng định đã thử tình huống có nhiều soft-deleted rows trong dataset này. SHA-256 từng bảng được lưu trong JSON evidence; dữ liệu hàng, mật khẩu, private key và dump không đưa vào tài liệu.

RPO/RTO production chưa được nghiệm thu: daily schedule gợi ý RPO mục tiêu ≤24 giờ; RTO đề xuất ≤60 phút phải đo lại trên dataset thực. Không lấy số giây fixture làm cam kết chung.

## 3. Kiểm tra tự động và build

| Kiểm tra | Kết quả |
|---|---|
| Search regression trên PostgreSQL riêng | **39/39**, không skip |
| Steps regression trên PostgreSQL riêng | **25/25**, không skip; baseline main chưa có test lifecycle bổ sung của PR #105 |
| HealthEndpointTests | **6/6**, gồm contract cũ và traffic admission theo trạng thái DB |
| Backup rules | **6/6**: lịch UTC, retention boundary/latest, failure/alert/resume, target guard, lock và libpq DSN |
| PowerShell orchestration | **Pass**: đúng argv Docker, finally resume trong success/failure, daily StartBoundary UTC; không tạo task thật trong test |
| Maintenance unit | **Pass**: biên 48 giờ, expired/future, JSON/date/interval/message không hợp lệ |
| Frontend production smoke | **Pass**: home/login/list/detail/status; API live/ready; banner axe, responsive 320 px |
| Prometheus/Alertmanager | **Pass**: config/rules hợp lệ; 50 giây chưa firing, 70 giây firing; receiver local nhận alert, backup failure webhook local nhận được |
| Backend solution/test-host build | **Pass**, 0 warning, 0 error |
| Frontend lint/typecheck/build | **Pass**; production build dùng `npm run build -- --webpack` |
| Docker images | **Pass**: API, frontend standalone, gateway, ops backup |
| Compose validation | **Pass** bằng fixture env; chỉ có cảnh báo `version` obsolete từ Compose gốc, không in cấu hình secret |
| Git diff | **Pass** `git diff --check`; fetch cuối tại thời điểm kiểm tra cho `HEAD...origin/main = 0/0` |

Các bộ regression trên cộng **70 tests**, backup rules thêm **6 tests**; browser/infrastructure/orchestration có assertion riêng, không cộng số “case” tùy ý vào tổng unit test. CI workflow riêng đã được thêm, chưa tuyên bố có kết quả GitHub Actions khi chưa push.

## 4. Quyết định và thay đổi đáng chú ý

- Không mang commit #83 chưa merge vào nhánh #88; không sửa PublicContentCache hoặc search locking. Decorator cache và SQL-only migration epoch mới giữ mutation/version bền qua outage và API restart.
- Health Redis probe dùng transport trực tiếp để không bị fallback decorator che giấu outage. `/health/ready` vẫn yêu cầu DB + Redis; `/health/traffic` chỉ DB để giữ graceful public reads qua gateway.
- Nginx controller active-poll, kiểm tra config trước reload và không replay POST. DNS runtime IPv4 tránh địa chỉ IPv6 không route được của host.docker.internal trong Docker Desktop; service recreate được resolve lại.
- Backup snapshot dừng source API/Hangfire của stack đã xác minh và resume trong finally; phải không có external writer. Cửa sổ này tạo downtime API, được tính vào SLA và maintenance policy. Worker/business reconciliation vẫn thuộc #91.
- Đã đối chiếu SRS trang 43: 99.5% tương đương khoảng **43.8 giờ/năm**, không phải chú thích 3.65 giờ/năm trong PDF. Runbook dùng tỷ lệ 99.5%, ghi rõ mâu thuẫn để nhóm review.

## 5. Bảo mật, cleanup và việc còn lại khi triển khai

Tất cả container/network/volume drill có GUID và safety guard, tự cleanup; chỉ fixture DB/bucket bị tác động. File env fixture bị xóa; dump/age identity chỉ tồn tại trong volume test đã cleanup. Đợt thử không gửi email/Slack hay cảnh báo cho người khác; receiver chỉ là HTTP local. Không thay lịch scheduler trên máy development. Dịch vụ dùng chung của người dùng được giữ nguyên.

Trước production cần operations cấu hình secrets/ACL, storage ngoài failure domain, lịch backup thực, receiver và external uptime monitor; xác nhận nhận cảnh báo và lần backup tự động đầu tiên. Cần review admission với Ân, benchmark generation-row contention và đo backup pause/restore dataset thực. SLA theo tháng/năm chưa thể chứng minh từ drill ngắn.

Nộp bài trên nhánh riêng từ main theo README/CONTRIBUTING; PR liên kết Issue #88 bằng closing keyword và chờ nhóm trưởng review. File plan/báo cáo cá nhân giữ local; commit chỉ gồm source/config/tests, runbook, report kỹ thuật và evidence synthetic. Không tự merge, đóng Issue #88 hoặc đánh dấu Project Done.
