# ADR — Issue #85: TTL cache và điều kiện đo hiệu năng

Ngày: 05/11/2026. Trạng thái: quyết định triển khai trong phạm vi Issue #85; chưa phải chứng nhận NFR.

## Bối cảnh

Issue #85 ghi TTL category/detail/search là 30/5/1 phút. Spec mục 4 và 10.7 đã chuẩn hóa category 30–60 phút, detail 60 phút và list/search 1–5 phút. Code baseline `a4a0166` đang dùng 45/60/3 phút. Việc đổi TTL về số cũ sẽ gây chênh lệch với Spec mới và ảnh hưởng phép đo hit rate.

## Quyết định

1. Giữ category 45 phút, detail 60 phút, list 3 phút, search 3 phút. Bind qua `PublicCache` với validation khi khởi động; giữ mặc định tương thích cho các caller/test hiện tại. Cho phép override detail 1–1.440 phút, category 30–60, list/search 1–5. Giá trị nghiệm thu là 45/60/3/3, không phải một cấu hình override tùy ý.
2. Mutation vẫn invalidate qua cơ chế version/epoch hiện có. Không thay consistency bằng chờ expiry; không đổi invariant recipe/auth/job để đạt latency.
3. `compose.performance.yml` là stack độc lập, project `issue85`, database `issue85_perf`, volume riêng. Ngân sách phục vụ tổng 2 CPU/4 GiB: PostgreSQL 0,4/1 GiB; Redis 0,1/256 MiB; MinIO 0,1/512 MiB; mỗi API 0,5/512 MiB; frontend 0,3/1 GiB; gateway 0,1/256 MiB. Collector và máy phát tải nằm ngoài ngân sách này nhưng vẫn phải ghi tài nguyên host và mức tranh chấp. Không suy ra máy thực đủ 4 GiB chỉ từ tổng mem_limit.
4. Capacity mode yêu cầu cả environment `Performance` và `Performance:CapacityMode=true`. Program từ chối opt-in ở environment khác. Chế độ này bỏ quota trong từng tiến trình của API/auth/upload/recipe-read/write để máy phát tải một IP không đo nhầm 429. Mặc định vẫn giữ quota cũ; kết quả capacity không chứng minh trải nghiệm production ở quota gốc hay distributed rate limiting.
5. Dùng workload/dataset/script có version; metric cache dữ liệu phân biệt hit/miss/bypass/error, không tính version lookup vào hit rate. Trường hợp reset counter hoặc không có mẫu phải báo invalid.

## Hệ quả và giới hạn

TTL dài tăng dung lượng cache; generation toàn cục có thể làm giảm hit rate mạnh khi ghi. Giữ cơ chế này cho tới khi có benchmark và regression consistency đủ mạnh để đổi. Pool API giới hạn 20/instance trong profile; Hangfire dùng cùng PostgreSQL, tổng connection phải đo thật. Shared Hangfire storage không đảm bảo exactly-once; kiểm thử idempotency/retry vẫn bắt buộc.

Một host Docker đang chạy dự án khác, bộ nhớ khả dụng thấp hơn ngân sách hoặc build đang chạy song song không phải môi trường nghiệm thu. Các số đo từ đó được ghi là local smoke, không đóng các acceptance về 100 CCU/CWV production.

## Đối chiếu SRS gốc đã đọc

Đã trích đọc SRS PDF trang 40–41 và 44: PERF-001 đặt latency trên cache warm; PERF-002 nêu **single instance** 2 vCPU/4 GB và yêu cầu kiểm tra hiệu quả khi thêm instance; PERF-003 ghi TTL cũ 30/5/1; PERF-004 yêu cầu query plan/index/slow SQL; PERF-005 ghi bốn budget frontend. SCALE-001 nhắc JWT/Redis/shared queue và khóa singleton; SCALE-002 nêu pool tối đa 100/instance và index, các phần read replica/partition nâng cao; SCALE-003 nêu upstream, distributed MinIO/CDN.

Bổ sung overlay `compose.performance.single.yml`: một API 1 CPU/1 GiB thay hai API 0,5 CPU/512 MiB, giữ tổng ngân sách phục vụ 2 CPU/4 GiB để so sánh công bằng. Đây là cách phân bổ bảo thủ cho toàn stack; chưa được gọi là chứng minh API riêng được cấp đủ 2 CPU/4 GB. Khi nghiệm thu theo cách hiểu API riêng, phải đo thêm profile riêng và ghi tài nguyên dependencies. Overlay dùng Compose ≥2.24.4 (`!override`). Đọc SRS không làm thay đổi TTL đã chuẩn hóa trong Spec mới.

## Điều chỉnh từ số đo local

Profile đầu phân bổ API 0,3 CPU/instance, PostgreSQL 0,5 và frontend 0,6. Time series cho thấy API chạm quota trong khi frontend nhàn rỗi và DB còn dư CPU; profile cuối chuyển thành API 0,5/instance, PostgreSQL 0,4 và frontend 0,3, vẫn đúng tổng 2 CPU/4 GiB. Lưu resource-limits thực từ Docker cho mỗi lượt. So sánh trước/sau phải ghi rõ cả thay đổi phân bổ CPU và sửa đường đọc cache hit, không quy toàn bộ chênh lệch cho một thay đổi.
