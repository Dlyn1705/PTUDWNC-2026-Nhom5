# Quality gate và cách cập nhật evidence

## Kiểm tra không cần dịch vụ

```powershell
python scripts/quality/traceability.py --check
python -m unittest discover -s scripts/quality -p 'test_*.py'
dotnet test Culinary_Blog_Nhom5/tests/CulinaryBlog.Architecture.Tests
dotnet test Culinary_Blog_Nhom5/tests/CulinaryBlog.Application.Tests
```

`requirements-catalog.json` có đủ 64 mã từ SRS (kể cả SEC-007) và JOB-004 bổ sung. Không dùng số lượng trong bảng tóm tắt SRS để bỏ qua requirement xuất hiện trong thân tài liệu.

Mỗi thành viên cập nhật `traceability.json` theo owner. Dùng file code/API/UI cụ thể, `path::test_symbol` và report/run chứng minh assertion yêu cầu, ghi commit. Sau đó chạy `python scripts/quality/traceability.py` để cập nhật Markdown. Không đánh dấu Verified chỉ vì có test file hoặc issue đã đóng. Catalog và SHA nguồn chỉ cập nhật sau khi đối chiếu PDF/bảng phân công thay đổi.

`endpoint-tests.json` liệt kê các operation WithName hiện có; happy/error dùng `path::test_symbol`. HTTP routes chưa WithName hoặc đăng ký ngoài Endpoints cần rà soát runtime/OpenAPI trước nghiệm thu, không coi inventory tĩnh là toàn bộ endpoint coverage.

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

Chạy `python scripts/quality/traceability.py --check --acceptance`. Lệnh này cố ý fail khi còn thiếu evidence owner hoặc endpoint cases. Đối chiếu #85–#93, CI artifacts, five critical fullstack E2E và approval requirement. Người có quyền quản trị phải kiểm chứng branch protection >=1 approving review, không xem checkbox template là enforcement.
