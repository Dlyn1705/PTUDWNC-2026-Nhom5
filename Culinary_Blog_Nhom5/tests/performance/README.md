# Issue #85 performance tools

Chạy từ repository root, cần PowerShell 7, .NET 10, Node 22 và Docker Compose. Script tạo `build/issue85.env` chứa secret ngẫu nhiên, không commit. Chỉ dùng stack/database kiểm thử riêng; công cụ seed/plans từ chối database không bắt đầu `issue85_`.

```powershell
./Culinary_Blog_Nhom5/tests/performance/run.ps1 -Mode prepare -Recipes 5000
```

Prepare chạy migration/seed một lần trước khi bật API workers, xuất `fixtures.json` và `query-plans.json`, build Release/production và mở gateway `http://localhost:8085`. API A/B ở 5085/5086; database test ở 55485. Các port chỉ bind loopback. Dùng project riêng nếu port đã bận, phải cập nhật đồng bộ cấu hình và manifest.

```powershell
$settings = Get-Content build/issue85.env | ConvertFrom-StringData
$env:PERF_PASSWORD = $settings.PERF_PASSWORD
node Culinary_Blog_Nhom5/tests/performance/scale.mjs
./Culinary_Blog_Nhom5/tests/performance/run.ps1 -Mode smoke
./Culinary_Blog_Nhom5/tests/performance/run.ps1 -Mode warm -Repeat 3
./Culinary_Blog_Nhom5/tests/performance/run.ps1 -Mode mixed
./Culinary_Blog_Nhom5/tests/performance/run.ps1 -Mode cold
./Culinary_Blog_Nhom5/tests/performance/run.ps1 -Mode stress
./Culinary_Blog_Nhom5/tests/performance/run.ps1 -Mode soak
./Culinary_Blog_Nhom5/tests/performance/run.ps1 -Mode browser
./Culinary_Blog_Nhom5/tests/performance/run.ps1 -Mode stop
```

Smoke chạy 2 VU/1 phút với create/update/publish/unpublish/delete và public reads. Warm/mixed giữ 100 VU 15 phút, stress tăng 100/150/200, soak giữ 45 phút. Login đo riêng; auth cookie refresh gửi Origin đúng allowlist. Warm-up tách khỏi custom HTTP metrics, marker bắt đầu chụp counters sau warm-up; cửa sổ báo cáo hiện bao gồm ramp/drain, chưa chỉ riêng plateau. Không tuyên bố p50 từng GET cache-hit từ p50 toàn GET warm. Threshold fail phải khiến script/CI fail, artifact vẫn được giữ.

Mỗi lượt nằm trong `build/issue85/<run-id>/`. `api_latency` là HTTP duration của k6, không gồm DNS/connect/TLS; `transaction_latency` gồm các HTTP bước, không gồm think time. Summary giữ status/check/sample count. `cache-summary.json` lấy delta counter ứng dụng, loại version lookup; Redis INFO chỉ là đối chiếu. Không sửa threshold để biến một môi trường không đạt thành pass.

## Query plan và N+1

Tool `plans` chạy repository thật, capture SQL và clone parameter tại execution, rồi EXPLAIN ANALYZE trên database test. Lưu plan list/search/category/detail ở pageSize 12/50. Query count kỳ vọng 2/2/3/1; không dùng count này thay cho kiểm thử API gồm epoch/auth/authorization. Muốn đánh giá tăng trưởng 50.000 rows cần database/volume mới, cùng seed/profile và plan trước/sau. Không thêm index khi chưa có bằng chứng; không coi sequential scan trên bảng nhỏ là lỗi.

## Frontend

Tooling npm/lockfile ở thư mục này, không sửa dependency runtime frontend. Browser test dùng Chromium 375×812, CPU slowdown 4, RTT 150 ms, download 1,6 Mbps. Tổng first-load JS gzip gồm mọi script tải trước interaction, deduplicate theo URL; budget 200.000 bytes. INP lấy từ `web-vitals` qua interaction thật, missing sample fail; đây là lab INP, không phải field p75. Lighthouse CI đo 3 lượt/route với LCP/CLS median; TBT không được dùng thay INP. `CHROME_PATH` có thể trỏ Chrome cài sẵn cho LHCI.

## An toàn dữ liệu và tái lập

- Không chạy generator vào URL production. Capacity override không bật ở Production; không dùng header giả IP để vượt quota.
- Seed giữ 80% Published, 10% Draft, 5% Archived và 5% soft-deleted; bốn author và mười category. SQL plan thu thập có literal dữ liệu seed, không chạy chế độ plans với dữ liệu người dùng thật.
- K6 dùng recipe riêng mỗi iteration, xóa mềm trong finally; dataset tăng theo số mutation, cần ghi lại hoặc reset volume test trước khi so sánh độc lập. Token/password không xuất vào summary.
- `stop` chỉ dừng project issue85, giữ volumes/evidence. Reset dữ liệu cần chủ động xác định đúng project/volume test; không tự xóa database phát triển.
- GitHub hosted runner là regression gate. Chứng nhận NFR cần runner chuyên dụng, ít nhất 3 lượt warm độc lập, snapshot/time series đủ và không có build/test khác cùng tranh tài nguyên.
- `scale.mjs` kiểm tra auth/refresh/replay/logout, cache visibility và upstream distribution. Nó không thay thế drill Hangfire crash/retry, concurrent refresh race hay failover kéo dài; tái sử dụng test #88/#91 và bổ sung evidence trước khi đóng issue.

## Profile một instance và telemetry

Sau prepare, chuyển topology bằng `run.ps1 -Mode start -Topology single`, đo bằng cùng `-Topology single`, rồi `run.ps1 -Mode start -Topology dual` để trở lại hai API. Chỉ chạy `scale.mjs` ở topology dual. Single overlay giữ tổng 2 CPU/4 GiB, không cấp 2 CPU riêng cho API; xem ADR và SRS trang 40. Muốn reseed sau lượt write, dùng database test mới; prepare không âm thầm xóa dữ liệu đã có.

`cache-ttl.ps1` reset **riêng Redis project issue85**, prime rồi kiểm tra PTTL khóa dữ liệu. Chạy riêng trước load, không chạy đồng thời với bất kỳ phép đo nào. `monitor.mjs` lưu metrics định kỳ và CPU/RAM container thuộc project trong thời gian k6 chạy, dừng theo marker riêng. Epoch SELECT trực tiếp bằng Npgsql không nằm trong histogram EF interceptor; dùng Npgsql pool/HTTP telemetry và kế hoạch đo bổ sung để đánh giá đường này, không khẳng định đã bao phủ toàn bộ SQL trực tiếp.

Seed thêm 1–3 ảnh/công thức bằng SVG nội bộ mount vào frontend, tránh phụ thuộc Unsplash/mạng ngoài trong lượt tái lập. Đây là ảnh synthetic nhỏ; không chứng minh hiệu năng ảnh production. Số bước/nguyên liệu thay đổi 1–8. Sau khi bổ sung ảnh phải reset cache test và khởi động lại frontend để dữ liệu seed trực tiếp không bị cache cũ che đi.

Dependency đo frontend được ghim bằng lockfile; override bản vá basic-ftp/glob/minimatch chỉ áp cho tool này. `npm audit` tại thời điểm triển khai báo 0 vulnerabilities cho tool; không thay dependency runtime của ứng dụng.

## Fixture verification, failover và workload cuối

`prepare` đánh dấu Work của ảnh SVG synthetic là `Skipped` với mã `PerformanceFixture`, vì trigger INSERT tự tạo Pending Work. Các ảnh thật và policy job không bị thay đổi. `verify` kiểm tra ảnh fixture, không còn Work cần xử lý và epoch ổn định trong 3 giây; lưu số rows thực và số Published. Runner kiểm tra verify trước load, restart collector trước mỗi lượt để bỏ series cũ từ các process đã restart; counter reset trong cửa sổ đo vẫn làm gate fail.

Chạy `node Culinary_Blog_Nhom5/tests/performance/failover.mjs` từ repo root để dừng/khôi phục riêng API A; luôn khôi phục trong finally, chờ health ready, rồi kiểm tra gateway phục vụ lại qua cả A/B. Nginx có DNS động và retry chỉ cho GET/HEAD; mutation không được replay. Báo cáo fault window riêng, không suy ra SLA tháng.

Mixed phân bổ theo **giao dịch/iteration**: 80% public list/detail/category, 10% search, 10% write flow. Một write flow có nhiều HTTP requests nên tỷ lệ theo request khác tỷ lệ giao dịch; xem endpoint_samples. Mixed có threshold riêng cho create/update/publish/unpublish/delete. Login riêng: 5 VU/5 phút, think time 1 giây, yêu cầu ít nhất 1.000 mẫu; thiếu mẫu hoặc vượt latency đều fail. Stress tự dừng khi tỷ lệ phản hồi bất ngờ vượt 5% sau 30 giây; artifact được giữ.

Không chạy fault drill, TTL reset, build hoặc E2E đồng thời với phép đo định lượng. Smoke chỉ gate hành vi; cache window invalid trong smoke vẫn được ghi invalid và không được dùng làm số đo hit rate.
