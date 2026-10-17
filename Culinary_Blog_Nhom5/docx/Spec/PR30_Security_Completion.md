# PR #30 — Bổ sung ba hạng mục bảo mật

Ngày: 17/10/2026. Nhánh hiện có: `2312778-PhanThiBaoTram-caidatbaomatfrontend`.

## Checklist

- [x] Rate limit API chung 100 request/phút/IP.
- [x] CSP và security headers.
- [x] Frontend unit/E2E cho login, refresh, logout và route authorization.

## 1. Rate limit API

`ApiSecurityExtensions.AddApiSecurity()` đăng ký global limiter cho `/api` và các đường dẫn con, cửa sổ cố định 1 phút, 100 permits, không xếp hàng. Health checks và trang tài liệu nằm ngoài bucket API. Giữ đồng thời giới hạn auth 10/phút/IP và upload 5/phút/IP; policy riêng không thay thế limiter chung.

IP lấy từ `Connection.RemoteIpAddress`; IPv4-mapped IPv6 được chuẩn hóa về IPv4. Không đọc X-Forwarded-For từ client. Nếu triển khai reverse proxy, cần cấu hình forwarded headers và danh sách proxy tin cậy tại hạ tầng, không tin tùy ý header do client gửi.

Middleware limiter chạy sau authentication nhưng trước authorization để cả request bị từ chối quyền cũng đi qua giới hạn chung. Request vượt ngưỡng trả 429, `application/problem+json`, `Retry-After` tính theo thời gian còn lại, tối thiểu 1 giây. Đây là limiter trong tiến trình; nhiều replica có bucket riêng. Bài này không triển khai distributed limiter Redis.

## 2. CSP và headers

### API

Middleware `ApiSecurityHeadersMiddleware` áp dụng cho thành công, 401/403, 404, 429 và lỗi:

- `X-Content-Type-Options: nosniff`.
- `X-Frame-Options: DENY`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- Permissions-Policy tắt camera, microphone, geolocation, payment, USB.
- CSP JSON mặc định `default-src 'none'`, `frame-ancestors 'none'`, `base-uri 'none'`, `form-action 'none'`.
- HSTS `max-age=31536000` chỉ với HTTPS ngoài Development, không bật preload/includeSubDomains tùy tiện.
- Scalar Development có policy riêng cho inline bootstrap/CDN của Scalar. Production không có ngoại lệ inline này.

### Frontend

`proxy.ts` sinh nonce ngẫu nhiên mỗi request HTML, ghi CSP vào request để Next.js gắn nonce cho script/style, đồng thời ghi policy vào response. Bỏ cache shared HTML chứa nonce bằng `private, no-store`.

Production script-src dùng nonce và strict-dynamic; không dùng unsafe-inline/unsafe-eval cho script. Development chỉ thêm unsafe-eval theo yêu cầu debug của Next.js. Object và embedding iframe của ứng dụng bị chặn. Style attributes được phép cho Radix/React positioning; đây không phải quyền thực thi script inline.

Nguồn kết nối API lấy từ NEXT_PUBLIC_API_URL; ảnh cho phép self/blob/data, Unsplash, avatar Google và danh sách origin cấu hình bằng CSP_IMAGE_ORIGINS. Giá trị cấu hình được parse thành HTTP(S) origin để tránh chèn directive. Google Identity Services có nguồn script/frame/connect/style cần thiết. Google login thật cần kiểm tra với OAuth client đã cấu hình; E2E này dùng đăng nhập Credentials.

Root layout dùng `connection()` để render theo request. Đây là đánh đổi cần thiết của nonce: HTML không còn static generation/ISR shared như trước. Không bỏ kiểm tra quyền ở server/API để đổi lấy cache.

Common headers đặt qua next.config cho cả static assets và API Auth.js; API Auth.js có CSP deny-by-default. HSTS frontend chỉ trên HTTPS production. Tắt X-Powered-By.

### Lỗi cookie tìm thấy khi viết E2E

Auth.js wrapper trước đó chạy cả với trang công khai/prefetch và có thể ghi lại session cookie từ response đến muộn sau signout. Proxy mới chỉ gọi Auth.js cho route protected. Matcher bỏ qua RSC prefetch theo hướng dẫn nonce của Next.js; server layouts/pages vẫn kiểm tra phiên và quyền khi prefetch. `/profile` cũng được bảo vệ. E2E kiểm tra cookie bị xóa sau logout và request protected tiếp theo trở về login.

## 3. Kiểm thử tự động

### Backend: 10 test mới

Project `tests/CulinaryBlog.Security.Tests` dùng ASP.NET TestServer với chính registration/middleware production. Không cần database hay secret thật:

- Request 1–100 thành công; request 101 bị 429 và có Retry-After/Problem Details.
- IP khác có bucket khác; spoof X-Forwarded-For không vượt được limiter.
- IPv4 và IPv4-mapped IPv6 dùng chung bucket.
- Auth/upload giữ giới hạn 10/5 và vẫn tiêu thụ bucket chung.
- Request bị authorization từ chối vẫn tính vào bucket chung.
- Health không tiêu thụ bucket API.
- Headers áp dụng trên success/errors; HSTS chỉ HTTPS production; Scalar dev không làm yếu CSP JSON.

### Frontend: 17 unit test mới

`tests/security.unit.cjs` chạy bằng node:test, transpile TypeScript thật để kiểm tra callbacks Auth.js, proxy, permission helper và CSP helper trong môi trường cô lập:

- Login đúng/sai/role không hỗ trợ; capture refresh cookie phía server.
- Session trả browser không có refresh token.
- Token còn hạn không refresh; hai refresh đồng thời dùng chung request; rotation cập nhật token và roles.
- Refresh bị từ chối đánh dấu session lỗi; logout gửi revoke với bearer và refresh token.
- Guest redirect có local callback; Author/Admin và route quản trị; session lỗi không vào protected route.
- Public prefetch không gọi Auth.js; nonce thay đổi theo request và không nới script policy production.

### E2E Next.js/Chrome thật

`tests/security.e2e.cjs` khởi chạy production Next.js trên port tạm, backend fixture HTTP có trạng thái trên port tạm và browser context riêng. Fixture phục vụ contract auth/category với dữ liệu chỉ dành cho test; không dùng tài khoản/database production.

Bao phủ login bằng UI, sai mật khẩu, HttpOnly cookie, refresh/rotation và refresh bị từ chối, logout bằng UserMenu, cookie/session bị xóa, guest bị redirect, Author không vào admin, admin đăng nhập và vào trang quản trị, server-layout guard cho prefetch, nonce khớp script Next.js và nonce đổi khi reload. Test chèn script vào HTML parser qua intercepted test response để xác nhận trình duyệt chặn script thiếu nonce; không dùng DevTools-evaluated trusted script để kết luận CSP.

Để kiểm tra expiry ngay, runner mã hóa một session test hết access token bằng secret ngẫu nhiên riêng của Next.js test server, không sửa thời gian hệ thống hay chờ token production hết hạn. Refresh/logout vẫn chạy qua Auth.js routes thật đến backend fixture. Đây là frontend E2E với backend fixture, không phải kiểm thử database/backend auth toàn hệ thống.

Kết quả: 10 API security test, 17 frontend security unit test, 36 backend regression test và 9 frontend logging regression test đạt. E2E production Chrome, frontend build/typecheck/lint đạt.

## 4. Dependency audit

Trong lúc thêm Playwright, npm audit phát hiện cảnh báo có sẵn trên Next 16.3.5. Đã nâng Next và eslint-config-next lên bản vá 16.3.8, cập nhật sharp/source-map-js trong range tương thích, khóa Playwright 1.62.1 làm dev dependency.

`npm audit --omit=dev` sau cập nhật: **0 vulnerabilities**. Audit đầy đủ còn **5 high** trong chuỗi dev tooling `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces`. Không chạy audit fix --force vì gợi ý hạ ESLint config xuống major 14 không phù hợp Next 16; không tuyên bố toàn bộ dependency dev đã sạch audit.

Nguồn đối chiếu: [Next.js ImageResponse advisory](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j), [Next.js Image Optimization advisory](https://github.com/advisories/GHSA-cjq9-62q9-8jv4), [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). Dự án không bổ sung hoặc thử khai thác các lỗ hổng này.

## 5. Chạy lại

Tại repository root:

```powershell
dotnet build Culinary_Blog_Nhom5/Culinary_Blog_Nhom5.sln
dotnet test Culinary_Blog_Nhom5/tests/CulinaryBlog.Security.Tests/CulinaryBlog.Security.Tests.csproj
dotnet test Culinary_Blog_Nhom5/tests/CulinaryBlog.Observability.Tests/CulinaryBlog.Observability.Tests.csproj
```

Tại `Culinary_Blog_Nhom5/culinary-blog-web`:

```powershell
npm ci
npm run test:security
npm run test:logging
npm run lint
npm run typecheck
npm run test:e2e:security
npm audit --omit=dev
```

E2E mặc định dùng Chrome đã cài. Với bundled Chromium trên CI: `npx playwright install chromium`, đặt `E2E_BROWSER_CHANNEL=bundled` rồi chạy test. Build cần mạng để tải Google Fonts của dự án. Runner dùng port tự cấp, không dừng server/dịch vụ người dùng và tự đóng tài nguyên test. Screenshot nằm trong `build/security-e2e` được gitignore.

PR #30 được cập nhật trên chính nhánh hiện có; không tạo nhánh/PR mới, không merge vào main.
