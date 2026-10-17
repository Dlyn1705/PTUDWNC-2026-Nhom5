# Kế hoạch hoàn thiện FR-RCP-010 — Quản lý các bước thực hiện

Ngày phân tích: 17/10/2026. Cập nhật triển khai/bàn giao: 18/10/2026; xem [báo cáo thực hiện](Implementation_FR-RCP-010-Step-Management.md). Nhánh bàn giao: `2312778-phanthibaotram-quanlybuocthuchien`.

## 1. Căn cứ và mục tiêu

- Nguồn chính: [Culinary_Blog_Spec.md](Culinary_Blog_Spec.md), mục 2, 3.1–3.3, 3.6–3.7, 4, bảng API Steps tại mục 6 và mô hình RecipeStep.
- Tham chiếu giao diện: [Frontend_Spec.md](Frontend_Spec.md), phần Dynamic Step Manager và hiển thị chi tiết công thức. Khi có khác biệt, ưu tiên đặc tả chính.
- Hoàn thiện thêm, sửa, xóa, đổi thứ tự bước của công thức đã lưu; đồng thời dùng form bước thống nhất khi tạo công thức mới.
- Author chỉ quản lý công thức của mình; Admin quản lý mọi công thức. Dữ liệu bền vững, thứ tự liên tục, không mất cập nhật khi có thao tác đồng thời.
- Giai đoạn lập kế hoạch chỉ thêm tài liệu. Giai đoạn triển khai sau đó thực hiện theo yêu cầu riêng của người dùng; kết quả được ghi ở báo cáo thực hiện.

## 2. Yêu cầu từ đặc tả

| Trường/hành vi | Quy tắc |
|---|---|
| Title | Chuỗi sau chuẩn hóa dài 1–200 ký tự; nếu client để trống, server đặt `Bước {stepNumber}` |
| Description | Bắt buộc, không toàn khoảng trắng, tối đa 2.000 ký tự |
| TimerMinutes | Nullable, số nguyên >= 0; không dùng tên DurationMinutes |
| ImageUrl | Nullable, ảnh minh họa riêng của bước; schema hiện tại giới hạn 500 ký tự |
| StepNumber | Server cấp; bước đầu là 1, thêm cuối bằng Max của các bước đang có + 1; danh sách cuối cùng liên tục 1..N |
| Thêm/sửa nội dung | Client không điều khiển StepNumber; PUT một bước không thay thứ tự |
| Reorder | PUT riêng nhận toàn bộ stepIds; tất cả bước được đánh số 1..N trong một transaction |
| Xóa | Xóa bước giữa tự đánh lại số; Published còn duy nhất một bước thì trả 422 và yêu cầu Unpublish trước |
| Publish | Chỉ thành công khi còn ít nhất một bước chưa xóa |
| Quyền | Author/Admin ở endpoint và kiểm tra ownership trong Application; step phải thuộc đúng recipe |
| Recipe đã xóa mềm | Không cho đọc quản lý hoặc mutation; giữ children theo vòng đời xóa Recipe |
| Concurrency/cache | Mutation cập nhật version Recipe, phát hiện version cũ và invalidate cache liên quan sau commit |

## 3. Hiện trạng đã đối chiếu

Đường dẫn trong bảng tính từ `Culinary_Blog_Nhom5/`.

| Thành phần | Hiện trạng | Khoảng thiếu |
|---|---|---|
| `src/CulinaryBlog.Domain/Entities/RecipeStep.cs` | Có RecipeId, StepNumber, Title, Description, TimerMinutes, ImageUrl; factory Create chỉ gán giá trị; kế thừa IsDeleted/RowVersion | Chưa có quy tắc validation/cập nhật bước dùng chung |
| `RecipeStepConfiguration.cs` | Title 200, ImageUrl 500, Description text; FK cascade, concurrency token, query filter | Index `(RecipeId, StepNumber)` chỉ là index thường; chưa bảo đảm unique như đặc tả |
| Initial migration và model snapshot | Cùng khai báo index thường | Cần migration mới; không sửa lịch sử migration đã áp dụng |
| `API/Endpoints/RecipeEndpoints.cs` | Có nested steps khi tạo Recipe, đánh số index+1, default title, giới hạn 100 bước; chỉ kiểm tra Description trắng ở đường này | Chưa có POST/PUT/DELETE/reorder steps độc lập; chưa validate đủ Title/Description/Timer/ImageUrl; request nested chưa có ImageUrl |
| Application | Chưa thấy feature quản lý bước riêng | Thêm query/command/validator và contract persistence nhỏ, không đặt nghiệp vụ CRUD trực tiếp trong endpoint |
| `Application/DTOs/RecipeDetailDto.cs` và `GetRecipeBySlugQuery.cs` | Public step DTO dùng `order`, `text`, cùng Title/TimerMinutes/ImageUrl; map từ StepNumber/Description | Cần DTO quản lý rõ `stepNumber`, `description`, giữ tương thích public DTO hiện có |
| `Domain/Entities/Recipe.cs` và endpoint publish | Publish dựa vào Steps.Count; endpoint đã chuyển DomainException thành validation | Cần kiểm tra số bước active và phối hợp concurrency với thao tác xóa bước cuối |
| `culinary-blog-web/app/dashboard/recipes/new/page.tsx` | Danh sách local nhập Description; tự tạo title `Bước n`; không xóa được hàng cuối; ghép thêm chuỗi Instructions | Thiếu title tùy chỉnh, timer, ảnh, reorder và validation đầy đủ |
| `app/dashboard/recipes/[id]/edit/page.tsx` | Có editor nội dung, IngredientManager và ImageGalleryManager | Chưa tích hợp StepManager hoặc API quản lý bước |
| `types/recipe.types.ts` | Public DTO hỗ trợ alias order/text; create step có description/title/timerMinutes | Thiếu kiểu quản lý chính thức và imageUrl cho nested create |
| `components/recipes/StepByStepList.tsx` | Đã sắp xếp, checklist, title, ảnh và RecipeTimer | Kiểm tra lại mapping/read sau mutation; không cần viết lại giao diện đọc |
| Hạ tầng dùng chung | Đã có AuditInterceptor, UnitOfWork, IRecipeCacheInvalidator; nguyên liệu/ảnh có mẫu khóa hàng Recipe và fresh context khi retry | Tái sử dụng nguyên tắc, không sao chép toàn bộ module hoặc làm thay đổi interface dùng chung không cần thiết |

## 4. Các quyết định đề xuất cần chuẩn hóa khi triển khai

Các mục dưới đây cụ thể hóa phần đặc tả chưa chốt; không coi là yêu cầu đã được hiện thực.

1. **Giới hạn 100 bước/công thức:** Kế thừa giới hạn đang có ở nested create, áp dụng đồng nhất cho thêm riêng. Chỉ tính bước active; ghi lại trong đặc tả nếu được đưa vào contract chính thức.
2. **Draft và Archived có thể không có bước:** Cho xóa bước cuối ở hai trạng thái này; chỉ Published bị chặn. Archived chưa bị đặc tả cấm biên tập bước, vì vậy đề xuất cho Owner/Admin sửa như nguyên liệu.
3. **Xóa riêng một bước:** Đề xuất soft-delete, tận dụng IsDeleted/query filter. Khi đó unique index phải là partial index `WHERE "IsDeleted" = false`; các hàng đã xóa có thể giữ StepNumber cũ. Đây là lựa chọn bổ sung so với mô tả unique index tổng quát trong đặc tả, cần cập nhật tài liệu cùng migration. Không tạo unique toàn bảng rồi tái sử dụng số của hàng đã soft-delete.
4. **Title mặc định:** Chuỗi null/rỗng/trắng được server gán theo số bước tại thời điểm thêm/sửa. Reorder chỉ đổi StepNumber, không tự đổi tiêu đề đã lưu: không thể phân biệt người dùng tự đặt tên “Bước 1” với tên tự sinh nếu không có metadata. UI hiển thị số thứ tự tách khỏi Title.
5. **Ảnh bước:** Trước mắt dùng chọn ảnh có sẵn thuộc recipe đã lưu hoặc URL HTTP/HTTPS hợp lệ, tối đa 500 ký tự. Chuỗi rỗng chuẩn hóa null; chặn scheme javascript/data/file và không tải URL phía server. Nếu chọn URL ngoài, phải phù hợp nguồn ảnh được CSP cho phép; không nới CSP thành wildcard.
6. **Không xây hệ thống upload thứ hai:** Có thể tái sử dụng upload/gallery hiện có sau khi Recipe đã có ID. Với draft local chưa lưu, giữ URL/null hoặc yêu cầu lưu bản nháp trước khi upload. Xóa/thay ảnh bước không tự gọi xóa object MinIO đang có thể được gallery hoặc bước khác tham chiếu. Upload độc lập và vòng đời object riêng của StepImage là phạm vi mở rộng, không âm thầm gộp vào CRUD bước.
7. **Concurrency:** Đề xuất If-Match/ETag của aggregate Recipe cho mọi mutation step đã lưu, tương tự nguyên liệu. Đây là contract bổ sung cụ thể cho child mutation; không dùng RowVersion của từng bước thay cho version aggregate.
8. **Instructions cũ:** Steps là nguồn dữ liệu cho trình quản lý và hiển thị bước. Không ghi đè Instructions mỗi lần reorder/CRUD, không tự suy diễn chuyển toàn bộ văn bản cũ thành Steps. Nếu nhóm muốn chuyển dữ liệu legacy, cần quy tắc migration riêng có kiểm tra và giữ nguyên nội dung gốc.

## 5. API contract dự kiến

Base URL `/api/v1`; các API quản lý đều Owner/Admin, dùng ApiResponse cho dữ liệu và Problem Details cho lỗi.

| Endpoint | Request | Thành công |
|---|---|---|
| `GET /recipes/{recipeId}/steps` — bổ sung cho editor | Không body | 200, `data: StepDto[]` theo StepNumber, ETag Recipe, no-store |
| `POST /recipes/{recipeId}/steps` | `{title?, description, timerMinutes?, imageUrl?}` và If-Match | 201, StepDto, ETag mới; Location chỉ trỏ tới route đọc có thật |
| `GET /recipes/{recipeId}/steps/{stepId}` — bổ sung nếu dùng Location tới item | Không body | 200, StepDto, ETag Recipe; no-store |
| `PUT /recipes/{recipeId}/steps/{stepId}` | Cùng các trường nội dung, If-Match; không StepNumber | 200, StepDto, ETag mới |
| `DELETE /recipes/{recipeId}/steps/{stepId}` | Không body, If-Match | 204, ETag mới; đánh lại số các bước còn lại |
| `PUT /recipes/{recipeId}/steps/reorder` | `{ "stepIds": ["id1", "id2", "..."] }`, If-Match | 200, danh sách theo thứ tự mới, ETag mới |

`StepDto`: `id`, `recipeId`, `stepNumber`, `title`, `description`, `timerMinutes: integer|null`, `imageUrl: string|null`.

- Reorder nhận đúng toàn bộ tập step active thuộc recipe, mỗi ID một lần; mảng rỗng chỉ hợp lệ nếu recipe không có bước. Route `/{stepId:guid}` không được nuốt route `/reorder`.
- Client không được truyền StepNumber/RecipeId/IsDeleted để điều khiển nội dung entity. Đề xuất từ chối `stepNumber` trong DTO write bằng validation/unmapped-member handling riêng DTO; không bật reject unknown toàn hệ thống làm vỡ client cũ.
- ETag là strong ETag chứa Base64 RowVersion Recipe; kiểm tra đúng định dạng/độ dài token hiện hành. GET quản lý và mọi mutation trả ETag, kể cả DELETE 204; expose ETag qua CORS.
- 401 chưa đăng nhập; 403 sai role/ownership; 404 recipe không tồn tại/đã xóa hoặc step không thuộc recipe; 409 version cũ/cạnh tranh; 422 dữ liệu, version thiếu/sai, tập ID reorder không hợp lệ hoặc xóa bước cuối Published.
- Đề xuất DELETE step đã soft-delete trả 404. Retry request sau commit với If-Match cũ có thể trả 409; client phải đọc lại, không tự đoán đã ghi hay tự gửi lại một POST mới.
- Nếu không bổ sung GET item, có thể trả Location về collection đọc được; không tạo Location giả tới endpoint chưa triển khai.

## 6. Các giai đoạn triển khai

### Giai đoạn 1 — Validation và dữ liệu đọc

- Thêm request/DTO/rules/validator dùng chung cho add, update và nested create. Trim Title/Description; Description 1–2.000; default Title; TimerMinutes null/0 hợp lệ, âm/phân số/vượt int bị từ chối trước DB; URL rỗng → null và validate như mục 4.
- Nested create phải kiểm tra cả phần tử null, độ dài và timer, thêm ImageUrl vào DTO nếu contract đã chốt. Một bước sai phải rollback toàn bộ Recipe, không tạo child rác.
- DTO quản lý dùng tên chuẩn. Public detail có thể thêm stepNumber/description đồng thời giữ order/text cho consumer hiện có; không đổi alias toàn repo khi chưa cần.
- Kiểm tra mapping đã loại step soft-delete; Publish đếm active steps, không tính child đã xóa còn nằm trong tracker.

### Giai đoạn 2 — Chuẩn hóa schema và migration

- Kiểm tra schema/migrations thực tế trên main mới nhất, không chỉ model C#.
- Báo cáo dữ liệu active có StepNumber trùng, <=0 hoặc bị hổng. Migration mới chuẩn hóa theo thứ tự ổn định `(StepNumber, CreatedAt, Id)` thành 1..N trong từng Recipe, không xóa mô tả hoặc tự đổi Title; lưu phương án backup/đối chiếu trước triển khai.
- Sau chuẩn hóa, tạo partial unique index `(RecipeId, StepNumber) WHERE IsDeleted=false`, thay index thường và cập nhật configuration/snapshot bằng công cụ migration.
- Không tạo migration rỗng hoặc sửa migration cũ. Không thêm constraint StepNumber dương nếu thuật toán reorder còn dùng số âm làm vùng tạm.
- Test migration trên DB có dữ liệu legacy và kiểm tra index thật sau migrate; EnsureCreated không đủ chứng minh migration nâng cấp chạy đúng.

### Giai đoạn 3 — Application và persistence

- Tách `Features/Recipes/Steps/` cho query/command/validation/authorization; contract nhỏ như `IRecipeStepStore`, implementation `RecipeStepStore` trong Infrastructure.
- Khóa hàng Recipe trước, đọc lại trạng thái/version/steps active bên trong transaction. Kiểm tra resource ownership trong workflow và kiểm tra lại dưới khóa trước ghi; không đọc aggregate kèm Category chỉ để xác thực owner vì filter Category có thể che Recipe hợp lệ.
- Cùng một thứ tự khóa với mutation ảnh/nguyên liệu; cập nhật UpdatedAt và RowVersion Recipe bằng AuditInterceptor. Recipe soft-delete không được mutation.
- Add tính Max(active StepNumber)+1 sau khóa; Update chỉ đổi nội dung; Delete soft-delete rồi renumber; Reorder kiểm tra tập ID rồi renumber.
- Khi unique index đã bật, đổi số theo **hai pha trong cùng transaction**: chuyển các bước active vào vùng số tạm không giao số hiện hành, SaveChanges; sau đó gán 1..N và SaveChanges. Tính vùng tạm bằng số học có kiểm tra overflow; không swap trực tiếp 1↔2 hoặc trông chờ thứ tự UPDATE của EF tránh unique violation.
- Parent version chỉ công bố sau commit; không để client thấy trạng thái tạm. Lỗi bất kỳ pha nào phải rollback cả số thứ tự, nội dung và version.
- Execution strategy phải tạo scope/context mới cho mỗi lần retry. Add dùng StepId sinh một lần cho operation nội bộ, có kiểm tra kết quả đã commit nếu commit ACK bị mất; không append trùng khi execution strategy chạy lại.
- Bảo vệ bất biến Published ở cùng transaction: khóa Recipe, đếm steps active rồi mới xóa. Rà soát publish/unpublish và các đường tạo/sửa steps khác để dùng cùng khóa hoặc optimistic concurrency trên Recipe; chỉ khóa ở StepStore mà publish vẫn ghi bằng snapshot cũ là chưa đủ.
- Sau commit gọi IRecipeCacheInvalidator theo contract hiện có; giữ fallback/ghi log khi Redis lỗi. Không trả lỗi giả “chưa lưu” do invalidation thất bại sau khi DB đã commit.

### Giai đoạn 4 — API và frontend

- Tạo `RecipeStepEndpoints.cs`, đăng ký một điểm nhỏ trong Program/route group. Khai báo policy, If-Match/ETag, mã lỗi và rate-limit theo cấu hình hiện có; không nhồi nghiệp vụ vào RecipeEndpoints dùng chung.
- Tạo `lib/api/stepApi.ts`, kiểu dữ liệu quản lý và `components/recipes/editor/StepManager.tsx`; đọc hướng dẫn Next trong node_modules theo AGENTS.md trước khi sửa frontend.
- Dùng React Hook Form/useFieldArray, Zod và ID/key ổn định. StepManager, IngredientManager, ImageGalleryManager phải có key phân biệt nếu là sibling; không cùng dùng key=recipeId.
- Chế độ tạo mới: danh sách local, thêm/xóa/reorder trước submit; cho phép không có bước để lưu Draft. Gửi nested steps một lần, không gọi child API khi chưa có RecipeId và không gửi StepNumber.
- Chế độ sửa: đọc collection/ETag, thêm/sửa/xóa/reorder qua API riêng; phân biệt hàng local chưa lưu và hàng đã có StepId. Lưu từng bước phải hiển thị pending/success/error, không chỉ đổi React state rồi báo đã lưu.
- Form có Title, Description và bộ đếm 2.000 ký tự, TimerMinutes, ImageUrl/ảnh xem trước, nút thêm và Lên/Xuống hỗ trợ bàn phím. Không ép `Number("")` thành 0; ô timer trống gửi null.
- Published một bước: khóa hoặc cảnh báo nút Xóa và hướng dẫn Unpublish; server vẫn là lớp chặn cuối. Draft/Archived được xóa bước cuối.
- Giữ nội dung đang nhập khi 409, yêu cầu tải lại có xác nhận nếu sẽ mất draft. Chặn request trùng; không polling/refetch ghi đè form dirty.
- Sau mutation, đồng bộ version với form cơ bản và manager ảnh/nguyên liệu bằng callback: chỉ nhận version mới khi snapshot nội dung nền không đổi; không lấy version mới để gửi lại dữ liệu cũ của một tab khác.
- Reorder/delete khi còn hàng sửa chưa lưu: yêu cầu lưu/hủy rõ ràng trước hoặc giữ draft theo StepId; không ghép draft theo index vì có thể sửa nhầm bước.
- Public StepByStepList và JSON-LD phải đọc đúng thứ tự mới, nội dung, timer/ảnh; không tự phát sinh tính năng timer mới ngoài component đang có.

## 7. Kế hoạch kiểm thử

| Nhóm | Tình huống | Kết quả cần đạt |
|---|---|---|
| Validation | Title trống/200/201; Description trắng/1/2.000/2.001; phần tử null | Default hợp lệ, vượt giới hạn 422, không ghi một phần |
| Timer/ảnh | null, 0, số nguyên dương, âm, phân số, overflow; URL rỗng/quá 500/scheme nguy hiểm | Kiểu/nullable đúng, không overflow/truncate hoặc gọi tải URL từ server |
| Quyền | Guest, Reader, Author khác, Owner, Admin; step của recipe khác; recipe bị xóa/category bị xóa | 401/403/404 đúng, không đọc hoặc ghi nhầm tài nguyên |
| CRUD | Add đầu/cuối, Update bỏ timer/ảnh, Delete đầu/giữa/cuối, reload | Dữ liệu bền vững, số 1..N, Title tùy chỉnh giữ nguyên |
| Trạng thái | Draft/Archived không bước; Published một bước/nhiều bước; Publish không bước | Xóa bước cuối Published bị chặn 422, không làm đổi dữ liệu/version |
| Reorder | Swap 1↔2, đảo toàn bộ, giữ nguyên, rỗng, ID thiếu/trùng/lạ/đã xóa | Không unique violation, đúng tập active hoặc lỗi validation, không đổi một phần |
| Concurrency | Hai append cùng version; update/delete/reorder giữa hai tab; step mutation cùng ảnh/nguyên liệu/sửa Recipe | Một thay đổi hợp lệ, bên stale 409, không mất cập nhật |
| Publish race | Xóa bước cuối đồng thời Publish; xóa Step đồng thời xóa Recipe | Không có Published với 0 bước; không ghi children vào Recipe đã xóa |
| Transaction/retry | Gây lỗi giữa hai pha renumber; lỗi commit ACK; transient retry | Rollback hoàn chỉnh, không số tạm tồn tại sau commit, không thêm bước trùng |
| Migration | DB legacy có trùng/hổng/âm, có steps soft-delete | Chuẩn hóa không mất nội dung; unique active được enforce; cascade vẫn đúng |
| Frontend | Form local/persisted, hàng dirty khi reorder, rapid click, error/409, keyboard, reload | Không mất draft hoặc đổi nhầm bước, không nhân đôi component |
| Đọc/cache | Public detail/JSON-LD, bước đã xóa, timer 0/null, ảnh thay đổi, invalidation | Không hiển thị bước cũ sau đọc mới; giữ tương thích order/text |

- Unit test rules, quyền, normalization và payload frontend.
- Integration/API test trên PostgreSQL thật: unique index, migration, row lock, RowVersion, rollback và race; không dùng EF InMemory để chứng minh các hành vi này.
- Test DB/bucket có tên riêng và tự dọn; không dùng dữ liệu ứng dụng để thử xóa/reorder.
- Browser smoke/E2E với Owner/Admin, tạo → thêm/sửa → reorder → xóa → reload/public; thử xóa bước cuối Published và hai tab cạnh tranh. Ghi rõ fixture API hay full-stack, không đánh đồng hai loại.
- Chạy dotnet build, test hiện có liên quan, test Steps mới; frontend lint, typecheck, production build theo scripts thực tế. Chạy typecheck/build lần lượt để tránh cạnh tranh `.next/types`.

## 8. Tổ chức công việc để giảm conflict

1. Trước triển khai, đọc README/CONTRIBUTING, fetch main và kiểm tra thay đổi mới/PR đang mở. Ưu tiên nhánh FR-RCP-010 đã có; nếu chưa có, tạo nhánh riêng theo quy định nhóm, không đưa code bước vào PR xóa công thức #49.
2. Tách files StepStore/contract/features/endpoints/API client/StepManager/test project; chỉ sửa điểm tích hợp thực sự cần trong DI, Program, create recipe, editor và DTO/mapping.
3. Editor đang chịu tác động của FR-RCP-004, 008, 009 và 007: giữ manager/callback/version guard, key riêng, chặn gửi lặp và luồng xác nhận xóa Recipe của các phần đã có. Không chọn toàn bộ ours/theirs khi conflict.
4. Tách migration riêng cho index steps; không regenerate các migration không liên quan, không tự nâng dependency hay format toàn repo.
5. Trước commit/push, fetch/merge main, xem diff và chạy kiểm thử phù hợp sau giải quyết conflict. Commit Conventional Commits, stage đúng file, không secret/build output, không force-push hoặc tự merge.
6. Cập nhật đặc tả cho các quyết định bổ sung đã thực hiện, kèm báo cáo implementation, lệnh chạy test và kết quả thực tế. Không đánh dấu checklist đạt nếu chưa chạy.

## 9. Checklist nghiệm thu

- [x] Quy tắc Title/Description/TimerMinutes/ImageUrl nhất quán ở create và CRUD.
- [x] API thêm/sửa/xóa/reorder và API đọc quản lý hoạt động đúng contract.
- [x] Ownership trong Application; kiểm tra quan hệ recipe–step; không thao tác recipe đã xóa.
- [x] Server quản lý StepNumber liên tục, PUT nội dung không đổi vị trí.
- [x] Migration chuẩn hóa dữ liệu và unique index active được kiểm thử trên PostgreSQL.
- [x] Xóa/reorder atomic, không lộ số tạm; retry không tạo trùng.
- [x] Published không thể còn 0 bước kể cả khi publish/delete chạy đồng thời.
- [x] If-Match/ETag và version phối hợp với editor, ảnh, nguyên liệu; stale trả 409.
- [x] StepManager dùng được ở tạo/sửa, có title/timer/URL ảnh/reorder và bảo vệ draft.
- [x] Public detail giữ order/text, xử lý bước theo thứ tự mới; đã kiểm tra mapping API và no-store/cache invalidation, không có browser assertion riêng cho JSON-LD.
- [x] Build/lint/typecheck, unit/integration/API và browser checks đạt; có báo cáo.
- [ ] Nhánh/commit/PR đúng quy định, không trộn phần xóa Recipe và không chứa file ngoài phạm vi.

**Ưu tiên thực hiện:** P0 contract/validation/quyền → P0 migration + transaction/concurrency + invariant Published → P1 API/StepManager/tích hợp editor → P1 kiểm thử và bàn giao. Reorder và bảo vệ bước cuối Published là điều kiện bắt buộc để hoàn thành FR-RCP-010.
