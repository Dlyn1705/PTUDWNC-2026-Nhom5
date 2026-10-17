# Kế hoạch hoàn thiện FR-RCP-009 — Quản lý nguyên liệu

**Ngày phân tích:** 15/10/2026.

**Trạng thái:** Đã triển khai và kiểm thử tự động ngày 15/10/2026; xem [báo cáo triển khai](./Implementation_FR-RCP-009-Ingredient-Management.md). Kiểm tra UI trực tiếp còn hạn chế do công cụ browser không khởi tạo được.

**Mục tiêu:** Owner/Admin thêm, sửa, xóa và sắp xếp nguyên liệu của công thức; hỗ trợ nguyên liệu “vừa đủ” xuyên suốt DB, API và giao diện.

## 1. Căn cứ và ranh giới

- Nguồn chính: [Culinary_Blog_Spec.md](./Culinary_Blog_Spec.md), mục 2 (phân quyền), 3.1 (aggregate), 3.3 (tạo recipe), 3.6 (nguyên liệu), 3.7 (xóa/concurrency), 4 (cache), 6 (API), 7 (entity), 10 (chuẩn hóa) và 12 (nghiệm thu).
- Đối chiếu [Bang_Phan_Cong_Va_Mo_Ta_Chi_Tiet_Cong_Viec.md](./Bang_Phan_Cong_Va_Mo_Ta_Chi_Tiet_Cong_Viec.md): mã FR-RCP-009 và component `IngredientManager`; [Frontend_Spec.md](./Frontend_Spec.md), phần Dynamic Ingredient Manager.
- Đặc tả chính mô tả nghiệp vụ nhưng không gắn trực tiếp nhãn FR-RCP-009; ánh xạ mã lấy từ tài liệu phân công.
- Phân tích dựa trên mã hiện có ở nhánh `2312778-phanthibaotram-quanlyanhcongthuc`, commit `35660d4`. Đây là trạng thái có phần quản lý ảnh FR-RCP-008; khi thực hiện FR-RCP-009 phải đối chiếu lại main và tình trạng PR #39, không mặc định phần ảnh đã merge.

Phạm vi: CRUD nguyên liệu độc lập cho recipe đã lưu; dữ liệu nguyên liệu khi tạo recipe; đổi thứ tự; DTO đọc; giao diện editor và hiển thị public; validation, quyền, transaction, concurrency và đồng bộ dữ liệu. Không tạo danh mục nguyên liệu dùng chung, tính dinh dưỡng tự động, quy đổi đơn vị, tự gộp nguyên liệu trùng tên hoặc thay toàn bộ trình biên soạn công thức.

## 2. Quy tắc nghiệp vụ

| Trường | Quy tắc chuẩn |
|---|---|
| `Name` | Bắt buộc; trim; 1–200 ký tự sau chuẩn hóa; không chấp nhận chỉ có khoảng trắng. |
| `Quantity` | `decimal?`, tùy chọn. Có giá trị thì phải > 0; không thay null bằng 0. Phù hợp DB `decimal(10,3)`: tối đa 9.999.999,999 và tối đa 3 chữ số thập phân có nghĩa; từ chối giá trị cần làm tròn thay vì âm thầm đổi số lượng. |
| `Unit` | `string?`, tùy chọn; trim; tối đa 50 ký tự; chuỗi trắng chuyển thành null. Không bắt buộc có Unit khi có Quantity và ngược lại. |
| `Notes` | `string?`, tùy chọn; trim; tối đa 500 ký tự; chuỗi trắng chuyển thành null. Dùng cho “vừa đủ”, “tùy khẩu vị”, “thái nhỏ”… |
| `OrderIndex` | Số nguyên không âm, thống nhất tên này. Đề xuất server quản lý vị trí; danh sách sau mutation có chỉ số liên tục `0..n-1`. |

- Mọi mutation yêu cầu role Author/Admin và kiểm tra owner trong Application; Admin được quản lý recipe của tác giả khác. Ingredient phải thuộc recipe trên URL.
- Recipe đã xóa mềm không được quản lý nguyên liệu và trả 404. Guest chỉ đọc nguyên liệu qua recipe Published; owner/Admin được đọc recipe riêng theo chính sách hiện có.
- Không có yêu cầu nguyên liệu phải duy nhất theo tên. Cho phép hai hàng cùng tên, khác ghi chú/công đoạn; không tự gộp.
- Không có điều kiện publish yêu cầu tối thiểu một nguyên liệu trong đặc tả chính. Cho phép danh sách rỗng và xóa nguyên liệu cuối; không áp dụng ràng buộc “còn một bước” của FR-RCP-010 cho nguyên liệu.
- Dữ liệu của recipe soft-delete được giữ theo vòng đời recipe. Đề xuất xóa một ingredient bằng `IsDeleted = true`, tận dụng query filter hiện có; khi purge recipe, FK cascade xóa vật lý dữ liệu con.
- Trạng thái Archived: đặc tả chưa cấm sửa nguyên liệu. Đề xuất cho owner/Admin quản lý trên Draft/Published/Archived chưa xóa; nếu nhóm chọn khóa Archived phải cập nhật đồng thời API/UI/test. Không suy diễn hạn chế upload ảnh thành quy tắc nguyên liệu.

## 3. Mâu thuẫn và quyết định cần chuẩn hóa

1. **Tên 100 hay 200 ký tự:** Frontend_Spec ghi 1–100, đặc tả chính và entity configuration dùng 200. Chọn 1–200 theo đặc tả chính; cập nhật schema form và tài liệu phụ.
2. **Quantity bắt buộc hay nullable:** Theo đặc tả chính, Quantity/Unit độc lập và nullable. Ô trống phải gửi null; `0`, âm, NaN/Infinity không được chấp nhận. Không dùng ép kiểu `Number("")` làm thành 0.
3. **Thứ tự:** Create recipe hiện gán `index + 1`, entity mặc định 0. Chọn 0-based cho contract quản lý mới; chuẩn hóa danh sách cũ theo OrderIndex/CreatedAt/Id khi mutation/reorder. Không thêm unique index chỉ để “sửa” sự khác biệt này nếu chưa cần.
4. **Reorder:** API đặc tả chính mới liệt kê POST/PUT/DELETE, trong khi tài liệu frontend/phân công yêu cầu di chuyển hàng. Plan đề xuất endpoint reorder riêng ở mục 5; đây là contract bổ sung để đáp ứng yêu cầu UI, không phải route đã có trong đặc tả chính.
5. **Giới hạn 100 nguyên liệu:** Create recipe hiện chặn quá 100 hàng, nhưng đặc tả chính chưa đặt giới hạn. Đề xuất giữ giới hạn hiện có và áp dụng nhất quán cho POST thêm nguyên liệu; ghi rõ đây là quyết định kế thừa code, cần được thống nhất trong contract. Không để đường tạo và đường thêm riêng có giới hạn khác nhau.

## 4. Hiện trạng và khoảng thiếu

Các đường dẫn dưới đây tính từ `Culinary_Blog_Nhom5/`.

| Thành phần | Hiện trạng đã đọc | Việc cần làm |
|---|---|---|
| `src/CulinaryBlog.Domain/Entities/RecipeIngredient.cs` | Có Create, Name, decimal? Quantity, string? Unit/Notes, OrderIndex; kế thừa soft-delete/RowVersion. | Bổ sung hành vi cập nhật/chuẩn hóa phù hợp domain; không để API gán trường tùy ý từ client. |
| `RecipeIngredientConfiguration.cs` | Name 200, Unit 50, Notes 500, decimal(10,3), query filter, FK cascade và concurrency token đã có. | Kiểm tra schema DB thực tế/migrations; không tạo migration nullable trùng lặp khi model đã đúng. |
| `API/Endpoints/RecipeEndpoints.cs` | Create recipe đã nhận nested ingredients và lưu cùng aggregate. Kiểm tra tên trắng, tối đa 100, Quantity chỉ chặn `< 0`, nên vẫn nhận 0. | Dùng validation chung cho create và CRUD; kiểm tra độ dài/precision; thêm API nguyên liệu độc lập qua Application. |
| Application | Chưa tìm thấy command/handler/validator chuyên biệt quản lý nguyên liệu. | Thêm Add/Update/Delete/Reorder và query nếu bổ sung GET quản lý. |
| `IUnitOfWork`/repository | Có đọc aggregate kèm Ingredients và SaveChanges; chưa có contract mutation nguyên liệu riêng. | Thêm contract nhỏ đúng phạm vi hoặc mở rộng UoW có chủ đích; transaction/concurrency tại persistence. |
| `GetRecipeBySlugQuery.cs` | Đọc theo OrderIndex nhưng map Quantity null thành 0, Unit null thành chuỗi rỗng. | Giữ nguyên nullable; bổ sung OrderIndex vào DTO để frontend quản lý đúng vị trí. |
| `Application/DTOs/RecipeDetailDto.cs` | `RecipeDetailIngredientDto.Quantity` là decimal không nullable; Unit là string mặc định rỗng. | Đổi thành decimal?/string?, đồng bộ consumer. |
| `culinary-blog-web/types/recipe.types.ts` | RecipeIngredientDto đã cho Quantity/Unit nullable; recipeId/orderIndex tùy chọn. | Chuẩn hóa DTO quản lý và payload; không phá mock/public DTO đang dùng. |
| `app/dashboard/recipes/new/page.tsx` | Có thêm/xóa hàng bằng state, nhập tên/số lượng/đơn vị; ô trống gửi null; không xóa được hàng cuối. | Component chung có Notes, validation và reorder; cho danh sách rỗng; giữ lưu nested trong một transaction. |
| `app/dashboard/recipes/[id]/edit/page.tsx`, `lib/api/recipeApi.ts` | Chưa có manager và API client CRUD nguyên liệu riêng. | Tải dữ liệu đã lưu, quản lý hàng theo id, xử lý version/conflict và refetch. |
| `components/recipes/IngredientList.tsx` | Đã nhận biết null trước khi scale theo servings; có hiện Notes. Hàm format hiện làm tròn 2 chữ số. | Sửa DTO upstream để không hiện “0”; giữ độ chính xác đến 3 chữ số khi cần để 0.001 không thành 0; chỉ scale số lượng có giá trị. |
| Cache/search | Chưa thấy cache recipe Redis/OutputCache trong mã hiện tại. Trigger FTS đã đọc chỉ dùng Title/Description. | Refetch frontend sau commit; nối invalidation nếu main đã thêm cache. Không tuyên bố tìm kiếm theo nguyên liệu hoạt động khi chưa có thay đổi thuộc FR-SRCH. |

## 5. API contract đề xuất

Base `/api/v1`. Dùng `ApiResponse<T>` cho success, Problem Details cho lỗi; không đổi hàng loạt wrapper của các API recipe đang tồn tại.

| Method và route | Request | Thành công |
|---|---|---|
| `GET /recipes/{recipeId}/ingredients` — bổ sung cho editor | Không body; Owner/Admin; trả danh sách ảnh hưởng quản lý, không cache chung với public. | 200, `data: IngredientDto[]`, ETag version Recipe. |
| `POST /recipes/{recipeId}/ingredients` — theo đặc tả | `{name, quantity, unit, notes}`; server append. | 201, `data: IngredientDto`, version mới; Location trỏ tài nguyên đọc thực sự tồn tại. Không tự dựng Location tới route chưa có. |
| `PUT /recipes/{recipeId}/ingredients/{ingredientId}` — theo đặc tả | `{name, quantity, unit, notes}`; không dùng để đổi vị trí. | 200, DTO đã cập nhật, version mới. |
| `DELETE /recipes/{recipeId}/ingredients/{ingredientId}` — theo đặc tả | Không body. | 204, version mới; loại khỏi kết quả đọc ngay. |
| `PUT /recipes/{recipeId}/ingredients/reorder` — bổ sung | `{ingredientIds:[id1,id2,...]}` đầy đủ các id chưa xóa, không trùng. | 200, danh sách sau reorder và version mới. |

`IngredientDto`: `id`, `recipeId`, `name`, `quantity: number|null`, `unit: string|null`, `notes: string|null`, `orderIndex`. Public detail giữ được null; có thể dùng projection nhỏ hơn nhưng không thay null thành giá trị số.

Ví dụ hàng hỗ trợ nêm nếm:

```json
{ "name": "Muối", "quantity": null, "unit": null, "notes": "Vừa đủ" }
```

**Concurrency đề xuất:** Dùng version của aggregate Recipe qua `If-Match: "<Base64 RowVersion>"` cho các write lên recipe đã lưu. API đọc quản lý và response mutation trả ETag mới. Đây là cách cụ thể hóa quy tắc mục 3.7 cho child mutation; phải triển khai cả client lẫn server và expose ETag qua CORS khi khác origin. Có thể hỗ trợ body rowVersion tương thích khi cần, nhưng phải thống nhất cách xử lý nếu header và body cùng xuất hiện. Tạo recipe mới không cần If-Match.

Mã lỗi: 401 chưa xác thực, 403 sai quyền, 404 recipe đã xóa/không tồn tại hoặc ingredient không thuộc recipe, 409 version cũ hoặc danh sách reorder không còn khớp do cập nhật đồng thời, 422 dữ liệu/version thiếu hoặc sai định dạng. Reorder thiếu/trùng id do request không hợp lệ trả 422. Mọi lỗi phải rollback, không đổi một phần danh sách.

Delete lặp: đề xuất trả 204 nếu row cùng recipe đã soft-delete và quyền/version hợp lệ; ingredient không tồn tại hoặc thuộc recipe khác trả 404. Request retry với version cũ có thể trả 409; client đọc lại trước khi tiếp tục. Reorder danh sách rỗng chỉ hợp lệ khi không còn ingredient nào.

## 6. Các bước triển khai

### Bước 1 — Đồng bộ dữ liệu đọc và validation

- Thêm DTO/request và FluentValidation dùng chung cho Add/Update và nguyên liệu nested khi create. Áp dụng quy tắc mục 2; create recipe phải validate toàn bộ child data trước khi ghi, lỗi một hàng rollback cả aggregate.
- Loại lỗi Quantity = 0 vẫn được chấp nhận; kiểm tra Name/Unit/Notes quá giới hạn trước DB để tránh lỗi 500/truncate.
- Sửa RecipeDetailIngredientDto và mapping nullable; thêm OrderIndex. Kiểm tra mọi consumer, mock và JSON-LD có sử dụng nguyên liệu, bảo đảm không xuất “0 Muối” khi lượng là null.
- Không coi dữ liệu 0 cũ là null một cách tự động: rà soát và báo cáo dữ liệu cần sửa; chỉ backfill khi có quy tắc nghiệp vụ rõ ràng.

### Bước 2 — Application và persistence

- Thêm các feature `AddRecipeIngredient`, `UpdateRecipeIngredient`, `DeleteRecipeIngredient`, `ReorderRecipeIngredients`, query `GetRecipeIngredients` nếu dùng GET collection mới.
- Kiểm tra owner/Admin trong Application; tra recipe và ingredient theo đúng quan hệ; không nhận recipeId/authorId/IsDeleted/RowVersion tùy ý từ body.
- Persistence dùng transaction và cơ chế đồng bộ theo Recipe tương thích với mutation ảnh. Nếu dùng khóa hàng Recipe như FR-RCP-008, đọc lại dữ liệu/version sau khóa rồi mới kiểm tra và ghi; giữ optimistic concurrency để từ chối form cũ thay vì âm thầm ghi đè.
- Thêm: tính vị trí cuối từ dữ liệu mới nhất. Sửa: giữ vị trí hiện tại. Xóa: soft-delete và renumber. Reorder: kiểm tra đúng tập id hiện hành rồi cập nhật toàn bộ trong một transaction.
- Cập nhật UpdatedAt và version Recipe; tận dụng AuditInterceptor quay vòng token. Chuẩn hóa lỗi concurrency thành 409; execution strategy phải tạo lại tracker hoặc reset state đúng khi retry.
- Nếu sau này thêm unique index `(RecipeId, OrderIndex)` cho hàng chưa xóa, phải dùng cập nhật hai giai đoạn tránh xung đột tạm thời. Index này chưa tồn tại trong configuration đã đọc và không phải điều kiện bắt buộc của FR-RCP-009.

### Bước 3 — API và đồng bộ dữ liệu

- Tách mapping endpoint nguyên liệu vào file riêng, ví dụ `RecipeIngredientEndpoints.cs`, với một điểm đăng ký nhỏ trong Program hoặc nhóm recipe. Không mở rộng RecipeEndpoints bằng toàn bộ logic CRUD nữa để giảm va chạm với phần công thức/ảnh/bước của thành viên khác.
- Khai báo AuthorPolicy, success/Problem Details/OpenAPI, If-Match/ETag; GET quản lý dùng no-store. Không tạo public endpoint làm lộ Draft/Archived.
- Giữ nested-create tương thích, chỉ thay validation/normalization cần thiết. Tạo recipe với ingredients phải còn nguyên tính atomic.
- Sau commit invalidate/refetch chi tiết, collection và dữ liệu chứa nguyên liệu; nối tag `recipes`/`recipe:{slug}` nếu hệ thống đã triển khai cache. Không thêm framework cache mới chỉ để gọi invalidate giả.
- Nếu enqueue hoặc invalidation lỗi sau commit, không trả trạng thái khiến client hiểu nhầm DB chưa ghi và tự tạo trùng; áp dụng cơ chế phục hồi/TTL sẵn có phù hợp.

### Bước 4 — IngredientManager và giao diện đọc

- Tạo `components/recipes/editor/IngredientManager.tsx`, ưu tiên React Hook Form/useFieldArray và Zod theo tài liệu frontend; `useFieldArray` chỉ quản lý form, không thay thế validation server hay cơ chế lưu DB.
- Trang tạo mới: manager quản lý hàng local, gửi một lần trong nested create; không gọi endpoint child khi chưa có recipeId. Cho xóa hàng cuối, thêm mới, Notes và di chuyển Lên/Xuống.
- Trang sửa: load danh sách từ server; các hàng đã lưu có id ổn định. Thêm/sửa/xóa/reorder gọi API riêng; lấy lại collection và version sau thành công. Không gửi nguyên mảng vào API PUT recipe hiện tại vì request đó không hỗ trợ Ingredients.
- Dùng chế độ local/persisted rõ ràng trong cùng component hoặc adapter nhỏ. Không hiển thị “đã lưu” cho hàng mới chỉ tồn tại trong state.
- Input Quantity giữ chuỗi khi nhập, chỉ chuyển thành số hợp lệ tại ranh giới submit; ô trống → null. Hiển thị lỗi tại hàng/trường, pending/empty/retry; ngăn thao tác trùng và không mất nội dung đang nhập khi 409.
- Reorder hỗ trợ nút bàn phím Lên/Xuống trước; kéo thả là cải tiến sau nếu cần, không bổ sung thư viện chỉ cho thao tác này.
- Đồng bộ RowVersion với form thông tin cơ bản và ImageGalleryManager: chỉ cập nhật version nền khi các trường dữ liệu nền vẫn khớp. Không lấy version mới rồi gửi lại nội dung cũ của người dùng khác; dùng callback phối hợp ở editor, tránh polling ghi đè hàng đang sửa.
- IngredientList public giữ checklist/scale servings; null không scale, không hiện 0; Notes vẫn hiển thị và định lượng nhỏ không bị làm tròn thành 0. UI không tự đổi đơn vị.

### Bước 5 — Kiểm thử và bàn giao

| Nhóm | Tình huống chính | Kết quả mong đợi |
|---|---|---|
| Validation | Name trắng/1/200/201 ký tự; Unit 50/51; Notes 500/501 | Trim/nullable đúng; vượt giới hạn trả 422, không ghi DB. |
| Quantity | null, 0, âm, 0.001, 1.5, giá trị tối đa, vượt precision/scale | Null hợp lệ, số >0 đúng precision; không làm tròn âm thầm. |
| Quyền/visibility | Guest, Author khác, owner, Admin, ingredient thuộc recipe khác; recipe soft-delete | 401/403/404 đúng; không mutation hoặc lộ dữ liệu khi bị từ chối. |
| CRUD | Tạo nested và thêm riêng; PUT xóa lượng/đơn vị về null; sửa Notes; xóa hàng cuối; tên trùng | Dữ liệu đúng, danh sách rỗng hợp lệ, không tự gộp. |
| Order | Append, xóa giữa, reorder, gửi id trùng/thiếu/lạ, reorder rỗng | Chỉ số liên tục và thứ tự ổn định; lỗi rollback toàn bộ. |
| Concurrency | Hai tab sửa/xóa/reorder; hai append; ingredient mutation cùng sửa Recipe/ảnh | Không mất cập nhật; stale version trả 409; client phục hồi được. |
| Transaction | Create có một hàng sai; lỗi DB giữa reorder/renumber | Không recipe/ingredient rác, không lưu một phần. |
| Read/UI | Reload, null xuyên suốt, lượng 0.001, đổi servings, sửa chưa lưu, pending/error, bàn phím | Không hiện “0 vừa đủ”; không mất draft nhập; dữ liệu server nhất quán. |
| Lifecycle/cache | Draft/Published/Archived; soft-delete recipe; refresh public/detail | Đúng chính sách đã chốt; không làm thay đổi quy tắc publish hoặc xóa recipe. |

- Unit test validation và workflow; integration test trên PostgreSQL thật cho precision, FK/query filter, transaction và cạnh tranh. Không dùng EF InMemory để chứng minh concurrency.
- API test chạy route thật cho contract, quyền và If-Match/ETag. Dữ liệu test độc lập, không sửa database ứng dụng.
- Build solution, chạy test hiện có và test nguyên liệu; frontend lint, TypeScript, production build theo scripts thực tế. Main hiện chưa có script `typecheck`, có thể dùng `npx tsc --noEmit --incremental false`; chạy lần lượt với build vì `.next/types` có thể được tạo lại.
- Smoke test có đăng nhập: tạo recipe có “Muối — vừa đủ” và lượng 0.001; mở sửa, thêm/sửa/xóa/đổi thứ tự, reload; xem public và đổi servings; thử Admin/Author khác, hai tab cùng sửa.

## 7. Tổ chức thay đổi để giảm conflict

- Giai đoạn triển khai: đã tạo nhánh `2312778-phanthibaotram-quanlynguyenlieu` từ origin/main; bàn giao bằng commit/PR riêng theo README/CONTRIBUTING. Không đưa plan/mã nguyên liệu vào PR ảnh #39 khi chưa có chỉ đạo ghép phạm vi.
- Khi triển khai, tuân thủ README/CONTRIBUTING: cập nhật main, tạo nhánh riêng theo MSSV–họ tên–công việc, ví dụ `2312778-phanthibaotram-quanlynguyenlieu`; commit Conventional Commits, không push trực tiếp main.
- Xác định phần FR-RCP-008 đã merge hay chưa trước khi dùng code của nó. Tách contract mutation nguyên liệu, feature, API mapping và component thành file riêng; dùng chung quy tắc khóa/concurrency, không sao chép cả module ảnh sang nhánh nguyên liệu.
- Chỉ sửa điểm tích hợp trong editor, create recipe, DTO/mapping và DI thật sự cần. Không format toàn file/toàn repo, không sửa migration đã áp dụng, không tự nâng dependency.
- Trước push: fetch/merge origin/main, xử lý conflict bằng cách giữ hành vi của cả hai phần, chạy lại kiểm tra; PR chỉ chứa FR-RCP-009 và tài liệu liên quan. Không thể bảo đảm không có conflict với commit tương lai.

## 8. Checklist hoàn tất

- [x] Quy tắc Name 200, Quantity/Unit nullable, precision và Notes nhất quán từ form đến DB.
- [x] API thêm/sửa/xóa và contract đổi thứ tự được hiện thực; read không biến null thành 0.
- [x] Owner/Admin và quan hệ recipe–ingredient được kiểm tra trong Application.
- [x] Transaction/concurrency/version đã triển khai; kiểm thử Recipe thành công, tích hợp ảnh chờ PR #39 merge để kiểm tra UI cùng nhau.
- [x] IngredientManager đã tích hợp ở tạo/sửa, có Notes/reorder và tải lại dữ liệu đã lưu; chưa xác minh tương tác browser trực tiếp.
- [x] Public checklist/scale servings đã sửa, test format/null/JSON-LD đạt.
- [x] Đồng bộ version/refetch, vòng đời recipe và soft-delete được kiểm thử qua API.
- [ ] Test backend/frontend và smoke test đạt; có báo cáo kết quả thực tế.
- [ ] Contract/tài liệu phụ cập nhật; nhánh/commit/PR đúng quy định và không chứa thay đổi ngoài phạm vi.

**Ưu tiên:** P0 validation + nullable + CRUD/quyền/concurrency; P1 IngredientManager + reorder + tích hợp tạo/sửa; P2 hoàn thiện hiển thị, kiểm thử và tài liệu. Reorder vẫn thuộc điều kiện bàn giao đầy đủ vì đã được yêu cầu trong tài liệu frontend/phân công.
