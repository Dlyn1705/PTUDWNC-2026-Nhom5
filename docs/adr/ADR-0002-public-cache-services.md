# ADR-0002: Giữ cache service chuyên biệt

- Trạng thái: Chấp nhận theo hướng triển khai người dùng yêu cầu ngày 16/11/2026.
- Phạm vi: quyết định thiết kế HT-07; kiểm chứng nghiệm thu vẫn còn mở.

## Quyết định

Giữ `IPublicContentCache`/`PublicContentCache` và `IRecipeCacheInvalidator`/`RecipeCacheInvalidator`. MediatR giữ Logging/Validation, handler điều phối use case; không thêm cache behavior trùng logic. Infrastructure thực hiện Redis và frontend revalidation qua port của Application.

## Contract

- Chỉ cache public projections. Dữ liệu Owner/Admin theo ID và dashboard dùng luồng quản lý riêng.
- TTL mặc định từ PublicCacheOptions: category 45, detail 60, list/search 3 phút. Next.js có policy riêng trong serverClient.ts; TanStack Query dùng query keys riêng.
- Invalidation sau commit: version key đổi cho public projections; recipe mutation làm mới recipe và category counts. FrontendRevalidationClient yêu cầu Next.js revalidate tag/path; browser mutation hooks invalidate query keys.
- Redis read/write lỗi có đường fallback về dữ liệu; mutation đã commit không biến thành thất bại chỉ vì cache invalidation lỗi. Pending invalidations hiện giữ trong process và được thử lại khi đọc version; không được mô tả là durable queue qua restart hoặc toàn cluster.
- Không cam kết loại bỏ mọi stale read chỉ từ thiết kế: TTL, restart, multi-instance và lỗi revalidation phải được kiểm chứng thực tế.

## Căn cứ mã nguồn

- `Culinary_Blog_Nhom5/src/CulinaryBlog.Application/DependencyInjection.cs`
- `Culinary_Blog_Nhom5/src/CulinaryBlog.Infrastructure/Services/PublicContentCache.cs`
- `Culinary_Blog_Nhom5/src/CulinaryBlog.Infrastructure/Services/RecipeCacheInvalidator.cs`
- `Culinary_Blog_Nhom5/src/CulinaryBlog.Infrastructure/Services/PublicCacheOptions.cs`
- `Culinary_Blog_Nhom5/culinary-blog-web/lib/api/serverClient.ts`
- `Culinary_Blog_Nhom5/culinary-blog-web/hooks/mutations/useRecipeMutations.ts`

## Kiểm chứng còn lại

Chạy public cache/security, recovery/observability và search cache suites phù hợp trên commit cuối cùng; kiểm tra mutation, Redis outage/recovery, process restart, Next.js revalidation và browser query invalidation. HT-07 chưa hoàn tất kiểm chứng vận hành; ADR này không chuyển yêu cầu nào sang Verified và không thay đổi chỉ tiêu performance.
