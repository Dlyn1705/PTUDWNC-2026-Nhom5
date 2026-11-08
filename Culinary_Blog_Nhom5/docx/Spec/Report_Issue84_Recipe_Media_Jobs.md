# Báo cáo nghiệm thu #84 — phần Trâm

Ngày kiểm tra: 31/10/2026. Người thực hiện: Phan Thị Bảo Trâm — 2312778.

Nhánh: `2312778-PhanThiBaoTram-hoanthien-recipe-media-84`, đã đồng bộ main `118758a` trước khi triển khai. Không đưa báo cáo Word cá nhân vào thay đổi này.

## Thay đổi

- StepManager dùng FileUploadDropzone/fileApi chung để upload và chọn ảnh Completed trong gallery, tự điền originalUrl vào bước được chọn; ảnh chỉ được ghi vào bước khi lưu. Bản nháp mới phải tạo recipe trước khi upload.
- Khi upload đổi aggregate RowVersion, đọc lại ETag và so persisted steps với baseline, giữ nguyên mọi nội dung local. Nếu người khác sửa/reorder/xóa/thêm bước trong lúc upload, báo conflict và chặn save thay vì nhận version mới rồi ghi đè. Cập nhật baseline theo thứ tự sau reorder.
- Chặn thao tác bước trong khi upload/reconciliation; nút cancel của dropzone vẫn hoạt động. Giữ dữ liệu khi API lỗi; lỗi lưu bước hiển thị correlation ID nếu có. Hai dropzone dùng help ID riêng.
- Hoàn thiện welcome theo auth contract mới (HTTP 201 trả session): receipt UI riêng theo user, hạn 10 phút, không chứa thông tin đăng nhập; welcome chỉ xuất hiện sau đăng ký mới. Bỏ cách tự hiển thị banner bằng `?registered=true`. Đăng nhập/logout xóa receipt; sessionStorage không khả dụng không làm hỏng đăng ký.
- Compose/PowerShell runner tạo dependency thật cô lập với cổng loopback ngẫu nhiên và credentials tạm; chạy đủ 6 suite yêu cầu cùng Ingredients/Steps, lưu TRX, tự cleanup đúng project, khôi phục biến môi trường.
- Parameter hóa endpoint MinIO/SMTP/MailHog trong fixtures, sửa public URL test retention theo cổng MinIO hiện tại. Test gọi resize trực tiếp chủ động đặt intent đến hạn theo clock host; kiểm tra lịch retry/recovery vẫn chạy riêng bằng Hangfire thật trong ImageProcessing.

## Kết quả dependency thật

Lệnh: `.\Culinary_Blog_Nhom5\tests\run-integration.ps1` từ repository root.

Lượt nghiệm thu sạch: `culinary-issue84-d30789c03ebf`. Đọc kết quả trực tiếp từ TRX: 154 passed, 0 failed, 0 skipped. Container/network của lượt chạy đã được tự dọn thành công.

| Suite | Passed | Dependency và nghiệp vụ kiểm tra |
|---|---:|---|
| RecipeCreation | 12 | PostgreSQL, tạo recipe và dữ liệu lồng, validation/phân quyền |
| RecipeUpdate | 21 | PostgreSQL + signed JWT, Owner/Admin, RowVersion, nutrition và transaction |
| RecipeDeletion | 14 | PostgreSQL + MinIO, quyền xóa, soft delete, retention/purge, retry khi lỗi |
| RecipeImages | 7 | PostgreSQL + MinIO, quyền gallery, primary đồng thời, upload/resize/xóa |
| ImageProcessing | 27 | PostgreSQL + MinIO + Hangfire thật, JPEG/PNG/WebP/AVIF, resize 800×600/300×300, retry/recovery/cleanup |
| WelcomeEmail | 27 | PostgreSQL + Hangfire + SMTP/MailHog thật, gửi HTML/text, lỗi transport không rollback đăng ký |
| Ingredients | 21 | PostgreSQL, CRUD/reorder, null quantity/unit, concurrency và rollback |
| Steps | 25 | PostgreSQL, CRUD/reorder, If-Match, version dùng chung với gallery, giới hạn bước Published |

TRX cục bộ: `Culinary_Blog_Nhom5/tests/TestResults/culinary-issue84-d30789c03ebf/`. Thư mục này bị Git ignore; mỗi người có thể tái tạo bằng runner.

## Đối chiếu tiêu chí nghiệm thu

| Tiêu chí | Bằng chứng |
|---|---|
| Owner/Admin tạo/sửa/xóa; 403/404/409/422 | RecipeCreation/Update/Deletion, Ingredients/Steps; update có test HTTP dùng signed JWT thật; E2E editor kiểm tra quyền và bảo toàn bản nháp khi lỗi |
| Primary đầu tiên và invariant khi set/delete | `PostgreSql_gallery_serializes_mutations_and_preserves_primary`, `Actual_image_routes_enforce_roles_ownership_and_primary_contract` |
| Upload/chọn ảnh bước đúng contract | E2E editor kiểm tra multipart qua dropzone thật, tự điền URL, ETag sau upload, giữ mô tả/URL khi 422 và từ chối ghi đè concurrent edit |
| Welcome chỉ sau đăng ký; email nền không chặn | E2E auth/editor + unit receipt; `Registration_is_atomic_unique_and_keeps_auth_contract_without_waiting_for_email`, `Real_smtp_connection_failure_leaves_durable_pending_without_rolling_back_registration` |
| Dependency thật và hướng dẫn môi trường sạch | 8 suite đạt bằng runner; compose không dùng volume/container development; finally cleanup thành công |
| Định dạng/dung lượng/magic bytes/resize/retry/xóa an toàn | StorageLifecycleTests + ImageProcessingTests: 4 định dạng, giả chữ ký/corrupt, giới hạn 5 MiB, kích thước đầu ra, idempotency, retry và retention |
| Không đưa secret thật vào repo | Credentials phát sinh trong process; file mẫu chỉ placeholder; không ghi `.env` |

## Kiểm tra frontend

- `npm run lint`, `npm run typecheck`, `npm run build`: đạt.
- `test:auth`: 9/9; `test:file-api`: 18/18; `test:recipe-editor`: 6/6; `test:api`: 11/11. Tổng 44 test unit/contract đạt.
- `node tests/steps.e2e.cjs`: đạt CRUD/reorder, validation, chống double submit, 409 và Published last-step.
- `npm run test:auth:e2e`: đạt auth/profile/admin/status regression; thêm axe trên trang welcome mới.
- `npm run test:lab6-editor`: đạt onboarding, editor, upload/chọn ảnh bước, đồng bộ ETag, giữ bản nháp khi 422 và khi người khác sửa trong lúc upload.

Các test trình duyệt dùng production Next và API HTTP fixture xác định; các suite .NET dùng dependency thật như bảng trên. Báo cáo không đánh đồng API fixture với trình duyệt nối trực tiếp toàn bộ backend/storage. Rà soát WCAG/NVDA toàn diện ở mọi breakpoint thuộc issue #92, không tuyên bố đã đóng #92 trong thay đổi này.

## Bàn giao

Hướng dẫn và contract đầy đủ: [Runbook_Issue84_Recipe_Media_Jobs.md](Runbook_Issue84_Recipe_Media_Jobs.md).

Issue #84 vẫn open và assignee `btram0812`. Token Git hiện thiếu quyền `read:project`/`project`, nên chưa cập nhật được card trong GitHub Project; cần đặt In Progress/In Review bằng tài khoản có quyền theo CONTRIBUTING. Không tự đóng issue hoặc đặt Done trước merge.

Khi commit/push và mở PR, phần mô tả dùng `Closes #84`, kèm bảng kết quả trên và contract đã tích hợp. Chỉ nhóm trưởng review/merge; không đưa #92/#93 vào closing keywords của PR này.
