# Đối chiếu nghiệm thu background jobs và media — #91

Phụ trách: Phan Thị Bảo Trâm, 2312778. Đối chiếu trên `ed2ae66` (đã có PR #110, #113, #115), ngày 05/11/2026. Tài liệu này ghi bằng chứng và giới hạn, không thay đổi tiêu chí của issue hoặc coi merge là quyết định chấp thuận SMTP exactly-once.

## Bảng đối chiếu

Các tên test dưới đây nằm trong `Culinary_Blog_Nhom5/tests/`. Kết quả trước khi bổ sung ca retention là 185 test qua regression/rerun; kết quả lượt nghiệm thu mới phải được đọc ở phần kết quả bên dưới.

| Tiêu chí #91 | Bằng chứng kiểm thử | Giới hạn/cần duyệt |
| --- | --- | --- |
| Retry tối đa ba lần, exponential backoff, không tạo side effect trùng | `ImageProcessing.Tests/JobDurabilityTests`: `Every_owned_side_effect_job_has_three_exponential_retries`, `Deletion_attempt_cap_and_exponential_backoff_survive_restart_and_duplicate_dispatch`, `Original_cleanup_poison_budget_survives_restart_and_does_not_retry_forever`; `WelcomeEmail.Tests/WelcomeEmailTests`: `Backoff_and_durable_cap_stop_after_four_transport_failures_even_with_duplicate_jobs` | SMTP không có giao dịch nguyên tử với DB: unknown outcome phải giữ NeedsReview. Bằng chứng NotAccepted và worker cũ dừng là điều kiện vận hành, API không tự xác minh provider. Cần nhóm trưởng ghi rõ chấp thuận phạm vi này. |
| Restart/cancellation/queue outage không mất intent hoặc đánh dấu Completed/Sent sai | `JobDurabilityTests`: `Cancelled_deletion_keeps_intent_and_worker_restart_recovers_queue_outage_once`; `ImageProcessingTests`: `Cancellation_does_not_mark_completed_and_preserves_backoff`, `Queue_outage_keeps_uploaded_image_and_recovery_enqueues_only_one_live_job`; `ReconciliationTests`: `Crash_after_submission_checkpoint_survives_restart_without_dispatch_or_send`; `SmtpSmokeTests`: `Real_smtp_acceptance_with_db_outage_never_resends_after_host_restart_and_receipt_reconciliation` | Restart API/Hangfire host thật trên cùng PostgreSQL/MinIO; không bao gồm mất đĩa hoặc phục hồi backup (#88). |
| Lỗi DB/MinIO từng phần có compensate/reconcile | `JobDurabilityTests`: `Partial_object_deletion_and_db_failure_preserve_manifest_until_retry_succeeds`, `Ambiguous_original_put_or_metadata_failure_and_failed_compensation_reconcile_after_api_restart`; `ImageProcessingTests`: `Ambiguous_partial_put_and_failed_cleanup_are_recovered_from_durable_manifest`, `Finalization_db_failure_keeps_manifest_and_cleanup_can_recover_after_restart` | Poison job hết budget giữ ledger Failed để vận hành xử lý; không hứa tự recovery khi dependency hỏng vĩnh viễn. Xem failure matrix và quy trình mở budget có kiểm soát. |
| First-primary/replacement, soft delete khi đang processing, retention/purge qua nhiều batch | `RecipeImages.Tests/GalleryTests`: `PostgreSql_gallery_serializes_mutations_and_preserves_primary`; `ImageProcessingTests`: `Deletion_during_resize_prevents_publish_and_removes_every_object`, `Soft_deleted_recipe_is_not_processed_and_purge_preserves_retention_then_cleans_ledger`; `JobDurabilityTests`: `Recipe_retention_blocks_individual_deletion_and_purge_removes_unpublished_generations`; `RecipeDeletion.Tests/DeletionTests`: `Purge_failure_does_not_block_other_records_or_batches_and_can_retry` (102 recipe) | Giữ metadata/object recipe soft-deleted 30 ngày; không bỏ qua lỗi storage để xóa metadata. |
| Fixture sạch với PostgreSQL + MinIO + Hangfire + MailHog | `tests/run-integration.ps1`, `tests/compose.integration.yml`, `tests/integration-test.env.example` | Docker Desktop và .NET SDK 10; project/DB/bucket riêng, finally cleanup đúng project. Không cần secret production. |
| Failure matrix và log/correlation evidence | [Failure/recovery](Issue_91_Background_Jobs_Failure_Recovery.md), [SMTP runbook](Runbook_Issue91_SMTP_Reconciliation.md), thư mục `evidence/issue91/` | Chỉ lưu JSON đã lọc; raw TRX nằm trong TestResults bị gitignore. Không ghi recipient, token, connection string. |
| Retention của intent SMTP chưa đối soát và audit | `WelcomeEmail.Tests/ReconciliationTests`: `Retention_preserves_unresolved_delivery_and_audit_across_restart_but_cleans_expired_resolved_audit` | Ca mới: giữ NeedsReview/checkpoint/recipient/attempt/audit qua restart và nhiều lượt sweep; dọn audit orphan cũ, giữ orphan mới tới hết hạn; không gửi lại SMTP. |

## Lệnh nghiệm thu thống nhất

Từ thư mục gốc repository:

```powershell
powershell -ExecutionPolicy Bypass -File .\Culinary_Blog_Nhom5\tests\run-integration.ps1 -ProjectPrefix culinary-issue91
```

Runner phải kết thúc exit code 0, không failed/skipped, các dependency test được cleanup. Không xem kết quả lịch sử là kết quả tự động của checkout mới.

## Kết quả lượt nghiệm thu mới

Project `culinary-issue91-bf68aa1f4aae`, trên nền `ed2ae66` cùng ca retention mới: **186/186 đạt trong một lượt đủ tám suite**, exit code 0, không failed/skipped. RecipeCreation 12, RecipeUpdate 21, RecipeDeletion 14, RecipeImages 7, ImageProcessing 35, WelcomeEmail 37, Ingredients 21, Steps 39.

- [Tổng hợp kết quả](evidence/issue91/integration-main-20261105-summary.json).
- [11 sự kiện failure/recovery với business key và log/correlation](evidence/issue91/integration-main-20261105-recovery.json).

PostgreSQL/MinIO/MailHog, network và container của project đã được runner cleanup; không áp dụng migration lên database development/production. Các file Word cá nhân nằm ngoài thay đổi. Chỉ bổ sung test/tài liệu/evidence, không sửa contract production trong lượt này.

## Điều kiện đóng issue

1. Ghi kết quả chạy mới và evidence tương ứng; sửa mọi lỗi mới phát hiện.
2. Nhóm trưởng xác nhận phạm vi SMTP: unknown outcome không tự resend, giữ NeedsReview cho tới đối soát có bằng chứng; không yêu cầu hoặc tuyên bố exactly-once SMTP đầu cuối.
3. Nếu nhóm trưởng yêu cầu provider có idempotency tự động thay thế, đó là phần triển khai tiếp theo theo contract/credential được cung cấp; không suy đoán provider.
4. Khi đầy đủ tiêu chí và phạm vi đã rõ, PR hoàn tất mới dùng `Closes #91`. Issue hiện vẫn mở; tài liệu này không tự đóng issue hoặc tự chuyển Project sang Done.
