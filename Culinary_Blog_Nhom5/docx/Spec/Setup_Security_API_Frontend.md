# Cài đặt bảo mật, tài liệu API và nền tảng frontend

## Backend

- `Program.cs`: CORS whitelist từ `Cors:AllowedOrigins`, cho phép credentials và expose correlation ID, Retry-After, ETag, api-supported-versions. Không sử dụng wildcard origin với credentials.
- JWT Bearer kiểm tra chữ ký, issuer, audience, thời hạn. `Jwt:Key` phải dài tối thiểu 32 byte, được cấp qua biến môi trường/user secrets.
- `AuthorPolicy`: Author hoặc Admin; `AdminOnly`: Admin. API công thức kiểm tra thêm chủ sở hữu. Frontend chỉ điều khiển giao diện; backend quyết định quyền truy cập.
- Rate limiting: API chung tối đa 100 yêu cầu/IP/phút, đồng thời giữ auth 10 và upload 5 yêu cầu/IP/phút. Quá giới hạn trả 429 Problem Details và Retry-After. Chi tiết bổ sung và kết quả test xem [PR30_Security_Completion.md](PR30_Security_Completion.md).
- Versioning dùng URL `/api/v1/...`. OpenAPI theo phiên bản tại `/openapi/v1.json`; Scalar tại `/scalar/v1`, chỉ bật trong Development.
- `Documentation/ApiDocumentTransformers.cs` khai báo Bearer JWT và thêm security, 401/403 cho endpoint yêu cầu authorization; endpoint public/AllowAnonymous giữ public.

## Frontend

Thư mục `culinary-blog-web` dùng Next.js App Router, React, TypeScript strict, Tailwind CSS.

| Thư mục | Trách nhiệm |
|---|---|
| app | Route, layout, server rendering và auth route |
| components | UI, form, providers và thành phần nghiệp vụ |
| hooks | Hook React, kiểm tra quyền |
| lib/api | Axios client, API nghiệp vụ, xử lý/log lỗi |
| lib | NextAuth, helper dùng chung |
| types | DTO, request/response, enum, phân trang, session |
| public | Tài nguyên tĩnh |

Thư viện đã khai báo trong package.json và khóa phiên bản trong package-lock.json: Next/React, NextAuth, Axios, React Hook Form, Zod/resolvers, Radix UI, Lucide, Tailwind, React Query, Zustand. `npm ci` cài đúng lockfile. React Query/Zustand hiện có sẵn cho các tính năng cần cache/state; không cần đưa vào mọi trang.

Các kiểu dùng chung: `auth.ts` (AppRole, login/register/Google/refresh, session response, Problem Details), `api.types.ts` (API wrapper, pagination, search), `recipe.types.ts` (view model, tạo/cập nhật, nguyên liệu/bước/dinh dưỡng), `category.types.ts`, `file.types.ts` (ảnh upload/status). DTO ảnh upload khác view model ảnh trong recipe card. Refresh token không có trong session trả về browser.

## Chạy và kiểm tra

Từ gốc repository, copy `.env.example` thành `.env`, đặt POSTGRES_PASSWORD và JWT_KEY riêng, rồi chạy `docker compose up -d`. Không ghi secret vào Git.

```powershell
dotnet restore .\Culinary_Blog_Nhom5\Culinary_Blog_Nhom5.sln
cd .\Culinary_Blog_Nhom5\culinary-blog-web
npm ci
Copy-Item .env.example .env.local
```

Đặt AUTH_SECRET riêng trong `.env.local`. API_INTERNAL_URL dành cho server; NEXT_PUBLIC_API_URL dành cho browser; chỉ dùng biến NEXT_PUBLIC_ cho dữ liệu công khai. Backend mặc định localhost:5156, frontend localhost:3000. Từ thư mục Culinary_Blog_Nhom5 chạy `./run-dev.ps1`.

```powershell
dotnet build .\Culinary_Blog_Nhom5\Culinary_Blog_Nhom5.sln
dotnet test .\Culinary_Blog_Nhom5\Culinary_Blog_Nhom5.sln
# Trong culinary-blog-web:
npm run lint
npm run typecheck
npm run build
npm run test:logging
```

Build frontend cần kết nối Google Fonts để tải Noto Sans. Kiểm thử có thể chạy không cần database; kiểm tra toàn luồng đăng nhập/CRUD cần các dịch vụ Docker hoạt động.

## Kiểm tra thủ công

1. Mở Scalar, kiểm tra document v1 và ô Bearer authentication.
2. Gọi API protected không token → 401; Author gọi admin/category mutation → 403.
3. Đăng nhập và dán accessToken vào Scalar; Author chỉ sửa công thức của mình, Admin quản lý toàn hệ thống.
4. Gửi hơn 10 yêu cầu auth/phút từ cùng IP → 429 và Retry-After.
5. CORS preflight từ localhost:3000 được chấp nhận; origin ngoài whitelist không nhận Access-Control-Allow-Origin.
6. Session refresh thất bại phải đưa người dùng về đăng nhập khi truy cập dashboard.

Tham khảo: [ASP.NET Core OpenAPI transformers](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/openapi/customize-openapi?view=aspnetcore-10.0), [Rate limiting](https://learn.microsoft.com/en-us/aspnet/core/performance/rate-limit?view=aspnetcore-10.0).
