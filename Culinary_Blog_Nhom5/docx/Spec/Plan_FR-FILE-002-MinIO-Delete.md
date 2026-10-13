# Kế hoạch hoàn thiện FR-FILE-002 — Xóa ảnh khỏi MinIO

**Phạm vi:** Cho phép chủ sở hữu recipe hoặc Admin xóa một ảnh của recipe; gỡ ảnh khỏi dữ liệu hiển thị và xóa mọi object MinIO do ảnh đó tạo ra (original, medium, thumbnail).
**Căn cứ:** `Culinary_Blog_Spec.md` mục 3.5 (Ảnh), 3.7 (xóa recipe hai giai đoạn), 5 (API), 8 (NFR), 12 (acceptance); `Plan_FR-FILE-001-MinIO-Upload.md`; danh mục công việc FR-FILE-002 trong `Bang_Phan_Cong_Va_Mo_Ta_Chi_Tiet_Cong_Viec.md`.
**Nguyên tắc ranh giới:** Xóa ảnh đơn lẻ theo yêu cầu người dùng khác với purge recipe đã soft-delete. Xóa recipe phải giữ các object ảnh 30 ngày; không gọi luồng xóa ảnh đơn lẻ từ thao tác soft-delete recipe.

## 1. Mục tiêu và hành vi

Endpoint xóa ảnh chỉ cho phép Author sở hữu recipe hoặc Admin. Sau khi xóa thành công, ảnh không còn được trả về/hiển thị, object gốc và các biến thể được dọn khỏi MinIO, và tập ảnh còn lại vẫn thỏa quy tắc primary. Hành vi có thể retry an toàn nếu MinIO hoặc PostgreSQL gián đoạn; không để một lần lỗi tạo trạng thái mất ảnh nhưng vẫn báo thành công.

Ảnh primary bị xóa thì chọn ảnh còn lại có `OrderIndex` nhỏ nhất (hòa thì `CreatedAt`, sau đó `Id`) làm primary. Nếu không còn ảnh thì recipe không có primary.

## 2. Yêu cầu đã xác định từ đặc tả

- API contract trong mục 5: `DELETE /api/v1/recipes/{id}/images/{imgId}`, quyền Owner/Admin.
- Quy tắc ảnh mục 3.5: chỉ owner/Admin được xóa; xóa primary phải tự chọn ảnh còn lại có thứ tự nhỏ nhất.
- Object key do server sinh theo `recipes/{recipeId}/{guid}.{ext}`; client không được cung cấp URL, object key hay bucket để xóa.
- Ảnh có original, medium và thumbnail. Tất cả object thuộc bản ghi ảnh cần được xóa, kể cả nếu xử lý biến thể chưa hoàn tất hoặc URL biến thể null.
- Xóa recipe ở mục 3.7 là soft delete và giữ ảnh 30 ngày. Chỉ `PurgeDeletedRecipesJob` mới dọn object khi hết hạn; không thay đổi chính sách này.
- Lỗi cần theo RFC 7807 Problem Details, có Correlation ID; không trả stack trace, endpoint nội bộ hoặc thông tin xác thực MinIO.

## 3. Contract API đề xuất

### Request

```http
DELETE /api/v1/recipes/{recipeId}/images/{imageId}
Authorization: Bearer <access-token>
```

Không nhận body. Server tự tra metadata và xác định các object cần xóa từ bản ghi thuộc recipe đã chỉ định. Không cho phép xóa object tùy ý theo URL/key do client gửi.

### Success

Trả `204 No Content` khi ảnh đã bị gỡ khỏi recipe và yêu cầu dọn object đã được hoàn tất hoặc được ghi nhận bền vững để retry. Nếu chọn tác vụ nền, API chỉ trả thành công sau khi trạng thái xóa được lưu bền vững; API đọc ảnh phải loại ảnh đó khỏi kết quả ngay.

### Lỗi

| HTTP | Trường hợp |
|---|---|
| `401` | Chưa xác thực hoặc token không hợp lệ. |
| `403` | Không phải owner và không phải Admin. |
| `404` | Recipe không tồn tại/đã xóa mềm, hoặc image không thuộc recipe chỉ định. Có thể thống nhất trả 404 cho ảnh không thuộc recipe để tránh lộ quan hệ. |
| `409` | Xung đột concurrency hoặc không thể thực hiện vì trạng thái recipe không cho phép. |
| `500` / `503` | Lỗi hạ tầng chưa thể khôi phục; trả ProblemDetails chung, chi tiết chỉ ghi log nội bộ. |

Xóa lặp lại: chọn ngữ nghĩa idempotent. Nếu ảnh đã bị xóa logic thì trả 204; nếu không tồn tại từ đầu, trả 404 theo chính sách đã chốt cho toàn API.

## 4. Hiện trạng mã nguồn và khoảng thiếu

| Phần | Hiện trạng quan sát được | Việc còn thiếu |
|---|---|---|
| Storage contract | `IFileStorageService` đã có `DeleteAsync(fileUrl)`; MinIO implementation trích object key từ URL rồi gọi `RemoveObjectAsync`. | Chuẩn hóa xóa idempotent, hỗ trợ mọi biến thể, xử lý URL không thuộc bucket và cancellation. Ưu tiên contract nhận object key nội bộ thay URL nếu có thể đổi tương thích ngược. |
| Image upload | Use case upload đã lưu URL original, metadata `RecipeImage`, trạng thái xử lý và tạo object key an toàn. | Dùng lại metadata này; không tin imageId/recipeId đơn lẻ nếu quan hệ không khớp. |
| Entity/DB | `RecipeImage` có `OriginalUrl`, `MediumUrl`, `ThumbnailUrl`, `IsPrimary`, `OrderIndex`, `ProcessingStatus`; kế thừa `IsDeleted`. Có unique index primary/ordering theo recipe ở migration mới. | Chốt chiến lược xóa logic hay xóa cứng row; đảm bảo truy vấn thường loại ảnh đang xóa; kiểm soát primary cạnh tranh bằng transaction/constraint. |
| Application | `IUnitOfWork` có `RemoveRecipeImage`; chưa thấy use case xóa ảnh chuyên biệt. | Thêm command/handler xác thực recipe, ownership, quan hệ image và chính sách xóa; phối hợp lưu DB và MinIO có bù trừ/retry. |
| API | `RecipeEndpoints` có các route upload và đọc ảnh; route DELETE theo contract chưa được hiện thực. | Bổ sung DELETE route AuthorPolicy, gửi command qua MediatR, khai báo status/ProblemDetails/OpenAPI. |
| Background/retry | Hangfire đã được dùng cho xử lý ảnh; đặc tả purge recipe yêu cầu retry tối đa 3 lần. | Dùng cơ chế bền vững cho xóa ảnh đơn lẻ hoặc xác định compensation rõ ràng; đảm bảo job không đua với image processing. |
| Frontend | UI upload/gallery chưa đầy đủ theo plan FR-FILE-001. | Nút xóa cần xác nhận hợp lý, loading/error, cập nhật gallery sau thành công và xử lý 401/403/404. Đây là tích hợp phụ thuộc gallery. |

## 5. Quyết định thiết kế cần giữ

1. **Xóa cả ba loại object:** Thu thập URL/key duy nhất khác rỗng từ `OriginalUrl`, `MediumUrl`, `ThumbnailUrl`. Bỏ qua URL null/trùng. Không suy đoán key dẫn xuất nếu có URL persisted; nếu metadata thiếu biến thể, dùng quy tắc key dẫn xuất đã chốt ở upload/job.
2. **Tin metadata DB, không tin input:** Tìm image theo cả `imageId` và `recipeId`; lấy recipe từ cùng aggregate và kiểm tra owner/Admin trong Application. Storage chỉ nhận key/URL đã xác minh.
3. **Nhất quán PostgreSQL–MinIO:** Không có transaction phân tán. Ưu tiên xóa logic/đánh dấu trạng thái `PendingDeletion` và ghi một tác vụ xóa bền vững trong cùng transaction DB; worker xóa object idempotently rồi hard-delete row hoặc chuyển `DeletionStatus=Completed`. Nếu dự án chưa có outbox, dùng Hangfire với cơ chế enqueue bền vững và thiết kế recovery để tìm bản ghi PendingDeletion còn sót. Không xóa DB row trước khi có đường retry cho object thất bại.
4. **Idempotency và lỗi từng object:** Object không tồn tại được xem là đã xóa. Nếu một trong các object lỗi, retry toàn bộ danh sách; các lần xóa trước lặp lại vẫn thành công. Chỉ đánh dấu hoàn tất khi cả bộ object đã được xử lý.
5. **Primary và đồng thời:** Trong transaction khóa/đồng bộ hóa theo recipe, chọn primary thay thế theo `OrderIndex, CreatedAt, Id` và cập nhật ảnh trước khi xóa ảnh cũ. Giữ constraint unique primary; lỗi concurrency thành 409 hoặc retry an toàn.
6. **Job resize đang chạy:** Worker resize phải xác nhận ảnh chưa ở trạng thái PendingDeletion/Deleted trước khi ghi biến thể. Nếu xóa xảy ra đồng thời, job không được tạo lại object sau khi delete hoàn thành; phối hợp bằng trạng thái, lock/version hoặc xóa bù các object job tạo ra.
7. **Xóa recipe khác phạm vi:** Purge sau 30 ngày tiếp tục gọi storage trên toàn bộ URL ảnh rồi mới hard-delete Recipe/cascade Images. Không tái sử dụng soft-delete image theo cách làm mất dữ liệu cần phục hồi trong 30 ngày.

## 6. Kế hoạch triển khai

### Giai đoạn 1 — Chốt mô hình trạng thái và storage contract

1. Chọn status field rõ ràng cho vòng đời xóa (ví dụ `DeletionStatus: Active/Pending/Completed`) hoặc dùng `IsDeleted` với trạng thái công việc riêng; tránh dùng cùng `ProcessingStatus` cho resize lẫn delete.
2. Chọn một trong hai cách gọi storage:
   - Tối thiểu: giữ `DeleteAsync(fileUrl)`, xác thực URL thuộc bucket cấu hình, idempotent khi object không còn.
   - Tốt hơn: thêm phương thức nhận object key nội bộ và chuyển metadata lưu key thay vì phụ thuộc URL public. Bảo đảm upload, resize, read, delete và purge đều nhất quán; có migration/backfill nếu đổi schema.
3. Cấu hình MinIO remove để thao tác có cancellation và chỉ cho phép key dưới prefix recipe tương ứng; không chấp nhận bucket hoặc URL ngoài cấu hình.
4. Chuẩn hóa MinIO lỗi transient/permanent, log object key đã làm mờ nếu cần, không log credentials hoặc signed URL.

### Giai đoạn 2 — Application command và cập nhật aggregate

1. Tạo `DeleteRecipeImageCommand` với `RecipeId`, `ImageId` và handler Application.
2. Load recipe kèm ảnh kể cả khi cần kiểm tra trạng thái; loại recipe soft-deleted; trả 404 nếu recipe/image không khớp.
3. Xác minh `currentUser.IsAdmin || recipe.AuthorId == currentUser.UserId`; không dựa riêng vào endpoint authorization.
4. Kiểm tra image thuộc recipe, chưa xóa/đang xóa; hỗ trợ idempotency theo quyết định ở mục 3.
5. Trong transaction DB:
   - Nếu image primary, chọn ảnh sống còn nhỏ nhất theo `OrderIndex, CreatedAt, Id`, đặt primary trước khi đánh dấu ảnh cũ xóa.
   - Đánh dấu PendingDeletion/soft-delete và ghi tác vụ xóa bền vững (ưu tiên transactional outbox; nếu dùng Hangfire, bảo đảm enqueue failure có thể phục hồi).
   - Cập nhật UpdatedAt/concurrency token của recipe khi phù hợp.
6. Chỉ xem ảnh là đã gỡ ngay khi truy vấn/gallery loại ảnh PendingDeletion; trả success sau commit transaction.
7. Bổ sung query filter/projection để ảnh đã xóa không xuất hiện ở DTO public, dashboard hoặc primary selector.

### Giai đoạn 3 — Worker xóa MinIO và hoàn tất

1. Tạo `DeleteRecipeImageJob` nhận image ID (hoặc operation ID), tải trạng thái với `IgnoreQueryFilters` khi cần, thoát an toàn nếu đã hoàn tất.
2. Thu thập original/medium/thumbnail URLs hoặc object keys; xác thực từng key thuộc bucket/prefix của image/recipe.
3. Xóa lần lượt hoặc song song có giới hạn; coi object not found là thành công; cancellation tôn trọng worker shutdown.
4. Retry transient error với tối đa 3 lần theo yêu cầu purge/background job; phân biệt lỗi không retry được và phát cảnh báo khi cạn retry.
5. Sau khi tất cả object được xóa, hard-delete RecipeImage row hoặc lưu trạng thái Completed theo lựa chọn thiết kế. Dọn tác vụ outbox.
6. Thêm recovery sweep định kỳ cho PendingDeletion bị kẹt, và đảm bảo job resize đang chạy không tái tạo biến thể cho ảnh đã bị xóa.
7. Với purge recipe, tiếp tục xóa toàn bộ object trước khi hard-delete Recipe; nếu bất kỳ ảnh nào lỗi, giữ recipe/metadata để retry, không cascade xóa mất danh sách key.

### Giai đoạn 4 — API contract và vận hành

1. Thêm `DELETE /api/v1/recipes/{id:guid}/images/{imgId:guid}` ở nhóm recipe, yêu cầu AuthorPolicy.
2. Gửi `DeleteRecipeImageCommand` qua MediatR; trả `Results.NoContent()` sau khi trạng thái xóa đã commit bền vững.
3. Khai báo OpenAPI responses 204, 401, 403, 404, 409 và 5xx; ProblemDetails theo middleware hiện có.
4. Structured logs gồm CorrelationId, userId, recipeId, imageId, operationId, retry count và elapsed time; không ghi token, secrets hoặc nội dung file.
5. Nếu xử lý async, cung cấp trạng thái quan sát nội bộ/metric cho số operation Pending, retry, failed và tuổi operation lâu nhất.

### Giai đoạn 5 — Frontend gallery

1. Bổ sung `deleteRecipeImage(recipeId, imageId)` trong API module; không gọi MinIO trực tiếp từ trình duyệt.
2. Trong gallery, chỉ owner/Admin thấy nút xóa theo quyền server; xác nhận trước thao tác nếu hành động xóa là không thể khôi phục.
3. Khi DELETE thành công, loại ảnh khỏi gallery và cập nhật primary từ response/refetch; khi lỗi giữ nguyên ảnh và hiển thị thông báo có thể hành động.
4. Khóa nút khi request đang xử lý, chống double-submit, hỗ trợ keyboard/ARIA và trạng thái retry. Không hiện URL/object key MinIO trong thông báo lỗi.

### Giai đoạn 6 — Xác minh

1. Unit tests cho kiểm tra ownership, image thuộc recipe, xử lý ảnh primary/ảnh cuối, lựa chọn ảnh primary thay thế và các URL null/trùng.
2. Integration tests với MinIO và PostgreSQL cho xóa original + medium + thumbnail, object đã mất, DB rollback, lỗi một object, retry và hoàn tất.
3. Kiểm tra concurrency: hai yêu cầu xóa cùng ảnh, xóa primary đồng thời upload/set-primary, worker resize chạy đồng thời với delete; xác nhận không có hai primary hoặc object được tạo lại.
4. API tests cho 204, 401, 403, 404, 409 và ProblemDetails; xác nhận imageId ở recipe khác không thể bị xóa.
5. Frontend tests cho success, pending state, API failure, retry, gallery/primary refresh và accessibility.
6. Kiểm tra riêng rằng soft-delete recipe không xóa object trước 30 ngày và purge vẫn retry khi MinIO tạm thời lỗi.

## 7. Tiêu chí nghiệm thu

- Owner/Admin xóa được ảnh thuộc recipe hợp lệ; user khác bị 403; ảnh không thuộc recipe không bị tác động.
- Ảnh bị loại khỏi truy vấn/gallery ngay sau khi trạng thái xóa được commit.
- Original, medium và thumbnail đều được xóa khỏi đúng bucket; URL/object key do client gửi không thể điều khiển thao tác.
- Xóa primary chuyển primary sang ảnh sống còn có `OrderIndex` nhỏ nhất (tie-break ổn định); xóa ảnh cuối để lại 0 primary.
- Retry, gọi lặp, object đã không tồn tại và lỗi một phần không làm mất khả năng hoàn tất; operation chưa xong vẫn có metadata đủ để retry.
- Resize job không tái tạo object sau khi delete đã hoàn tất.
- Xóa recipe giữ ảnh trong 30 ngày; purge recipe mới xóa vật lý ảnh sau hạn đó.
- API trả đúng status và ProblemDetails, có Correlation ID; response/log không lộ secret, signed URL hoặc stack trace.

## 8. Phụ thuộc và ngoài phạm vi

- **Phụ thuộc:** FR-FILE-001 (quy ước key/URL và biến thể), `IFileStorageService`, `RecipeImage`/UnitOfWork, authorization owner/Admin, unique primary constraint, Hangfire/background job và global error handling.
- **Ngoài phạm vi:** Xóa toàn bộ recipe ngay khi người dùng yêu cầu; khôi phục ảnh đã xóa riêng; xóa avatar/tệp tùy ý; thay đổi retention 30 ngày của soft-delete recipe.
- **Quyết định đã áp dụng:** Xóa logic `RecipeImage` và đổi primary trong transaction PostgreSQL; sau commit, enqueue Hangfire job bền vững. Job xóa original/medium/thumbnail theo metadata, retry 3 lần và hard-delete row khi dọn object thành công. Gọi DELETE lặp lại sẽ enqueue lại job cho row đã soft-delete, cho phép phục hồi trường hợp enqueue/lần xử lý trước lỗi. Job xử lý resize kiểm tra trạng thái xóa và dọn các biến thể đã tạo nếu ảnh bị xóa đồng thời.
