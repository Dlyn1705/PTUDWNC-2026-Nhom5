# Kết quả triển khai FR-RCP-009 — Quản lý nguyên liệu

**Ngày:** 15/10/2026.

**Nhánh:** `2312778-phanthibaotram-quanlynguyenlieu`, tạo từ `origin/main` tại `0452d23`. Bàn giao trên nhánh riêng theo README/CONTRIBUTING. Nhánh ảnh #39 chưa merge vào main tại lúc bắt đầu; phần nguyên liệu hoạt động độc lập.

**Căn cứ:** [Plan_FR-RCP-009-Ingredient-Management.md](./Plan_FR-RCP-009-Ingredient-Management.md).

## 1. Chức năng đã hoàn thành

- CRUD và đổi thứ tự nguyên liệu qua API riêng; Owner/Admin được quản lý recipe Draft/Published/Archived chưa xóa mềm. Kiểm tra ownership ở Application và đọc lại dưới transaction tại persistence. Ingredient luôn được kiểm tra theo đúng recipe.
- Validation FluentValidation dùng chung cho create recipe có nguyên liệu nested và các thao tác thêm/sửa riêng: tên 1–200, Unit tối đa 50, Notes tối đa 500, Quantity nullable hoặc >0 đúng decimal(10,3), tối đa 100 nguyên liệu.
- Chuẩn hóa tên/chuỗi tùy chọn, giữ null xuyên suốt DB/DTO/UI; không đổi nguyên liệu “vừa đủ” thành số 0, không tự gộp tên trùng.
- Server append, renumber sau xóa và reorder theo danh sách đầy đủ id. Thứ tự 0-based, đọc ổn định theo OrderIndex/CreatedAt/Id. Xóa hàng cuối hợp lệ; xóa một nguyên liệu là soft-delete.
- Mỗi mutation yêu cầu If-Match với ETag Recipe hiện tại, khóa hàng Recipe bằng PostgreSQL FOR UPDATE, kiểm tra version sau khi lấy khóa. Cập nhật child data và UpdatedAt/RowVersion Recipe trong cùng transaction. Version cũ trả 409; không ghi đè thay đổi đồng thời.
- ETag mới trả ở response GET/mutation, CORS expose ETag. GET quản lý dùng no-store. Không thêm tầng cache mới vì các đường recipe hiện đọc DB trực tiếp; frontend cập nhật dữ liệu/version sau mutation.
- `IngredientManager` dùng React Hook Form/useFieldArray và Zod: thêm/xóa hàng kể cả hàng cuối, ghi chú, lượng để trống, nút Lên/Xuống, lưu từng hàng của recipe đã có. Ở trang tạo chưa lưu, chỉ giữ local state và gửi cùng request tạo recipe.
- Khi gặp 409, giữ các giá trị đang nhập, chặn ghi tiếp và yêu cầu tải bản mới; có xác nhận trước khi bỏ nội dung form chưa lưu. Thao tác reorder giữ những nội dung hàng chưa lưu thay vì thay bằng bản server. Hàng mới phải lưu trước khi reorder persisted list.
- Trang sửa phối hợp version với form thông tin cơ bản; chỉ nhận version mới khi dữ liệu nền vẫn khớp, giữ nguyên các trường đang nhập. Khi phần khác sửa recipe, manager yêu cầu reload rõ ràng thay vì âm thầm lấy token mới để ghi dữ liệu cũ.
- IngredientList giữ checklist và scale servings; lượng nhỏ 0.001 hoặc 0.00025 sau scale không bị làm tròn thành 0. JSON-LD không xuất literal `null`/`undefined` khi thiếu đơn vị; thêm ghi chú vào chuỗi nguyên liệu.
- Cập nhật Culinary_Blog_Spec và Frontend_Spec về contract nguyên liệu, nullable, giới hạn và reorder.

## 2. Contract API

Base `/api/v1`, AuthorPolicy. Success dùng `ApiResponse<T>`; lỗi dùng middleware Problem Details hiện có.

| Endpoint | Thành công | Ghi chú |
|---|---|---|
| GET `/recipes/{recipeId}/ingredients` | 200, danh sách và ETag | Chỉ Owner/Admin, no-store. |
| POST `/recipes/{recipeId}/ingredients` | 201, ingredient và ETag mới | If-Match bắt buộc; Location trỏ GET collection thực sự tồn tại. |
| PUT `/recipes/{recipeId}/ingredients/{ingredientId}` | 200, ingredient và ETag mới | Cập nhật nội dung, không dùng để đổi vị trí. |
| DELETE `/recipes/{recipeId}/ingredients/{ingredientId}` | 204 và ETag mới | Soft-delete; renumber; gọi lại với version hiện tại và row đã xóa trả 204. |
| PUT `/recipes/{recipeId}/ingredients/reorder` | 200, danh sách và ETag mới | Body `{ "ingredientIds": ["id1", "id2"] }`; đúng tập id đang tồn tại, không trùng. |

Ví dụ header: `If-Match: "<Base64 RowVersion>"`. Chỉ hỗ trợ strong ETag cụ thể; không nhận `*`, weak ETag hoặc header nhiều version. GET đầu tiên cung cấp token; API tạo recipe mới không yêu cầu If-Match.

Mã lỗi: 401 chưa xác thực, 403 sai role/owner, 404 recipe không tồn tại/đã xóa hoặc ingredient không thuộc recipe, 409 stale version/concurrency, 422 dữ liệu hoặc If-Match không hợp lệ. Reorder sai tập id với version hợp lệ trả 422; request dùng version cũ trả 409 trước khi ghi.

DTO nguyên liệu: `id`, `recipeId`, `name`, `quantity`, `unit`, `notes`, `orderIndex`; Quantity/Unit/Notes có thể null. Public detail cũng giữ nullable và bổ sung OrderIndex.

## 3. Tổ chức mã và giảm conflict

- Application: `Features/Recipes/Ingredients/IngredientModels.cs` (DTO/rules/FluentValidation), `IngredientRequests.cs` (query/command/handler); contract persistence `IRecipeIngredientStore` riêng. Một command điều phối các operation Add/Update/Delete/Reorder, tái sử dụng authorization và transaction contract.
- Infrastructure: `RecipeIngredientStore` riêng, dùng execution strategy với context mới mỗi retry. Không sửa IUnitOfWork hoặc implementation ảnh.
- API: `RecipeIngredientEndpoints.cs` riêng và một dòng đăng ký ở Program. RecipeEndpoints chỉ sửa validation nested-create và chỉ số thứ tự.
- Frontend: component, API client, schema/format helper và tests riêng; chỉ sửa điểm tích hợp ở trang tạo/sửa và hiển thị nguyên liệu/JSON-LD.
- Không thêm dependency, không sửa lock file hoặc solution. Không có migration mới: InitialCreate và model hiện có đã định nghĩa Quantity numeric(10,3) nullable, Unit nullable, query filter và concurrency token đúng yêu cầu. Không tự đổi dữ liệu Quantity = 0 cũ thành null.
- Đã chạy so sánh ba chiều bằng `git merge-file` giữa main, mã hiện tại và nhánh ảnh #39 cho 5 file dùng chung: trang tạo, trang sửa, RecipeEndpoints, Program và DependencyInjection. Cả 5 ghép sạch với nhánh ảnh tại thời điểm kiểm tra. Không merge hai chức năng vào nhánh này và không thể bảo đảm với commit tương lai.
- Working tree không có unmerged entry, `git diff --check` thành công; thay đổi chỉ thuộc nguyên liệu/tài liệu/test liên quan. Commit/push chỉ thực hiện trên nhánh nguyên liệu riêng, không trực tiếp vào main.

## 4. Kết quả kiểm tra

| Kiểm tra | Kết quả thực tế |
|---|---|
| Build solution backend | Thành công, 0 lỗi, 0 cảnh báo. |
| Build project test nguyên liệu từ đầu | Thành công, 0 lỗi, 0 cảnh báo. |
| `CulinaryBlog.Ingredients.Tests` | **21/21 pass**: 16 test validation/domain, 5 test API tích hợp PostgreSQL. |
| `CulinaryBlog.Observability.Tests` | **35/35 pass**. |
| Frontend schema/format tests | **6/6 pass**. |
| TypeScript | `tsc --noEmit --incremental false` thành công. |
| ESLint toàn frontend | `npm run lint` thành công, không cảnh báo ở lần chạy cuối. |
| Frontend production build | `npm run build` thành công. |

Các API test dùng route thực tế, middleware exception và policy của ứng dụng với authentication scheme riêng chỉ trong test. Mỗi test tạo/xóa database tên ngẫu nhiên `fr_rcp009_test_<guid>`, không sửa database ứng dụng.

Đã kiểm tra:

- Owner/Admin, Guest, role khác và Author khác; thiếu version, dữ liệu sai, ingredient thuộc recipe khác.
- Create nested hợp lệ/không hợp lệ; một hàng sai không tạo recipe hoặc child data rác.
- Null được giữ trong API detail; Notes, lượng 0.001, tên trùng, cập nhật về null, xóa cuối/idempotent, thứ tự liên tục.
- Giới hạn 100 hàng; duplicate/foreign id trong reorder không làm thay đổi danh sách hoặc version; reorder stale không khôi phục hàng đã xóa.
- Hai POST cùng version chỉ có một request thành công; form Recipe dùng version cũ trả 409; Archived vẫn sửa nguyên liệu được; recipe soft-delete không còn quản lý được.
- Trigger PostgreSQL trong database test cố ý làm UPDATE Recipe thất bại: reorder trả lỗi và rollback cả thứ tự lẫn version; sau bỏ trigger, cùng request với version cũ chưa thay đổi thực hiện được.
- Frontend từ chối lượng 0/âm/NaN/Infinity/quá precision, hỗ trợ dấu chấm/phẩy và zero tận cùng; lượng nhỏ/JSON-LD hiển thị đúng.

## 5. Chạy lại kiểm tra

Từ gốc repository:

```powershell
dotnet build Culinary_Blog_Nhom5/Culinary_Blog_Nhom5.sln
dotnet test Culinary_Blog_Nhom5/tests/CulinaryBlog.Observability.Tests/CulinaryBlog.Observability.Tests.csproj

# Cấp từ cấu hình local; không commit thông tin xác thực.
$env:INGREDIENTS_TEST_CONNECTION = '<PostgreSQL local connection string; tài khoản có quyền tạo database test>'
dotnet test Culinary_Blog_Nhom5/tests/CulinaryBlog.Ingredients.Tests/CulinaryBlog.Ingredients.Tests.csproj

Set-Location Culinary_Blog_Nhom5/culinary-blog-web
npx tsc -p tsconfig.ingredient-tests.json
node --test build/ingredient-tests/tests/ingredient-form.test.js
npm run lint
npm run build
npx tsc --noEmit --incremental false
```

Chạy build và typecheck lần lượt vì build tạo lại `.next/types`. Test project nguyên liệu độc lập, chưa đưa vào solution để tránh chỉnh file dùng chung; cần chạy rõ csproj như trên.

## 6. Giới hạn xác minh và bước kiểm tra UI

Đã thử khởi tạo công cụ browser để kiểm tra frontend cục bộ nhưng runtime báo `failed to write kernel assets: The system cannot find the path specified`. Vì vậy chưa thực hiện E2E có đăng nhập/kiểm tra bàn phím trực tiếp và chưa có ảnh chụp giao diện; không coi build hoặc API test là bằng chứng đã kiểm tra UI bằng trình duyệt.

Luồng kiểm tra thủ công: tạo recipe có “Muối — Vừa đủ” và “Gia vị — 0.001 g”; mở editor, thêm/sửa Notes, đổi Quantity/Unit về trống, đổi thứ tự, xóa cuối và reload. Xem public detail/đổi servings/JSON-LD. Mở hai tab để kiểm tra 409 giữ nội dung, thử Author khác/Admin, lưu thông tin cơ bản rồi tải lại manager. Khi ghép với PR #39, kiểm tra thêm ảnh đổi version khiến nguyên liệu yêu cầu reload đúng cách.
