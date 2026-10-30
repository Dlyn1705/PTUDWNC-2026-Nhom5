# Ma trận contract sau tích hợp frontend local với backend main

**Nền backend:** `e33babacf24721a01797866cedd362c52f031675`
**Nguồn yêu cầu:** `docx/Spec/Culinary_Blog_Spec.md` v1.2.0
**Ngày đối chiếu:** 20/10/2026

| Luồng | Contract hiện thực trên backend main | Trạng thái so với đặc tả | Bằng chứng / quyết định frontend |
| --- | --- | --- | --- |
| Đăng ký, đăng nhập | `POST /api/v1/auth/register`, `POST /api/v1/auth/login`; trả `ApiResponse<AuthSessionResponseDto>` và refresh cookie | Đúng | `AuthEndpoints.cs`, `authApi.ts`, `authStore.ts`; frontend dùng JWT backend |
| Google login | `POST /api/v1/auth/google` nhận `idToken` | Đúng | `AuthEndpoints.cs`, `GoogleLoginButton.tsx` |
| Refresh, logout | `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`; logout trả `204`; cookie `HttpOnly`, `Secure`, `SameSite=Lax` | Đúng | `AuthEndpoints.cs`, `authStore.ts`, `sessionAuth.ts` |
| Hồ sơ người dùng | Không có `GET/PATCH /api/v1/auth/me` | **Chưa có** | `/profile` chỉ hiển thị dữ liệu session; không giả lập thao tác cập nhật |
| Danh sách category | `GET /api/v1/categories` trả `{ data }` | Đúng | `CategoryEndpoints.cs`; `serverClient.getCategories()` chuẩn hóa cho Server Component |
| Chi tiết category | `GET /api/v1/categories/{slug}?page&pageSize` trả `{ data: { category, recipes }, meta }` | Đúng | Route local gọi trực tiếp theo slug và giữ page trong URL |
| CRUD category | `POST`, `PUT`, `DELETE`; yêu cầu Admin; delete trả `204`, xung đột được ánh xạ Problem Details | Đúng | `CategoryEndpoints.cs`, hooks category dùng `categoryApi` duy nhất |
| Danh sách recipe public | `GET /api/v1/recipes` trả `{ data, meta }` qua `PagedResult` | Đúng | `serverClient.getRecipes()` và `recipeApi.getPaged()` dùng duy nhất contract `{ data, meta }` |
| Chi tiết recipe | `GET /api/v1/recipes/{slug}` trả `{ data }` và ETag | Đúng | Frontend unwrap `{ data }`, 404 thành `null`; lỗi khác giữ Problem Details |
| Search | `GET /api/v1/recipes/search` trả `ApiResponse<PagedResult<...>>`, tối thiểu 2 ký tự | Đúng | Route `/search` giữ query/filter/sort/page trong URL |
| Tạo recipe | `POST /api/v1/recipes` nhận ingredients, steps và 6 chỉ số nutrition; trả `{ data }` | Đúng | Form gửi `CreateRecipeRequest`; recipe mới do backend tạo ở Draft |
| Cập nhật recipe | `PUT /api/v1/recipes/{id}` nhận `rowVersion`/`If-Match`; không nhận child data | Đúng cho dữ liệu cơ bản | Hook update chỉ gửi `RecipeWritePayload`; child data đi qua API riêng |
| Xóa recipe | `DELETE /api/v1/recipes/{id}` trả `204`, soft delete | Đúng | `recipeApi.delete()` không diễn giải archive là delete |
| Publish lifecycle | `PATCH .../publish`, `unpublish`, `archive`, `unarchive` | Đúng | Hook trạng thái dùng `changeRecipeState`; không còn POST/restore cũ |
| Nutrition update | Không có `PUT /api/v1/recipes/{id}/nutrition` | **Chưa có** | Tạo mới gửi đủ 6 chỉ số; màn sửa không tuyên bố lưu nutrition thành công |
| Ingredient | CRUD và `PUT .../reorder`; ETag/`If-Match`; `409`/`422`; response `{ data }` | Đúng | Giữ `ingredientApi` từ main và dữ liệu quản lý `no-store` |
| Step | CRUD và `PUT .../reorder`; server sinh số bước; ETag/`If-Match`; chặn xóa bước cuối của Published | Đúng | Giữ `stepApi` từ main; UI không gửi `StepNumber` |
| Image | CRUD, set primary, giới hạn MIME/kích thước và multipart | Đúng | Giữ `fileApi` từ main, trình duyệt tự tạo multipart boundary |
| SEO | DTO có `PublishedAt`/`UpdatedAt`; frontend có sitemap, robots, canonical, Open Graph, Twitter và JSON-LD | Đúng trong frontend | Sitemap lặp `pageSize=50` đến hết; JSON-LD dùng `PublishedAt`, lọc quantity/unit null và escape `<` |
| Cache dữ liệu quản lý | Endpoint owner/Admin trả `Cache-Control: no-store` | Đúng | Proxy và API client không đưa dashboard/Draft/Archived vào shared cache |
| Cache public | Category list/detail 45 phút, recipe list 3 phút, recipe detail 60 phút; version-key invalidation sau commit | Đúng | Redis lỗi được log cảnh báo và fallback database; cache public không chứa count/nội dung riêng Admin |

## Hạng mục backend còn mở

1. Hiện thực `GET /api/v1/auth/me` và `PATCH /api/v1/auth/me` trước khi bật chỉnh sửa hồ sơ.
2. Hiện thực `PUT /api/v1/recipes/{id}/nutrition` để cập nhật độc lập đủ sáu chỉ số.
Hai mục trên không được tính là đã đạt đặc tả chỉ vì frontend build thành công.
