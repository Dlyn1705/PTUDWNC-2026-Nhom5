# Vận hành FR-JOB-002 — Image Resize / Thumbnail

## Khởi chạy và nâng cấp

1. Cập nhật mã trên nhánh chức năng, cung cấp ConnectionStrings/Minio credentials qua environment/User Secrets theo README. Không commit secret.
2. **Dừng toàn bộ worker phiên bản cũ** trước migration/deploy. Worker cũ chưa biết generation/session lock, không được chạy song song với worker mới; không hỗ trợ rolling upgrade trộn hai giao thức.
3. Áp dụng migration `20261016033625_AddDurableImageProcessing`:

```powershell
dotnet ef database update --project Culinary_Blog_Nhom5/src/CulinaryBlog.Infrastructure --startup-project Culinary_Blog_Nhom5/src/CulinaryBlog.API
dotnet run --project Culinary_Blog_Nhom5/src/CulinaryBlog.API
```

API development vẫn tự migrate theo cơ chế hiện có; production cần migrate trước khi nhận upload. Migration chỉ thêm RecipeImageWork/RecipeImageGenerations, indexes và trigger tạo work cùng transaction INSERT RecipeImages. Không có FK cascade từ ledger tới ảnh/recipe; ledger phải sống qua hard delete để cleanup.

Backfill: ảnh đã xóa → Skipped; Completed đủ URL → Completed, chờ reconciliation; Failed giữ Failed; Pending/Processing/trạng thái chưa biết → Pending, chờ 5 phút. Không bulk reset Failed. Snapshot chỉ thêm hai entity mới. Down gỡ trigger trước bảng; rollback schema chỉ sau khi dừng worker mới, xử lý/dọn generation đang tồn tại và quay về bộ code tương thích.

## Runtime và đầu ra

- Cần .NET 10 trong PATH (`dotnet`) kể cả khi deploy apphost; triển khai cả `CulinaryBlog.API.dll`, deps/runtimeconfig và native assets theo output publish. Máy/container phải cho phép spawn child process và có thư mục TEMP ghi được. Worker transform không phải HTTP endpoint.
- API tái sử dụng Hangfire PostgreSQL và queue `default`. Recurring id `recover-pending-recipe-image-processing`, chạy mỗi phút, batch dispatch/cleanup 100, reconcile Completed tối đa 5 ảnh/lượt.
- Mỗi ảnh có Work riêng. Job arguments chỉ imageId và CancellationToken hạ tầng. Claim transaction ngắn, session advisory lock theo image dùng chung resize/delete/purge; không giữ DB transaction suốt decode/MinIO I/O. Purge khóa nhiều ảnh trên **một** session, không chiếm một connection mỗi ảnh.
- Medium JPEG 800×600; thumbnail JPEG 300×300; quality 85, giữ tỷ lệ rồi center crop, có upscale ảnh nhỏ. AutoOrient trước crop; chuyển sRGB, alpha trắng, strip metadata/GPS. Multi-frame lấy frame đầu, có giới hạn resource/frame. Original giữ nguyên.
- Chỉ decoder JPEG/PNG/WebP/AVIF được chọn theo header; không autodetect SVG/MSL/URL. AVIF phụ thuộc native codec; kiểm thử phiên này xác nhận trên Windows x64, không suy ra mọi image Linux đều có cùng codec.
- Decoder trong tiến trình con, tối đa 2 process/host; giới hạn bytes 5 MiB, chiều 10.000, 40 triệu pixel kiểm tra trước/sau decode, memory/disk 256 MiB, profile 4 MiB, frame đầu, list ceiling 8 (cho phép clone nội bộ), một thread. Area của ImageMagick là ngưỡng cache, không thay thế kiểm tra pixel.
- Parent kill process tree sau 45 giây/cancellation; native time limit 40 giây và watchdog child 50 giây dự phòng nếu parent chết. Pipeline tổng 120 giây, lease 180 giây. Child chỉ đọc/ghi temp file, không PUT MinIO; parent crash không để child upload ảnh sau xóa. Resource limits không phải giới hạn RSS tuyệt đối của OS.
- Temp tạo tên GUID riêng và dọn sau child exit. Parent crash có thể để temp `culinary-resize-<guid>`; chỉ dọn thư mục thuộc tác vụ đã dừng và đủ cũ, không xóa TEMP chung. Cần quota/giám sát disk khi vận hành.

## Trạng thái, retry và cleanup

`Pending → Processing → Completed`. Lỗi storage/worker tạm thời về Pending, NextAttemptAt sau 60/300/900 giây; Hangfire retry 3 lần ngoài lần đầu. Work giới hạn 4 attempts kể cả job trùng/recovery; cạn attempts → Failed. InvalidImage dừng sớm: business Failed, Hangfire method kết thúc không ném lỗi lặp lại file hỏng. Hangfire Succeeded không có nghĩa mọi ảnh đều Completed: xem business Work/RecipeImage.

Ảnh hoặc recipe mất/IsDeleted → Work Skipped, không sinh ảnh; Archived chưa bị xóa vẫn được xử lý. Không có API restore recipe trong phạm vi này; muốn khôi phục Work Skipped sau restore phải có thao tác operator được kiểm tra/audit.

Generation chứa imageId/recipeId/generationId, key dạng `recipes/{recipeId}/{imageId:N}/{generationId:N}/medium.jpg` và thumbnail.jpg. Manifest được commit trước PUT; URL chỉ publish cùng Completed khi đúng lease và ảnh/recipe còn hợp lệ. Stale worker chỉ cleanup generation riêng, không xóa output mới. RowVersion của ảnh được cập nhật; không đổi RowVersion hay UpdatedAt của recipe/mốc retention 30 ngày.

Lỗi PUT một phần/ACK mất/cleanup lỗi giữ manifest. Sau ít nhất 5 phút sweep dọn generation không được DB tham chiếu, có advisory lock. Completed có URL đang tham chiếu được giữ kể cả recipe soft-delete, để delete/purge quyết định thời điểm dọn. Tombstone cleanup giữ 7 ngày và thử xóa lại mỗi ngày để xử lý kết quả PUT không rõ. MinIO và DB không có transaction chung; có thể orphan tạm thời trước recovery, không cam kết exactly-once hoặc không bao giờ có orphan.

Completed được reconcile tối đa một lần/giờ mỗi ảnh: đọc bounded JPEG SOF header để kiểm tra 800×600/300×300, không chạy decoder native trong web host. Thiếu object/sai dimensions → mở **chu kỳ repair mới** Pending, reset attempt 0, bỏ hai URL, original làm fallback; mỗi chu kỳ vẫn tối đa 4 attempts. Storage outage khác NotFound không được reset/clear URL. Object nguyên bản bị mất cần operator xử lý; Failed không tự reset.

Đăng ký upload đã commit nhưng enqueue lỗi vẫn trả 201 và Pending được recovery. DB insert thất bại thì bù original; nếu commit outcome không rõ và DB không đọc lại được, giữ original và log imageId/recipeId để operator reconcile (key original mới dùng imageId). Trường hợp original trước INSERT nhưng mất cả DB có thể cần kiểm kê thủ công; ledger generation xử lý biến thể, không thay thế kho kiểm kê original toàn bucket.

## UI và cache

Upload trả ngay sau lưu; component preview poll mỗi 3 giây, tối đa 35 phút; dừng Completed/Failed, 401/403/404, 3 lỗi liên tiếp hoặc unmount. Có thông báo khi không đọc được status; không biến lỗi poll thành upload thất bại/khuyến khích upload trùng. Completed có link original/medium/thumbnail. Không có nút public retry tùy ý.

List/search ưu tiên thumbnail → medium → original; detail ưu tiên medium → original. Main chưa có shared Redis/output-cache tag pipeline cho các query này; không gọi một invalidator giả. Search metadata đổi Cache-Control từ max-age=60 sang no-store để request mới thấy URL mới; list/detail Axios query trực tiếp DB như hiện có. Tradeoff: chưa đạt mục tiêu cache hit performance trong spec; khi thêm cache sau này phải invalidate tags khi generation publish/repair, không chỉ HTTP mutation. UI ngoài trang upload đang mở cần refetch theo flow của màn hình đó.

## Chẩn đoán và retry thủ công

Tra Work: Status/AttemptCount/NextAttemptAt/LeaseExpiresAt/LastErrorCode/HangfireJobId. Tra ledger: ImageId/Id/CleanupAfter/CleanedAt. Log an toàn có RecipeImageId/Attempt/ErrorCategory/Elapsed; không credential, signed URL hoặc raw transport exception trong failure của pipeline. Dashboard chưa được mở thêm; nếu triển khai sau này phải Admin.

Failed chỉ retry sau khi kiểm tra original/codec/MinIO/DB, ghi audit ticket (operator, imageId, thời gian, lý do). Dừng worker hoặc lấy cùng session advisory lock, transaction khóa Work của đúng image, xác nhận image/recipe còn tồn tại và chưa IsDeleted. Đặt Work Pending, AttemptCount=0, NextAttemptAt=now, HangfireJobId/LeaseToken/LeaseExpiresAt=null, LastErrorCode=OperatorRetry; đặt RecipeImage.ProcessingStatus=Pending, làm mới RowVersion/UpdatedAt của **ảnh**. Sau commit để recovery enqueue. Không bulk reset, không sửa URL từ input người dùng và không chỉ bấm Retry Hangfire rồi kỳ vọng Failed tự gửi lại. Mỗi operator retry là chu kỳ mới có audit.

## Kiểm thử tái lập

```powershell
$env:IMAGE_TEST_CONNECTION='Host=localhost;Port=5433;Username=postgres;Password=<local-secret>'
$env:IMAGE_TEST_MINIO_ACCESS='<local-access>'
$env:IMAGE_TEST_MINIO_SECRET='<local-secret>'
dotnet test Culinary_Blog_Nhom5/tests/CulinaryBlog.ImageProcessing.Tests/CulinaryBlog.ImageProcessing.Tests.csproj
dotnet test Culinary_Blog_Nhom5/tests/CulinaryBlog.Observability.Tests/CulinaryBlog.Observability.Tests.csproj
```

Test tạo/xóa DB `fr_job002_test_<guid>` và bucket `fr-job002-test-<guid>` riêng, chỉ dùng server local. Không dùng DB/bucket production, không dọn dữ liệu người dùng. Unit renderer/codec chạy worker child thật; fake service chỉ tiêm lỗi/cancellation có kiểm soát.

Frontend: npm run lint, npx tsc --noEmit, npm run build. Browser component integration: `node tests/image-processing-ui.cjs` khi có Playwright; biến PLAYWRIGHT_MODULE có thể trỏ package Playwright local, BROWSER_CHANNEL mặc định chrome (hoặc msedge). Test dùng real React/effects trên browser headless profile tạm, stub API/next-image; không phải full E2E NextAuth → backend.

Tham chiếu dependency: giữ [Magick.NET 14.17.2](https://www.nuget.org/packages/Magick.NET-Q8-AnyCPU/14.17.2), license Apache-2.0; [ResourceLimits](https://github.com/dlemstra/Magick.NET/blob/main/src/Magick.NET/ResourceLimits.cs) phân biệt Area/cache và giới hạn tài nguyên. Không nâng major hoặc thêm decoder thứ hai chỉ để thực hiện resize.
