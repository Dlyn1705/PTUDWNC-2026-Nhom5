# Lab 6 — Phần Trâm: giao diện quản lý công thức

Ngày thực hiện: 18/10/2026; cập nhật tích hợp: 20/10/2026. Thành viên: Phan Thị Bảo Trâm — 2312778.

Nguồn phân công: `C:\Users\baotr\Downloads\PHÂN VIỆC LAB 6.docx`.
Nhánh bàn giao: `2312778-phanthibaotram-formcongthuc` (đã đổi tên nhánh cũ), bắt đầu từ `origin/main` tại `5f0fa1e`.

## Đối chiếu ba mục giao diện độc lập của Trâm

Rà soát lại ngày 20/10/2026 trên code tại commit `ff5aee5`. Ba mục này đã triển khai, không cần chờ bàn giao API của Ân:

| Yêu cầu | Kết quả và nơi triển khai |
|---|---|
| Menu dashboard trên mobile | `components/layout/DashboardMobileNav.tsx`, nối vào layout dashboard; menu có tên, trạng thái mở, Tab giữ trong Dialog, Escape đóng và trả focus; chỉ Admin có liên kết danh mục. E2E kiểm tra tràn ngang ở 320/375/640/1024 px. |
| Xác nhận rời trang khi chưa lưu | `hooks/useUnsavedRecipe.ts`, nối vào cả trang tạo/sửa và trạng thái bẩn của nguyên liệu/bước; xác nhận liên kết, tải bản mới, reload/đóng trang và Back/Forward theo phạm vi trình duyệt ghi dưới đây; hủy rời trang giữ nội dung, lưu thành công cập nhật mốc dữ liệu. |
| Accessibility form/modal | RecipeForm và manager có label, mô tả/lỗi, aria-invalid, ID riêng và focus ô sai sau khi mở khóa; modal dùng Radix giữ focus, Escape và trả focus khi đóng; menu và modal có tên truy cập. |

Chạy lại `npm run test:lab6-editor` và `BROWSER_CHANNEL=chrome npm run test:a11y`: cả hai đạt. Đây là kiểm tra tự động trên Chrome với API fixture, không thay thế kiểm thử backend thật hoặc nghiệm thu trên trình duyệt khác. Bản sửa `ff5aee5` bổ sung focus sau validation và khôi phục focus navbar khi CSS ẩn menu lúc resize.

## Phạm vi được thống nhất

Thực hiện các mục thuộc phần Trâm. Component dùng chung của Tuấn và nền tảng API/auth đã được tích hợp vào main. Sau khi cập nhật main `9c02839`, trang tạo/sửa và query dashboard chuyển sang `recipeEditorApi`; mutation trạng thái dùng `recipeLifecycleApi`. RecipeForm sử dụng contract lỗi và helper chung, giữ nguyên bảo vệ dữ liệu chưa lưu.

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
- Giữ RouteLoading/ErrorState và correlationId cho lỗi tải trang sửa; hỗ trợ thử lại theo errorPresentation chung. Phần lỗi mutation/422 và contract cuối đã tích hợp như mục RecipeForm và API bên dưới.
- Menu dashboard trên điện thoại có Tổng quan/Công thức/Danh mục (Admin)/Trang chủ; giữ nhãn truy cập và focus Dialog của component chung. Dùng breakpoint xl để header không tràn khi có đủ menu desktop.
- Nối cảnh báo chưa lưu vào StepManager ở cả trang tạo và sửa. Tải bản mới của toàn form sau xác nhận sẽ tải lại cả nguyên liệu và bước; bước đã lưu không tạo cảnh báo thừa. Thêm mô tả lỗi, aria-invalid và focus vào ô sai khi lưu bước.
- Tạo ID ô nhập/mô tả/lỗi theo `useId` của từng form để các trang được Next.js giữ trong Activity không trùng ID hay gắn nhầm nhãn. Giữ tên truy cập của ô tên món ăn riêng với nội dung hướng dẫn/lỗi.

## Hoàn thiện RecipeForm và xử lý lỗi

- Hai trang tạo/sửa dùng `components/recipes/editor/RecipeForm.tsx` với React Hook Form và Zod. Schema chung kiểm tra tiêu đề, mô tả, hướng dẫn, danh mục, độ khó, số nguyên thời gian/khẩu phần và giới hạn/độ chính xác dinh dưỡng. Giữ hàm build/validate payload hiện có để khớp contract backend.
- Thay xử lý lỗi ép kiểu `error.response` ở trang tạo/sửa bằng `toApiProblemError`. Không sửa interceptor, ApiProblemError hoặc session/auth của Ân/Tuấn.
- Với 400/422 có field errors, gọi `setError` và đưa focus tới ô lỗi đầu tiên khi form đã thoát trạng thái disabled. Hỗ trợ tên PascalCase/camelCase, alias thời gian, `Nutrition.*`, `Ingredients[index].*` và `Steps[index].*`; bỏ qua khóa không thuộc các trường cho phép. Lỗi collection được chuyển vào RHF của manager tương ứng.
- Trước khi tạo công thức, kiểm tra cả RHF nguyên liệu/bước; ô sai có lỗi mô tả và focus, không gửi API khi dữ liệu chưa hợp lệ.
- 401 hiển thị đăng nhập lại với callback nội bộ; 403 giữ form và thông báo quyền, không chuyển sang login; 409 giữ dữ liệu, khóa lưu cho tới khi tải phiên bản mới sau xác nhận bỏ bản nháp. Lỗi khác dùng thông báo chung và correlationId, không hiển thị detail lỗi nội bộ.
- Lưu thành công mới `reset` mốc RHF; RowVersion lấy từ DTO mới nhất của aggregate. Lưu nguyên liệu/bước/ảnh không tự reset bản nháp thông tin cơ bản. Có khóa bằng ref chống submit trùng.
- Khi nối form nguyên liệu vào tạo mới, sửa payload để giữ ghi chú và chuẩn hóa số thập phân dùng dấu phẩy (`1,25` thành `1.25`) theo định dạng mà IngredientManager đã chấp nhận. Nhãn nguyên liệu tách khỏi thông báo lỗi để không đọc lỗi thành một phần tên ô.
- Danh mục tải qua query chung; lỗi tải cho thử lại mà không xóa dữ liệu form. Giữ các component loading/error chung, xác nhận rời trang, kiểm tra chủ sở hữu/Admin và hộp thoại xóa đã có.
- Bỏ hook validation DOM cũ đã hết nơi sử dụng. Bổ sung test schema/mapping và mở rộng Chrome E2E; đưa hai bộ test form vào CI.

## Hoàn tất tích hợp API sau bàn giao

| Mục | Trạng thái | Thực hiện |
|---|---|---|
| Contract lỗi và helper chung | Đã tích hợp | Giữ nguyên ApiProblemError từ interceptor bằng isApiProblemError; chuẩn hóa lỗi chưa có contract bằng toApiProblemError. Chỉ dùng getApiErrorMessage cho thông báo validation do ứng dụng tạo, không đưa detail nội bộ lên UI. |
| API tạo/sửa/xóa/nutrition và query editor | Đã chuyển | Hai trang tạo/sửa cùng hooks/queries/useRecipes.ts import trực tiếp recipeEditorApi; trang sửa gọi thêm endpoint nutrition khi 6 chỉ số thay đổi. Không còn facade recipeApi trong app/components/hooks. |
| API trạng thái | Đã tích hợp từ main | useRecipeMutations dùng recipeLifecycleApi cho publish/archive/unarchive; khôi phục dùng unarchive, không gọi endpoint restore không tồn tại. |
| Loại bỏ cast error.response | Đã rà soát | Các component dùng toApiProblemError; chỉ lớp nền HTTP chịu trách nhiệm chuẩn hóa lỗi và component không đọc trực tiếp response của Axios. |

Phần phụ thuộc API của Trâm đã được nối với nền tảng vừa bàn giao. Facade recipeApi vẫn tồn tại trong lib/api để tương thích và được test riêng; không còn được editor/dashboard sử dụng. Công việc này không thay đổi interceptor, refresh token hay store do thành viên khác bàn giao.

## Kiểm tra

Chạy tại `Culinary_Blog_Nhom5/culinary-blog-web`:

```powershell
npm ci --no-audit --no-fund
npm run lint
npm run typecheck
npm run build
npm run test:common
npm run test:recipe-editor
npm run test:api
npm run test:auth
npm run test:logging
npm run test:ui-store
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

E2E bước thực hiện xác nhận CRUD/reorder, timer 0 phút, chặn gửi trùng, giữ bản nháp thông tin cơ bản, xử lý 409 và bảo vệ bước cuối của công thức Published. Kịch bản reload có chủ ý xác nhận cảnh báo beforeunload mới. Các kiểm thử trình duyệt sử dụng API fixture; bộ integration backend với PostgreSQL/MinIO thật được chạy riêng trong đợt hoàn tất bàn giao.

### Kiểm tra RecipeForm

- Kết quả cuối ngày 20/10/2026: lint, typecheck, production build, 6/6 unit test RecipeForm, kiểm tra payload tạo công thức, Chrome E2E Lab 6 và Chrome E2E bước thực hiện đều đạt. `git diff --check` không phát hiện lỗi whitespace.
- `test:recipe-editor`: 6 test schema/field mapping/payload, bao gồm giới hạn số, độ chính xác dinh dưỡng, khóa lạ/prototype, chỉ số collection không tồn tại, ghi chú nguyên liệu và số thập phân dùng dấu phẩy.
- Chrome E2E bổ sung 422 cho thông tin cơ bản/dinh dưỡng/nguyên liệu/bước; focus sau khi form hết disabled; giữ dữ liệu khi 401/403/500; hiển thị correlationId và không lộ detail; chỉ một PUT khi click lưu trùng; giữ dữ liệu khi hủy tải lại sau 409; chặn giao diện Author sửa công thức người khác và cho Admin mở form bằng session Auth.js riêng.
- Các ca quyền/API trên dùng backend fixture và session thật của Auth.js. Không suy diễn đây là kiểm chứng bảo mật endpoint backend thật.

## Lưu ý khi tích hợp

### Kết quả hoàn tất sau bàn giao API ngày 20/10/2026

| Kiểm tra chạy lại | Kết quả |
|---|---|
| ESLint và Next.js production build (gồm TypeScript) | Đạt |
| Contract API / schema RecipeForm | 7/7 và 6/6 đạt |
| Auth, có AUTH_TEST_REDIS=1 và Redis thật | 20/20 đạt, không bỏ qua test |
| Logging / component chung / UI store | 16/16, 12/12 và 2/2 đạt |
| dotnet test solution Release | 185/185 đạt |
| Integration bước thực hiện ngoài solution | 25/25 đạt |
| Chrome E2E form quản lý công thức | Đạt |
| Chrome E2E quản lý bước thực hiện | Đạt |
| Chrome accessibility form/modal/menu | Đạt |
| Auth E2E hai tiến trình Next.js và Redis | Đạt |
| Production route boundaries, retry, empty/error, pagination/history | Đạt |
| Rà soát error.response và import facade trong app/components/hooks | Không còn |

Backend integration dùng PostgreSQL/MinIO/MailHog local và dữ liệu test cô lập. Browser E2E dùng production Next.js với API fixture; Auth E2E dùng Redis thật và token server kiểm thử. Chưa tuyên bố đã chạy toàn bộ trình duyệt xuyên suốt backend thật hay thay thế nghiệm thu thủ công của cả nhóm. Phạm vi code và tích hợp được phân công cho Trâm đã hoàn tất; nghiệm thu cuối toàn nhóm vẫn theo quy trình review.

- Giữ nguyên `axiosClient`, `problemDetails`, session/auth đã bàn giao để hạn chế chồng lấn. Ca test Redis dùng khóa mã hóa ngẫu nhiên tự sinh khi môi trường không có AUTH_SECRET; CI bật AUTH_TEST_REDIS để không bỏ qua ca này.
- Không tự tạo bộ component trạng thái/phân trang thay Tuấn.
- Đã tích hợp main `9c02839` trong đợt hoàn tất ngày 20/10. Các lần push bổ sung cần cập nhật lại main và kiểm tra theo CONTRIBUTING.md.
