# #89 — Quality gate và truy vết FR/NFR

Phụ trách: Phan Thị Bảo Trâm, 2312778. Nhánh `2312778-PhanThiBaoTram-truyvet-qualitygate`, nền `47c26ed`. Ngày kiểm tra 06/11/2026. Các kết quả dưới đây là kiểm tra local; kết quả CI và quyết định nghiệm thu được theo dõi trên PR tương ứng.

## Đã triển khai

- [65 yêu cầu có owner, code/test/status/evidence hoặc gap](Requirement_Traceability_Matrix.md): 64 mã từ PDF + JOB-004 từ bảng phân công. Có công cụ extract/kiểm tra lại catalog; hash văn bản chuẩn hóa newline để dùng được trên Windows/Linux.
- [56 endpoint có mapping happy/error](Endpoint_Test_Coverage.md). Mapping không tự thay thế owner review hoặc chứng minh assertion đủ toàn bộ yêu cầu.
- Architecture/CQRS gate kiểm tra project và assembly references; phát hiện persistence mutation trực tiếp, helper cùng class hoặc dispatch Command từ Query. Có test chèn vi phạm để xác nhận detector.
- Unit coverage Application đo riêng; không loại file/attribute Application. Gate gộp theo dòng, từ chối inventory Debug/Release khác nhau, empty report và baseline bị hạ trong PR/push.
- Sonar safety rules/.NET analyzers/EditorConfig; CI warnings-as-errors. Frontend typecheck, ESLint không chấp nhận warning, Prettier regression gate theo hash nợ cũ, production build.
- Năm critical Playwright API E2E qua real routes/services/JWT/PostgreSQL; không mock API. Giữ các browser UI tests hiện hữu trong CI, không gọi API E2E là UI E2E.
- Artifact coverage/TRX/critical report và GitHub step summary, cleanup dependency containers, PR template requirement/test/evidence, ADR/CHANGELOG và liên kết setup/OpenAPI.

## Kết quả

| Kiểm tra | Kết quả |
| --- | --- |
| Application unit (Release) | 55/55, 1221/1444 dòng = 84,556787%; CI floor 84,55% |
| Architecture | 11/11 |
| Python gate tests | 6/6 |
| Health endpoint | 7/7 |
| Integration | 274 ca riêng biệt đạt qua regression + rerun có provenance, không tuyên bố lượt đầu exit 0 |
| Critical API journey | 5 flow + 8 happy/error boundary pairs đạt |
| Backend solution Release | 0 warning / 0 error ở lượt build đã ghi nhận; các project mới/sửa được build trong test tương ứng |
| Frontend | typecheck/lint/format regression đạt; production build Webpack đạt |

Lượt integration đầu có 1 failure trong Auth: latest migration target model thiếu RecipeSlugHistories so với snapshot. Thêm migration `SyncRecipeSlugHistoryTargetModel` **Up/Down không có DDL**, đồng bộ metadata thay vì tạo/xóa bảng có sẵn. Auth rerun sau sửa đạt 42/42; HTTP upload/read-single-image mở rộng rerun 1/1, không cộng trùng test. Database development/production không bị migrate trong lượt này.

Lượt build frontend mặc định bị lỗi fetch font trong sandbox, sau đó Turbopack gặp panic tiến trình trên Windows. Webpack production build đạt; chưa thay compiler mặc định của nhóm hoặc bỏ qua bước build trong CI.

Báo cáo đã lọc tại `quality/evidence/verification-20261106.json`, `unit-coverage-20261106.json`, `critical-api-e2e-20261106.json`. Raw TRX/coverage nằm trong thư mục ignored artifacts/TestResults, không đưa Word/secret vào phạm vi thay đổi.

## Lệnh kiểm tra

```powershell
python scripts/quality/traceability.py --check
python -m unittest discover -s scripts/quality -p 'test_*.py'
dotnet test Culinary_Blog_Nhom5/tests/CulinaryBlog.Architecture.Tests
dotnet test Culinary_Blog_Nhom5/tests/CulinaryBlog.Application.Tests -c Release --collect:"XPlat Code Coverage" --settings Culinary_Blog_Nhom5/tests/application.runsettings --results-directory artifacts/quality/unit
python scripts/quality/coverage_gate.py artifacts/quality/unit
./Culinary_Blog_Nhom5/tests/run-critical.ps1
```

Hướng dẫn chi tiết: `quality/README.md`. Muốn extract lại SRS: cài `scripts/quality/requirements-catalog.txt`, chạy `python scripts/quality/extract_catalog.py`; chỉ dùng `--write` sau khi đối chiếu thay đổi nguồn, sau đó cập nhật rows/Markdown.

## Còn cần nghiệm thu phối hợp

- Ân review architecture, auth/API contract và nợ Domain Identity/Npgsql ghi trong [ADR-0001](ADR-0001-Quality-Gates-And-Existing-Debt.md).
- Linh/Tuấn/Ân/Trâm đối chiếu assertion/evidence cụ thể rồi cập nhật owner/reviewer/commit. Hiện các hàng giữ NeedsOwnerReview; `--acceptance` chủ động không pass nếu chưa đủ Verified.
- Nhóm trưởng kiểm chứng/cấu hình >=1 approving review và required checks phía GitHub. Đọc branch-protection API trả 404 và ruleset list không có mục; không thể kết luận template đã enforce server-side review.
- Đo benchmark setup dưới 5 phút theo điều kiện máy/cache; hiện chưa có số đo.
- Xác nhận mức API E2E cho năm critical flow có đủ phạm vi hay cần thêm cả năm UI production flow. Google endpoint dùng command-handler substitute và avatar dùng storage-port substitute ở contract tests; đây không phải live Google/MinIO evidence của các ca đó.
- OpenAPI/Scalar có metadata summary; chưa chứng minh XML comments bao phủ tài liệu API như SRS yêu cầu. Quyết định thay thế cần ghi nhận/review, không âm thầm đánh dấu đạt.

Các dependency #85/#86/#87/#88/#90/#91/#92/#93 đã đóng theo snapshot GitHub tại `quality/dependency-status-20261106.json`; điều này không tự làm mọi requirement Verified. Chưa dùng `Closes #89` khi các mục phối hợp trên còn mở.
