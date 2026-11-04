# Lab 8 — phần liên quan chức năng của Phan Thị Bảo Trâm

MSSV: 2312778. Nhánh triển khai: `2312778-PhanThiBaoTram-hoanthien-editor-congthuc`, từ main `277e0f2`.

Ngày nghiệm thu: 03/11/2026.

## Phạm vi đối chiếu phân công

| Yêu cầu Lab 8 | Phần Trâm thực hiện / tích hợp |
|---|---|
| Upload ảnh | Gallery, ảnh bước nấu, primary/delete, xử lý nền resize và trạng thái; tích hợp FileUploadDropzone/fileApi/MinIO chung của Tuấn |
| Trang thêm mới/cập nhật công thức | Form cơ bản, sáu chỉ số dinh dưỡng, nguyên liệu/bước nấu/ảnh, Owner/Admin, RowVersion, giữ bản nháp khi lỗi |
| Draft → Published → Archived/Deleted | Thêm điều khiển trạng thái trong editor qua hook/API/modal chung của Tuấn; xóa mềm và modal xác nhận thuộc Trâm |
| Danh sách người dùng Admin/Author | Frontend đã được tích hợp trên main qua #93; kiểm thử hồi quy quyền truy cập, lọc/phân trang và role mutation. Không ghi nhận mã có sẵn của Ân là phần Trâm viết mới |
| Logging | Dùng axiosClient/httpLogging/client logger chung; kiểm tra request editor/upload/nutrition/lifecycle có status/correlation, không lộ body/password/token. Không xây thêm hệ thống logging song song với Tuấn |
| Các tính năng SRS khác | Giữ scope FR-RCP-003/004/007/008/009/010, FR-JOB-001/002 và các điểm tích hợp liên quan; không nhận toàn bộ tính năng của nhóm |

## Phần bổ sung trong lần này

1. `RecipeEditorLifecycle` hiển thị status hiện tại, nút xuất bản/hủy xuất bản/lưu trữ/khôi phục tương ứng trạng thái. Dùng `useRecipeMutations` và `RecipeLifecycleDialog` có sẵn, không sửa workflow backend. Có xác nhận, khóa chống nhấn lặp, lỗi + correlation ID; chặn đổi trạng thái khi còn nội dung/nguyên liệu/bước chưa lưu hoặc gallery đang thao tác. Sau thành công, nạp lại aggregate/RowVersion và đưa focus về tiêu đề trạng thái.
2. Cho modal chung nhận nhãn reload và ID fallback focus tùy chọn; mặc định của bảng quản lý được giữ nguyên. Editor dùng nhãn “Tải lại công thức” và ID riêng để không trùng với các trang được cache.
3. Sửa form cập nhật để lỗi 422 của endpoint nutrition được gắn đúng ô, đọc bằng screen reader và focus sau khi mở lại fieldset; giữ dữ liệu. Endpoint basic và nutrition vẫn riêng theo SRS, không tự gộp thành API mới.
4. Gallery đồng bộ phiên bản recipe khi upload kết thúc, kể cả đã lưu original nhưng poll bị lỗi/cancel. Không reset bản nháp cơ bản/dinh dưỡng. Gallery báo busy cho trang cha để ngăn đổi trạng thái/lưu/xóa/tải lại trong lúc thao tác; cảnh báo rời trang khi upload đang chạy.
5. Công thức Archived không có dropzone upload ở StepManager; vẫn cho phép chọn ảnh đã có theo contract steps. Khôi phục về Draft để tải ảnh mới.
6. Mở rộng E2E editor cho nutrition 422/retry, failed processing sau gallery commit, vòng đời trong editor, dirty/pending/duplicate guards, soft-delete, logging an toàn và axe của vùng trạng thái. `test:lab8-editor` là alias của runner editor hiện có, giữ script cũ để CI không bị đứt.

Deleted là cờ xóa mềm `IsDeleted`, không thêm giá trị enum trạng thái thứ tư. Xóa recipe vẫn giữ tệp trong retention 30 ngày trước purge theo backend/SRS.

## Chạy kiểm tra

```powershell
# Repository root: PostgreSQL/MinIO/MailHog/Hangfire thật, DB/bucket cô lập
.\Culinary_Blog_Nhom5\tests\run-integration.ps1

cd .\Culinary_Blog_Nhom5\culinary-blog-web
npm ci --include=dev
npm run lint
npm run typecheck
npm run build
npm run test:logging
npm run test:file-api
npm run test:recipe-editor
npx playwright install chromium --only-shell
$env:E2E_BROWSER_CHANNEL = 'bundled'
npm run test:lab8-editor
npm run test:auth:e2e
node tests/steps.e2e.cjs
```

Test trình duyệt chạy production Next với API HTTP fixture; integration .NET chạy dependency thật. Không gọi fixture là kiểm thử trình duyệt nối trực tiếp toàn bộ backend.

## Kết quả

### Backend — dependency thật

Lượt chạy cô lập `culinary-issue84-f932e70dea5c`: **168 passed, 0 failed, 0 skipped**. Container/network đã tự cleanup sau khi chạy. TRX nằm trong `Culinary_Blog_Nhom5/tests/TestResults/culinary-issue84-f932e70dea5c/` (Git ignore).

| Suite | Passed |
|---|---:|
| RecipeCreation | 12 |
| RecipeUpdate | 21 |
| RecipeDeletion | 14 |
| RecipeImages | 7 |
| ImageProcessing | 27 |
| WelcomeEmail | 27 |
| Ingredients | 21 |
| Steps (gồm lifecycle trên main mới) | 39 |

### Frontend

- Lint, TypeScript và production build đạt. Build có một lượt lỗi kết nối Google Fonts; chạy lại đã đạt, không đổi font/design system để che lỗi mạng.
- **40 unit/contract tests đạt**: logging 16, file API 18, recipe editor 6.
- Runner editor (script lịch sử `test:lab6-editor`, alias `test:lab8-editor`) đạt: create/update, nutrition 422 + focus + retry, upload/chọn ảnh bước, đồng bộ version khi gallery processing Failed, chặn trạng thái khi dirty, xuất bản/lưu trữ/khôi phục, chống confirm lặp, soft-delete và logging không lộ dữ liệu.
- `test:auth:e2e` đạt: hồi quy auth/profile, Admin users/filter/pagination/role, status và accessibility. Đây là xác minh tích hợp mã đã có, không phải viết lại chức năng của Ân.
- `tests/steps.e2e.cjs` đạt: CRUD/reorder, validation, concurrency 409, Published last-step và giữ bản nháp cơ bản.
- E2E chạy bằng Chromium headless đúng Playwright trong lockfile; axe vùng trạng thái editor không có serious/critical. Kiểm thử này không thay thế checklist NVDA/WCAG toàn diện của #92.

### Minh chứng giao diện

Dữ liệu trong ảnh là fixture giả dùng cho kiểm thử, không phải thông tin người dùng thật.

- [Editor Published trên mobile](evidence/lab8/editor-published-mobile.png).
- [Editor Archived trên mobile](evidence/lab8/editor-archived-mobile.png).

Các báo cáo Word cá nhân được giữ trên máy và không đưa vào commit mã nguồn.
