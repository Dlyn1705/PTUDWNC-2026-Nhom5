# Issue #90 — SEO / ISR / canonical evidence

Ngày kiểm tra: 2026-11-04 (Asia/Bangkok)
Working-tree base commit: `bbdc98d`
Môi trường: Windows, Next.js 16.4.3, Node/npm, .NET 10.

## Đã triển khai

- Recipe JSON-LD typed builder: image absolute/fallback, author, dates, prep/cook/total time, yield, ingredients, ordered `HowToStep` và nutrition nullable.
- Metadata helper dùng chung cho recipe/category/listing: title có giới hạn, description có chuẩn hóa, canonical, OG 1200×630 và Twitter large card.
- Public route cache: home 120s, category 300s, recipe list 180s, recipe detail 3600s; search/auth/dashboard giữ `no-store`.
- `POST /api/revalidate` có secret header, allow-list tag/path, giới hạn payload 8 KiB; backend gọi best-effort sau invalidation Redis.
- Slug draft unique/stable sau publish, lưu `RecipeSlugHistory`, resolver public và redirect permanent từ slug cũ; canonical chỉ trỏ slug hiện tại.
- Pagination/filter/search policy: page category giữ `?page=n`; listing filter/search `noindex,follow` với canonical route gốc.
- Lighthouse CI config cho `/`, `/recipes`, `/categories`; output local được ignore bằng `.gitignore`.

## Kết quả kiểm tra

| Kiểm tra | Kết quả |
|---|---|
| `npm run typecheck` | Pass |
| `npm run test:seo` | Pass — 5/5 |
| `npm run test:sitemap` | Pass — 14/14 |
| `npm run test:search` | Pass — 22/22 |
| `npm run lint` | Pass — 0 lỗi, 1 warning cũ tại `tests/sitemap-robots.unit.cjs:257` |
| `npm run build` | Pass — route table xác nhận TTL 2m/5m và dynamic public detail/search |
| `dotnet build Culinary_Blog_Nhom5.sln --no-restore` | Pass — 0 warning, 0 error |
| Recipe update authorization test | Pass — 1/1 |
| `PublicContentCacheTests` | Pass — 6/6 |
| Full RecipeUpdate test project | 20 pass, 1 fail do môi trường thiếu `RECIPE_UPDATE_TEST_CONNECTION` |

### Lighthouse local stack

Đã khởi động API tại `http://localhost:5156` với database/Redis/MinIO local và frontend tại `http://localhost:3000`. Lighthouse CLI chạy với Chrome headless flags ổn định, chỉ kiểm tra nhóm SEO:

| Route | SEO |
|---|---:|
| `/` | 100/100 |
| `/recipes` | 100/100 |
| `/categories` | 100/100 |
| `/recipes/che-dau-do` | 100/100 |

## Kiểm tra còn phụ thuộc môi trường

- Lighthouse CI đã có config/script. Lệnh `lhci autorun` trước đó gặp `NO_FCP` khi tự quản lý server trên runner local; lệnh Lighthouse CLI trực tiếp với Chrome headless flags đã chạy thành công 100/100 cho bốn route nêu trên. Cần chạy lại `lhci autorun` trên CI/staging runner để xác nhận end-to-end.
- Google Rich Results Test chưa chạy vì fixture/API local không có public HTTPS URL. Khi deploy staging, chạy test với một Published recipe đủ 6 nutrition fields và đính kèm URL/result vào report này.
- Migration `20261104120000_AddRecipeSlugHistory` được thêm thủ công vì môi trường chưa có `dotnet-ef`; cần chạy migration trên staging/database integration trước merge.

## Cấu hình triển khai cần đặt

- Frontend: `NEXT_PUBLIC_SITE_URL`, `REVALIDATION_SECRET`.
- Backend: `SEO_REVALIDATION_URL` hoặc `SeoRevalidation:Url`, và `SEO_REVALIDATION_SECRET` hoặc `SeoRevalidation:Secret`.
- Không đưa revalidation secret vào `NEXT_PUBLIC_*`, HTML, payload body hoặc log.
