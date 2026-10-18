# Lab 6 — Phần Trâm: giao diện quản lý công thức

Ngày thực hiện: 18/10/2026. Thành viên: Phan Thị Bảo Trâm — 2312778.

Nguồn phân công: `C:\Users\baotr\Downloads\PHÂN VIỆC LAB 6.docx`.
Nhánh bàn giao: `2312778-phanthibaotram-lab6-giaodienquanlycongthuc`, bắt đầu từ `origin/main` tại `5f0fa1e`.

## Phạm vi được thống nhất

Thực hiện trước các mục độc lập thuộc phần Trâm. Các mục cần contract API của Ân hoặc component dùng chung của Tuấn được để lại đến khi bàn giao; không tạo bản thay thế trong phạm vi công việc của hai thành viên đó.

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
- Cho phép bỏ trống hàng bước mặc định khi lưu bản nháp, đúng hành vi của `buildCreateRecipePayload` và thông báo sẵn có trên giao diện.

## Các mục chờ bàn giao

| Mục | Chờ ai | Điều kiện tiếp tục |
|---|---|---|
| Tích hợp contract lỗi đầy đủ và helper `isApiProblemError` / `getApiErrorMessage` | Ân | Contract giữ đủ RFC 7807, code, errors, correlationId và interceptor chuẩn hóa lỗi được bàn giao |
| Tách việc gọi API tạo/sửa/xóa/editor và publish/archive/restore theo module | Ân | Module API đã tách, kèm re-export tương thích ở module cũ |
| Chuẩn hóa RecipeForm dùng React Hook Form, ánh xạ 422 vào `setError`, xử lý thống nhất 401/403/409 và correlationId | Ân bàn giao nền tảng; Trâm tích hợp | Hoàn thành các đầu việc nền tảng 1–5 của Ân theo tài liệu phân công |
| Dùng LoadingState / ErrorState / EmptyState / Pagination trong dashboard | Tuấn | Component dùng chung và props được bàn giao |
| Kiểm thử tích hợp toàn bộ luồng sau khi thay contract/component | Ân/Tuấn | Tích hợp xong các mục trên, chạy lại kiểm thử với backend thật |

Các đoạn xử lý API cũ hiện còn tồn tại ở trang tạo/sửa được giữ cho đợt tích hợp tiếp theo; không đánh dấu những mục này là hoàn thành.

## Kiểm tra

Chạy tại `Culinary_Blog_Nhom5/culinary-blog-web`:

```powershell
npm ci --no-audit --no-fund
npm run lint
npm run typecheck
npm run build
npm run test:lab6-editor
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

## Lưu ý khi tích hợp

- Không thay đổi `axiosClient`, `problemDetails`, session/auth hoặc chia API trước bàn giao để hạn chế chồng lấn với Ân.
- Không tự tạo bộ component trạng thái/phân trang thay Tuấn.
- Đã fetch lại remote trước khi đóng gói commit; main vẫn ở `5f0fa1e`, không có thay đổi mới cần tích hợp. Các lần push bổ sung cần cập nhật lại main và kiểm tra theo CONTRIBUTING.md.
