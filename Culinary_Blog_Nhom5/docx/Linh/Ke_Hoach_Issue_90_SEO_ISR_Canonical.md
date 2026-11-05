# Kế hoạch hoàn thiện Issue #90 — Structured data, metadata, ISR và URL canonical

**Issue:** [#90 — Hoàn thiện structured data, metadata, ISR và URL canonical](https://github.com/Dlyn1705/PTUDWNC-2026-Nhom5/issues/90)
**Phụ trách chính:** Linh (`@Dlyn1705`)
**Phối hợp:** Tuấn (lifecycle/cache), Trâm (recipe data), Ân (public/auth boundaries)
**Phạm vi liên quan:** `NFR-SEO-001..004`; sitemap/robots phối hợp với #82
**Ngày lập kế hoạch:** 2026-11-04

## 1. Mục tiêu và nguyên tắc chốt phạm vi

Hoàn thiện SEO cho các public route của Culinary Blog theo đặc tả `docx/Spec/Culinary_Blog_Spec.md`, đồng thời tạo bằng chứng nghiệm thu tự động và thủ công:

- Published recipe/category có metadata động, canonical URL, Open Graph/Twitter và structured data đúng dữ liệu backend.
- Draft/Archived/Deleted không xuất hiện trong public listing/detail/sitemap; nếu có màn hình preview dành cho owner/Admin thì phải `noindex, nofollow` và không được dùng shared cache.
- Public rendering có chiến lược ISR/revalidation rõ ràng; dashboard, auth và dữ liệu theo user không được cache dùng chung.
- URL dùng slug lowercase, không dấu, unique; slug Published ổn định. Slug Draft đổi thì URL cũ được lưu mapping và trả HTTP 301 tới URL mới.
- Query pagination/filter/sort có canonical policy nhất quán, không tạo duplicate content.
- PR hoàn tất phải ghi `Closes #90` và đính kèm kết quả Rich Results/Lighthouse.

Không đưa phần triển khai sitemap/robots ra ngoài phạm vi đã giao cho #82; Issue #90 chỉ bổ sung kiểm thử và tích hợp SEO để bảo đảm các route mà #82 sinh ra dùng cùng base URL, slug và trạng thái Published.

## 2. Đối chiếu baseline hiện tại

### Đã có nền tảng

- `app/recipes/[slug]/page.tsx` đã có `generateMetadata`, canonical recipe, robots theo status, Open Graph/Twitter và JSON-LD `Recipe`.
- `app/categories/[slug]/page.tsx` đã có metadata và canonical category.
- `app/sitemap.ts`, `app/robots.ts` và `tests/sitemap-robots.unit.cjs` đã tồn tại; sitemap có lọc `status === 1`, phân trang và fallback tĩnh.
- `lib/api/serverClient.ts` đã lọc defense-in-depth recipe chỉ Published cho public listing/detail.
- `docx/Linh/Frontend_Backend_Contract_Matrix.md` xác nhận contract public recipe/category, `PublishedAt`/`UpdatedAt`, SEO hiện có và cache API 60 phút cho recipe detail.

### Khoảng cách phải xử lý trước khi nghiệm thu

1. JSON-LD đang tạo trực tiếp trong page; cần tách builder/normalizer, xử lý nullable và kiểm tra đủ trường Rich Results. Không được biến dữ liệu thiếu thành giá trị giả như `0 grams` hoặc chuỗi `undefined`.
2. Metadata chưa có utility giới hạn title tối đa 60 ký tự, description mục tiêu 150–160 ký tự, ảnh OG chuẩn 1200×630, `metadataBase` và URL canonical dùng chung.
3. Public fetch hiện dùng `cache: "no-store"`; root layout gọi `connection()`. Vì vậy chưa có bằng chứng ISR Next.js dù API có Redis cache.
4. `proxy.ts` đang gắn `private, no-store` cho nhiều public recipe/category route; cần thống nhất với chiến lược ISR/CDN sau khi chốt ADR.
5. Canonical hiện mới bao phủ URL cơ bản; chưa có policy cho page 2+, filter/sort/search params và redirect về URL chuẩn.
6. Chưa có luồng kiểm thử slug cũ → 301 sau khi Draft đổi slug; cần contract với backend/lifecycle.
7. Test hiện có chủ yếu kiểm tra source/sitemap/robots; chưa có automated assertions đầy đủ cho rendered head, JSON-LD, cache/revalidation và Lighthouse CI.

## 3. Quyết định kiến trúc cần chốt trước khi code

### Quyết định đề xuất: ISR public ở Next.js, Redis API vẫn là data cache

Giữ hai lớp cache nhưng mỗi lớp có trách nhiệm riêng:

| Lớp | Phạm vi | TTL/revalidation đề xuất | Invalidation |
|---|---|---:|---|
| Next.js ISR/RSC | HTML/RSC và metadata của public route | Home 120s; category 300s; recipe list 180s; recipe detail 3600s | Tag/path revalidation khi publish, unpublish, archive, delete, sửa recipe/category |
| Backend Redis | DTO/API public | Category 45–60 phút; recipe list 1–5 phút; recipe detail 60 phút theo Spec | Backend invalidates sau write commit |
| Auth/dashboard | Dữ liệu theo user, Draft/Archived preview | `no-store` | Không đưa vào shared cache |

Để tránh HTML Next.js giữ dữ liệu đã bị xóa sau khi Redis invalidation chạy, cần một cơ chế revalidation có xác thực: backend/lifecycle gọi endpoint nội bộ của frontend với secret server-to-server, endpoint gọi `revalidateTag`/`revalidatePath` cho tag recipe/category. Secret không được đưa vào `NEXT_PUBLIC_*`, log hoặc HTML.

Trước khi merge phải ghi một ADR ngắn (`docx/Linh/ADR-SEO-ISR.md`) mô tả TTL, tags, endpoint revalidation, failure mode và cách rollback.

### Điều kiện fallback

Nếu môi trường triển khai không thể gọi on-demand revalidation an toàn, nhóm phải chấp thuận ADR thay thế: dynamic SSR public + backend Redis cache, bỏ tuyên bố “Next ISR đã hoàn tất”, giữ test không cache private và chứng minh độ tươi theo TTL API. Không được vừa ghi là ISR vừa giữ toàn bộ `no-store` mà không có bằng chứng.

## 4. Kế hoạch thực hiện theo giai đoạn

### Giai đoạn A — Chốt contract và URL policy

1. Chuẩn hóa `SITE_URL`/`metadataBase`: trim trailing slash, bắt buộc origin hợp lệ, không ghép URL bằng chuỗi rời rạc.
2. Tạo utility dùng chung, dự kiến tại `lib/seo/`:
   - `siteUrl.ts`: `siteOrigin`, `absoluteUrl`, `recipeUrl`, `categoryUrl`.
   - `text.ts`: trim, collapse whitespace, cắt title/description theo boundary từ đầy đủ từ, fallback tiếng Việt/Anh ổn định.
   - `canonical.ts`: loại bỏ params không có ý nghĩa SEO và tạo canonical theo route policy.
   - `recipeJsonLd.ts`: map DTO → Schema.org, sanitize chuỗi, escape `<` trước khi đưa vào `application/ld+json`.
3. Chốt policy canonical:
   - `/recipes/[slug]`: canonical tới slug hiện tại, không mang query params.
   - `/categories/[slug]`: page 1 canonical URL sạch; page `n > 1` self-canonical gồm `?page=n` vì nội dung phân trang khác nhau.
   - `/recipes` với filter/sort/page và `/search`: `noindex,follow`; canonical về URL nền tương ứng sau khi loại tham số tracking. Nếu nhóm muốn index một tập filter cụ thể, phải bổ sung allow-list riêng trong ADR, không index mặc định.
   - Tất cả URL phải lowercase, không double slash, không trailing slash ngoài root, encode slug an toàn.
4. Chốt status policy: Published là `index,follow`; Draft/Archived/Deleted là 404 trên public route hoặc `noindex,nofollow` trên preview riêng; không để `generateMetadata` vô tình index fallback “Not Found”.

### Giai đoạn B — Structured data `Recipe`

1. Dùng builder thuần, có type rõ ràng, cho các trường:
   - `@context`, `@type`, `@id`, `url`, `name`, `description`, `image`.
   - `author`, `datePublished`, `dateModified`.
   - `prepTime`, `cookTime`, `totalTime` theo ISO 8601; không sinh thời gian sai khi giá trị nullable.
   - `recipeYield`, `recipeCategory`.
   - `recipeIngredient` theo `OrderIndex`; quantity/unit null hoặc rỗng thì chỉ còn tên nguyên liệu.
   - `recipeInstructions` theo `StepNumber`, mỗi phần tử là `HowToStep`; bỏ field null/empty.
   - `nutrition` với 6 chỉ số `calories`, `proteinContent`, `carbohydrateContent`, `fatContent`, `fiberContent`, `sodiumContent` khi có dữ liệu hợp lệ.
2. Không thêm `aggregateRating`/review khi hệ thống chưa có dữ liệu đánh giá thật.
3. Chọn ảnh primary, fallback ảnh đầu tiên, cuối cùng là ảnh OG mặc định 1200×630; kiểm tra URL absolute và MIME/nguồn ảnh phù hợp.
4. Dùng một `<script type="application/ld+json">` cho Recipe; JSON phải parse được, escape `<` để chống phá vỡ thẻ script, không chứa secret/token/HTML không cần thiết.
5. Category/listing chỉ thêm JSON-LD nếu có schema được đặc tả rõ; không nhúng Recipe JSON-LD cho các card không phải trang detail để tránh khai báo trùng/sai nội dung.

### Giai đoạn C — Metadata, Open Graph và canonical

1. Đặt `metadataBase` ở root metadata và tạo helper metadata cho page/category/recipe, tránh mỗi page tự ghép env URL.
2. Recipe metadata:
   - title mục tiêu ≤60 ký tự, ưu tiên `{title} | Culinary Blog` và cắt có chủ đích nếu title dài.
   - description 150–160 ký tự khi dữ liệu đủ dài; nếu mô tả ngắn thì giữ nội dung thật, không chèn filler vô nghĩa.
   - `alternates.canonical`, `openGraph.url`, `openGraph.type=article`, `publishedTime`, `modifiedTime`, author và ảnh 1200×630.
   - Twitter `summary_large_image`, title/description/image đồng nhất OG.
3. Category metadata: title/description riêng, OG type `website`, ảnh fallback 1200×630, canonical theo pagination policy.
4. Home, `/categories`, `/recipes`, `/search`: metadata tĩnh/động thống nhất; filter/search không được tạo nhiều canonical mâu thuẫn.
5. `noindex` phải được sinh từ trạng thái dữ liệu, không dựa vào text hiển thị. Draft/Archived preview không được trả `index,follow` do dùng lại metadata của Published.

### Giai đoạn D — ISR, revalidation và cache boundary

1. Tách public cached client khỏi private management client trong `lib/api/serverClient.ts`:
   - public fetch nhận `revalidate` và `tags` theo route;
   - auth/owner/Admin fetch giữ `no-store`;
   - không truyền access token vào request cacheable hoặc HTML.
2. Loại bỏ `connection()` khỏi root layout nếu nó làm toàn bộ cây route dynamic; chuyển dynamic boundary vào auth/dashboard/preview cần thiết.
3. Cấu hình route-level `revalidate` và tags cho home, category list/detail, recipe list/detail; query params phải là một phần của cache key.
4. Cập nhật `proxy.ts` để public ISR response có policy public phù hợp; dashboard/profile/auth/preview vẫn `private, no-store`. Không dùng browser `Cache-Control` để che giấu việc server vẫn render stale data.
5. Bổ sung endpoint nội bộ revalidation, ví dụ `POST /api/revalidate`, kiểm tra secret, allow-list tag/path, giới hạn payload và không trả secret trong lỗi.
6. Phối hợp Tuấn để phát event/call hook sau commit thành công của publish/unpublish/archive/delete/update category. Nếu hook lỗi, ghi structured log/correlation ID và để TTL làm fallback.
7. Đảm bảo sitemap/robots của #82 dùng cùng `siteUrl`, public API và status filter; không thêm Draft/Archived/Deleted chỉ vì ISR cache cũ.

### Giai đoạn E — Slug ổn định và redirect 301

1. Xác nhận backend tạo slug không dấu, lowercase, unique (`-2`, `-3`...), giữ nguyên sau Published như Spec.
2. Bổ sung contract cho Draft đổi slug: lưu `oldSlug → recipeId/currentSlug` trong backend (bảng history/mapping hoặc cơ chế tương đương), không dùng redirect map trong memory của frontend.
3. Tạo resolver public không trả dữ liệu private, ví dụ `GET /api/v1/recipes/resolve/{slug}` trả `currentSlug` và trạng thái redirect; old slug không được trở thành canonical mới.
4. Route Next.js dùng `permanentRedirect`/HTTP 301 tới `/recipes/{currentSlug}` trước khi render metadata nếu slug cũ được xác định; slug Published đổi phải bị từ chối theo domain rule hoặc giữ redirect history.
5. Revalidate canonical slug, old slug và sitemap sau đổi slug/publish; không cache redirect vô thời hạn nếu backend có chính sách dọn history.

### Giai đoạn F — Kiểm thử và bằng chứng nghiệm thu

#### Unit/contract

- `seo-text`: title/description giới hạn, Unicode tiếng Việt, whitespace, chuỗi rỗng.
- `canonical`: root, trailing slash, page 1/page n, filter/sort/tracking params, URL encode.
- `recipeJsonLd`: đủ trường, 6 nutrition, thứ tự steps/ingredients, null quantity/unit, missing image/nutrition, escape `<` và `</script`.
- API contract: status Published/Draft/Archived/Deleted, `PublishedAt`/`UpdatedAt`, slug history/resolve, cache tags/revalidation payload.

#### Rendered E2E với Playwright

- Published recipe: kiểm tra title ≤60, description, canonical, OG/Twitter, JSON-LD parseable và các required fields.
- Category/list/search: canonical đúng policy; page/filter không tạo canonical trùng ngoài ý muốn.
- Draft/Archived/Deleted: public không hiển thị; preview (nếu có) có `noindex,nofollow`, `Cache-Control: private, no-store`.
- Slug Draft đổi: URL cũ trả 301, URL mới 200, canonical chỉ về URL mới, không có loop.
- Publish/unpublish/delete: sau revalidation, request tiếp theo không trả HTML/metadata/JSON-LD cũ; test fallback khi revalidation endpoint lỗi.
- Sitemap/robots: phối hợp test #82; chỉ Published recipe và public category, base URL không double slash.

#### Rich Results và Lighthouse

- Thêm script `test:seo` chạy unit + rendered SEO assertions; không chỉ regex source.
- Thêm Lighthouse CI config cho `/`, `/categories`, `/recipes`, một category và một Published recipe; fail nếu SEO dưới ngưỡng nhóm thống nhất, canonical/robots/structured data lỗi hoặc có broken public URL.
- Chạy Google Rich Results Test cho ít nhất một recipe fixture có đủ 6 nutrition; lưu URL/result hoặc snapshot trong `culinary-blog-web/docs/reports/issue-90-seo.md`.
- Báo cáo phải ghi commit SHA, môi trường, route, thời điểm, kết quả Rich Results, Lighthouse và các cảnh báo chấp nhận được.

## 5. Phân công và điểm bàn giao

| Người | Cần bàn giao | Điều kiện hoàn thành |
|---|---|---|
| Linh | SEO utilities, metadata, JSON-LD, canonical, public ISR wiring, E2E/CI, report | Test SEO xanh; không cache private; PR có evidence |
| Tuấn | Lifecycle event/revalidation hook, cache tag/path invalidation, slug history/resolve contract | Publish/unpublish/archive/delete và đổi slug làm public cache/redirect đúng |
| Trâm | Xác nhận DTO recipe/nutrition/image/step và dữ liệu nullable | JSON-LD không phải đoán field; 6 chỉ số mapping được kiểm chứng |
| Ân | Kiểm tra boundary auth/preview/dashboard | Draft/Archived preview không lọt vào shared cache/HTML public |
| #82 | Sitemap/robots contract và test chung | Cùng base URL/status filter/canonical slug với Issue #90 |

## 6. Thứ tự triển khai đề xuất

1. Chốt ADR và contract status/slug/cache với Tuấn, Trâm, Ân, #82.
2. Tạo SEO URL/text/JSON-LD utilities và unit tests.
3. Refactor recipe/category metadata và canonical policy.
4. Hoàn thiện structured data Recipe, fixture đủ dữ liệu và Rich Results smoke test.
5. Tách cache boundary, bật ISR/revalidation, cập nhật proxy headers và integration tests.
6. Bổ sung slug history/resolve/301 nếu backend chưa có; test redirect/canonical/sitemap.
7. Thêm Lighthouse CI, chạy toàn bộ frontend typecheck/build/test/E2E, sửa cảnh báo.
8. Lập report, cập nhật matrix/ADR, mở PR ghi `Closes #90` và đính kèm evidence.

## 7. Acceptance checklist của Issue #90

- [ ] Recipe Published pass Schema.org/Rich Results với `name`, `description`, `image`, `author`, ngày tháng, thời gian, yield, ingredients, instructions và nutrition hợp lệ.
- [ ] Recipe/category/public routes có title, description, OG 1200×630, Twitter large card, URL/type và canonical đúng policy.
- [ ] Published là `index,follow`; Draft/Archived/Deleted không public/sitemap và preview (nếu có) là `noindex,nofollow`.
- [ ] ISR/revalidation đúng TTL/tag/path đã ghi trong ADR; dữ liệu private không shared-cache; mutation không để HTML SEO cũ quá policy.
- [ ] Slug không dấu/lowercase/unique; Published ổn định; old Draft slug trả 301 tới slug mới và canonical không trỏ ngược.
- [ ] Pagination/filter/search không tạo duplicate content; canonical/noindex được kiểm thử tự động.
- [ ] Sitemap/robots phối hợp #82, chỉ public Published/category và dùng cùng site origin.
- [ ] Automated SEO assertions, build/typecheck và Lighthouse CI đạt; có kết quả Rich Results/Lighthouse trong report.
- [ ] PR ghi `Closes #90` và không gộp các hạng mục ngoài phạm vi #82 nếu chưa có thỏa thuận.

## 8. Tài liệu đối chiếu

- `docx/Spec/Culinary_Blog_Spec.md`: vòng đời Published/Draft/Archived, slug ổn định, cache TTL recipe detail 60 phút, Next.js public SSR/ISR, metadata/canonical/JSON-LD, filter/sort/page trong URL và SEO NFR.
- `docx/Spec/Frontend_Spec.md`: Recipe Detail SEO, Schema.org Recipe, category/recipe public routes và acceptance Rich Results/sitemap.
- `docx/Spec/Bang_Phan_Cong_Va_Mo_Ta_Chi_Tiet_Cong_Viec.md`: phân công Linh, boundary với Tuấn/Trâm/Ân và #82.
- `docx/Linh/Frontend_Backend_Contract_Matrix.md`: contract hiện tại, trạng thái SEO/cache và các điểm backend còn mở.
- GitHub Issue #90: mục tiêu, NFR-SEO-001..004, tiêu chí nghiệm thu và yêu cầu evidence.
