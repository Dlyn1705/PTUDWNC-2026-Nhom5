# Kết quả kiểm tra Issue #85 — 05/11/2026

Trạng thái: triển khai và kiểm thử hồi quy; chưa đủ điều kiện nghiệm thu toàn bộ NFR-PERF/SCALE. Baseline trước thay đổi: `a4a0166`. Commit triển khai được ghi trong PR chứa tài liệu này.

## Kiểm tra đã đạt

- Solution .NET build: 0 lỗi, 0 cảnh báo.
- Frontend lint: 0 lỗi, 1 cảnh báo biến không dùng trong test sitemap có sẵn.
- Production build với `npm run build -- --webpack`; build mặc định Turbopack gặp lỗi tạo tiến trình trên Windows. Không ghi nhận build mặc định đã đạt.
- Backend search/cache: 46/46 test; gồm concurrency cache hit, coalescing cache miss, TTL validation, quota mặc định, capacity-mode guard và slow SQL fingerprint.
- Job regression: 3 test restart/retry/idempotency được chọn đã đạt; không suy rộng thành bảo đảm exactly-once cho mọi job.
- Frontend: 9 auth tests, 3 performance-behavior tests, 6 ingredient tests; auth/profile/admin/health E2E, editor/lifecycle E2E và accessibility Chromium đã đạt.
- Redis TTL thực: category/detail/list/search = 45/60/3/3 phút; quyết định và khác biệt TTL issue cũ được giải thích trong ADR.
- EXPLAIN ANALYZE BUFFERS: list/search/category/detail có số truy vấn 2/2/3/1 ở page size 12 và 50; chưa kết luận SQL dưới tải đạt ngân sách.
- Hai API: JWT qua instance khác, refresh replay/concurrent refresh, revoke/logout và publish/update/unpublish invalidation đã kiểm tra; drill failover có kết quả passed. Không suy ra SLA tháng từ drill.
- Script smoke/load/stress/soak, CI và profile tài nguyên có trong repository; chưa xác nhận CI remote xanh.

## Các mục chưa đạt hoặc còn thiếu bằng chứng

- Chưa có lượt warm 100 CCU đủ thời lượng sau bản sửa concurrency cache cuối. Lượt cũ có fixture job làm đổi epoch; lượt sau dừng để sửa contention. Không dùng hai lượt này chứng nhận p50/p95/p99 hoặc hit rate cuối.
- Browser mobile 375x812, CPU x4, RTT 150 ms/1.6 Mbps trên máy phát triển dùng chung: home 190.808 byte gzip, INP 408/440/584 ms; recipes 203.485–213.071 byte, INP 128–328 ms; detail 201.166 byte, INP 272–344 ms; search 199.471 byte, INP 120–320 ms; category 194.417 byte, INP 272–344 ms; login 215.557 byte, INP 104–216 ms. Chưa đạt đồng thời budget 200 KB và INP 200 ms.
- Lighthouse trước tối ưu frontend cuối: median LCP khoảng 5,5 giây (không đạt), CLS khoảng 0,004 (đạt). Chưa đo lại Lighthouse cuối; không dùng TBT thay INP.
- Chưa đủ bằng chứng benchmark pool/index, tải ghi hỗn hợp và mọi recurring/singleton job đồng thời trên hai instance.

## Cách tái lập và giới hạn môi trường

Xem `tests/performance/README.md`, runbook và ADR cùng thư mục. Profile Docker độc lập giới hạn tổng phần phục vụ 2 CPU/4 GiB; collector và máy phát tải nằm ngoài ngân sách. Các phép đo cục bộ dùng máy Windows chia sẻ tài nguyên, không đại diện một host nghiệm thu độc lập. Dữ liệu là fixture tổng hợp, không phải dữ liệu người dùng. Script lưu cấu hình, image IDs, counter và tài nguyên cho mỗi lượt trong thư mục build bị Git bỏ qua; không commit secret hoặc artifact thô.

PR phải giữ trạng thái nháp cho đến khi các mục còn thiếu được đo lại và các ngưỡng nghiệm thu đạt. Chỉ merge sau khi nhóm trưởng chấp thuận.
