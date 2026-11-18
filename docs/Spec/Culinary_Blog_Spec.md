# Culinary Blog - Business and Architecture Specification

**Tài liệu nguồn:** `docs/SRS_Culinary_Blog_v1.0.0.pdf`
**Phiên bản tổng hợp:** 1.5.0 (Đồng bộ kiến trúc đang triển khai và các quyết định tháng 11)
**Ngày cập nhật:** 2026-11-18; baseline lịch sử: 2026-09-21
**Phạm vi:** Làm rõ logic nghiệp vụ, kiến trúc mục tiêu, công nghệ frontend, chuẩn hóa các mâu thuẫn đặc tả và hiện trạng mã nguồn.

> Bản 1.4.0 áp dụng điều chỉnh yêu cầu được người dùng cho phép ngày 16/11/2026 theo [ADR-0003](../adr/ADR-0003-acceptance-baseline-amendments.md). Đặc tả này cùng các điều chỉnh là căn cứ nghiệm thu hiện hành; SRS PDF giữ vai trò nguồn gốc lịch sử tại các điều khoản được thay thế. Không tuyên bố tuân thủ nguyên văn các điều khoản cũ.

> Bản 1.3.0 giữ kiến trúc phân tầng hiện tại, chấp nhận ngoại lệ Domain theo [ADR-0001](../adr/ADR-0001-domain-persistence-exceptions.md) và cache service theo [ADR-0002](../adr/ADR-0002-public-cache-services.md). Đây là thay đổi thiết kế chuẩn hóa, không sửa SRS PDF gốc và không tự xác nhận các yêu cầu SRS là Verified.

> Tài liệu này là bản tổng hợp và diễn giải chuẩn hóa từ SRS, đóng vai trò căn cứ kỹ thuật chính xác cho Domain model, API contract, UI flow, Database migrations và test acceptance.

## 1. Tóm tắt hệ thống

Culinary Blog là ứng dụng web full-stack cho phép:

- Khách xem, tìm kiếm, lọc và khám phá công thức đã công khai.
- Tác giả tạo, biên tập, quản lý ảnh/nguyên liệu/các bước và công khai công thức của mình.
- Quản trị viên quản lý danh mục, có thể quản lý công thức của mọi tác giả và theo dõi hệ thống.
- Hệ thống lưu dữ liệu quan hệ trong PostgreSQL, tệp ảnh trong MinIO, cache dùng Redis và xử lý tác vụ chậm bằng Hangfire.

### Ngoài phạm vi phiên bản 1.0

Không bao gồm bình luận, đánh giá sao, yêu thích/bookmark, thông báo realtime, ứng dụng native, thanh toán, nhắn tin trực tiếp và GraphQL.

## 2. Actor và phân quyền

| Actor | Điều kiện | Quyền chính |
|---|---|---|
| Khách (Guest / Anonymous) | Không cần tài khoản | Chỉ xem Published recipes, categories và tìm kiếm. KHÔNG được tạo/sửa/xóa. |
| Tác giả (Author) | Tài khoản đăng nhập, role Author | Toàn bộ quyền Guest; tạo/sửa/xóa/xuất bản/lưu trữ recipe do mình sở hữu; quản lý child data (steps, ingredients, images). |
| Quản trị viên (Admin) | Tài khoản có role Admin | Toàn bộ quyền Author; CRUD category; sửa/xóa/quản lý recipe của bất kỳ author; truy cập Hangfire Dashboard và xem structured logs. |

### Ba lớp kiểm tra quyền

1. **RBAC:** Endpoint yêu cầu role Author hoặc Admin. User đăng ký mặc định là Author; Admin chỉ gán qua seed hoặc quy trình nội bộ.
2. **Resource-based authorization:** Author chỉ thao tác recipe khi `Recipe.AuthorId == CurrentUserId`; Admin được bypass ownership check. Nếu vi phạm ownership, hệ thống trả về HTTP `403 Forbidden` (hoặc `404 Not Found`).
3. **Policy-based authorization:** Policy `VerifiedAuthor` có thể yêu cầu email đã xác minh cho các thao tác tác giả.

Kiểm tra ownership phải nằm trong Application/domain workflow, không chỉ dựa vào middleware endpoint, để tránh bỏ sót khi gọi use case từ kênh khác.

## 3. Mô hình nghiệp vụ cốt lõi

### 3.1 Recipe là Aggregate Root

`Recipe` quản lý các thành phần con:

- `RecipeStep[]`: Các bước thực hiện, sắp xếp và hiển thị theo `StepNumber`.
- `RecipeIngredient[]`: Danh sách nguyên liệu, sắp xếp theo `OrderIndex`.
- `RecipeImage[]`: Ảnh gốc, medium, thumbnail và metadata, sắp xếp theo `OrderIndex`.
- `RecipeNutrition`: Owned value/entity, được nhúng trực tiếp vào bảng Recipes (gồm 6 chỉ số dinh dưỡng).
- `Category` và `ApplicationUser` là tham chiếu đến aggregate/entity khác.

Mọi mutation recipe và child data nên đi qua use case/Unit of Work để đảm bảo transaction, authorization, validation và cache invalidation.

### 3.2 Vòng đời Recipe

```mermaid
stateDiagram-v2
    [*] --> Draft: Create
    Draft --> Published: Publish (có ít nhất 1 Step và 1 Ingredient active)
    Published --> Draft: Unpublish
    Draft --> Archived: Archive
    Published --> Archived: Archive
    Archived --> Draft: Unarchive
    Draft --> [*]: Delete (Soft Delete)
    Published --> [*]: Delete (Soft Delete)
    Archived --> [*]: Delete (Soft Delete)
```

Quy tắc vòng đời:

- Tạo mới luôn bắt đầu ở trạng thái `Draft`.
- **Chuẩn hóa Issue #83 (02/11/2026):** Draft chỉ publish khi có ít nhất một step và một ingredient chưa xóa mềm; thiếu trả 422 với field errors `steps`/`ingredients`. Đây là bổ sung nghiệp vụ của Issue #83 so với FR-RCP-005 trong SRS gốc chỉ nêu điều kiện step. Kiểm tra dưới cùng khóa Recipe với mutation child. Gọi lại khi đã Published vẫn idempotent; giữ quyền xóa nguyên liệu cuối theo FR-RCP-009, không tự unpublish dữ liệu cũ.
- Publish/unpublish là idempotent: gọi lại khi đã ở trạng thái đích thì trả thành công (`200 OK`), không tạo lỗi nghiệp vụ.
- `Published` mới được hiển thị cho Guest, được tìm kiếm và đưa vào sitemap.
- `Draft`/`Archived` chỉ xem được bởi owner hoặc Admin.
- `Archive` ẩn nội dung khỏi public listing nhưng vẫn giữ bản ghi trong CSDL. Hỗ trợ thao tác `Unarchive` để đưa công thức từ Archived quay trở lại `Draft`.
- **Ràng buộc bất biến của Published Recipe:** Khi công thức đang ở trạng thái `Published`, hệ thống ngăn chặn việc xóa bước nếu công thức chỉ còn duy nhất 1 bước (trả về lỗi `422 Unprocessable Entity`). Tác giả phải chuyển trạng thái về `Draft` (Unpublish) trước khi muốn xóa bước đó.
- Slug được sinh tự động từ title, unique, không đổi sau khi publish để tránh broken links và bảo toàn giá trị SEO. Nếu đổi title sau khi đã publish, slug vẫn giữ nguyên.

### 3.3 Luồng tạo và công khai recipe

1. Author/Admin gửi thông tin cơ bản, category, thời gian, servings, difficulty và tùy chọn steps/ingredients/nutrition.
2. Application validation kiểm tra dữ liệu và category tồn tại.
3. Domain tạo recipe với status Draft và sinh slug unique (nếu trùng slug thì tự động thêm hậu tố số tăng dần: `-2`, `-3`...).
4. Lưu aggregate trong một transaction duy nhất.
5. Author bổ sung steps, ingredients và images nếu chưa gửi cùng request ban đầu.
6. Khi publish từ Draft, kiểm tra active steps > 0 và active ingredients > 0 trong cùng transaction/khóa Recipe.
7. Nếu hợp lệ, status chuyển Published, gán `PublishedAt`, invalidate cache và cập nhật search visibility.

### 3.3.1 Mức độ khó

`Difficulty` là enum số dùng chung giữa Domain, API, TypeScript và bộ lọc tìm kiếm. API chỉ chấp nhận các giá trị sau; giá trị khác phải bị validator từ chối với lỗi `422`:

| Giá trị API | Tên enum | Nhãn giao diện |
|---:|---|---|
| 1 | `Easy` | Dễ |
| 2 | `Medium` | Trung bình |
| 3 | `Hard` | Khó |
| 4 | `Expert` | Chuyên gia |

`Expert` là phần mở rộng hợp lệ của contract hiện hành so với mô tả ba mức trong SRS PDF lịch sử. Create, update, public listing và search phải giữ nguyên giá trị này, không chuyển thành mức khác hoặc loại bỏ khỏi kết quả lọc.

### 3.4 Category

- Admin tạo category; slug sinh từ name và tự động thêm suffix số nếu trùng (`-2`, `-3`...).
- Đổi name không đổi slug đã tồn tại để tránh broken links.
- Không được xóa category khi còn bất kỳ recipe nào, kể cả Draft/Archived; trả về `409 Conflict` và số lượng recipe hiện có.
- Xóa category áp dụng **Soft Delete** (`IsDeleted = true`). CSDL cấu hình Filtered Unique Index trên `Slug` (`WHERE "IsDeleted" = false`) để tránh xung đột khi tạo mới.
- Danh sách category và chi tiết category là public.
- Các route public `/recipes` và `/categories/{slug}` chỉ hiển thị recipe `Published`, không phụ thuộc việc request có kèm token Author/Admin hay không. Draft/Archived của Author được xem và quản lý tại dashboard, `/recipes/mine` và endpoint quản lý theo ID; không đưa dữ liệu theo user vào shared public cache.

### 3.5 Ảnh

- Chỉ owner/Admin được upload, set primary và delete.
- File tối đa 5 MB; MIME cho phép: JPEG, PNG, WebP, AVIF.
- Phải kiểm tra magic bytes, không tin duy nhất vào extension/Content-Type.
- Tên object phải sinh bằng GUID theo mẫu `recipes/{recipeId}/{guid}.{ext}` để tránh path traversal.
- Ảnh đầu tiên tự động là primary; tại mỗi thời điểm chỉ có duy nhất một ảnh primary.
- Upload lưu original trước; Hangfire tạo medium 800x600 và thumbnail 300x300.
- Xóa primary thì tự động chọn ảnh còn lại có `OrderIndex` (hoặc thời gian tạo) nhỏ nhất làm primary.

### 3.6 Nguyên liệu và bước thực hiện (Chuẩn hóa giải pháp)

**Nguyên liệu (RecipeIngredient):**
- `Name`: Bắt buộc, độ dài từ 1–200 ký tự.
- `Quantity` và `Unit`: **Nullable (Tùy chọn)** ở cả Database, Entity và DTO để hỗ trợ các nguyên liệu nêm nếm theo khẩu vị ("vừa đủ", "tùy ý"). Nếu người dùng có nhập `Quantity` thì FluentValidation kiểm tra `Quantity > 0`.
- `Notes`: Tùy chọn (tối đa 500 ký tự).
- `OrderIndex`: Số nguyên biểu thị thứ tự hiển thị, mặc định 0 (thống nhất dùng `OrderIndex`, loại bỏ hoàn toàn `SortOrder`).

**Chuẩn hóa triển khai FR-RCP-009:** Tối đa 100 nguyên liệu/công thức; `Unit` tối đa 50 ký tự; Quantity khớp `decimal(10,3)` (tối đa 9999999.999, không tự làm tròn số có quá 3 chữ số thập phân có nghĩa). Server quản lý thứ tự liên tục từ 0; thêm ở cuối, xóa tự đánh lại thứ tự, đổi vị trí qua endpoint reorder. Owner/Admin được quản lý nguyên liệu trên Draft/Published/Archived chưa xóa mềm; được xóa nguyên liệu cuối. Xóa một nguyên liệu là soft-delete. Mutation nguyên liệu của recipe đã lưu yêu cầu `If-Match` chứa ETag Recipe hiện tại; GET quản lý và các mutation thành công trả ETag mới. Version cũ trả 409, thiếu/sai version hoặc tập id reorder không hợp lệ trả 422. Quantity/Unit/Notes rỗng được chuẩn hóa về null; không tự gộp nguyên liệu trùng tên.

Điều kiện “có ít nhất một nguyên liệu active” là gate tại thời điểm chuyển từ Draft sang Published, không phải invariant liên tục. Vì vậy API hiện cho phép Owner/Admin xóa nguyên liệu cuối của bài đã Published; bài chỉ bị chặn khi thực hiện một lần publish tiếp theo mà vẫn thiếu nguyên liệu. Đây là contract có chủ ý và phải được kiểm thử như hai hành vi riêng.

**Bước thực hiện (RecipeStep):**
- `Title`: Bắt buộc, độ dài 1–200 ký tự (nếu client để trống, backend tự động gán mặc định `$"Bước {stepNumber}"`).
- `Description`: Bắt buộc, không rỗng, tối đa 2.000 ký tự.
- `TimerMinutes`: Thời gian hẹn giờ cho bước tính bằng phút, số nguyên >= 0, nullable (thống nhất dùng `TimerMinutes`, loại bỏ `DurationMinutes`).
- `ImageUrl`: URL ảnh minh họa riêng cho bước, nullable.
- `StepNumber`: **Server là nguồn chân lý duy nhất (Single Source of Truth)**. Khi thêm bước mới qua `POST /recipes/{id}/steps`, client KHÔNG truyền `stepNumber`; backend tự động tính toán `Max(StepNumber) + 1` (hoặc 1 nếu chưa có bước nào).
- **Cập nhật nội dung bước:** Endpoint `PUT /recipes/{id}/steps/{stepId}` chỉ dùng để sửa thông tin (`title`, `description`, `timerMinutes`, `imageUrl`), không chứa `stepNumber` để tránh vi phạm khóa duy nhất.
- **Đổi thứ tự bước (Reorder):** Tách riêng endpoint chuyên dụng `PUT /recipes/{id}/steps/reorder` nhận mảng `{ "stepIds": ["id1", "id2", ...] }` và cập nhật lại `StepNumber = 1, 2, 3...` trong một transaction an toàn, tránh lỗi xung đột `UNIQUE(RecipeId, StepNumber)`.
- **Xóa bước:** Xóa bước qua `DELETE /recipes/{id}/steps/{stepId}` sẽ tự động renumber các bước còn lại theo thứ tự liên tục (1, 2, 3...). Nếu bài viết đang `Published` và chỉ còn đúng 1 bước, hệ thống chặn xóa và trả về lỗi `422 Unprocessable Entity`.

**Chuẩn hóa triển khai FR-RCP-010:** Tối đa 100 bước active/công thức; Owner/Admin được quản lý bước trên Draft/Published/Archived chưa xóa. Xóa riêng một bước là soft-delete; unique index `(RecipeId, StepNumber)` áp dụng cho `WHERE "IsDeleted" = false`. Mọi mutation step đã lưu yêu cầu strong `If-Match` chứa ETag Recipe; API đọc quản lý và mutation thành công trả ETag mới, version cũ trả 409, thiếu/sai version hoặc dữ liệu không hợp lệ trả 422. Reorder giữ nguyên Title đã lưu, chỉ đổi StepNumber; title trắng khi thêm/sửa được đặt theo số bước lúc ghi. ImageUrl nullable, tối đa 500 ký tự, URL HTTP/HTTPS không chứa thông tin đăng nhập; backend không tải URL và không tự xóa object ảnh dùng chung khi xóa bước. Publish và mutation step dùng cùng khóa Recipe, ngăn Published còn 0 bước kể cả khi chạy đồng thời. DTO quản lý dùng stepNumber/description; public detail giữ order/text để tương thích. Instructions cũ không bị ghi đè bởi CRUD/reorder steps.

### 3.7 Xóa và tính toàn vẹn dữ liệu (Mô hình 2 giai đoạn)

Hệ thống áp dụng mô hình **Xóa 2 giai đoạn (Two-Stage Deletion Lifecycle)** để giải quyết dứt điểm xung đột giữa Soft Delete và Hard Delete:

1. **Giai đoạn 1 (Thao tác của người dùng / Admin):**
   - API `DELETE /api/v1/recipes/{id}` thực hiện **Soft Delete**: gán `IsDeleted = true`, `Status = RecipeStatus.Archived`, cập nhật `UpdatedAt = DateTime.UtcNow`.
   - **Không xóa file ảnh trên MinIO ngay** nhằm bảo vệ dữ liệu và hỗ trợ phục hồi khi xóa nhầm (tuân thủ cam kết NFR-REL-003).
   - Global Query Filter (`.Where(x => !x.IsDeleted)`) tự động loại trừ bài viết khỏi các truy vấn thông thường.
   - Invalidate cache Redis liên quan và trả về HTTP `204 No Content`.
2. **Giai đoạn 2 (Dọn dẹp vật lý tự động qua Hangfire):**
   - Định kỳ hàng tuần, Hangfire Recurring Job (`PurgeDeletedRecipesJob`) quét các công thức có `IsDeleted == true` quá 30 ngày để thực hiện **Hard Delete**:
     - Gửi yêu cầu xóa bất đồng bộ toàn bộ file ảnh trên MinIO qua `IFileStorageService.DeleteAsync()` (Hangfire tự động retry 3 lần nếu lỗi).
     - Xóa vật lý bản ghi Recipe trong CSDL, kích hoạt cascade delete loại bỏ toàn bộ Steps, Ingredients và Images.
3. **Xử lý Unique Index trên Slug:**
   - CSDL PostgreSQL áp dụng **Filtered Unique Index (Partial Index)**:
     ```sql
     CREATE UNIQUE INDEX "IX_Recipes_Slug" ON "Recipes" ("Slug") WHERE "IsDeleted" = false;
     ```
   - Điều này đảm bảo khi bài viết cũ bị xóa mềm, người dùng vẫn có thể tạo bài viết mới trùng Title/Slug mà không bị lỗi duplicate key.
4. **Optimistic Concurrency:**
   - `RowVersion` (bytea/timestamp) dùng cho concurrency control. Cập nhật Recipe phải gửi version hiện tại qua header `If-Match` hoặc body; nếu mismatch ném ngoại lệ trả về `409 Conflict`.

## 4. Tìm kiếm, lọc, phân trang và cache

### Tìm kiếm

- PostgreSQL `tsvector/tsquery`, GIN index, `unaccent` để hỗ trợ tìm không dấu tiếng Việt.
- Query tối thiểu 2 ký tự; sanitize từ khóa và parameterize qua EF Core để chống SQL Injection.
- Chỉ tìm kiếm trong các công thức có `Status == Published`; sắp xếp theo `ts_rank` giảm dần.
- Không có kết quả vẫn trả về `200 OK` với danh sách rỗng `[]`.

### Lọc và phân trang

- Filter kết hợp bằng logic AND: category, difficulty, cook time, servings.
- **Quy ước Sắp xếp chuẩn hóa:**
  - Chuẩn API công khai sử dụng cặp query parameters: **`sortBy`** và **`sortOrder`** (theo đúng Chương 8):
    - `sortBy`: `createdAt` (mặc định), `title`, `cookTime`.
    - `sortOrder`: `desc` (mặc định), `asc`.
  - Tầng Application hỗ trợ tương thích ngược (backward compatibility): Tự động phân tích cú pháp nếu client truyền dạng tiền tố âm `sort=-createdAt` hoặc `sort=title`.
- Phân trang Offset-based: `page >= 1`, `pageSize` mặc định 12 và tối đa 50.
- Response phân trang chuẩn hóa đồng nhất wrapper:
  ```json
  {
    "data": [ ... ],
    "meta": {
      "page": 1,
      "pageSize": 12,
      "totalCount": 100,
      "totalPages": 9,
      "hasNextPage": true,
      "hasPreviousPage": false
    }
  }
  ```

### Cache

Thiết kế cache service theo ADR-0002: `PublicCacheOptions` mặc định category 45 phút, detail 60 phút, list/search 3 phút. TTL được cấu hình và validation tại Infrastructure. Dùng version keys cho public cache; không cache dữ liệu quản lý theo user vào shared cache. Xem §7.2 về ranh giới handler/service và xử lý lỗi sau commit.

**Contract riêng cho search (`FR-SRCH-001`, chuẩn hóa 01/11/2026):** `/api/v1/recipes/search` mặc định relevance (`ts_rank`) giảm dần; mặc định `createdAt desc` bên trên áp dụng cho listing `/recipes`. Search chấp nhận `sortBy=relevance|createdAt|title|cookTime`, `sortOrder=asc|desc`; relevance luôn giảm dần, sort tường minh thay thế relevance làm thứ tự chính. Khi có `sortBy` hoặc `sortOrder`, bỏ qua alias `sort`. `servings` là lọc bằng chính xác và tương đương `minServings=maxServings`; alias mâu thuẫn với range trả 422. q thiếu/rỗng/trắng hoặc chỉ dấu câu sau chuẩn hóa trả 200 với `{ data: [], meta }`; q sau trim có 1 ký tự hoặc dài hơn 100 ký tự trả 422. Input sai kiểu ở HTTP binding có thể trả 400; input sai ngữ nghĩa qua validator trả 422. Page vượt kết quả trả danh sách rỗng với page đã yêu cầu; không tự chuyển về trang cuối. Chi tiết và kiểm thử xem [Search_API_Contract.md](./Search_API_Contract.md).

- Category list: Cache Redis/IMemoryCache với TTL mục tiêu 30–60 phút.
- Recipe detail: Cache theo slug và tag `recipes`, TTL chuẩn hóa **60 phút** (cấu hình qua `appsettings.json`), sử dụng cache-aside / Output Cache kết hợp tag-based invalidation.
- Recipe list/search: Cache theo query string, TTL ngắn 1–5 phút.
- Mọi mutation command thành công phải invalidate cache liên quan (xóa tag `recipes` và tag `recipe:{slug}`).
- Redis là cache dùng chung; khi Redis down, hệ thống tự động fallback về database (graceful degradation) mà không làm sập request.

## 5. Xác thực và token

- Đăng ký bằng email/password; mật khẩu do ASP.NET Core Identity hash với PBKDF2 (HMAC-SHA512, >= 100.000 iterations).
- Đăng nhập local hoặc Google OAuth 2.0. Chuẩn hóa luồng: Frontend dùng Google Identity Services / One Tap lấy `idToken`, gửi lên endpoint `POST /api/v1/auth/google`, Backend dùng thư viện `Google.Apis.Auth` để xác thực token.
- User đăng ký tài khoản mới mặc định nhận role **Author**. Role **Admin** chỉ gán qua database seeding hoặc quy trình quản trị nội bộ.
- Access JWT stateless: TTL 15 phút, claim tối thiểu: `userId`, `email`, `roles`, `jti`. Lưu trữ tại client trong memory / React state.
- Refresh token: 128-bit cryptographically secure random bytes, chỉ lưu SHA-256 hash trong CSDL, TTL 7 ngày.
- **Lưu trữ Refresh Token an toàn:** Lưu trong **httpOnly, Secure, SameSite=Lax Cookie**. Đây là policy đã chốt, thay cho SameSite=Strict của SRS gốc theo ADR-0003. HttpOnly hạn chế JavaScript đọc refresh token, không loại bỏ XSS hoặc CSRF; refresh/logout dùng cookie phải kiểm tra origin và cross-site request theo allowlist, kết hợp CORS chặt chẽ. Production phải dùng HTTPS và kiểm chứng cookie trên topology triển khai thực tế.
- **Refresh Token Rotation & Reuse Detection:** Token cũ bị revoke ngay sau khi sử dụng; nếu phát hiện token đã bị revoke được gửi lại (dấu hiệu replay attack), hệ thống lập tức thu hồi toàn bộ token family của tài khoản đó.
- Đăng xuất (`POST /auth/logout`): Xóa cookie và thu hồi refresh token trong CSDL.
- Rate limiting: auth 10 request/phút/IP, API chung 100 request/phút/IP, upload 5 request/phút/IP.

## 6. API contract tổng hợp

Base URL: `/api/v1`. Authentication dùng `Authorization: Bearer <access_token>`; Refresh token truyền an toàn qua httpOnly Cookie (hoặc JSON body cho client non-browser). Success response đồng nhất dùng wrapper `{ "data": ... }` hoặc `{ "data": [...], "meta": {...} }`; phản hồi lỗi tuân thủ chuẩn RFC 7807 `application/problem+json` với `type`, `title`, `status`, `detail`, `errors`.

| Module | Endpoint chính | Quyền hạn | Mô tả |
|---|---|---|---|
| **Auth** | `POST /auth/register` | Public | Đăng ký tài khoản mới (tự động gán role Author) |
| | `POST /auth/login` | Public | Đăng nhập email/mật khẩu, cấp bộ token |
| | `POST /auth/google` | Public | Đăng nhập Google OAuth qua `idToken` |
| | `POST /auth/refresh` | Public | Làm mới Access Token bằng Refresh Token |
| | `POST /auth/logout` | Author/Admin | Đăng xuất, thu hồi Refresh Token |
| | `GET /auth/me` | Author/Admin | Xem thông tin hồ sơ tài khoản hiện tại |
| | `PATCH /auth/me` | Author/Admin | Cập nhật hồ sơ (displayName, bio, avatarUrl) |
| **Categories** | `GET /categories` | Public | Lấy danh sách danh mục (cache-aside) |
| | `GET /categories/{slug}` | Public | Chi tiết danh mục kèm danh sách recipes `Published` phân trang; không vary theo user/token |
| | `POST /categories` | Admin | Tạo danh mục mới |
| | `PUT /categories/{id}` | Admin | Cập nhật tên/mô tả danh mục |
| | `DELETE /categories/{id}` | Admin | Xóa mềm danh mục (chặn nếu còn chứa recipes) |
| **Recipes** | `GET /recipes` | Public | Danh sách recipes `Published` (lọc, phân trang, `sortBy`, `sortOrder`) |
| | `GET /recipes/{slug}` | Public / Owner | Chi tiết recipe theo slug (kèm đầy đủ nested data) |
| | `GET /recipes/{id}` | Owner/Admin | Chi tiết recipe theo ID để quản lý Draft/Published/Archived |
| | `GET /recipes/mine` | Author/Admin | Danh sách recipe quản lý, gồm Draft/Published/Archived, có phân trang |
| | `GET /recipes/search` | Public | Tìm kiếm FTS không dấu (`?q=...`) |
| | `POST /recipes` | Author/Admin | Tạo recipe mới (trạng thái Draft) |
| | `PUT /recipes/{id}` | Owner/Admin | Cập nhật thông tin cơ bản của recipe |
| | `PUT /recipes/{id}/nutrition` | Owner/Admin | Cập nhật riêng 6 chỉ số dinh dưỡng |
| | `PATCH /recipes/{id}/publish` | Owner/Admin | Xuất bản công thức (yêu cầu steps > 0) |
| | `PATCH /recipes/{id}/unpublish` | Owner/Admin | Hủy xuất bản (chuyển về Draft) |
| | `PATCH /recipes/{id}/archive` | Owner/Admin | Lưu trữ công thức (ẩn khỏi public) |
| | `PATCH /recipes/{id}/unarchive` | Owner/Admin | Khôi phục công thức từ Archived về Draft |
| | `DELETE /recipes/{id}` | Owner/Admin | Xóa công thức (Soft delete ngay, dọn vật lý sau 30 ngày) |
| **Images** | `POST /recipes/{id}/images` | Owner/Admin | Upload ảnh mới (multipart/form-data) |
| | `PATCH /recipes/{id}/images/{imgId}/primary` | Owner/Admin | Đặt làm ảnh chính duy nhất |
| | `DELETE /recipes/{id}/images/{imgId}` | Owner/Admin | Xóa ảnh khỏi recipe |
| **Steps** | `GET /recipes/{id}/steps` | Owner/Admin | Danh sách bước active kèm ETag Recipe (no-store) |
| | `GET /recipes/{id}/steps/{stepId}` | Owner/Admin | Chi tiết một bước thuộc công thức, kèm ETag Recipe |
| | `POST /recipes/{id}/steps` | Owner/Admin | Thêm bước mới, yêu cầu If-Match; Server tự động tính StepNumber |
| | `PUT /recipes/{id}/steps/{stepId}` | Owner/Admin | Cập nhật nội dung bước (title, desc, timer) |
| | `PUT /recipes/{id}/steps/reorder` | Owner/Admin | Đổi thứ tự toàn bộ các bước an toàn |
| | `DELETE /recipes/{id}/steps/{stepId}` | Owner/Admin | Xóa bước & tự động renumber (chặn xóa nếu bài Published còn 1 bước) |
| **Ingredients** | `GET /recipes/{id}/ingredients` | Owner/Admin | Danh sách nguyên liệu đã lưu kèm ETag Recipe (no-store) |
| | `POST /recipes/{id}/ingredients` | Owner/Admin | Thêm nguyên liệu (Quantity/Unit là tùy chọn, yêu cầu If-Match) |
| | `PUT /recipes/{id}/ingredients/{ingId}` | Owner/Admin | Cập nhật nguyên liệu |
| | `DELETE /recipes/{id}/ingredients/{ingId}` | Owner/Admin | Xóa nguyên liệu |
| | `PUT /recipes/{id}/ingredients/reorder` | Owner/Admin | Đổi thứ tự toàn bộ qua ingredientIds; yêu cầu If-Match như PUT/DELETE nguyên liệu |
| **Operations** | `GET /health`, `/health/live`, `/health/ready` | Public/Probe | Health check probes |

HTTP status codes quan trọng:
- `200 OK`: Truy vấn, cập nhật thành công; kết quả tìm kiếm rỗng vẫn trả về 200.
- `201 Created`: Tạo mới tài nguyên thành công.
- `204 No Content`: Xóa thành công, đăng xuất thành công.
- `400 Bad Request`: Cú pháp request sai, tệp tải lên không hợp lệ.
- `401 Unauthorized`: Chưa xác thực hoặc token hết hạn/không hợp lệ.
- `403 Forbidden`: Đã xác thực nhưng không có quyền (Author thao tác bài người khác, truy cập endpoint Admin).
- `404 Not Found`: Không tìm thấy tài nguyên (hoặc tài nguyên đã bị xóa mềm `IsDeleted = true`).
- `409 Conflict`: Trùng lặp dữ liệu unique, xung đột concurrency `RowVersion`, xóa Category đang chứa recipes.
- `422 Unprocessable Entity`: Vi phạm quy tắc nghiệp vụ domain (publish bài thiếu active step hoặc ingredient, xóa bước duy nhất của bài published).
- `429 Too Many Requests`: Vượt quá giới hạn rate limit.
- `500 Internal Server Error`: Lỗi hệ thống chưa được bắt (không lộ stack trace ở production).
- `503 Service Unavailable`: Thành phần phụ thuộc (DB/Redis) tạm thời không sẵn sàng.

## 7. Kiến trúc logic

```mermaid
flowchart LR
    Browser[Browser] --> Nginx[Nginx reverse proxy]
    Nginx --> Web[Next.js App Router]
    Web --> API[ASP.NET Core .NET 10 Minimal API]
    API --> App[Application CQRS + MediatR]
    App --> Domain[Domain entities and rules]
    App --> Infra[Infrastructure abstractions]
    Infra --> DB[(PostgreSQL 16)]
    Infra --> Redis[(Redis 7)]
    Infra --> MinIO[(MinIO S3)]
    Infra --> Jobs[Hangfire]
    Jobs --> Email[SMTP / SendGrid]
    API --> Obs[Serilog + OpenTelemetry]
```

### 7.1 Backend Clean Architecture

- **Domain (`CulinaryBlog.Domain`):** Chứa entities, value objects, enums, domain exceptions/events và abstraction repository; không phụ thuộc Application/Infrastructure/API. Mặc định chỉ dùng .NET BCL; đúng hai ngoại lệ persistence được giới hạn bởi ADR-0001: Identity trong `Entities/ApplicationUser.cs` và Npgsql trong `Entities/Recipe.cs` cho SearchVector. Không mở rộng package hoặc vị trí sử dụng. Tiêu chí nghiệm thu hiện hành là tuân thủ phân tầng và khóa đúng hai ngoại lệ theo ADR-0001/ADR-0003; thay thế điều khoản Domain thuần BCL ban đầu, không tuyên bố đã loại bỏ hai phụ thuộc.
- **Application (`CulinaryBlog.Application`):** Commands/Queries, handlers, DTOs, FluentValidation validators, interfaces và MediatR pipeline behaviors. Chỉ phụ thuộc Domain.
- **Infrastructure (`CulinaryBlog.Infrastructure`):** EF Core DbContext, configurations, migrations, repositories, UnitOfWork, Identity, JWT, Redis, MinIO, email, Hangfire background jobs. Implement interfaces của Application.
- **Presentation (`CulinaryBlog.API`):** Minimal API endpoint groups, middleware, DI composition root, auth policies, OpenAPI/Scalar và HTTP mapping.

Dependency direction:
```text
API -> Infrastructure -> Application -> Domain
API -> Application -> Domain
Domain -X-> Application/Infrastructure/API
Application -X-> Infrastructure/API
```

### 7.2 CQRS pipeline

Thiết kế được chọn: MediatR đăng ký `LoggingBehavior` rồi `ValidationBehavior`; handler điều phối use case, authorization, transaction và các port của Application. Infrastructure triển khai persistence/cache. Không thêm `CachingBehavior` hoặc `CacheInvalidationBehavior` trùng với service hiện hữu; xem ADR-0002.

1. Logging ghi request name, user, correlation/trace và elapsed time, không serialize command/response chứa dữ liệu nhạy cảm. Ngưỡng cảnh báo chậm mặc định **500 ms**, cấu hình `StructuredLogging:SlowRequestThresholdMs`; đây là ngưỡng cảnh báo, không thay đổi mục tiêu p99 <= 1.000 ms.
2. Validation chạy trước handler; lỗi ngữ nghĩa trả 422 Problem Details.
3. Query public dùng `IPublicContentCache` theo cache-aside; query quản lý theo user không đi qua shared public cache.
4. Mutation commit dữ liệu rồi gọi invalidation qua các service chuyên biệt. Không rollback dữ liệu đã commit chỉ vì Redis hoặc frontend revalidation lỗi.

Command được đọc dữ liệu để kiểm tra quyền, invariant và thực hiện cập nhật trong transaction. Query không thay đổi trạng thái nghiệp vụ; việc điền cache/ghi telemetry không phải mutation nghiệp vụ.

### 7.3 Frontend Next.js

#### 7.3.1 Kiến trúc frontend mục tiêu

Frontend là một ứng dụng **Next.js App Router** độc lập trong thư mục `culinary-blog-web`, đóng vai trò Presentation/BFF nhẹ trước ASP.NET Core API. Ranh giới trách nhiệm được thống nhất như sau:

```mermaid
flowchart LR
    U[Trình duyệt] --> R[Next.js App Router]
    R --> SC[Server Components<br/>SSR/ISR cho trang công khai]
    R --> CC[Client Components<br/>tương tác, form, dashboard]
    SC --> AC[API client phía server]
    CC --> TQ[TanStack Query]
    TQ --> AC2[Axios client phía browser]
    AC --> API[ASP.NET Core API /api/v1]
    AC2 --> API
    CC --> ZS[Zustand<br/>auth/UI state tối thiểu]
    CC --> FORM[React Hook Form + Zod]
```

- **Server Components là mặc định:** Trang công khai như danh sách/chi tiết recipe và category lấy dữ liệu phía server để trả HTML có nội dung, hỗ trợ SEO và giảm JavaScript gửi xuống trình duyệt.
- **Client Components chỉ dùng tại biên tương tác:** Navbar cần đọc pathname, form, modal, bộ lọc tức thời, timer và dashboard. Không đặt `"use client"` ở layout/page nếu không thực sự cần.
- **Server state và client state tách biệt:** TanStack Query quản lý dữ liệu từ API ở các màn hình tương tác; Zustand chỉ giữ trạng thái phiên/UI không phù hợp với URL hoặc server cache. Không sao chép cùng dữ liệu API vào cả hai nơi.
- **Form:** React Hook Form quản lý trạng thái/hiệu năng form; Zod định nghĩa schema xác thực phía client và suy luận type. Backend vẫn là nguồn xác thực cuối cùng.
- **Giao tiếp API:** Axios dùng cho request từ browser và có thể dùng ở server, nhưng phải tách cấu hình base URL server-side và public URL browser-side khi chạy Docker/production.

#### 7.3.2 Công nghệ frontend và trạng thái sử dụng thực tế

Nguồn phiên bản là `culinary-blog-web/package.json` và lockfile, không dùng bảng phiên bản tháng 9 làm contract. Next.js App Router/React/TypeScript là nền tảng; TanStack Query quản lý server state; Zustand quản lý auth/UI state; React Hook Form và Zod quản lý form. Sự hiện diện trong code không thay thế kiểm chứng UI, accessibility hoặc hiệu năng.

#### 7.3.3 Routing và chiến lược render

Đã có các route public category/recipe/search, auth/profile và dashboard quản lý. Public content lấy qua server API client; dashboard và form dùng client hooks. Metadata, Recipe JSON-LD, sitemap và robots có implementation; chỉ kết luận đạt SEO sau review và kiểm chứng trên commit nghiệm thu. Draft/Archived không xuất hiện ở public listing, search hoặc sitemap.

#### 7.3.4 Luồng dữ liệu, API contract và xác thực

- API client tập trung trong `lib/api`; DTO và pagination theo contract backend. Dữ liệu mock không được che lỗi production.
- Access token ở memory/auth store; refresh token ở HttpOnly cookie. Browser gửi credentials, refresh/retry có giới hạn; API kiểm tra quyền và ownership trong Application workflow.
- `GET /recipes/{id}` là API quản lý Owner/Admin: Guest 401, người khác 403, thiếu/đã xóa 404. Đọc public dùng slug.
- Sáu chỉ số dinh dưỡng giữ nullable xuyên database/API/UI; chưa nhập không biến thành 0. JSON-LD bỏ giá trị thiếu.
- Tách URL nội bộ server và URL công khai browser. Không đưa token/secrets vào HTML, logs hoặc NEXT_PUBLIC variables.

#### 7.3.5 UI, hiệu năng, SEO và khả năng truy cập

Các yêu cầu responsive từ 320px, keyboard/focus/label/contrast và WCAG 2.1 AA vẫn là tiêu chí nghiệm thu. Browser E2E và axe tự động cần kết hợp kiểm tra thủ công phù hợp; không suy toàn bộ WCAG từ axe pass. Phân biệt kết quả development browser E2E với bản production.

Cache có ba lớp cần kiểm chứng riêng: backend public Redis, Next.js server cache theo tag/path và TanStack Query theo query key. `serverClient.ts` định nghĩa TTL/tag phía server; mutation hooks invalidate query keys liên quan. Không giả định invalidate Redis tự động làm mới mọi browser session.

#### 7.3.6 Quy ước triển khai frontend

1. Component/page chỉ truy cập API qua module trong `lib/api` hoặc feature service; không rải Axios call trực tiếp trong UI.
2. TypeScript DTO phải bám contract/OpenAPI của backend; không dùng field chỉ tồn tại ở mock mà không đánh dấu rõ.
3. Query key có cấu trúc, ví dụ `['recipes', filters]`, `['recipe', slug]`, `['categories']`; mutation thành công invalidate đúng phạm vi.
4. Filter, sort và pagination của trang công khai đặt trong URL để chia sẻ link, hỗ trợ back/forward và render phía server.
5. Chỉ cache nội dung public; dữ liệu dashboard theo user không được đưa vào shared cache. Không truyền access token vào HTML, log hoặc biến `NEXT_PUBLIC_*`.
6. Mỗi trang phải có loading, empty, error và unauthorized state; lỗi API chuẩn RFC 7807 được ánh xạ thành thông báo có thể hành động.
7. Kiểm thử mục tiêu: unit cho schema/util, component test cho form và quyền hiển thị, E2E cho login-refresh-logout, tìm kiếm, tạo/sửa/publish recipe và quản trị category.

### 7.4 Mô hình Dữ liệu (Chuẩn hóa)

| Entity | Quan hệ và ghi chú |
|---|---|
| `BaseEntity` | UUID v4 (`Id`), `CreatedAt`, `UpdatedAt`, `IsDeleted`, `RowVersion` (bytea timestamp concurrency token). |
| `Recipe` | Aggregate Root. N:1 với Category, N:1 với Author. Thuộc tính: `Title` (varchar 200), `Slug` (varchar 220, Unique Filtered Index `WHERE "IsDeleted" = false`), `Description` (text), `Instructions` (text NULL - legacy field), `PrepTime`, `CookTime`, `Servings`, `Difficulty`, `Status`, `SearchVector` (tsvector FTS), `PublishedAt`. |
| `RecipeNutrition` | Owned Entity 1:1, nhúng trực tiếp vào bảng Recipes (`Nutrition_*`). Gồm 6 chỉ số: `Calories`, `Protein`, `Carbohydrates`, `Fat`, `Fiber`, `Sodium` (đều là `decimal(8,2)?`). |
| `RecipeStep` | 1:N với Recipe; cascade delete; thuộc tính: `Title` (varchar 200, bắt buộc), `Description` (text, bắt buộc), `TimerMinutes` (integer NULL), `ImageUrl` (varchar 500 NULL), `StepNumber` (integer, partial unique index trên `(RecipeId, StepNumber)` với `IsDeleted = false`). |
| `RecipeIngredient` | 1:N với Recipe; cascade delete; thuộc tính: `Name` (varchar 200, bắt buộc), `Quantity` (decimal(10,3) NULL), `Unit` (varchar 50 NULL), `Notes` (varchar 500 NULL), `OrderIndex` (integer DEFAULT 0). |
| `RecipeImage` | 1:N với Recipe; cascade delete; thuộc tính: `OriginalUrl`, `MediumUrl`, `ThumbnailUrl`, `AltText`, `IsPrimary`, `OrderIndex` (integer DEFAULT 0). |
| `Category` | 1:N với Recipe. Thuộc tính: `Name` (unique), `Slug` (unique filtered index `WHERE "IsDeleted" = false`), `Description`, `ImageUrl`, `OrderIndex`. Không xóa được nếu còn recipe. |
| `ApplicationUser` | Kế thừa IdentityUser. Thêm: `DisplayName`, `AvatarUrl`, `Bio`, `IsActive`, `CreatedAt`. |
| `RefreshToken` | `TokenHash` (SHA-256 unique), `ExpiresAt`, `RevokedAt`, `ReplacedByTokenHash`, `CreatedAt`, `CreatedByIp`. |

PostgreSQL cấu hình EF Core Code First: extension `unaccent` và GIN Index trên `SearchVector` phục vụ tìm kiếm toàn văn bản tiếng Việt.

### 7.5 Triển khai và vận hành

Docker Compose mục tiêu gồm Nginx, API, frontend, PostgreSQL, Redis, MinIO; Seq và MailHog chỉ dành cho development. Production cần TLS termination, persistent volumes, backup PostgreSQL hàng ngày, health probes và secrets quản lý qua environment/User Secrets/Kubernetes Secrets.

Observability bắt buộc:
- `/health`: Kiểm tra database, Redis, MinIO.
- `/health/live`: Liveness probe (tiến trình còn sống).
- `/health/ready`: Readiness probe (các phụ thuộc DB và Redis sẵn sàng tiếp nhận traffic).
- Structured log chứa `CorrelationId`, path, method, status, elapsed time, `UserId`.
- OpenTelemetry cho HTTP request, EF Core, custom metrics recipe created/published.

## 8. Yêu cầu phi chức năng quan trọng

- API: p50 <= 150 ms cho GET cache hit, p95 <= 500 ms, p99 <= 1.000 ms.
- Hỗ trợ tối thiểu 100 concurrent users trên cấu hình máy chủ tối thiểu.
- Redis hit rate mục tiêu >= 80% khi steady state.
- Không có lỗi N+1 query; bắt buộc sử dụng projection/eager loading hợp lý.
- Bảo mật tuân thủ OWASP Top 10; HTTPS TLS 1.2+, CORS theo allowlist chặt chẽ, CSP, rate limiting.
- Giao diện responsive từ 320 px trở lên, đạt chuẩn WCAG 2.1 AA, hỗ trợ điều hướng bàn phím.
- Uptime mục tiêu >= 99.5%; retry job và global exception handling theo chuẩn RFC 7807.
- Unit coverage tối thiểu 80% cho tầng Application; mọi endpoint có happy path và error case; kiểm thử E2E cho luồng trọng yếu.
- SEO: JSON-LD Schema.org, meta tags / Open Graph, sitemap XML động tại `/sitemap.xml` do Next.js cung cấp và robots.txt. FR-JOB-003/NFR-SEO-003 áp dụng contract ADR-0003: không yêu cầu Hangfire sinh/lưu file sitemap lúc 02:00 UTC. Sitemap chỉ chứa URL public hợp lệ, duyệt các trang dữ liệu, loại Draft/Archived/đã xóa, phản ánh thay đổi theo cache policy và có fallback an toàn khi upstream lỗi; không coi fallback tĩnh là bằng chứng sitemap đầy đủ.

## 9. Baseline lịch sử mã nguồn ngày 2026-09-21

**Lưu trữ lịch sử, không phải hiện trạng 16/11/2026.** Các mô tả thiếu chức năng bên dưới chỉ áp dụng ngày 21/09. Hiện trạng và công việc còn lại theo `docs/Ke_Hoach_Hoan_Thien_He_Thong.md`, traceability và evidence theo commit.

Kết quả đối chiếu tại ngày baseline:

- **Domain:** Đã có `BaseEntity`, user/category/recipe và các child entity, enum, domain exception cùng repository interfaces. Đây mới là nền domain; nhiều invariant/use case trong các mục 3–6 chưa có bằng chứng hiện thực đầy đủ.
- **Application:** Đã cấu hình MediatR, logging/validation behavior, DTO và một phần use case category (`Get`, `Create`, `Delete`). Các use case auth, recipe lifecycle, ảnh, step, ingredient, nutrition, cache behavior/invalidation còn thiếu hoặc chưa hoàn chỉnh.
- **Infrastructure:** Đã có `ApplicationDbContext`, entity configurations, repositories/UnitOfWork, JWT service, local file storage, migration ban đầu và development seeder. Redis, MinIO client, Hangfire, email, refresh-token rotation và purge job chưa được tích hợp đầy đủ theo kiến trúc mục tiêu.
- **API:** `Program.cs` đã nối DI, CORS, JWT bearer, authorization policy, middleware correlation/error, OpenAPI/Scalar và endpoint groups. Category mới có GET/POST/DELETE; recipe mới có GET danh sách; auth mới có endpoint ping; health endpoint hiện trả trạng thái tĩnh, chưa probe dependency thật. Hai mutation category chưa gọi `RequireAuthorization("AdminPolicy")`, còn recipe GET inject repository trực tiếp thay vì đi qua Application query/DTO; đây là hai vi phạm kiến trúc/bảo mật cần ưu tiên sửa.
- **Frontend:** Đã rời scaffold mặc định và có public layout, Navbar/Footer, trang danh sách/chi tiết category, API client và kiểu dữ liệu category. Các trang còn lại, auth store/flow, Query provider, form stack, route guard, ISR/cache tag, recipe SEO và test chưa được hiện thực.
- **Hạ tầng chạy local:** Docker Compose hiện chỉ có PostgreSQL, Redis, MinIO và Seq; chưa có service API, frontend, Nginx hoặc MailHog. `LocalFileStorageService` cũng cho thấy lưu trữ ảnh hiện chưa chuyển hoàn toàn sang MinIO.

Vì vậy, các mục từ 1 đến 8 là **kiến trúc và hành vi mục tiêu đã được chuẩn hóa**; mục 9 là **baseline triển khai một phần tại ngày 2026-09-21**, không nên hiểu mọi thành phần đã hoàn thành.

## 10. Các quyết định kiến trúc đã thống nhất (Chuẩn hóa)

1. **Xóa Recipe (Soft delete vs Hard delete):** Áp dụng mô hình xóa 2 giai đoạn. API người dùng chỉ thực hiện Soft Delete (`IsDeleted = true`, `Status = Archived`), không xóa ảnh MinIO ngay. Hangfire Job định kỳ quét và Hard Delete vật lý sau 30 ngày.
2. **Filtered Unique Index cho Slug:** Cấu hình index `UNIQUE("Slug") WHERE "IsDeleted" = false` cho cả Recipe và Category để cho phép tạo lại slug sau khi bản ghi cũ đã bị xóa mềm.
3. **Chuẩn hóa Sắp xếp (Sorting API):** Thống nhất API Contract dùng cặp tham số `sortBy` và `sortOrder` (mặc định `sortBy=createdAt&sortOrder=desc`). Backend Application Layer hỗ trợ bóc tách thêm cú pháp tiền tố âm `sort=-title`.
4. **Nguyên liệu (Quantity & Unit):** Cho phép `Nullable` ở cả CSDL, Entity và DTO để hỗ trợ nguyên liệu nêm nếm vừa đủ. Thống nhất tên thuộc tính thứ tự là `OrderIndex` và độ dài `Name` tối đa 200 ký tự.
5. **Dinh dưỡng (RecipeNutrition):** Hỗ trợ đầy đủ **6 chỉ số** (`Calories`, `Protein`, `Carbohydrates`, `Fat`, `Fiber`, `Sodium`) trong Owned Entity và DTO. Bổ sung endpoint riêng `PUT /recipes/{id}/nutrition` và cho phép trường `Instructions` của Recipe mang giá trị `null`.
6. **Bước thực hiện (RecipeStep):** `StepNumber` do Server tự động sinh và đánh số liên tục `1..N`; cấm sửa `StepNumber` qua PUT step đơn lẻ; bổ sung endpoint `PUT /recipes/{id}/steps/reorder` để đổi thứ tự bước an toàn; chuẩn hóa tên trường `TimerMinutes` và `Title`; chặn xóa nếu là bước duy nhất của bài `Published`.
7. **Cache TTL:** Thống nhất TTL cho Recipe detail là **60 phút** cấu hình qua `appsettings.json`, kết hợp cơ chế xóa cache theo tag khi có write operation.
8. **Luồng Google OAuth:** Thống nhất frontend dùng Google Sign-In gửi `idToken`, backend xác thực token qua thư viện `Google.Apis.Auth`.
9. **Lưu trữ Token:** Access Token lưu ở client memory; Refresh Token lưu trong **httpOnly, Secure, SameSite=Lax Cookie** để hạn chế JavaScript đọc refresh token. HttpOnly không loại bỏ XSS; vẫn cần CSP, kiểm soát nội dung đầu ra và kiểm tra origin/CSRF cho các thao tác dùng cookie.
10. **Mã lỗi phân quyền:** Vi phạm ownership trả về HTTP `403 Forbidden` (chuẩn RESTful), xung đột concurrency hoặc ràng buộc dữ liệu trả về `409 Conflict`.

## 11. Thứ tự hiện thực đề xuất

1. Dựng Domain model, enum/status, BaseEntity, exception và rule publish/ownership/reorder.
2. Tạo EF Core DbContext, Identity, configurations, Filtered Indexes, migrations, seed và UnitOfWork.
3. Tạo Application CQRS cho auth/category/recipe; validators, authorization handler và mapping DTOs.
4. Tạo Infrastructure cho JWT/refresh rotation qua httpOnly cookie, Redis, MinIO, Hangfire và email.
5. Tạo API endpoints, middleware, RFC 7807 Problem Details, rate limit, health check và Scalar UI.
6. Tạo frontend public pages trước, sau đó auth/dashboard; kết nối TanStack Query với API.
7. Viết unit/integration/E2E tests theo các luồng critical và architecture tests để giữ dependency rule.
8. Hoàn thiện Docker Compose, observability, SEO, backup và CI checks.

## 12. Acceptance checklist cốt lõi

- [ ] Khách (Guest) không xem được bài Draft/Archived của tác giả khác.
- [ ] `/recipes` và `/categories/{slug}` chỉ trả recipe Published kể cả khi request có token Author/Admin; Author xem Draft/Archived qua workspace quản lý, không qua public shared cache.
- [ ] Author không thể sửa/xóa/publish recipe của author khác (trả về 403 Forbidden).
- [ ] Admin quản lý được category và recipe của mọi owner.
- [ ] Draft thiếu active step hoặc ingredient không publish được; 422 có errors.steps/errors.ingredients (Issue #83).
- [ ] Điều kiện ingredient áp dụng lúc publish; xóa ingredient cuối của bài Published vẫn thành công theo contract FR-RCP-009.
- [ ] Không thể xóa bước duy nhất của bài viết đang ở trạng thái Published (trả về 422).
- [ ] Category còn recipe bị từ chối xóa với mã lỗi 409 Conflict.
- [ ] Chỉ có duy nhất một ảnh primary; upload validate kích thước, MIME type và magic bytes.
- [ ] Thêm bước mới tự động tăng `StepNumber`; xóa bước tự động renumber liên tục 1, 2, 3...
- [ ] Đổi thứ tự bước hoạt động chính xác qua endpoint `steps/reorder` mà không bị lỗi duplicate key.
- [ ] Nguyên liệu hỗ trợ nêm nếm vừa đủ (cho phép Quantity và Unit nhận giá trị null).
- [ ] Recipe detail hỗ trợ đầy đủ 6 chỉ số dinh dưỡng.
- [ ] Xóa recipe thực hiện Soft Delete và xóa sạch ảnh MinIO sau 30 ngày qua Hangfire.
- [ ] Refresh token được lưu trong httpOnly cookie, hash SHA-256 trong DB, rotate và phát hiện reuse.
- [ ] Search không dấu tiếng Việt trả kết quả Published theo relevance rank (`ts_rank`).
- [ ] Difficulty `Expert=4` tạo, cập nhật, listing và search đúng; các giá trị ngoài `1..4` bị từ chối.
- [ ] Write operation tự động invalidate cache liên quan; xung đột concurrency trả về 409 Conflict.
- [ ] Lỗi API tuân thủ đúng RFC 7807 Problem Details, có Correlation ID và không lộ stack trace.
- [ ] Endpoints `/health/live` và `/health/ready` phân biệt đúng mục đích vận hành.
- [ ] Kiến trúc phân tầng tuân thủ Dependency Rule và khóa đúng hai ngoại lệ Domain theo ADR-0001/ADR-0003; không mở rộng package hoặc vị trí sử dụng.

### Nhật ký điều chỉnh yêu cầu 1.4.0 — 16/11/2026

Người dùng đã cho phép điều chỉnh đặc tả trong phiên làm việc sau đề xuất giữ sitemap động Next.js, ngoại lệ Domain có giới hạn và refresh cookie SameSite=Lax. ADR-0003 ghi contract, điều khoản được thay thế và phép kiểm chứng. Chỉ thay đổi tiêu chí thiết kế của FR-JOB-003, NFR-SEO-003, NFR-MAINT-004 và phần cookie của NFR-SEC-005; các yêu cầu chức năng, bảo mật, hiệu năng và vận hành còn lại vẫn giữ nguyên. Không tự chuyển trạng thái sang Verified; cần review/test trên phiên bản nghiệm thu.
