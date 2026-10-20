# Lab 6 — Phần Trâm: giao diện quản lý công thức

Ngày thực hiện: 18/10/2026; cập nhật tích hợp: 20/10/2026. Thành viên: Phan Thị Bảo Trâm — 2312778.

Nguồn phân công: `C:\Users\baotr\Downloads\PHÂN VIỆC LAB 6.docx`.
Nhánh bàn giao: `2312778-phanthibaotram-lab6-giaodienquanlycongthuc`, bắt đầu từ `origin/main` tại `5f0fa1e`.

## Phạm vi được thống nhất

Thực hiện trước các mục độc lập thuộc phần Trâm. Ngày 20/10, component dùng chung của Tuấn đã có trên main và được tích hợp vào nhánh này. Các mục cần contract API của Ân tiếp tục chờ bàn giao; không tạo bản thay thế trong phạm vi công việc của Ân.

## Phần đã triển khai

- Menu dashboard cho điện thoại và máy tính bảng; danh mục chỉ xuất hiện với Admin. Menu dùng Dialog hiện có, có tên truy cập, giữ focus trong hộp thoại, hỗ trợ Escape và trả focus về nút mở menu.
- Header thu gọn trên màn hình nhỏ; thêm liên kết bỏ qua điều hướng đến nội dung chính. Trang tạo/sửa dùng landmark `main` của layout, tránh lồng hai `main`.
- Theo dõi thông tin công thức chưa lưu ở trang tạo/sửa. Bản sửa so sánh với dữ liệu đã tải/lưu; thay đổi RowVersion do ảnh hoặc nguyên liệu không tự tạo trạng thái bẩn cho thông tin cơ bản.
- Theo dõi cả hàng nguyên liệu chưa lưu. Sau khi một hàng lưu thành công, chỉ cập nhật mốc của hàng đó; các hàng khác đang sửa vẫn được bảo vệ.
- Xác nhận khi bấm liên kết rời trang hoặc tải bản mới để bỏ dữ liệu đang nhập; cảnh báo khi tải lại/đóng tài liệu. Sau khi lưu hoặc xóa thành công, không cảnh báo thừa cho dữ liệu đã lưu.
- Bảo vệ Back/Forward nội bộ trên trình duyệt cung cấp `window.navigation.currentEntry.index`: nếu chọn ở lại, khôi phục vị trí lịch sử trước khi Next.js xử lý, giữ form đang nhập và lịch sử Forward. Listener được đặt ở root layout để đăng ký trước listener điều hướng của Next.js.
- Gắn nhãn cho các ô tạo công thức, bổ sung mô tả/lỗi qua `aria-describedby`, đánh dấu `aria-invalid` và đưa focus đến ô sai đầu tiên khi kiểm tra ràng buộc phía trình duyệt. Lỗi nguyên liệu dùng React Hook Form và hỗ trợ focus khi lưu hàng.
- Hộp thoại xóa ở trang sửa trả focus về nút mở sau khi hủy.
- Khóa các trường đã tạo thành công để tránh nhập tiếp nội dung không thể lưu bằng nút tạo lần hai. Nguyên liệu và ảnh vẫn có thao tác quản lý riêng sau khi tạo.
- Cho phép lưu bản nháp chưa có bước. Sau khi đồng bộ main ngày 20/10, trang tạo/sửa giữ nguyên StepManager của FR-RCP-010, bao gồm nội dung, hẹn giờ, ảnh và phiên bản khi lưu bước.

## Tích hợp component Tuấn ngày 20/10/2026

- Đồng bộ main `8661b94`; kết hợp bốn file xung đột gồm layout dashboard, trang tạo, trang sửa và hộp thoại xóa. Giữ cache key mới, SkipLink/main-content, các trạng thái route, trang tổng quan và bản sửa focus/trạng thái chờ của main.
- Giữ LoadingState, Skeleton, ErrorState, EmptyState đã tích hợp trong RecipeStatusTable trên main. Dùng Pagination chung để chuyển trang theo metadata backend; query key chứa page/pageSize để tránh lấy nhầm cache. Giữ bảng khi tải trang tiếp theo, khóa nút phân trang/thao tác trạng thái trong lúc đang tải. Trang trống sau thay đổi dữ liệu có nút về trang đầu.
- Giữ RouteLoading/ErrorState và correlationId cho lỗi tải trang sửa; hỗ trợ thử lại theo errorPresentation chung. Phần lỗi mutation/422 vẫn chờ contract Ân.
- Menu dashboard trên điện thoại có Tổng quan/Công thức/Danh mục (Admin)/Trang chủ; giữ nhãn truy cập và focus Dialog của component chung. Dùng breakpoint xl để header không tràn khi có đủ menu desktop.
- Nối cảnh báo chưa lưu vào StepManager ở cả trang tạo và sửa. Tải bản mới của toàn form sau xác nhận sẽ tải lại cả nguyên liệu và bước; bước đã lưu không tạo cảnh báo thừa. Thêm mô tả lỗi, aria-invalid và focus vào ô sai khi lưu bước.
- Tạo ID ô nhập/mô tả/lỗi theo `useId` của từng form để các trang được Next.js giữ trong Activity không trùng ID hay gắn nhầm nhãn. Giữ tên truy cập của ô tên món ăn riêng với nội dung hướng dẫn/lỗi.

## Các mục chờ bàn giao

| Mục | Chờ ai | Điều kiện tiếp tục |
|---|---|---|
| Tích hợp contract lỗi đầy đủ và helper `isApiProblemError` / `getApiErrorMessage` | Ân | Contract giữ đủ RFC 7807, code, errors, correlationId và interceptor chuẩn hóa lỗi được bàn giao |
| Tách việc gọi API tạo/sửa/xóa/editor và publish/archive/restore theo module | Ân | Module API đã tách, kèm re-export tương thích ở module cũ |
| Chuẩn hóa RecipeForm dùng React Hook Form, ánh xạ 422 vào `setError`, xử lý thống nhất 401/403/409 và correlationId | Ân bàn giao nền tảng; Trâm tích hợp | Hoàn thành các đầu việc nền tảng 1–5 của Ân theo tài liệu phân công |
| Kiểm thử tích hợp toàn bộ luồng sau khi thay contract API | Ân | Tích hợp xong contract lỗi/module API và chạy lại kiểm thử với backend thật |

Các đoạn xử lý API cũ hiện còn tồn tại ở trang tạo/sửa được giữ cho đợt tích hợp tiếp theo; không đánh dấu những mục này là hoàn thành.

## Kiểm tra

Chạy tại `Culinary_Blog_Nhom5/culinary-blog-web`:

```powershell
npm ci --no-audit --no-fund
npm run lint
npm run typecheck
npm run build
npm run test:common
npm run test:lab6-editor
node tests/steps.e2e.cjs
```

E2E dùng Next.js production trên cổng ngẫu nhiên, Chrome headless, backend fixture và Redis dành cho session Auth.js. Có thể đặt `AUTH_REDIS_URL` nếu Redis không ở `localhost:6379`. Dùng `E2E_BROWSER_CHANNEL=bundled` khi chạy Playwright Chromium đã cài trên CI. Các API công thức trong E2E là fixture, không phải kiểm chứng phân quyền ở backend thật.

Kết quả ngày 18/10/2026:

| Kiểm tra | Kết quả |
|---|---|
| ESLint toàn frontend | Đạt |
| TypeScript (`tsc --noEmit`) | Đạt |
| Next.js production build | Đạt |
| Chrome E2E (`npm run test:lab6-editor`) | Đạt |
| `git diff --check` | Đạt |

E2E kiểm tra viewport 320/375/640/1024 px; menu Author không có link quản trị; Tab/Escape và trả focus; lỗi nhập liệu không gọi API và focus đúng ô; lỗi dinh dưỡng có mô tả gắn đúng ô; hủy rời trang/tải lại/Back vẫn giữ dữ liệu; nguyên liệu chưa lưu vẫn được bảo vệ; lưu hàng nguyên liệu xong không cảnh báo thừa; lưu công thức xong cho rời trang; 409 giữ nội dung và khóa lưu đến khi tải lại; tạo bản nháp với hàng bước mặc định trống. Không có lỗi JavaScript không được xử lý trong các kịch bản này.

Ảnh kiểm tra cục bộ: `culinary-blog-web/build/lab6-recipe-editor-e2e/mobile-recipe-created.png` (thư mục build được ignore, không đưa vào commit). Fixture đăng xuất khi kết thúc để dọn session kiểm thử.

Phạm vi trình duyệt: kiểm thử tự động hiện chạy trên Chrome. Nhánh bảo vệ Back/Forward nội bộ cần thuộc tính Navigation API nêu trên; trên trình duyệt chưa cung cấp thuộc tính đó, cảnh báo liên kết/tải lại/đóng tài liệu vẫn hoạt động, nhưng chưa bảo đảm bảo vệ Back/Forward trong SPA.

### Kết quả tích hợp ngày 20/10/2026

| Kiểm tra | Kết quả |
|---|---|
| ESLint / TypeScript / Next.js production build | Đạt |
| `npm run test:common` | Đạt 12/12 |
| `npm run test:lab6-editor` | Đạt trên Chrome |
| `node tests/steps.e2e.cjs` | Đạt trên Chrome |
| `git diff --check`, kiểm tra marker xung đột | Đạt |

E2E Lab 6 bổ sung chuyển trang 1–2 và quay lại, trạng thái lỗi danh sách kèm correlationId và thử lại, danh sách rỗng, lỗi tải trang sửa và phục hồi, lưu/kiểm tra lỗi bước, bảo vệ bản nháp bước khi rời trang và khi tải lại, nhãn/ID không trùng giữa các form được cache. Fixture danh mục được cập nhật sang envelope `success/data` theo contract mới đã có trên main.

E2E bước thực hiện xác nhận CRUD/reorder, timer 0 phút, chặn gửi trùng, giữ bản nháp thông tin cơ bản, xử lý 409 và bảo vệ bước cuối của công thức Published. Kịch bản reload có chủ ý xác nhận cảnh báo beforeunload mới. Các kiểm thử tiếp tục sử dụng API fixture; chưa thay thế kiểm thử phân quyền/backend thật trong đợt bàn giao API sau.

## Lưu ý khi tích hợp

- Không thay đổi `axiosClient`, `problemDetails`, session/auth hoặc chia API trước bàn giao để hạn chế chồng lấn với Ân.
- Không tự tạo bộ component trạng thái/phân trang thay Tuấn.
- Đã fetch lại remote và tích hợp main `8661b94` trong đợt ngày 20/10. Các lần push bổ sung cần cập nhật lại main và kiểm tra theo CONTRIBUTING.md.
