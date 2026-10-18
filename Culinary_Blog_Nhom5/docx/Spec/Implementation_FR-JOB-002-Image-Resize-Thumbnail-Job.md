# Kết quả triển khai FR-JOB-002 — Image Resize / Thumbnail Job

**Ngày:** 16/10/2026. **Nhánh:** `2312778-phanthibaotram-fr-job-002-imageresize`.
**Nền:** `origin/main` commit `0452d23`, fetch lại trước bàn giao; commit/push theo yêu cầu bàn giao tiếp theo của người dùng.

## Thay đổi đã thực hiện

- Giữ public job `RecipeImageProcessingJob.ProcessAsync(imageId, ct)` để tương thích Hangfire đã persist, tách pipeline/store/renderer/storage/lock/reconcile/cleanup thành file riêng dưới Infrastructure/Services/Images.
- Migration mới `20261016033625_AddDurableImageProcessing` thêm Work và generation manifest độc lập, indexes và trigger tạo Pending trong chính transaction INSERT ảnh. Không sửa migration cũ/RecipeImage schema hoặc auth/email/nguyên liệu. Có backfill legacy và Down gỡ trigger trước bảng.
- Upload đã commit vẫn trả 201 nếu enqueue lỗi, giữ original và Pending cho recovery. Adapter lưu job id. Insert failure có compensation; commit outcome không rõ thì kiểm tra stable imageId trước khi xóa original.
- Claim theo image, lease 180 giây; session advisory lock dùng chung resize/delete/purge, transaction DB ngắn. CAS finalization kiểm tra lease và trạng thái image/recipe, publish hai URL cùng Completed; replay commit không cleanup nhầm output đã publish. Không đổi primary/order/alt text hoặc RowVersion của recipe.
- Generation key riêng từng attempt và write-ahead manifest trước PUT; stale worker không ghi/xóa file của generation mới. Ledger không cascade khi xóa ảnh/recipe. Cleanup lỗi/PUT mất ACK được recovery, tombstone giữ 7 ngày và xóa lại hàng ngày.
- Medium JPEG 800×600 và thumbnail JPEG 300×300 thật, quality 85; center crop không méo, có upscale. AutoOrient theo EXIF, chuyển ICC về sRGB trước strip, nền trắng cho alpha, bỏ metadata/GPS; multi-frame lấy frame đầu.
- Decoder tiến trình con giới hạn bytes/dimensions/pixel/cache/profile/list/thread, semaphore 2 process/host, parent timeout 45 giây/kill tree, native time 40 giây và watchdog dự phòng 50 giây. Pipeline 120 giây; child chỉ làm file tạm, không gọi MinIO. Không autodetect codec ngoài allowlist và không đưa native error output vào log ứng dụng.
- Retry Hangfire 3 lần với backoff 60/300/900 giây, durable tổng cap 4 attempts. InvalidImage Failed sớm; Failed không tự reset bởi job trùng. Pending/Processing bị kẹt được dispatcher mỗi phút, batch 100, dùng queue/storage/server cũ.
- Completed reconciliation batch 5, tối đa một lần/giờ/ảnh: kiểm tra JPEG dimensions/object có thật bằng đọc header managed; thiếu/sai biến thể mở chu kỳ repair hữu hạn mới. Storage outage không giả là object missing.
- Delete/purge phối hợp khóa và dọn cả generation chưa publish, không resurrect object; recipe soft-delete vẫn giữ original/biến thể đã publish đến purge theo retention cũ. Purge lấy nhiều lock trên một connection để tránh cạn pool vì nhiều ảnh.
- UI upload trả ngay, status preview riêng poll có giới hạn/dừng terminal/lỗi/quyền/unmount. Có nút chỉ GET lại trạng thái khi chờ lâu/lỗi, không resend/re-upload. Multipart header đúng với Axios JSON default. Completed hiển thị link ba kích thước.
- List/search ưu tiên thumbnail, detail ưu tiên medium, fallback original. Chưa có shared tag cache pipeline trên baseline: search đổi no-store để metadata URL không bị giữ bởi max-age cũ; không thêm invalidator giả. Các request mới tiếp tục query DB.

## Kiểm chứng

- Bộ test ImageProcessing: **27/27 đạt** trong lượt toàn bộ cuối, không skip; bao gồm migration legacy up/down, EF transient claim replay và recovery dispatcher song song với worker thật.
- Hồi quy Observability: **35/35 đạt**.
- Solution build: đạt, **0 warning/0 error** trên mã backend cuối.
- Frontend lint, production build và TypeScript đạt; browser component tests chạy lại sau thay đổi UI cuối đạt.
- `git diff --check` đạt. Test project riêng, không sửa solution chung.

Các test dùng PostgreSQL migration/storage thật, MinIO bucket tạm thật và worker Hangfire thật. Đọc/decode lại output, so dimensions/MIME và original bytes; xác nhận JPEG/PNG/WebP/AVIF trên Windows x64. Kiểm thử alpha trắng, ICC/EXIF orientation bằng màu vùng ảnh, strip metadata và animated WebP frame đầu. Fault injection gồm queue outage, trigger DB insert/finalization failure, PUT accepted nhưng ACK mất, cleanup outage, cancellation và claim cũ.

Đã kiểm tra rollback/replay transient claim không reuse tracked entity cũ; dispatcher chỉ giữ Work row lock ngắn, không giữ image session lock khi enqueue để worker nhanh không kết thúc no-op. Đã kiểm tra duplicate/concurrent jobs, ảnh khác vẫn claim được, backoff/cap, Failed không tự chạy lại, stale completion/cleanup, Processing lease hết hạn, job Deleted/recovery, deleted image/recipe, purge 30 ngày và deadline kill process. Không coi mock storage là bằng chứng MinIO hoặc codec; mock chỉ dùng để chặn/tiêm lỗi có kiểm soát.

Browser test dùng Chrome headless profile tạm, React/effects/timers thật, stub API/next-image: Pending → Processing → Completed/link, stop terminal, 403, 3 lỗi liên tiếp và unmount. Công cụ desktop browser không khởi tạo được, nên dùng harness headless. Đây chưa phải full E2E login NextAuth → upload frontend → backend thật. Backend HTTP upload/status/delete được kiểm thử bằng TestServer và auth principal test, không dùng account người thật.

## Giảm conflict và lưu ý tích hợp

Main hiện tại không có commit mới và không có merge conflict trên nhánh triển khai. Kiểm tra ba chiều các file chung: nhánh nguyên liệu 4 file ghép sạch, Welcome Email 5 file ghép sạch sau điều chỉnh vị trí DI/Program/log fields. Kết quả tính trước khi thêm đoạn README runbook; đoạn này đặt ở mục khác để tránh vị trí welcome email.

**PR #39 chưa nằm trong main** và sửa cùng luồng ảnh. Không thể cam kết merge tự động giữa hai phiên bản này. Có 5 file tracked chồng lấn và một recovery file add/add cần ghép nghiệp vụ khi #39 được tích hợp:

1. `RecipeImageProcessingJob.cs`: giữ adapter entrypoint + pipeline FR-JOB-002; không quay về xử lý inline hoặc lock method-wide của #39.
2. `RecipeImageProcessingRecoveryJob.cs`: dùng duy nhất phiên bản có Work/lease/cap/cleanup/reconcile, không đăng ký thêm recovery Pending-only.
3. `UploadRecipeImageCommandHandler.cs`: giữ cơ chế mutation/transaction chống primary/order race của #39 khi ghép, đồng thời giữ trigger intent và chính sách không compensation vì queue lỗi của FR-JOB-002. Không bỏ authorization/magic bytes.
4. `fileApi.ts`: giữ exports list/set-primary và status API của #39; dùng upload trả ngay, multipart header và polling riêng, không khôi phục vòng chờ 30 giây trong upload.
5. `RecipeImageUploadPanel.tsx`: giữ ImageGalleryManager của #39 và ghép status component/hook vào gallery thay vì khôi phục panel lưu ảnh mới tạm thời. Không làm mất list/primary/delete UI.
6. `RecipeEndpoints.cs`: giữ list/set-primary/query ownership của #39; giữ metadata không cache và contract status hiện có. Không thêm duplicate routes.

Không tự sửa/merge/push nhánh PR #39 của công việc khác để che conflict. Trước push/PR của FR-JOB-002 cần fetch main, ghép các thay đổi nếu #39 đã merge, chạy lại cả test ảnh/resize/UI; snapshot migration phải đối chiếu model thực tế. Hướng dẫn này là rủi ro tích hợp đã xác định, không phải tuyên bố rằng mọi nhánh tương lai ghép sạch.

## Triển khai và giới hạn

- Hướng dẫn cấu hình, migration, retry/cleanup/repair: [Runbook_FR-JOB-002-Image-Resize-Thumbnail.md](./Runbook_FR-JOB-002-Image-Resize-Thumbnail.md). Dừng worker cũ trước deploy; cần `dotnet` trong PATH và temp ghi được. Không hỗ trợ trộn worker cũ/mới trong rolling deploy.
- Chỉ áp dụng migration trên DB test riêng trong phiên này, không sửa schema/dữ liệu DB ứng dụng. Các bucket test riêng được dọn; không dùng bucket ảnh người dùng để kiểm thử.
- DB/MinIO không có distributed transaction; có orphan tạm thời trước cleanup. Original upload xảy ra trước DB INSERT: nếu cả commit outcome và DB đều không đọc được, original được giữ để operator reconcile bằng imageId/recipeId; chưa có toàn-bucket inventory/original janitor tự động.
- Chưa benchmark tải 100 users, p95/cache hit rate, RSS tuyệt đối, fault injection OS/container termination ở mọi instruction hoặc codec trên Linux production. Native resource limits và child watchdog không thay thế container memory/disk quota.
- Chưa có hệ thống cảnh báo image Failed tự động hoặc shared Redis tag cache; runbook cung cấp trạng thái để operator theo dõi. Search no-store là tradeoff đúng dữ liệu trước khi cache có invalidation thật.
- Không tạo public retry API hoặc dashboard mới, không commit secrets/build output và không tự merge PR.
