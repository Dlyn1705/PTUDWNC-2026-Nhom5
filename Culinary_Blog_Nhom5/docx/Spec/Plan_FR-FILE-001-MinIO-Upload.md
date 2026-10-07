# Kế hoạch hoàn thiện FR-FILE-001 — Upload file lên MinIO

**Phạm vi:** Tải ảnh công thức lên MinIO, lưu metadata liên kết với recipe và đưa ảnh gốc vào luồng xử lý kích thước dẫn xuất.
**Căn cứ chính:** `Culinary_Blog_Spec.md` mục 3.5, 6, 7.1, 7.5, 8, 9 và 12; tham chiếu hợp đồng giao diện trong `Frontend_Spec.md` mục 4.2, 5.5 và checklist mục 6.

## 1. Mục tiêu và kết quả mong đợi

Tác giả sở hữu recipe hoặc Admin có thể chọn/kéo thả ảnh hợp lệ, tải qua API đã xác thực, lưu ảnh gốc vào MinIO và tạo bản ghi `RecipeImage` trong PostgreSQL. URL ảnh có thể được dùng bởi DTO và trang công thức; các kích thước medium/thumbnail được tạo bởi background job theo đặc tả. Lỗi ở bất kỳ bước nào phải có phản hồi rõ ràng và không để lại object hoặc metadata mồ côi ngoài ý muốn.

FR-FILE-001 trong plan này là upload **ảnh công thức** có `recipeId`. Upload avatar/profile cần endpoint/use case được cho phép riêng; không chấp nhận `folder` tùy ý do client gửi lên.

## 2. Yêu cầu chuẩn hóa từ đặc tả

- Actor được phép: owner của recipe hoặc Admin. Kiểm tra quyền ở Application workflow, không chỉ dựa vào UI hoặc endpoint.
- Chỉ nhận JPEG, PNG, WebP, AVIF; kích thước tối đa 5 MiB (5 × 1024 × 1024 byte). Từ chối file rỗng, vượt giới hạn, loại không hỗ trợ, khai báo MIME/extension không khớp nội dung và bytes không nhận diện được.
- Xác định loại ảnh từ magic bytes; chuẩn hóa MIME/extension phía server. Không dùng tên file của client làm object key.
- Object key sinh bằng GUID theo mẫu `recipes/{recipeId}/{guid}.{ext}`.
- Lưu ảnh original; tạo medium 800×600 và thumbnail 300×300 bằng Hangfire/background job theo FR-JOB-002. Ảnh đầu tiên của recipe là primary; chỉ một ảnh không bị xóa có thể là primary.
- Áp dụng rate limit upload 5 request/phút/IP theo yêu cầu NFR ở mục 4; trả lỗi có cấu trúc, không làm lộ thông tin MinIO hoặc filesystem.
- File ảnh của recipe soft-delete không bị xóa khỏi MinIO ngay. Xóa vật lý và xóa object sau 30 ngày thuộc lifecycle/purge, không nằm trong upload này.

## 3. Contract HTTP đề xuất

### Request

```http
POST /api/v1/recipes/{recipeId}/images
Authorization: Bearer <access-token>
Content-Type: multipart/form-data
```

- Part bắt buộc: `file`.
- Part tùy chọn: `altText` (tối đa 200 ký tự, nếu API/DTO hiện tại giữ giới hạn này).
- Recipe ID đến từ route; server tự sinh object key, URL, `OrderIndex` và `IsPrimary`.
- Không nhận bucket, object key, URL, folder, MIME tin cậy hoặc cờ `isPrimary` từ client.

### Success response

Trả `201 Created` với wrapper `ApiResponse<RecipeImageDto>` theo chuẩn API hiện tại. DTO tối thiểu: `id`, `recipeId`, `originalUrl`, `mediumUrl`, `thumbnailUrl`, `altText`, `isPrimary`, `orderIndex`. Tại thời điểm response ngay sau upload, medium/thumbnail có thể null hoặc trạng thái xử lý rõ ràng; không giả vờ hoàn tất resize trước khi job chạy xong.

### Lỗi cần chuẩn hóa

| HTTP | Trường hợp |
|---|---|
| `400` / `422` | Thiếu file, file rỗng, kích thước/định dạng/chữ ký ảnh không hợp lệ, `altText` quá dài. |
| `401` | Chưa đăng nhập hoặc access token không hợp lệ. |
| `403` | Người dùng không phải owner và không phải Admin. |
| `404` | Recipe không tồn tại hoặc đã soft-delete. |
| `413` | Request vượt giới hạn body tại API/proxy. |
| `415` | Media type không được hỗ trợ, nếu dùng status này thống nhất toàn API. |
| `429` | Vượt rate limit upload. |
| `503` / `500` có ProblemDetails | MinIO/DB không sẵn sàng; log nội bộ kèm correlation ID, không trả credentials hoặc stack trace. |

Chọn một mapping validation thống nhất giữa 400/422/415 khi hiện thực; không trả nhiều mã cho cùng một trường hợp một cách tùy tiện.

## 4. Hiện trạng và khoảng thiếu

| Thành phần | Hiện trạng quan sát được | Công việc còn thiếu |
|---|---|---|
| Storage abstraction | Có `IFileStorageService.UploadAsync/DeleteAsync`. | Chốt contract object key/metadata và bảo toàn cancellation/error semantics cho MinIO. |
| Storage implementation | DI đang đăng ký `LocalFileStorageService`; implementation ghi file vào `wwwroot/uploads`, dùng extension tên client và chưa validate bytes/size/MIME. | Thêm MinIO implementation dùng cấu hình typed options; chọn provider theo cấu hình/environment; không đưa credentials vào frontend. |
| MinIO runtime | `docker-compose.yml` có service MinIO và persistent volume. | Cấu hình endpoint nội bộ/public, bucket, credentials qua environment/secrets; bootstrap bucket/policy idempotent và health/readiness check. |
| API | Spec nêu `POST /recipes/{id}/images`, nhưng chưa tìm thấy endpoint upload ảnh trong `RecipeEndpoints` hoặc endpoint group khác. | Thêm multipart endpoint có auth, validation, rate limit, OpenAPI và ProblemDetails. |
| Application/domain | Có entity `RecipeImage`, `IRecipeRepository`, `IUnitOfWork`; chưa tìm thấy upload command/use case hay repository operation chuyên cho ảnh. | Thêm use case upload kiểm tra recipe/ownership, xác định primary/order, lưu metadata và phối hợp object storage. |
| Database | `RecipeImage` đã có `OriginalUrl`, `MediumUrl`, `ThumbnailUrl`, `AltText`, `IsPrimary`, `OrderIndex`; configuration hiện chưa có unique constraint cho primary. | Dùng transaction và constraint phù hợp bảo đảm tối đa một primary ảnh còn hiệu lực; migration/backfill nếu cần. |
| Background processing | Master spec yêu cầu Hangfire tạo ảnh medium/thumbnail; hiện trạng mục 9 ghi Hangfire/MinIO chưa tích hợp đủ. | Tích hợp tối thiểu background job FR-JOB-002 hoặc tạo dependency rõ ràng; bảo đảm enqueue/retry/idempotency sau upload. |
| Frontend | Chưa thấy `FileUploadDropzone`, `fileApi`, `ImageGalleryManager` hoặc recipe editor upload hiện thực trong cây component. `Frontend_Spec.md` mô tả contract dự kiến. | Tạo dropzone/API client có recipeId, progress, preview, lỗi, retry/cancel và callback thành công; tích hợp ở nơi quản lý ảnh recipe khi màn hình đó sẵn sàng. |

## 5. Quyết định contract cần giữ nhất quán

1. **Upload có gắn recipe:** Dùng endpoint chuẩn `POST /api/v1/recipes/{recipeId}/images`, không tạo endpoint tổng quát cho phép client tùy ý truyền `folder`. Frontend helper nhận `recipeId` và `File`; contract trong `Frontend_Spec.md` cần cập nhật từ `uploadFile(file)` nếu helper hiện được mô tả quá chung.
2. **URL persisted:** `RecipeImage` và public DTO đang lưu/đọc URL dạng chuỗi. Chọn một URL ổn định cho original và các bản dẫn xuất; MinIO credentials chỉ ở backend. Với ảnh công thức được xem công khai, bucket/object có thể read-only public hoặc URL đi qua public media origin; nếu yêu cầu draft image phải private, cần chốt cơ chế private/proxy/presigned URL trước khi lưu URL lâu dài.
3. **Primary/order:** Tính trong transaction trên recipe sau khi xác thực ownership. Nếu chưa có ảnh, ảnh mới là primary; `OrderIndex` tăng liên tục/đơn điệu. Constraint DB là hàng rào cuối để chống hai request đồng thời cùng đặt primary.
4. **Lỗi giữa MinIO và PostgreSQL:** Không có transaction phân tán. Nếu upload object thành công nhưng insert DB thất bại, gọi `DeleteAsync` bù trừ và log lỗi bù trừ; nếu ghi object thất bại thì không tạo RecipeImage. Hành vi khi Hangfire không enqueue được cần thống nhất (retry/outbox hoặc trả trạng thái `Processing` có thể phục hồi), tránh báo resize thành công giả.
5. **Nội dung ảnh:** Magic bytes là điều kiện cần theo SRS; decoder trong job cần xác nhận file giải mã được và áp dụng giới hạn kích thước pixel phù hợp để chống ảnh lỗi/quá lớn trước khi resize.

## 6. Kế hoạch triển khai

### Giai đoạn 1 — Cấu hình và MinIO storage

1. Thêm typed `MinioOptions` (endpoint nội bộ, public origin nếu cần, bucket, access key/secret, TLS, timeout) và validate cấu hình khi khởi động. Secrets lấy từ environment/User Secrets/secrets store; chỉ giá trị development mẫu mới nằm trong compose, tuyệt đối không thêm `.env` hoặc secret cá nhân vào Git.
2. Thêm MinIO SDK phù hợp vào Infrastructure; implement `MinioFileStorageService` qua `IFileStorageService`, dùng stream/cancellation, bucket bootstrap idempotent và thao tác upload/xóa theo object key.
3. Tách rõ URL công khai trả về khỏi object key nội bộ; không trả endpoint quản trị hoặc thông tin xác thực. Dùng key do server dựng `recipes/{recipeId}/{Guid}.{ext}`.
4. Chọn `MinioFileStorageService` làm provider production; giữ `LocalFileStorageService` chỉ nếu còn cần local fallback/dev, chọn bằng cấu hình rõ ràng và tránh hai provider cùng được đăng ký ngầm.
5. Thêm MinIO health/readiness check và kiểm tra bucket tồn tại/quyền truy cập; MinIO down phải cho upload lỗi có kiểm soát, không làm API startup lỗi không rõ nguyên nhân.

### Giai đoạn 2 — Validation và Application workflow

1. Tạo validator/service nhận stream và metadata, kiểm tra length, allowlist MIME, signature cho JPEG/PNG/WebP/AVIF, MIME/extension consistency, tên hiển thị và `altText`; lấy extension/MIME canonical từ định dạng phát hiện được.
2. Giới hạn request multipart tại endpoint/Kestrel và proxy tương ứng 5 MiB cộng overhead nhỏ có kiểm soát; đọc stream có giới hạn thực tế để không dựa duy nhất vào `IFormFile.Length`.
3. Tạo `UploadRecipeImageCommand`/handler (hoặc use case tương đương) kiểm tra recipe tồn tại/chưa xóa, owner/Admin và các trạng thái được phép sửa; không để client quyết định đường dẫn.
4. Upload original lên MinIO trước, thêm `RecipeImage` metadata vào `IUnitOfWork`, tính `OrderIndex`/`IsPrimary` an toàn; khi lưu DB thất bại thì bù trừ xóa object.
5. Bổ sung ràng buộc/migration tối đa một ảnh primary chưa xóa cho mỗi recipe; xử lý dữ liệu primary cũ trước khi tạo partial unique index nếu database đã có dữ liệu.
6. Enqueue job resize sau khi có bản ghi ổn định; job đọc key original, sinh medium 800×600 và thumbnail 300×300, cập nhật URLs, retry an toàn và không tạo object trùng khi chạy lại. Xác định rõ xử lý enqueue failure (ưu tiên durable/outbox nếu Hangfire có thể mất việc sau khi DB commit).

### Giai đoạn 3 — API và vận hành

1. Thêm route `POST /api/v1/recipes/{recipeId}/images`, multipart `file` + tùy chọn `altText`, authorization Author/Admin và check ownership trong Application.
2. Gắn policy rate limit upload 5 request/phút/IP; xử lý upload body limit, cancellation, ProblemDetails, correlation ID và response DTO/OpenAPI.
3. Bảo đảm log structured chỉ ghi recipeId, userId, object key/correlation ID, kết quả và thời lượng; không log binary, bearer token, access key/secret hay nội dung file.
4. Cập nhật cấu hình MinIO Docker/local và hướng dẫn setup/health; kiểm tra persistent volume để restart MinIO không làm mất object.

### Giai đoạn 4 — Frontend upload experience

1. Tạo `lib/api/fileApi.ts` hoặc feature API rõ nghĩa (`uploadRecipeImage(recipeId, file, onProgress?)`) dùng Axios client đang có; không tự set `Content-Type` multipart nếu Axios/browser phải tự sinh boundary.
2. Tạo `FileUploadDropzone` cho JPEG/PNG/WebP/AVIF, giới hạn 5 MiB phía client để phản hồi sớm; xem validation client là tiện ích UX, backend vẫn là thẩm quyền.
3. Hỗ trợ chọn file/kéo thả, preview an toàn qua object URL và revoke khi thay/xóa/unmount, progress, trạng thái uploading/success/error, retry/cancel và thông báo lỗi dễ hiểu.
4. Tích hợp trong editor/gallery nhận recipeId; callback trả `RecipeImageDto`, cập nhật ảnh ngay và hiển thị trạng thái original/đang tạo medium-thumbnail/hoàn tất. Không giả lập ảnh thành công bằng URL local sau lỗi API.
5. Bảo đảm controls label/keyboard/ARIA, mobile và token/auth failure UX; không cho thao tác upload nếu recipe chưa có ID đã lưu.

### Giai đoạn 5 — Kiểm thử và nghiệm thu

1. Unit tests cho từng chữ ký file hợp lệ, sai magic bytes, MIME/extension giả, file rỗng, sát/vượt 5 MiB, altText, object key và quy tắc primary.
2. Integration tests với MinIO test service: upload thật, key đúng pattern, object tải lại được qua read URL, record RecipeImage đúng, unauthorized/forbidden/recipe missing và bù trừ object khi DB fail.
3. Kiểm thử đồng thời hai upload đầu tiên trên cùng recipe để xác nhận duy nhất một primary; xác nhận `OrderIndex` không trùng theo chính sách đã chọn.
4. Kiểm thử job resize, ảnh lỗi không giải mã, retry/idempotency và xử lý job enqueue failure.
5. Kiểm thử frontend: loại/size sai bị chặn, upload progress, success callback, lỗi mạng/401/403/413/415/429, retry, URL.createObjectURL được dọn, keyboard/screen reader.
6. Chạy build backend/frontend, lint và kiểm thử liên quan; smoke test MinIO qua Docker local; xác nhận secret không xuất hiện trong response/log/Git diff.

## 7. Tiêu chí nghiệm thu

- Owner/Admin tải được ảnh hợp lệ dưới 5 MiB; người khác không upload được vào recipe đó.
- JPEG, PNG, WebP, AVIF được nhận dựa trên chữ ký nội dung; giả MIME, giả extension, dữ liệu không phải ảnh, file rỗng hoặc quá cỡ bị từ chối rõ ràng.
- Upload tạo object key đúng `recipes/{recipeId}/{guid}.{ext}` và tạo đúng RecipeImage record; đường dẫn không thể bị điều khiển bằng tên file/folder client.
- Original URL dùng được bởi trang/DTO; credentials MinIO không bao giờ lộ ra client. Lỗi MinIO/DB có bù trừ hoặc trạng thái phục hồi xác định.
- Ảnh đầu tiên thành primary; không thể có hai primary còn hiệu lực sau upload đồng thời.
- Background job tạo medium 800×600 và thumbnail 300×300, xử lý retry/idempotency; UI phản ánh đúng trạng thái xử lý.
- API rate limit 5/phút/IP; lỗi theo ProblemDetails và có correlation ID, không lộ stack trace/secret.
- Xóa mềm recipe không xóa object ngay; upload plan không can thiệp vào chính sách purge sau 30 ngày.

## 8. Phụ thuộc và ngoài phạm vi

- **Phụ thuộc:** MinIO SDK/options/DI, auth ownership, `IUnitOfWork`/repository thao tác RecipeImage, Hangfire/FR-JOB-002 và cấu hình reverse proxy body-size/read URL.
- **Ngoài phạm vi trực tiếp:** FR-FILE-002 xóa file do người dùng khởi tạo; đặt primary/xóa ảnh qua endpoint chuyên dụng; avatar/profile upload; purge recipe sau 30 ngày. Các phần này dùng chung storage abstraction nhưng cần acceptance riêng.
- **Rủi ro cần chốt trước production:** Quyền đọc ảnh Draft và cách tạo URL ổn định. Không dùng presigned URL hết hạn làm URL persisted trong DB nếu các trang phụ thuộc URL đó lâu dài.
