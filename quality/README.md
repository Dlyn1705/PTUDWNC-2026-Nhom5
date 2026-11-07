# Quality gate và cách cập nhật evidence

## Kiểm tra không cần dịch vụ

```powershell
python scripts/quality/traceability.py --check
python -m unittest discover -s scripts/quality -p 'test_*.py'
dotnet test Culinary_Blog_Nhom5/tests/CulinaryBlog.Architecture.Tests
dotnet test Culinary_Blog_Nhom5/tests/CulinaryBlog.Application.Tests
```

`requirements-catalog.json` theo dõi SRS gốc, bảng phân công và `Culinary_Blog_Spec.md`. Danh mục hiện có 64 mã từ SRS và JOB-004 từ bảng phân công. `specSections` liên kết từng mục đánh số với phạm vi yêu cầu tương ứng. `specChecklist` liên kết từng dòng checklist mục 12, gồm cả các dòng không có mã riêng. `specCriteria` nêu các tiêu chí cụ thể trên hàng yêu cầu liên quan, như magic bytes, lưu trữ token và Dependency Rule.

Khi một trong ba nguồn thay đổi, đối chiếu cả mã yêu cầu và nội dung tiêu chí rồi chạy `python scripts/quality/extract_catalog.py --write` (cài dependency từ `scripts/quality/requirements-catalog.txt`). Cập nhật hàng, mục nguồn và tiêu chí tương ứng. Chạy `python scripts/quality/traceability.py` để sinh lại Markdown.

Mỗi owner đối chiếu toàn bộ yêu cầu và tiêu chí chuẩn hóa với file code/API/UI cụ thể, test dạng `path::test_symbol` và file evidence của lượt chạy. Điền `reviewedBy`, `reviewedCommit` và chỉ chuyển sang `Verified` sau khi rà soát đủ phạm vi. CI dùng `--check` để kiểm tra danh mục, hash nguồn, tham chiếu và tài liệu sinh.

`endpoint-tests.json` liệt kê các operation WithName hiện có. Mỗi operation cần test happy và error dạng `path::test_symbol`, evidence của lượt chạy và trạng thái `Verified` để qua acceptance. Reviewer mở từng test để xác nhận assertion kiểm tra đúng operation, quyền, mã lỗi và các nhánh hành vi liên quan. HTTP routes chưa WithName hoặc đăng ký ngoài Endpoints cần rà soát qua runtime/OpenAPI trước nghiệm thu.

## Coverage

```powershell
dotnet test Culinary_Blog_Nhom5/tests/CulinaryBlog.Application.Tests --collect:"XPlat Code Coverage" --settings Culinary_Blog_Nhom5/tests/application.runsettings --results-directory artifacts/quality/unit
python scripts/quality/coverage_gate.py artifacts/quality/unit --output artifacts/quality/unit-coverage.json
```

Unit gate tối thiểu 80%; báo cáo ít hơn phải bổ sung test, không hạ baseline. Để đo combined trong fixture cô lập:

Baseline unit đã đo: Release: 1221/1444 dòng = 84,556787%, 55 test đạt. CI yêu cầu >=84,55% để không giảm baseline. Không dùng kết quả collector cũ có exclude CompilerGeneratedAttribute làm baseline vì có thể bỏ state machine async; runsettings hiện không loại attribute/file Application nào.

```powershell
& ./Culinary_Blog_Nhom5/tests/run-integration.ps1 -ProjectPrefix culinary-quality -Suites RecipeCreation,RecipeUpdate,RecipeDeletion,RecipeImages,ImageProcessing,WelcomeEmail,Ingredients,Steps,Auth,Search -Coverage
python scripts/quality/coverage_gate.py Culinary_Blog_Nhom5/tests/TestResults/<project>
```

Mỗi lần runner có project riêng và cleanup trong finally. Không gộp report của phiên bản code khác nhau hoặc nhiều lần run để tăng coverage. CI report combined bao gồm unit cùng phiên bản; đây không thay thế điều kiện unit riêng.

## Frontend

```powershell
cd Culinary_Blog_Nhom5/culinary-blog-web
npm ci
npm run typecheck
npm run lint
npm run format:check
npm run build
```

ESLint Next.js giữ nguyên; Prettier baseline ghi nhận file cũ chưa format. Khi sửa file, format chính file đó; không chạy format toàn repository hoặc tự tăng baseline để bỏ qua thay đổi mới.

Năm critical API E2E (register, login, create, publish, search) chạy bằng `npm run test:e2e:critical-api` với `CRITICAL_TEST_CONNECTION` hoặc `./Culinary_Blog_Nhom5/tests/run-critical.ps1` từ root. Fixture dùng routes/services/JWT/PostgreSQL thật, database riêng được drop khi runner đóng stdin. Đây là API journey, báo cáo phân biệt với UI tests; không gọi nó là năm flow UI production.

## Trước khi đóng issue

Giữ `Refs #89` trong PR khi còn chờ nghiệm thu. Chạy `python scripts/quality/traceability.py --check --acceptance` sau khi các owner và reviewer hoàn tất rà soát. Xem `artifacts/quality/traceability.json` để biết mã yêu cầu và operation còn thiếu. Chỉ đóng #89 khi lệnh đạt, CI của commit cuối xanh và nhóm đã xác nhận các điều kiện nghiệm thu còn lại.

- Đo setup từ checkout sạch sau khi SDK, Docker và Node đã cài. Ghi rõ trạng thái cache, thời gian Compose, restore, npm ci và thời điểm API cùng web phản hồi.
- Đối chiếu Scalar và OpenAPI JSON với các XML comments cho operation và DTO. Ghi phạm vi đã kiểm tra và các phần còn thiếu.
- Chốt phạm vi E2E với reviewer. Báo cáo riêng luồng HTTP và luồng thực hiện qua trình duyệt.
- Xác nhận quyết định xử lý Identity/Npgsql trong Domain ở ADR-0001.
- Quản trị viên cấu hình required status checks theo tên check của workflow trên `main` và tối thiểu một approving review. Kiểm tra bằng PR thử hoặc cấu hình hiển thị trên GitHub.
