# ADR — Public SEO rendering dùng Next.js ISR và backend Redis

**Trạng thái:** Accepted for Issue #90
**Ngày:** 2026-11-04
**Phạm vi:** public home/category/recipe/list routes

## Quyết định

Public route dùng Next.js ISR/RSC cache với tag/path revalidation; backend Redis tiếp tục là lớp cache DTO/API. Auth, dashboard và Draft/Archived preview giữ `no-store`.

TTL route:

- Home: 120 giây.
- Category list/detail: 300 giây.
- Recipe list: 180 giây.
- Recipe detail: 3600 giây.
- Search: `no-store`, `noindex,follow`.

Tags chính:

- `public:categories`
- `public:recipes`
- `public:category:{slug}`
- `public:recipe:{slug}`

Frontend cung cấp `POST /api/revalidate`. Backend gọi bằng header `x-revalidation-secret` và payload chỉ gồm tag/path allow-list. Endpoint không nhận token trong body, không log secret, giới hạn body 8 KiB và trả 422 cho tag/path ngoài allow-list.

Backend cấu hình endpoint bằng `SEO_REVALIDATION_URL` + `SEO_REVALIDATION_SECRET` (hoặc
`SeoRevalidation:Url` + `SeoRevalidation:Secret`). Frontend cấu hình
`NEXT_PUBLIC_SITE_URL` và `REVALIDATION_SECRET`; secret chỉ là server-side.

## Invalidation contract

Sau commit thành công của publish, unpublish, archive, delete, sửa recipe/image/ingredient/step/nutrition hoặc sửa category, backend phải gọi revalidation cho recipe/category liên quan và các collection tags. Nếu frontend endpoint tạm thời không reachable, TTL là fallback; lỗi phải được ghi structured log có correlation ID.

Sitemap/robots vẫn do #82 sở hữu. Sitemap phải dùng cùng `NEXT_PUBLIC_SITE_URL`, Published filter và slug hiện tại.

## Lý do

Spec yêu cầu public SSR/ISR và recipe detail cache TTL 60 phút, nhưng Redis backend không thể tự xóa HTML/RSC cache của Next.js. Hai lớp cache tách trách nhiệm giúp giữ hiệu năng và vẫn làm mất nội dung SEO cũ sau mutation khi webhook hoạt động.

## Rủi ro và rollback

- Nếu deployment không hỗ trợ gọi endpoint nội bộ, tắt `REVALIDATION_SECRET` và rollback public fetch về `cache: "no-store"`; khi đó hệ thống chỉ tuyên bố dynamic SSR + backend Redis, không tuyên bố ISR.
- Nếu resolver slug lỗi, proxy bỏ qua redirect và route hiện tại tiếp tục phục vụ recipe; không làm public recipe unavailable.
- Không bật cache cho request chứa access token hoặc dữ liệu owner/Admin.
