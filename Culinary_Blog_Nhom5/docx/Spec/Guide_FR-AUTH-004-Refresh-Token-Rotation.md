# FR-AUTH-004 — Triển khai và kiểm tra

Đã triển khai trên repository gốc tại `Culinary_Blog_Nhom5/`. Bản Git con `PTUDWNC-2026-Nhom5/` không thuộc thay đổi này.

## Hành vi

- Access Token có hạn 15 phút. NextAuth tự refresh trước expiry 60 giây khi đọc phiên; frontend kiểm tra phiên mỗi 60 giây và khi cửa sổ được focus.
- Refresh Token có hạn 7 ngày kể từ lần cấp mới (sliding expiration); không giới hạn tổng tuổi phiên ở 7 ngày từ lần login đầu tiên.
- Mỗi rotation đặt `IsUsed = true`, `RevokedAt != null` (tức `IsRevoked = true`) và `ReplacedByTokenHash` cho token cũ, đồng thời tạo token mới trong một transaction.
- PostgreSQL khóa theo user và conditional update bảo đảm token chỉ được dùng một lần. Gửi lại token used/revoked/replaced thu hồi toàn bộ refresh token còn hiệu lực của tài khoản, kể cả thiết bị khác. Token cũ đã hết hạn nhưng đã dùng vẫn kích hoạt phát hiện reuse.
- User không tồn tại/không active nhận 401; Identity lockout nhận 423. Refresh không yêu cầu Access Token còn hạn.
- Logout thu hồi token được gửi cùng mọi token kế tiếp trong chuỗi; dùng được ngay cả khi Access Token hết hạn.
- Refresh Token đi qua cookie HttpOnly/Secure/SameSite=Lax. Login/register/Google/refresh không đưa raw refresh token vào JSON public.
- JWT access đã phát hành vẫn có hiệu lực đến expiry, tối đa 15 phút. Thu hồi refresh token không thu hồi JWT stateless tức thời.

## Phiên web và Redis

Next server nhận refresh cookie của API rồi giữ cặp token trong Redis dưới dạng AES-256-GCM, khóa dẫn xuất từ `AUTH_SECRET`. Cookie NextAuth giữ ID phiên dùng chung và thông tin phiên phục vụ hiển thị; không chứa raw Refresh Token. Browser session JSON không chứa ID Redis hay Refresh Token.

Mỗi thao tác lấy phiên khóa theo ID trong Redis, đọc lại trạng thái mới nhất rồi mới quyết định refresh. Request mang cookie cũ, Server Component, proxy và nhiều Next instance dùng cùng phiên mới nhất. Ghi dữ liệu phải chứng minh còn sở hữu khóa; worker mất khóa không được ghi đè. Trạng thái đang refresh được lưu trước khi gọi API để worker kế tiếp không phát lại token khi worker cũ chết. Logout giữ tombstone đến expiry để cookie cũ không khôi phục phiên.

Redis mất kết nối hoặc 429 trước xử lý refresh là lỗi tạm thời, không lập tức đăng xuất. 429 có cooldown. Nếu request refresh đã được gửi nhưng timeout/5xx làm không xác định được token đã tiêu thụ chưa, phiên bị đóng và yêu cầu đăng nhập lại để tránh replay. Không retry bằng token cũ trong trường hợp này.

Các instance phải dùng cùng `AUTH_SECRET` và `AUTH_REDIS_URL`. Redis là phụ thuộc bắt buộc của phiên web; không fallback về Map riêng từng process. Phiên từ bản trước chưa có ID mới cần đăng nhập lại một lần sau nâng cấp. Đổi AUTH_SECRET cũng làm phiên cũ mất hiệu lực.

## Chạy ở máy phát triển

Từ gốc repository:

```powershell
docker compose up -d postgres redis
dotnet tool restore
$env:ASPNETCORE_ENVIRONMENT = "Development"
dotnet ef database update --project Culinary_Blog_Nhom5/src/CulinaryBlog.Infrastructure --startup-project Culinary_Blog_Nhom5/src/CulinaryBlog.API
```

Trong `culinary-blog-web/.env.local`, đặt `AUTH_SECRET` ngẫu nhiên, ổn định và `AUTH_REDIS_URL=redis://localhost:6379`. `.env.example` đã có biến mẫu. `run-dev.ps1` đã được sửa để không ghi đè secret trong `.env.local` bằng secret tạm mỗi lần khởi động. Không tạo AUTH_SECRET khác nhau cho từng instance. Production dùng HTTPS và Redis có xác thực/TLS.

```powershell
cd Culinary_Blog_Nhom5/culinary-blog-web
npm ci
npm run dev
```

Migration `20261012163223_AddRefreshTokenUsage` thêm `IsUsed` và backfill token có replacement. Token chỉ bị logout không bị đánh dấu đã dùng. Giữ bản sửa `FixCurrentModel` trên `main` dưới dạng no-op: column/index tìm kiếm đã do migration trước tạo nên không tạo trùng hoặc xóa chúng khi rollback migration này.

## API kiểm tra thủ công

1. Login email/password hoặc Google. Lưu cookie `culinary_refresh_token` từ Set-Cookie, không tìm refresh token trong JSON.
2. Gửi `POST /api/v1/auth/refresh` với cookie hoặc JSON body cho API client. Nhận access token và cookie mới.
3. Kiểm tra DB: token cũ used/revoked, replacement trỏ tới hash token mới; token mới chưa dùng/chưa revoke và có expiry 7 ngày.
4. Gửi lại token cũ: nhận 401; refresh token còn hiệu lực của user đều bị thu hồi.
5. Khóa Identity hoặc đặt `IsActive=false`: refresh không được cấp token.

Browser sử dụng NextAuth, không gọi API refresh song song. Axios chỉ thử lại một lần sau 401 nếu NextAuth trả access token khác; 403/5xx không tự refresh/retry. Provider, guard, permission hook và Navbar phản ánh session lỗi. Lỗi API có ProblemDetails và cookie lỗi được xóa với cùng path.

## Kiểm thử

Từ gốc repository:

```powershell
dotnet build Culinary_Blog_Nhom5/Culinary_Blog_Nhom5.sln
dotnet test Culinary_Blog_Nhom5/Culinary_Blog_Nhom5.sln
```

Backend tests tạo database `culinary_auth_test_<random>` riêng trên PostgreSQL Compose cổng 5433 rồi xóa đúng database đó. Không migrate/xóa database phát triển. Đổi server test bằng `AUTH_TEST_POSTGRES` nếu cần; tài khoản test cần quyền CREATE DATABASE. Bộ test gồm rotation/TTL, cookie/body, lockout, user bị xóa, reuse và descendant race, rollback insert/signing, xác nhận commit bị mất, migration dữ liệu cũ, role hiện tại và refresh cho tài khoản liên kết Google không có mật khẩu.

Trong frontend:

```powershell
npm run lint
npm run build
npm run test:auth
# Bật integration test Redis; đây là secret chỉ dùng cho test.
$env:AUTH_SECRET = "FR_AUTH_004_TEST_ONLY_SECRET_32_BYTES_OR_LONGER"
$env:AUTH_TEST_REDIS = "1"
npm run test:auth
npm run test:auth:e2e
```

`test:auth:e2e` cần build production và Redis. Script tự chạy hai Next process ở cổng trống, dùng token server giả lập để kiểm soát expiry, kiểm tra Credentials/Google ID Token/CSRF/cookie, refresh đồng thời, cookie đến muộn, SSR/proxy, token privacy và logout; tự dừng process và dọn đúng Redis key test tạo. Logic bảo mật backend được kiểm thử riêng trên PostgreSQL thật. Đây là kiểm thử HTTP tích hợp, không phải kiểm thử UI trong trình duyệt thật hoặc xác minh Google OAuth với dịch vụ Google thật.

Kết quả khi triển khai: 24 backend tests, 15 frontend/helper/Redis tests và kiểm thử hai Next process đạt; frontend production build đạt. Migration đã được áp dụng vào PostgreSQL phát triển `culinary_blog_db` ở cổng 5433. Solution còn warning NU1510 có sẵn ở package logging của Application.
