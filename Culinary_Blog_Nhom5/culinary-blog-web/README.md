# Culinary Blog frontend

Next.js 16.3.5 App Router, React 19, TypeScript strict và Tailwind CSS 4.

## Cài đặt và cấu hình

Yêu cầu Node.js 20.9 trở lên. Chạy trong thư mục này:

```powershell
npm ci
Copy-Item .env.example .env.local
```

Đặt `AUTH_SECRET` riêng trong `.env.local`; giữ file này ngoài Git. `API_INTERNAL_URL` dùng cho server, `NEXT_PUBLIC_API_URL` dùng cho browser, mặc định backend là `http://localhost:5156`. Chỉ đặt dữ liệu công khai vào biến `NEXT_PUBLIC_`. Backend cần PostgreSQL, Redis, MinIO và cấu hình riêng theo README ở gốc repo.

## Cấu trúc và thư viện

- `app/`: route public, auth, dashboard và layout.
- `components/`: UI Radix, form, thành phần công thức, SessionProvider.
- `hooks/`: hook React và quyền người dùng.

## Quy ước frontend

### Thêm primitive shadcn/ui

Chạy CLI shadcn từ thư mục này và commit component sinh ra trong `components/ui`.
`components.json` là nguồn chuẩn cho style và alias; giữ nguyên alias `@/components`
và `@/lib/utils`, không sửa vendor primitive tùy tiện. Đặt hành vi đặc thù ứng dụng
ở component wrapper.

### Chọn loại state

- State cục bộ: form, dialog và trạng thái tạm thời của một component.
- URL search params: filter, sort và pagination có thể chia sẻ.
- TanStack Query: server state và cache request.
- Zustand: projection auth/UI nhỏ dùng chung. Store mới phải có selector, action và
  `partialize` allowlist nếu persist; chỉ persist UI preference sau hydration client.
  Không persist token, cookie, password, raw session hoặc API response.

Component chỉ gọi backend qua `lib/api`, không tự tạo Axios client và không đọc
`error.response`. Lỗi API dùng `ApiProblemError`, `isApiProblemError` và
`getApiErrorMessage`.

```powershell
npm run lint
npm run typecheck
npm run test:api
npm run test:auth
npm run test:logging
npm run build
```

Suite mới nên có `tsconfig.*-tests.json` riêng khi cần runtime/module boundary khác;
test phải deterministic và không gọi backend thật.
- `lib/api/`: Axios client, API và xử lý lỗi/log.
- `lib/auth.ts`: NextAuth credentials, refresh token phía server.
- `types/`: DTO, payload, role, session, phân trang, ảnh và enum.
- `proxy.ts`: kiểm tra phiên/quyền trước khi truy cập dashboard; backend tiếp tục kiểm tra role và ownership.

Thư viện chính: NextAuth, Axios, React Hook Form, Zod, Radix UI, Lucide, Tailwind CSS; React Query/Zustand được cài sẵn cho các tính năng cần cache/state.

## Kiểm tra

```powershell
npm run lint
npm run typecheck
npm run build
npm run test:logging
```

Build cần truy cập Google Fonts để tải Noto Sans. Hướng dẫn phần bảo mật và API: [Setup_Security_API_Frontend.md](../docx/Spec/Setup_Security_API_Frontend.md).

## Google OAuth 2.0

Create a Google OAuth 2.0 **Web application** client. For the frontend login flow in this project, add these values in Google Cloud Console:

- Authorized JavaScript origin: `http://localhost:3000`

Set the frontend variables in `culinary-blog-web/.env.local`:

```env
API_INTERNAL_URL=http://localhost:5156
NEXT_PUBLIC_API_URL=http://localhost:5156
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
AUTH_SECRET=generate-a-unique-random-secret
AUTH_URL=http://localhost:3000
```

The backend only needs the Google client ID to validate the ID token. Set it in the environment where the API process runs; it is not read from the frontend `.env.local`:

```powershell
$env:Authentication__Google__ClientId = "your-client-id.apps.googleusercontent.com"
dotnet run --project src/CulinaryBlog.API
```

Google Identity Services returns an ID token to the browser. Auth.js forwards it server-side to `POST /api/v1/auth/google`; the API validates its signature, issuer, expiry, and audience with `Google.Apis.Auth`. Never commit real OAuth credentials.
