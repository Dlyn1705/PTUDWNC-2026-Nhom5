# Kế hoạch hoàn thiện FR-JOB-002 — Image Resize / Thumbnail Job

**Ngày phân tích:** 16/10/2026.
**Baseline:** nhánh `main`, commit `0452d23`.
**Trạng thái:** Đã triển khai trên nhánh `2312778-phanthibaotram-fr-job-002-imageresize`; xem [báo cáo và giới hạn xác minh](./Implementation_FR-JOB-002-Image-Resize-Thumbnail-Job.md), [runbook](./Runbook_FR-JOB-002-Image-Resize-Thumbnail.md). Commit/push theo yêu cầu bàn giao tiếp theo; chưa migrate DB ứng dụng.

**Mục tiêu:** Sau upload original thành công, Hangfire tạo medium 800×600 và thumbnail 300×300, cập nhật trạng thái/URL đáng tin cậy; xử lý an toàn khi lỗi, retry, worker dừng, chạy trùng hoặc ảnh/công thức bị xóa đồng thời.

## 1. Căn cứ và phạm vi

- [Culinary_Blog_Spec.md](./Culinary_Blog_Spec.md): mục 3.5 (ảnh), 3.7 (soft delete/purge), 4 (cache invalidation), 6 (API/quyền), 7 (Clean Architecture/Hangfire/MinIO), 8 (độ tin cậy), 9 (baseline cũ).
- [Bang_Phan_Cong_Va_Mo_Ta_Chi_Tiet_Cong_Viec.md](./Bang_Phan_Cong_Va_Mo_Ta_Chi_Tiet_Cong_Viec.md): FR-JOB-002, ImageResizeJob, kích thước biến thể và retry 3 lần.
- [Frontend_Spec.md](./Frontend_Spec.md): ImageGalleryManager hiển thị Original/Medium/Thumbnail và badge đang tạo thumbnail.
- Liên quan FR-RCP-008, FR-FILE-001/002 và purge recipe: không viết lại toàn bộ quản lý ảnh, upload, primary hoặc xóa công thức.

Yêu cầu đã có: upload original trước; JPEG/PNG/WebP/AVIF, tối đa 5 MiB theo giới hạn code hiện tại; kiểm tra magic bytes; quyền owner/Admin; job nền sinh hai biến thể; retry 3 lần. **Crop/pad, alpha, EXIF, animation, backoff, lease, durable attempt cap và recovery là quyết định triển khai đề xuất dưới đây**, không coi là nội dung đã quy định đầy đủ trong đặc tả chính.

## 2. Hiện trạng đối chiếu và phụ thuộc PR

Đường dẫn dưới đây tính từ `Culinary_Blog_Nhom5/`.

| Thành phần | Hiện trạng trên main | Khoảng cần hoàn thiện |
|---|---|---|
| `Infrastructure/Services/RecipeImageProcessingJob.cs` | Có job và adapter Hangfire queue; nhận imageId, retry 3 lần; đọc original, sinh JPEG quality 85, ghi URL/ProcessingStatus. | Resize giữ tỷ lệ nhưng chưa crop/pad nên chưa bảo đảm đúng hai kích thước. Chưa thấy AutoOrient, strip metadata, claim theo ảnh, durable attempt cap hoặc cache invalidation. |
| Decoder | Đang dùng `Magick.NET-Q8-AnyCPU` 14.17.2; có giới hạn width/height 10.000, area 40 triệu pixel, memory/disk 256 MiB và kiểm tra pixel sau decode. | Xác minh ý nghĩa giới hạn thực tế; area không được mặc định coi là cơ chế từ chối ảnh. Cần deadline, multi-frame policy và test ảnh lỗi/bom giải nén. |
| Upload handler | Lưu original/RecipeImage Pending rồi enqueue; enqueue lỗi cố xóa row/object và trả lỗi. | Sau DB commit mà API chết, Pending có thể không có job. Enqueue thành công nhưng ACK lỗi có thể đụng compensation. Cần giữ intent bền vững thay vì xóa upload đã commit vì queue tạm lỗi. |
| `RecipeImage`/configuration | Có URLs, ProcessingStatus string, RowVersion; unique primary/order và filter ảnh chưa xóa. | Chưa có lease, attempt, NextAttemptAt, job id/error code cho xử lý nền hữu hạn. |
| Job hoàn tất/thất bại | Gán URL trực tiếp vào entity tracked; catch dọn file rồi SaveChanges status Failed. | URL đã gán có thể được persist dù object vừa bị cleanup; lỗi ghi DB sau upload cần đường recovery/cleanup, không để Completed hoặc URL giả. |
| Delete/purge | Job xóa dựa trên URLs đã lưu rồi hard-delete row; resize kiểm tra IsDeleted trước/sau upload. | Vẫn có cửa sổ xóa sau kiểm tra cuối trước save; lỗi cleanup có thể để object không còn metadata. Resize chưa kiểm tra recipe soft-delete, purge có thể đua với worker. |
| `MinioFileStorageService` | Dùng MinIO SDK, OpenRead tải toàn object vào MemoryStream; key lấy từ URL theo bucket. | Cần giới hạn byte đọc và xác thực key thuộc đúng ảnh/recipe; không xử lý đường dẫn tùy ý từ job/client. |
| Program/DI | Hangfire PostgreSQL storage/server đã có; đăng ký resize job, deletion recovery và purge. | Main chưa có processing recovery recurring job; tái sử dụng server/queue hiện có. |
| API/DTO | `GET /api/v1/recipes/{recipeId}/images/{imageId}` owner/Admin có ProcessingStatus/URLs. | Giữ contract; chỉ bổ sung metadata an toàn nếu UI thật sự cần. Không public endpoint enqueue hoặc nhận URL tùy ý. |
| Frontend | Có `components/dashboard/RecipeImageUploadPanel.tsx`, hiển thị status thô và original/thumbnail. | Chưa có ImageGalleryManager ở đường dẫn editor trên main; cần polling/badge rõ ràng, stop condition và lỗi có thể thao tác. |

**Phân biệt nhánh:** nhánh `2312778-phanthibaotram-quanlyanhcongthuc` (PR #39, commit `35660d4`) đã có AutoOrient, resize fill/crop center đúng kích thước, DisableConcurrentExecution và recovery Pending quá 5 phút, batch 100. Đây chưa phải baseline đã merge vào main. Recovery đó chưa bao phủ Processing bị kẹt, Failed terminal hoặc giới hạn tổng attempts qua nhiều job. DisableConcurrentExecution ở cùng method không được mặc định coi là khóa riêng từng imageId.

Khi thực hiện phải fetch và kiểm tra lại trạng thái PR #39/#40/#41. Nếu PR #39 đã merge thì phát triển tiếp trên main mới; nếu chưa, thống nhất dependency với nhánh ảnh và tái sử dụng phần phù hợp, tránh tạo hai recovery job hoặc hai bản sửa upload đối nghịch. Không kéo cả nhánh nguyên liệu/welcome email vào PR resize. Mục 9 của đặc tả chính phản ánh 21/09/2026, không dùng để kết luận hiện chưa có MinIO/Hangfire.

## 3. Quyết định đầu ra đề xuất

| Nội dung | Phương án triển khai |
|---|---|
| Medium | Chính xác 800×600, tỷ lệ 4:3. |
| Thumbnail | Chính xác 300×300, tỷ lệ 1:1. |
| Fit | Giữ tỷ lệ, fill rồi crop giữa; không kéo méo. Cho phép upscale ảnh nhỏ để đáp ứng kích thước cố định; ghi rõ tradeoff giảm nét. |
| Orientation | AutoOrient theo EXIF trước resize/crop; kiểm tra width/height sau orientation. |
| Format | JPEG, Content-Type image/jpeg, quality 85 như hiện tại; chuyển sRGB phù hợp, flatten alpha lên nền trắng trước encode. |
| Metadata | Bỏ EXIF/GPS/comment và metadata không cần thiết ở biến thể sau khi áp dụng orientation/color profile. Original giữ nguyên. |
| Animation/multi-frame | Đề xuất chỉ lấy frame đầu thành ảnh tĩnh; không decode toàn bộ animation vô hạn. Nếu decoder không bảo đảm giới hạn tài nguyên, từ chối có reason code rõ ràng. |
| Key | Server sinh từ recipeId/imageId, không filename người dùng; metadata generation/lease quyết định namespace biến thể để worker cũ không xóa output của worker mới. |

Giữ Magick.NET để tái sử dụng JPEG/PNG/WebP/AVIF hiện có. Tài liệu phân công nhắc ImageSharp nhưng không nên thêm thư viện thứ hai hoặc đổi decoder chỉ vì tên ví dụ. Khi triển khai, kiểm tra package/native codec, advisories và license bằng nguồn chính thức tại thời điểm đó; chứng minh AVIF hoạt động trên runtime triển khai thực tế. Không giả định đọc được magic bytes là decode được ảnh.

## 4. Intent bền vững, trạng thái và retry

Ưu tiên bổ sung metadata xử lý chuyên biệt lên RecipeImage hoặc entity processing liên kết một-một nếu giúp tách concurrency; chọn một cách trước migration, không xây outbox tổng quát toàn hệ thống.

Metadata tối thiểu đề xuất: `AttemptCount`, `NextAttemptAt`, `ProcessingStartedAt`, `LeaseToken`, `LeaseExpiresAt`, `HangfireJobId`, `LastErrorCode`, generation/version biến thể. Bản ghi/metadata được tạo cùng transaction insert RecipeImage, trạng thái Pending. Có indexes cho Pending/NextAttemptAt và Processing/LeaseExpiresAt; migration mới, giữ dữ liệu cũ. Nếu dùng ExecuteUpdate/raw SQL thì quản lý RowVersion/timestamp rõ ràng vì AuditInterceptor không tự chạy cho những thao tác đó.

Luồng:

1. Upload original và commit metadata Pending như luồng hiện có, bảo toàn quyền, primary, ordering và response 201.
2. Enqueue sau commit là best effort; enqueue lỗi không xóa original/row đã commit và không trả thất bại giả cho upload thành công. Vẫn bù trừ original nếu DB insert thật sự thất bại. Tình huống DB commit không rõ kết quả cần kiểm tra bằng identity ổn định trước cleanup.
3. Worker claim atomic theo imageId trong transaction ngắn, cấp lease và tăng attempt trước transport/decode. Không giữ transaction/row lock suốt decode hoặc upload. Nhận GUID nội bộ, không URL/key/credential do client điều khiển.
4. Worker khác gặp lease sống không chạy chồng. Thời hạn xử lý tổng phải nhỏ hơn lease, hoặc có renewal và fencing thực sự. Lock Hangfire theo method không thay thế CAS bằng LeaseToken/generation trong DB.
5. Completed chỉ khi cả hai object upload thành công và CAS finalization thành công; cập nhật cả hai URL và trạng thái trong một lần lưu. Không làm thay đổi primary/order/alt text từ entity cũ bị tracked.
6. Lỗi tạm thời chuyển Pending kèm NextAttemptAt/reason code và ném lỗi đã làm sạch để Hangfire retry. Chỉ terminal Failed khi lỗi không thể xử lý hoặc cạn attempts. Không dùng Failed cho mọi lần lỗi nếu còn tự retry; UI không báo thất bại cuối quá sớm.
7. Đề xuất backoff 60/300/900 giây; 3 retry ngoài lần đầu, tối đa 4 attempts tự động cho một generation. Durable cap phải áp dụng cả các job mới do recovery tạo; không reset khi job trùng. Lỗi file không decode/không hỗ trợ/quá giới hạn có thể dừng sớm bằng cơ chế Hangfire state/filter phù hợp.
8. Ảnh/recipe không còn tồn tại hoặc đang xóa: kết thúc không sinh biến thể. Đề xuất xử lý recipe soft-delete bằng trì hoãn/skip có lý do, giữ original và các biến thể đã có theo retention; nếu sau này có restore thì thiết kế rõ cách kích hoạt lại. Archived đơn thuần không phải IsDeleted, không tự xóa ảnh.

## 5. Idempotency, file mồ côi và phối hợp xóa

- Hai URL khác null không đủ chứng minh Completed: có thể trỏ object bị cleanup/mất. Với dữ liệu mới, chỉ publish URLs sau upload/finalization thành công; với dữ liệu cũ, kiểm tra/reconcile có batch, tránh HEAD mọi ảnh trong mỗi request.
- Chốt một giao thức dùng chung cho resize/delete/purge. Đề xuất biến thể có generation namespace; lưu trước các key được phép tạo trong ledger bền vững, sau đó upload, CAS publish chỉ khi image và recipe còn hợp lệ, lease/generation đúng. Stale worker chỉ được cleanup generation của chính nó.
- Ledger/tombstone cleanup không được bị cascade mất trước khi dọn object. Delete/purge đánh dấu ngừng xử lý, phối hợp với worker còn lease và dọn cả original, published variants, key đang tạo và orphan generation; không chỉ dựa vào hai URL cuối.
- Nếu giữ key deterministic hiện tại `{imageId:N}-medium.jpg`/`-thumbnail.jpg`, phải có fencing/lock chung và đường cleanup chứng minh không xóa file của worker mới; không kết hợp key chung với cleanup mù theo danh sách URL cũ.
- Worker kiểm tra trước upload và trước publish, nhưng đây chưa đóng hết race. Khi xóa xảy ra giữa các bước, finalization phải thất bại có kiểm soát và lưu cleanup intent bền vững; lỗi cleanup không chỉ log rồi quên.
- API chết/worker chết sau PUT trước ghi DB: recovery phải biết key có thể tồn tại từ ledger/generation và dọn hoặc tái dùng có kiểm chứng. DB và MinIO không có transaction chung; không hứa không bao giờ có orphan tức thời, mục tiêu là hội tụ và dọn được.
- Purge sau 30 ngày không được bị hoãn vô hạn vì resize cập nhật timestamp của recipe đã soft-delete; không thay đổi mốc retention ngoài phạm vi chức năng.

## 6. Recovery và vận hành

- Đề xuất recurring processing recovery mỗi phút, batch 100; tái sử dụng Hangfire storage/server/queue default hiện có. Nếu dùng queue riêng phải cập nhật worker consume queue đó và test thực tế.
- Quét Pending đến NextAttemptAt và Processing lease hết hạn. Không quét Completed/Failed vô hạn. Pending có job Enqueued/Processing/Scheduled còn hợp lệ không enqueue lặp; khi mất job, enqueue thành công nhưng chưa lưu job id, nhiều dispatcher hoặc storage lệch, claim/CAS vẫn bảo vệ cuối.
- Processing không có lease hợp lệ là dữ liệu cần backfill/recovery theo cutoff, không bị bỏ quên vì chỉ quét Pending. Retry không vượt backoff hoặc mở attempts mới sau Failed.
- Backfill dữ liệu cũ: Completed đủ URL giữ nguyên trước khi reconcile; Pending/Processing cũ không tự coi là còn worker; Failed cũ cần quyết định migration/ops rõ ràng, không bulk reset phát sinh retry vô hạn. Chuẩn hóa trạng thái không rõ và ghi lại số lượng ảnh hưởng.
- Log/metric đề xuất: ImageId/RecipeId/JobId, generation, attempt, status, elapsed, dimension và error code. Không log signed URL, token/credential, nội dung file hoặc đường dẫn tùy ý từ upload; kiểm tra SafeLogSink allowlist.
- Runbook: phân biệt invalid image, original missing, MinIO outage, DB failure, worker stopped, exhausted retries và cleanup pending; operator kiểm tra rồi retry một generation có audit. Chưa cần public retry API hay dashboard mới; dashboard nếu bật phải Admin.

## 7. Bảo vệ tài nguyên và storage

1. Giới hạn cả dung lượng upload HTTP và bytes đọc từ MinIO, kể cả object được thay đổi ngoài API. Không tin Length/extension/Content-Type do client khai báo.
2. Kiểm tra header/dimensions trước cấp phát pixel nếu decoder hỗ trợ, kiểm tra lại sau decode; giới hạn width/height/pixel/frame count, memory/disk, elapsed và số worker xử lý đồng thời theo sức máy.
3. Magick resource limits có thể áp dụng toàn process; cấu hình tập trung, không thay đổi qua lại theo job gây race. Xác minh cancellation của thao tác native đồng bộ; CancellationToken bên ngoài không mặc định ngắt decode đang chạy. Nếu không thể cắt tác vụ đúng hạn, cần cơ chế isolation/worker process thay vì lease giả an toàn.
4. Stream/ảnh clone/buffer dispose đầy đủ. Giới hạn concurrency để nhiều file 5 MiB không tạo lượng pixel cache vượt ngân sách máy. Ngưỡng đề xuất lấy từ hiện trạng rồi đo trên runtime thật, không coi 5 MiB tương đương ảnh ít pixel.
5. Key original/variant phải thuộc bucket/prefix recipe và image được load từ DB; dùng MinIO SDK, không HTTP fetch URL tùy ý. Harden parser dùng chung phải bảo đảm tương thích delete/purge và dữ liệu cũ, tránh mở rộng sửa storage ngoài nhu cầu đã chứng minh.

## 8. API, frontend và cache

- Giữ endpoint trạng thái ảnh owner/Admin và wrapper RecipeImageDto; không rò Draft/Archived cho Guest hoặc cho phép đọc ảnh của recipe khác qua imageId.
- Pending: “Đang chờ tạo thumbnail”; Processing: “Đang tạo thumbnail…”; Completed: hiển thị hai biến thể; Failed: thông báo lỗi phù hợp và cách liên hệ/thử lại theo khả năng backend. Phân biệt lỗi đọc trạng thái với lỗi xử lý ảnh.
- Dùng hook/API layer hiện có hoặc tái sử dụng ImageGalleryManager từ PR #39 khi đã merge. Poll đề xuất 2–5 giây chỉ cho Pending/Processing; dừng Completed/Failed, 401/403/404, unmount và khi ảnh bị xóa. Có giới hạn thời gian/thông báo chờ lâu, không poll vô hạn.
- Preview fallback original khi chưa có biến thể, giữ alt text. Frontend không tự enqueue/retry job qua useEffect, không giả Completed bằng ảnh preview local.
- Sau finalization cần invalidate recipe detail/list/search cache và frontend query liên quan qua abstraction sẵn có. Nếu cache/tag pipeline chưa tích hợp thực tế, ghi dependency và giải pháp trong phạm vi, không tự tuyên bố đã có Redis invalidation chỉ vì được nêu trong spec. Không cập nhật nhầm RowVersion của recipe làm hỏng form tác giả đang mở.
- Trước khi sửa frontend đọc `culinary-blog-web/AGENTS.md` và guide Next.js local liên quan. UI thay đổi phải kiểm tra thực tế trên trình duyệt, responsive và accessibility; build/lint không thay thế E2E.

## 9. Trình tự triển khai và tổ chức file

1. Fetch main, đọc README/CONTRIBUTING, xác định PR #39 đã merge hay chưa; tạo nhánh FR-JOB-002 riêng theo mẫu MSSV-họ tên-chức năng. Yêu cầu tiếp theo đã cho phép triển khai; nhánh riêng đã được tạo; commit/push theo yêu cầu bàn giao tiếp theo.
2. Chốt output contract/state machine, retry cap, generation/lease và giao thức resize-delete-purge; ghi quyết định crop/alpha/multi-frame và chính sách legacy.
3. Bổ sung metadata/ledger, EF configuration/indexes và migration mới. Không sửa migration cũ; rà snapshot/backfill và tương thích triển khai cuốn chiếu trước khi chạy worker mới.
4. Tách transform renderer/options/processing store/cleanup nếu cần thành file Infrastructure riêng; Application chỉ giữ contract, Domain không phụ thuộc Hangfire/Magick.
5. Điều chỉnh upload handler ở đúng đoạn sau commit; không rewrite ownership/primary/order, giữ compensation DB failure và recovery enqueue failure riêng.
6. Hoàn thiện RecipeImageProcessingJob: claim, validate/decode/transform, upload, CAS publish, retry/error và cleanup generation. Giữ tên entrypoint tương thích job Hangfire đã lưu; nếu đổi tên/type phải có adapter chuyển tiếp.
7. Thêm/nâng cấp recovery và cleanup; phối hợp tối thiểu với RecipeImageDeletionJob/PurgeDeletedRecipesJob để không tái sinh file hoặc mất cleanup intent.
8. Bổ sung cache invalidation, status UI/polling và hướng dẫn vận hành. Program/DI chỉ thêm registrations nhỏ, không tạo Hangfire server thứ hai.
9. Chạy ma trận kiểm thử, ghi báo cáo kèm bằng chứng dimensions/MIME/object/DB/job states, giới hạn xác minh và cách cấu hình. Cập nhật main trước push/PR, review diff và không tự merge.

File dự kiến: RecipeImage và processing metadata/ledger mới; EF configuration/migration/snapshot; RecipeImageProcessingJob và recovery; processing/transform/cleanup/options services; UploadRecipeImageCommandHandler; điểm phối hợp delete/purge; DTO/API nếu cần; frontend image manager/hook/API; test project riêng và tài liệu vận hành. Ưu tiên file mới, không sửa các module auth/email/nguyên liệu.

## 10. Ma trận kiểm thử và nghiệm thu

| Nhóm | Tình huống cần kiểm chứng | Kết quả mong đợi |
|---|---|---|
| Đầu ra | JPEG/PNG/WebP/AVIF; landscape/portrait/square; ảnh nhỏ | Decode thành công trên runtime thật; medium đúng 800×600, thumbnail đúng 300×300, JPEG MIME đúng, không méo, original nguyên vẹn. |
| Metadata | EXIF xoay, GPS/comment, alpha, color profile, multi-frame | Orientation đúng, biến thể không giữ GPS, nền trắng cho alpha, frame policy đúng, không vượt ngân sách. |
| Input xấu | Header giả, file cắt cụt, quá byte/pixel/frame, decompression bomb | Thất bại có phân loại, không crash worker/API, không publish URL giả hoặc để retry vô hạn. |
| Upload/queue | Commit thành công rồi enqueue lỗi/API chết; enqueue ACK không rõ | 201 cho upload đã commit, Pending còn original; recovery xử lý; không compensation nhầm dữ liệu đang được worker dùng. |
| Transaction | DB insert thất bại/commit ambiguity; finalization thất bại sau PUT | Bù trừ đúng hoặc kiểm tra commit; variant chưa publish có cleanup/recovery bền vững. |
| Retry | MinIO GET/PUT down; DB down; lỗi lần thứ 1/2 rồi thành công; lỗi 4 lần | Backoff đúng, eventual Completed hoặc Failed cuối; không vượt cap khi có job mới/trùng. |
| Đồng thời | Hai job cùng ảnh; hai ảnh khác nhau; stale worker hoàn tất/cleanup | Một claim hợp lệ mỗi generation; ảnh khác vẫn xử lý song song trong giới hạn; worker cũ không ghi/xóa output mới. |
| Crash | Dừng trước/sau từng PUT, trước/sau DB publish; lease sống/hết hạn | Không mất intent; không chạy chồng khi lease sống; phục hồi hữu hạn và dọn orphan biết được. |
| Xóa | Xóa ảnh/recipe trước job, giữa decode/PUT/finalization; purge sau 30 ngày | Không resurrect row/object; giữ đúng retention; dọn original và mọi generation, kể cả metadata biến thể chưa publish. |
| Recovery | Pending cũ, Processing kẹt, job Deleted/mất, dispatcher song song, Failed | Không bỏ quên Processing; không enqueue storm, vượt backoff hoặc tự mở chu kỳ Failed. |
| Idempotency | Completed chạy lại; object variant thiếu; lỗi cleanup; URL cũ từng bị xóa | Không resize vô ích bình thường; reconcile/cleanup có đường xử lý, không Completed giả vì chỉ nhìn URL khác null. |
| UI/quyền/cache | Owner/Admin/Guest/user khác, cross-recipe id; polling; public cache cũ | Quyền đúng; badge/URL cập nhật và polling dừng; cache không giữ original/null thay cho biến thể hoàn tất quá lâu. |
| Hồi quy | Upload, primary/order/alt, delete, soft delete/purge, job email hiện có | Không đổi hành vi ngoài phạm vi, không mất queue khác, không lộ secret/log nhạy cảm. |

Unit test renderer/options/state transitions; integration PostgreSQL thật cho transactions/claim/CAS/attempts, Hangfire storage/worker thật cho enqueue/retry/recovery, MinIO thật với bucket/prefix và DB test riêng cho output/cleanup/race. Chỉ mock để tiêm lỗi kiểm soát được; mock storage không chứng minh MinIO PUT/GET hoặc codec AVIF thực sự hoạt động.

Smoke: upload ảnh test → response 201 khi còn Pending → worker tạo 2 object → đọc decode lại object để đo dimensions/MIME → DB Completed và URL dùng được → rerun không tạo biến thể rác → kiểm tra delete/race/restart. Không benchmark p95 bằng vài smoke request hoặc tuyên bố coverage 80% khi chưa đo.

Build .NET solution, chạy test resize và hồi quy liên quan; frontend lint/TypeScript/production build và kiểm thử browser nếu UI thay đổi. Ghi rõ test nào dùng clock giả, lỗi mô phỏng và runtime/container đã dùng. Không xóa bucket/mailbox/data người dùng để dọn test.

## 11. Giảm conflict và checklist bàn giao

Các điểm dễ conflict: processing job đã sửa ở PR #39; upload handler; RecipeImage/schema/snapshot; Program/DI; storage/delete/purge; gallery/DTO. Không thêm lại recovery đã có, không mang toàn bộ PR ảnh vào PR resize khi chưa thống nhất dependency. Dùng migration timestamp mới, tránh format toàn file và giữ tương thích job type/method đã persist. Kiểm tra merge với main mới nhất và chạy lại test sau xử lý conflict; không hứa không xung đột với mọi thay đổi tương lai.

- [x] Chốt baseline/dependency PR #39 và output contract crop/alpha/orientation/frame.
- [x] Có medium 800×600, thumbnail 300×300 thật trên MinIO, original không đổi.
- [x] Upload đã commit không bị mất vì enqueue failure; worker xử lý sau commit.
- [x] Claim/lease/generation, retry 3 lần và tổng cap qua recovery được kiểm chứng.
- [x] Processing kẹt, crash sau PUT và finalization failure phục hồi/dọn được.
- [x] Resize-delete-purge không resurrect object hoặc xóa output của worker mới.
- [x] Completed/Failed/UI/cache phản ánh đúng thực tế, không publish URL bị cleanup.
- [x] File xấu/native codec/resource limits/cancellation được kiểm thử trên runtime thật.
- [x] Log/runbook/manual retry không lộ secret hoặc mở endpoint xử lý tùy ý.
- [x] Migration/backfill, tests, build/UI và bằng chứng được ghi vào báo cáo triển khai.

**Ưu tiên:** P0 đúng đầu ra + durable dispatch/claim/finalization + phối hợp xóa; P1 retry/recovery/cleanup và resource safety; P2 UI/cache/observability, tối ưu hiệu năng và bàn giao. Không nghiệm thu chỉ bằng việc có job trong Hangfire hoặc URL medium/thumbnail khác null.
