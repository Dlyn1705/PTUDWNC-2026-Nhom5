# Issue #91 — Độ bền background jobs và dữ liệu media

Phụ trách: Phan Thị Bảo Trâm (`btram0812`, 2312778). Phạm vi: phần background jobs/data durability của NFR-REL-002/003, FR-JOB-001/002, recipe images và soft delete. Không bao gồm backup PostgreSQL, SLA và Redis fallback của #88.

## Chạy nghiệm thu từ môi trường sạch

Cần Docker Desktop hoạt động, .NET SDK 10 và PowerShell. Chạy tại thư mục gốc repository:

```powershell
.\Culinary_Blog_Nhom5\tests\run-integration.ps1 -ProjectPrefix culinary-issue91
```

Chỉ chạy các suite trọng tâm khi phát triển:

```powershell
.\Culinary_Blog_Nhom5\tests\run-integration.ps1 -ProjectPrefix culinary-issue91 -Suites ImageProcessing,WelcomeEmail,RecipeImages,RecipeDeletion
```

Runner khởi tạo PostgreSQL, MinIO và MailHog thật bằng Compose; Hangfire dùng PostgreSQL thật trong từng test host. Mỗi lần có project/port riêng; mỗi fixture có database/bucket riêng. Mật khẩu ngẫu nhiên chỉ tồn tại trong process/container test. Biến tham khảo: `tests/integration-test.env.example`; không cần credential production. `finally` dừng và xóa đúng Compose project/volume vừa tạo, đồng thời khôi phục biến môi trường ban đầu. Không chạy `docker system prune`.

TRX, `integration-summary.json` và `failure-recovery-evidence.json` nằm trong `tests/TestResults/<project>/` (gitignored). Chỉ lưu bản evidence JSON đã kiểm tra và loại thông tin nhạy cảm vào `docx/Spec/evidence/issue91/`. Không commit raw test output có connection string, SMTP payload hoặc access token.

## Chính sách và invariant

- Mỗi business operation có lần đầu và tối đa **3 retry**, backoff **60 / 120 / 240 giây**. Hangfire và ledger dùng cùng `BackgroundJobRetryPolicy`; duplicate job không reset budget. Job hết lượt ở trạng thái Failed cần vận hành xử lý, không tự tạo vòng retry vô hạn.
- Business key: welcome delivery ID (outbox unique theo tài khoản), image ID cho processing/deletion/original upload; generation ID phân biệt các lần render. Lease/token chặn worker cũ finalize công việc của worker mới.
- Upload original ghi intent vào PostgreSQL **trước** PUT, có deadline 120 giây. Nếu PUT/DB ACK không rõ, intent vẫn tồn tại để đối soát sau 10 phút; cleanup kiểm tra cả image soft-deleted trước khi xóa. Tombstone được giữ bảy ngày để dọn PUT hoàn thành muộn. Cleanup lỗi tối đa bốn attempt rồi Failed.
- Processing chỉ publish URL sau khi cả medium 800×600 và thumbnail 300×300 đã được ghi; lỗi finalize giữ manifest để recovery. Original không bị thay bằng variant. Manifest/work không có FK cascade làm mất intent khi recipe bị purge.
- Xóa image commit tombstone và deletion intent cùng transaction. Xóa object là idempotent; metadata deletion và trạng thái Completed cùng commit. Lỗi I/O/DB giữ intent để chạy lại. Xóa lại không tác động image đang active.
- Whole-recipe soft delete giữ metadata và object 30 ngày. Deletion worker không vượt quyền retention của purge; purge khóa recipe/image, dọn cả generation chưa publish trước khi cascade metadata, xử lý batch 100 và cô lập record lỗi.
- Recovery dispatcher có 0 Hangfire retry: lịch minutely quét intent bền vững và deduplicate job Enqueued/Processing/Scheduled. Điều này không tăng số business attempt.

## Failure matrix

| Điểm lỗi / tình huống | Trạng thái sau lỗi | Recovery và kiểm chứng |
| --- | --- | --- |
| Queue không truy cập được sau đăng ký/upload/xóa | Outbox/work Pending đã commit; API không đánh dấu Sent/Completed | Dispatcher chạy lại sau phục hồi; parallel dispatch chỉ giữ một live job; duplicate delivery đã hoàn thành là no-op |
| API/Hangfire host restart | PostgreSQL giữ outbox, work, lease, manifest, job ID; MinIO giữ object | Fixture stop/dispose toàn bộ API/worker rồi tạo host mới trên cùng DB/bucket; pending tiếp tục và terminal không lặp side effect |
| Worker cancel / lease cũ | Pending có backoff hoặc Processing chờ lease hết; không Completed/Sent giả | Worker mới claim bằng token mới; token cũ không finalize; cancellation không rollback đăng ký |
| Poison/transient render/send/delete | Attempt tăng có giới hạn; lỗi được phân loại, không lưu exception chứa payload bí mật vào Hangfire | 60/120/240; sau attempt 4 Failed, duplicate không gọi transport/storage tiếp |
| Original PUT đã ghi nhưng ACK lỗi | Không có image row; upload intent vẫn còn và original có thể tồn tại | Sau deadline, restart rồi cleanup theo business key; xóa idempotent, giữ tombstone |
| Insert metadata thất bại và compensation MinIO cũng lỗi | Không image row; original và upload intent còn lại; API trả lỗi máy chủ | Sweep retry cleanup khi MinIO phục hồi; không trả 409 giả cho DB outage |
| PUT variant một phần + cleanup lỗi | Manifest ghi key trước I/O; không publish URL giả | Sweep theo manifest; generation mới không bị worker cũ xóa; original giữ nguyên |
| Commit finalize processing lỗi | Manifest/work giữ intent; output đã ghi chưa được publish | Restart và recovery đối soát, không xóa mù output có thể đã commit |
| Xóa original xong, xóa medium lỗi | Image tombstone + deletion work còn; một phần object đã mất | Attempt tiếp theo bỏ qua object không còn và hoàn tất phần còn lại |
| Xóa object xong, DELETE metadata lỗi | Metadata/work chưa Completed; object có thể đã hết | Rollback DB giữ business intent; restart/retry xóa idempotent rồi commit metadata + Completed |
| Recipe bị soft delete trong lúc processing/deletion | Không publish sau soft delete; dữ liệu chưa hết retention được giữ | Worker skip/defer; purge sau 30 ngày dọn metadata/object/generation; failed record không chặn batch sau |
| SMTP accepted nhưng commit Sent thất bại | Outbox vẫn Processing, không báo Sent giả; email có thể đã được nhận | **Giới hạn SMTP:** retry sau lease có thể gửi trùng. Không có transaction chung giữa SMTP và PostgreSQL. Test cố ý xác nhận rủi ro này; muốn exactly-once side effect cần provider hỗ trợ idempotency theo delivery ID |

## Recovery vận hành

Tra cứu theo `job-process-<imageId:N>`, `job-delete-<imageId:N>`, `job-upload-<imageId:N>`, `job-welcome-<deliveryId:N>` hoặc `job-purge-<recipeId:N>`. Log chỉ cần business key, attempt, error category và correlation ID; không ghi recipient, nội dung thư, secret hoặc raw storage/DB exception.

1. Khắc phục nguyên nhân (kết nối, quota, object quyền truy cập, dữ liệu không hợp lệ). Kiểm tra DB row, manifest, trạng thái job và object của đúng business key trước khi retry.
2. Pending/lease hết hạn: dùng recurring recovery job; không enqueue nhiều job thủ công. Failed không được sweep tự reset budget.
3. Với Failed deletion/original cleanup, thao tác quản trị trên DB cần giới hạn đúng một business key, kiểm tra không còn worker/lease sống, giữ bản ghi audit trước/sau và lấy image advisory lock như worker. Chỉ sau khi xác minh object/metadata và nguyên nhân đã sửa mới mở một budget mới (Pending, count 0, due now, clear lease/live job ID hoặc Failed=false cho upload intent). Không reset toàn bộ bảng hoặc xóa ledger để “sửa lỗi”.
4. Welcome SMTP có unknown outcome: đối chiếu mailbox/provider trước khi requeue. Gửi lại có thể trùng; không tự sửa Sent khi chưa có bằng chứng acceptance. Yêu cầu exactly-once vẫn cần quyết định contract provider.
5. Purge retry chỉ áp dụng recipe hết retention. Không xóa metadata trước object hoặc bỏ qua lỗi I/O; chạy lại job sẽ tiếp tục an toàn ở các record/batch còn lại.

## Mức độ bằng chứng

Các test restart thực sự dừng và tạo lại **API/Hangfire host** trên cùng các dependency. Chúng không mô phỏng mất đĩa vật lý, không kill PostgreSQL/MinIO container và không thay cho nghiệm thu backup/disaster recovery của #88. MailHog kiểm tra giao nhận SMTP thực trong happy path/restart; unknown SMTP outcome là giới hạn còn cần quyết định. Chưa được ghi `Closes #91` nếu tiêu chí không gửi trùng trong cửa sổ này chưa được thống nhất.

## Kết quả nghiệm thu 03/11/2026

Lệnh đầy đủ ở trên đạt **176/176 test**, không failed/skipped, trên project cô lập `culinary-issue91-205b3baed25f`:

| Suite | Passed / total |
| --- | ---: |
| RecipeCreation | 12 / 12 |
| RecipeUpdate | 21 / 21 |
| RecipeDeletion | 14 / 14 |
| RecipeImages | 7 / 7 |
| ImageProcessing | 35 / 35 |
| WelcomeEmail | 27 / 27 |
| Ingredients | 21 / 21 |
| Steps | 39 / 39 |

Runner kết thúc exit code 0 và đã xóa cả ba container cùng network của lần chạy. `dotnet ef migrations has-pending-model-changes` đạt, không còn model change chưa có migration. Migrations mới bổ sung deletion work và original upload intent; không áp dụng vào database development/production trong đợt kiểm thử này.

- [Tổng hợp máy đọc được](evidence/issue91/integration-summary.json).
- [Tám tình huống recovery và correlation evidence](evidence/issue91/failure-recovery-evidence.json).

Kết quả pass bao gồm test ghi nhận **giới hạn có thể gửi trùng của SMTP khi accepted/commit Sent bị lỗi**; không được diễn giải 176 test pass thành bảo đảm exactly-once email. Tiêu chí này còn cần thống nhất với người phụ trách contract/provider trước khi đóng #91.
