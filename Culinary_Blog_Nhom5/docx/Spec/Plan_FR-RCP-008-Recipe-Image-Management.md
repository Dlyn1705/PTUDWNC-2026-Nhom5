# Kế hoạch hoàn thiện FR-RCP-008 — Quản lý ảnh công thức

**Ngày phân tích:** 14/10/2026.
**Trạng thái:** Đã triển khai và kiểm thử tự động ngày 15/10/2026; xem [báo cáo triển khai](./Implementation_FR-RCP-008-Recipe-Image-Management.md) về kết quả và phần kiểm tra trình duyệt còn lại.
**Mục tiêu:** Owner/Admin quản lý bộ sưu tập ảnh đã lưu, tải thêm ảnh, đặt ảnh chính và xóa ảnh; dữ liệu hiển thị luôn đồng bộ với backend.

## 1. Căn cứ và phạm vi

- Tài liệu chính: [Culinary_Blog_Spec.md](./Culinary_Blog_Spec.md), mục 2 (phân quyền), 3.1 (aggregate), 3.5 (ảnh), 3.7 (xóa/concurrency), 4 (cache), 5 (rate limiting), 6 (API), 7 (kiến trúc/entity), 9 (hiện trạng) và 12 (acceptance).
- Đối chiếu bổ sung: [Bang_Phan_Cong_Va_Mo_Ta_Chi_Tiet_Cong_Viec.md](./Bang_Phan_Cong_Va_Mo_Ta_Chi_Tiet_Cong_Viec.md), phần FR-RCP-008; [Frontend_Spec.md](./Frontend_Spec.md), component `ImageGalleryManager`; các plan FR-FILE-001 và FR-FILE-002.
- Tài liệu chính diễn giải nghiệp vụ ảnh nhưng không ghi trực tiếp mã FR-RCP-008; ánh xạ mã chức năng được xác nhận từ tài liệu phân công.
- Các nhận xét hiện trạng trong đặc tả và plan cũ là ảnh chụp tại thời điểm soạn. Bảng hiện trạng dưới đây dựa trên mã nguồn đọc ngày phân tích, tránh triển khai lại upload/delete đã có.

Trong phạm vi: gallery, tải ảnh, primary, xóa, trạng thái xử lý ảnh, tích hợp trình tạo/sửa công thức, quyền truy cập, transaction, cache và kiểm thử. Tái sử dụng FR-FILE-001 (upload), FR-FILE-002 (delete), FR-JOB-002 (resize). Không bổ sung reorder ảnh, giới hạn số ảnh, chỉnh sửa ảnh hoặc API sửa AltText sau upload nếu chưa có yêu cầu riêng.

## 2. Quy tắc nghiệp vụ và tiêu chí chấp nhận

1. Chỉ Author sở hữu recipe hoặc Admin được mutation. Kiểm tra ownership tại Application, không chỉ ở endpoint; image phải thuộc đúng recipe trong URL.
2. Recipe không có ảnh thì không có primary. Khi còn ít nhất một ảnh chưa xóa phải có đúng một primary; ảnh đầu tiên tự động được chọn. Unique index chỉ bảo đảm **tối đa một**, nên Application phải bảo đảm cả trường hợp thiếu primary.
3. Đặt primary chỉ thay đổi cờ ảnh chính, không đổi `OrderIndex`, URL hay trạng thái xử lý. Gọi lại cho ảnh đang primary trả thành công.
4. Xóa primary chọn ảnh còn lại theo `OrderIndex`, rồi `CreatedAt`, rồi `Id`. Xóa ảnh cuối cùng hợp lệ; điều kiện publish hiện chỉ yêu cầu có bước thực hiện.
5. File tối đa 5 MiB theo code hiện tại (`5 * 1024 * 1024` bytes); JPEG, PNG, WebP, AVIF; kiểm tra magic bytes và sự phù hợp MIME/extension. Đặc tả ghi 5 MB, cần ghi rõ cùng đơn vị trong UI/API.
6. Object key do server sinh theo `recipes/{recipeId}/{guid}.{ext}`. Không nhận URL/key/bucket tùy ý từ client cho mutation.
7. Original được lưu trước; job tạo medium 800×600 và thumbnail 300×300. UI dùng original khi biến thể chưa có và hiển thị Pending/Processing/Completed/Failed.
8. Xóa một ảnh gỡ ảnh khỏi gallery ngay sau commit và dọn original/các biến thể có retry. Xóa mềm cả recipe phải giữ ảnh 30 ngày theo chính sách riêng.
9. Mutation thành công và cập nhật biến thể phải làm mới dữ liệu liên quan: gallery, chi tiết, thẻ công thức, category/list/search nếu chứa ảnh.

**Điểm cần chuẩn hóa khi triển khai:** Upload hiện chặn `Archived`, trong khi mục 3.5 chưa nêu hạn chế này và delete hiện không có cùng kiểm tra. Đề xuất giữ chính sách upload hiện tại, cho phép set primary/delete trên Archived còn tồn tại; ghi rõ trong API/UI. Recipe đã soft-delete trả 404 cho quản lý ảnh thông thường. Không tự mở rộng quyền mutation khi bổ sung gallery.

## 3. Hiện trạng và khoảng thiếu

| Thành phần | Hiện trạng đã đọc | Công việc cần hoàn thiện |
|---|---|---|
| `RecipeImage` | Có URL original/medium/thumbnail, AltText, IsPrimary, OrderIndex, ProcessingStatus và IsDeleted/RowVersion kế thừa | Tập trung hóa quy tắc primary, kiểm tra cách cấp/cập nhật concurrency token |
| `RecipeImageConfiguration` | Partial unique index primary theo RecipeId và ordering theo RecipeId/OrderIndex; query filter ảnh chưa xóa | Giữ constraint; kiểm chứng transaction bằng PostgreSQL thật |
| `UploadRecipeImageCommandHandler` | Kiểm tra owner/Admin, kích thước, chữ ký ảnh; ảnh đầu là primary; tính Max(OrderIndex)+1; enqueue resize và compensation | Kiểm soát upload đồng thời, mất primary, lỗi enqueue/compensation; kiểm chứng invalidation |
| `DeleteRecipeImageCommandHandler`, `UnitOfWork` | Đã xóa logic, chọn replacement, lưu hai bước trong transaction; enqueue cleanup; metadata còn lại phục vụ recovery | Bảo vệ cạnh tranh delete/set/upload; chọn replacement từ dữ liệu đọc trong transaction |
| `RecipeEndpoints` | Có POST upload, DELETE ảnh và GET trạng thái từng ảnh | Chưa thấy PATCH primary và GET bộ sưu tập ảnh chuyên biệt |
| `RecipeImageProcessingJob` | Có resize, retry 3 lần, giới hạn decoder, kiểm tra ảnh bị xóa trước/sau upload biến thể | Kiểm thử race với delete; rà soát retry, cache và kích thước thực tế |
| `RecipeRepository`, `GetRecipeBySlugQuery` | Đã include/map ảnh; DTO detail đưa primary lên trước | Gallery cần thứ tự OrderIndex nhất quán; tách rõ thứ tự hero và quản lý |
| `RecipeImageUploadPanel` | Nhập UUID thủ công; chỉ giữ ảnh upload trong phiên; có delete | Tải ảnh đã lưu, set primary, tích hợp editor; lấy lại server state sau mutation |
| `fileApi.ts` | Upload rồi poll tối đa 30 lần; delete | Bổ sung list/set-primary; tách upload thành công khỏi kết quả resize để không mất ảnh khỏi UI khi job lỗi |
| Kiểm thử | Thư mục `tests` hiện tìm thấy project observability; chưa thấy bộ test chuyên biệt ảnh | Thêm test use case, API/PostgreSQL và UI ở mức cần thiết |

## 4. API contract triển khai

Base URL `/api/v1`; tái sử dụng wrapper `ApiResponse<T>` thực tế của dự án và chuẩn lỗi Problem Details. Không thay toàn bộ wrapper chỉ vì đặc tả trình bày dạng rút gọn `{ data: ... }`.

| Method/route | Hành vi | Thành công |
|---|---|---|
| `GET /recipes/{recipeId}/images` **đề xuất bổ sung** | Owner/Admin lấy toàn bộ ảnh chưa xóa, sắp OrderIndex/CreatedAt/Id; không phân trang trong phạm vi này | 200, danh sách `RecipeImageDto`; rỗng là `[]` |
| `POST /recipes/{recipeId}/images` hiện có | Multipart `file`, `altText` tùy chọn tối đa 200 ký tự; original lưu xong, job có thể chưa hoàn tất | 201, DTO và Location |
| `GET /recipes/{recipeId}/images/{imageId}` hiện có | Owner/Admin đọc trạng thái một ảnh | 200, DTO |
| `PATCH /recipes/{recipeId}/images/{imageId}/primary` **theo đặc tả** | Không body; đổi primary idempotent | 200, DTO ảnh chính; frontend refetch collection |
| `DELETE /recipes/{recipeId}/images/{imageId}` hiện có | Xóa logic và ghi nhận đường cleanup bền vững | 204; frontend refetch collection |

DTO thống nhất: `id`, `recipeId`, `originalUrl`, `mediumUrl`, `thumbnailUrl`, `altText`, `isPrimary`, `orderIndex`, `processingStatus`. Hai khai báo frontend trong `types/file.types.ts` và `types/recipe.types.ts` cần dùng cùng contract, tránh lệch trường.

Lỗi: 401 chưa xác thực; 403 sai ownership; 404 recipe không tồn tại/đã xóa hoặc ảnh không thuộc recipe; 409 xung đột; 422 validation; 413 request quá lớn; 429 upload rate limit. Giữ ngữ nghĩa delete lặp lại của handler hiện có (204 khi row đã đánh dấu xóa, 404 nếu không tồn tại). GET gallery/trạng thái yêu cầu AuthorPolicy; xem ảnh public đi qua recipe Published, không dùng endpoint quản lý để lộ Draft/Archived.

## 5. Kế hoạch triển khai theo thứ tự

### Bước 1 — Chuẩn hóa contract và đọc gallery

- Tạo query/handler `GetRecipeImages` trong Application; kiểm tra recipe và ownership, trả ảnh chưa xóa theo thứ tự chuẩn.
- Chuyển kiểm tra quyền đọc trạng thái hiện đặt trực tiếp ở endpoint vào use case dùng chung nếu phù hợp cấu trúc hiện tại.
- Bổ sung GET collection và OpenAPI/status; thống nhất DTO frontend/backend.
- Kết quả: tải lại trang vẫn xem được toàn bộ ảnh, kể cả recipe Draft của owner và recipe bất kỳ của Admin.

### Bước 2 — Hiện thực đặt ảnh chính và kiểm soát cạnh tranh

- Thêm `SetRecipeImagePrimaryCommand`/handler, contract persistence cần thiết trong `IUnitOfWork`, implementation và PATCH endpoint qua MediatR.
- Trong transaction: đọc recipe/ảnh còn hiệu lực, kiểm tra quyền và quan hệ; hạ primary cũ rồi `SaveChanges`; nâng ảnh đích rồi `SaveChanges`; commit. Không dựa vào thứ tự UPDATE do EF tự sắp vì unique index có thể bị vi phạm tạm thời.
- Đề xuất khóa hàng Recipe trong PostgreSQL làm điểm phối hợp cho **tất cả** upload/delete/set-primary; các luồng cùng tuân thủ một cơ chế, không chỉ khóa trong handler mới. Không giữ transaction DB trong lúc truyền file MinIO: upload original trước, đọc lại trạng thái và commit metadata dưới khóa; nếu DB thất bại thì bù trừ object.
- Chọn replacement và tính OrderIndex từ dữ liệu mới đọc dưới cơ chế đồng bộ. Không dùng replacement đã chọn ngoài transaction như nguồn quyết định cuối cùng.
- Chuẩn hóa lỗi unique/concurrency thành 409; kiểm tra RowVersion thực sự thay đổi khi mutation. Theo đặc tả concurrency của Recipe, nếu áp dụng If-Match cho child mutation phải cập nhật cả API và client, không thêm header bắt buộc một phía.
- Khi data cũ có ảnh nhưng không có primary, sửa bằng tác vụ/migration xác định ảnh đầu theo thứ tự chuẩn. Chỉ thêm migration mới khi có thay đổi schema hoặc cần backfill; không sửa migration đã áp dụng.

### Bước 3 — Đồng bộ cache và xử lý ảnh nền

- Rà soát cơ chế invalidation đang dùng; kết nối upload/delete/set-primary với tag `recipes`, `recipe:{slug}` và cache khác thực sự chứa ảnh. Cập nhật UpdatedAt/version của Recipe theo quy ước mutation.
- Invalidation sau commit; nếu cache gặp lỗi không làm mutation đã commit bị báo thất bại thiếu kiểm soát. Có đường retry hoặc TTL giới hạn dữ liệu cũ.
- Job resize hoàn tất cũng làm mới dữ liệu/cache URL biến thể. Kiểm chứng không lưu metadata hoặc tạo lại object của ảnh đã xóa khi job chạy đồng thời.
- Xác định resize là fit trong khung hay crop đúng kích thước: code hiện giữ tỉ lệ nên ảnh có thể không đúng 800×600/300×300. Đề xuất crop giữ tỉ lệ để đạt kích thước đặc tả; xác nhận và ghi rõ tiêu chí trước khi chỉnh job.
- Rà soát lỗi enqueue/compensation upload; bổ sung recovery cho ảnh Pending bị bỏ sót nếu các thử nghiệm cho thấy thiếu đường phục hồi.

### Bước 4 — Hoàn thiện giao diện gallery

- Tạo `components/recipes/editor/ImageGalleryManager.tsx`; tái sử dụng FileUploadDropzone và API hiện có.
- Tích hợp `/dashboard/recipes/[id]/edit`; ở trang tạo mới chỉ bật upload sau khi đã lưu recipe và có ID. Trang nhập UUID hiện có có thể dùng lại component chung.
- Khi mở gallery, lấy ảnh từ server; mỗi ảnh có preview, AltText, badge primary, trạng thái resize, nút “Đặt làm ảnh chính” và “Xóa”. Không bắt người dùng biết UUID trong luồng editor.
- Sau upload nhận ngay DTO 201 và đưa ảnh vào gallery; polling resize chạy riêng. Job Failed vẫn giữ ảnh gốc trong gallery và thông báo phù hợp; hết thời gian poll giữ trạng thái đang xử lý, không báo upload thất bại.
- Sau set-primary/delete refetch và dùng trạng thái server; bỏ cách suy luận `index === 0` trong danh sách local vì danh sách này có thể không chứa toàn bộ ảnh.
- Loading/empty/error rõ ràng; chặn thao tác trùng, xác nhận delete, phục hồi sau 409; hủy polling khi unmount/đổi recipe, tránh response cũ cập nhật gallery mới.
- Nút thao tác dùng được bằng bàn phím, có accessible name; AltText hiển thị đúng, fallback original khi thiếu biến thể. RecipeCard/RecipeHero dùng primary mới sau refresh.

### Bước 5 — Kiểm thử và nghiệm thu

| Nhóm | Tình huống bắt buộc | Kết quả |
|---|---|---|
| Quyền | Anonymous; Author khác; owner; Admin; image thuộc recipe khác | 401/403/404 phù hợp; không đổi DB/MinIO khi bị từ chối |
| Gallery | Ảnh có sẵn, reload, collection rỗng, ảnh soft-delete | Đủ ảnh hợp lệ và thứ tự ổn định; không lộ dữ liệu riêng |
| Primary | Upload đầu/tiếp; đổi A→B; gọi lại B; xóa primary/phụ/cuối | Đúng một primary khi còn ảnh; 0 khi không còn ảnh |
| Concurrency | Hai upload đầu; hai set-primary; set/delete cùng ảnh; delete/upload | Không nhiều primary hoặc mất primary; lỗi 409 có thể phục hồi |
| Upload | Rỗng, biên 5 MiB, vượt biên, MIME/extension giả, magic bytes sai, đủ 4 định dạng | Validate nhất quán; không object rác khi DB lỗi |
| Job/cleanup | Pending/Failed, retry, MinIO lỗi, enqueue lỗi, delete trong lúc resize | Ảnh gốc vẫn hiển thị khi hợp lệ; cleanup có retry; không hồi sinh ảnh đã xóa |
| Cache/public | Đổi/xóa primary trên Published; resize hoàn tất | Card/hero/detail/list hiển thị dữ liệu mới; Draft/Archived không lộ |
| UI | Reload, đổi recipe, 409, polling timeout, thao tác bằng bàn phím | Server state đúng; không mất ảnh đã upload; thông báo dễ hiểu |

- Unit test tập trung nghiệp vụ/authorization/idempotency. Integration test dùng PostgreSQL thật để kiểm tra partial unique index và race; EF InMemory không thay thế được các kiểm tra này.
- Smoke test với PostgreSQL, MinIO, Hangfire và frontend: upload hai ảnh → đổi primary → reload → xóa primary → kiểm tra fallback → xóa ảnh cuối; kiểm tra object được cleanup và soft-delete recipe vẫn giữ ảnh.
- Chạy build/test backend và lint/typecheck/build frontend theo script của repository; ghi kết quả thực tế vào báo cáo nghiệm thu, không coi kế hoạch này là bằng chứng test đã pass.

## 6. Danh sách bàn giao và điều kiện hoàn tất

- [ ] Query gallery và PATCH primary có OpenAPI, phân quyền và status phù hợp.
- [ ] Upload/delete/set-primary dùng cơ chế transaction/concurrency chung; constraint được giữ và dữ liệu cũ hợp lệ.
- [ ] Gallery tích hợp editor, tải ảnh đã lưu, refetch sau mutation, hiển thị primary và xử lý nền đúng.
- [ ] DTO thống nhất; upload thành công không bị đánh đồng với resize thành công.
- [ ] Cache/public preview cập nhật; không vi phạm lưu ảnh 30 ngày khi xóa recipe.
- [ ] Bộ kiểm thử quyền, primary, cạnh tranh và cleanup pass; lưu bằng chứng smoke test.
- [ ] Tài liệu contract và các điểm chuẩn hóa (Archived, 5 MiB, kích thước resize, concurrency) được cập nhật.

**Thứ tự ưu tiên:** P0 API primary + transaction + quyền; P1 gallery/editor + server refetch + cache; P2 củng cố recovery/resize và khả năng quan sát qua test. Chỉ coi FR-RCP-008 hoàn tất khi toàn bộ checklist nghiệm thu đạt, không chỉ khi nút đặt primary hoạt động.
