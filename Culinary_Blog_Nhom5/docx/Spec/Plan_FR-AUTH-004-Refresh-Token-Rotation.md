# Kế hoạch FR-AUTH-004 — Refresh Token Rotation

Ngày rà soát: 2026-10-12. Kế hoạch được giữ làm căn cứ thiết kế; hiện trạng trong các mục dưới là thời điểm lập kế hoạch. Đã triển khai trên baseline mới hơn, không còn merge conflict. Chi tiết mã đã làm, cấu hình và kiểm thử: [Guide_FR-AUTH-004-Refresh-Token-Rotation.md](Guide_FR-AUTH-004-Refresh-Token-Rotation.md).

## 1. Phạm vi và căn cứ

Hoàn thiện việc cấp Access Token mới (15 phút) và Refresh Token mới (7 ngày) khi phiên cần refresh. Token cũ phải trở thành `IsRevoked = true`, `IsUsed = true`; chỉ token mới được tiếp tục sử dụng. Người dùng phải còn tồn tại, đang hoạt động và không bị khóa bởi ASP.NET Core Identity.

Cơ sở là yêu cầu FR-AUTH-004 người dùng cung cấp, `Culinary_Blog_Spec.md` mục 5, cấu trúc backend Domain/Application/Infrastructure/API, EF migrations, frontend NextAuth/Axios, middleware logging và các test hiện có. Các mô tả “hiện trạng” trong spec được viết từ tháng 9; mã nguồn hiện tại đã có nhiều chức năng hơn.

Workspace có hai repository độc lập:

- Bản gốc `D:/Học Sml/PTUDWNC-2026-Nhom5`: cơ sở của kế hoạch theo cwd được cung cấp; đang có nhiều thay đổi staged và hai file unmerged: `AuthService.cs`, `lib/auth.ts`.
- Bản con `PTUDWNC-2026-Nhom5/`: working tree sạch tại thời điểm kiểm tra. Đối chiếu hai file trên cho thấy phần refresh giống nhau; khác biệt đang gây conflict nằm ở luồng Google login. Những module khác có chênh lệch, không được tự động chép đè hai bản.

Phạm vi rà soát phục vụ kế hoạch: cấu trúc toàn repository, tài liệu kiến trúc, các nhóm endpoint và điểm gọi API, đọc chi tiết toàn bộ chuỗi xác thực và các thành phần liên quan. Đây không phải báo cáo kiểm toán từng dòng UI hoặc tài nguyên sinh tự động; PDF SRS chưa được trích xuất độc lập, yêu cầu FR-AUTH-004 lấy trực tiếp từ nội dung người dùng.

## 2. Hiện trạng đã xác minh

Các đường dẫn trong bảng tính từ `Culinary_Blog_Nhom5/`.

| Thành phần | Đã có | Khoảng thiếu cần xử lý |
|---|---|---|
| `src/CulinaryBlog.Domain/Entities/RefreshToken.cs` | Hash, expiry, `RevokedAt`, `ReplacedByTokenHash`; `IsRevoked` suy ra từ timestamp | Chưa có `IsUsed`; `IsActive` chưa loại riêng token đã dùng/đã thay thế |
| `src/CulinaryBlog.Infrastructure/Services/JwtService.cs` | Access JWT; refresh token từ 64 byte ngẫu nhiên; hash SHA-256 | Cần kiểm thử TTL, đồng nhất thời điểm hết hạn DTO và JWT |
| `src/CulinaryBlog.Infrastructure/Services/AuthService.cs` | Refresh, revoke token cũ, liên kết token thay thế, tạo token mới trong transaction; conditional update chống dùng cùng token hai lần | Chưa kiểm tra Identity lockout; chưa kiểm tra `IsUsed`; transaction chưa bọc execution strategy; phát hành access token sau commit; cần kiểm soát race giữa rotation và thu hồi diện rộng |
| `src/CulinaryBlog.Infrastructure/DependencyInjection.cs` | PostgreSQL, Identity, `EnableRetryOnFailure(3)` | Phải làm transaction refresh tương thích retry |
| `src/CulinaryBlog.API/Endpoints/AuthEndpoints.cs` | `POST /api/v1/auth/refresh` public; cookie hoặc JSON body; trả access token và Set-Cookie refresh mới | Bổ sung hợp đồng lỗi khóa tài khoản, no-store, kiểm thử xóa cookie và đầu vào |
| `src/CulinaryBlog.Application/Features/Auth/Commands/Refresh/` | Command, handler, validator dài tối đa 256 ký tự | Tái sử dụng; không tạo use case trùng |
| `src/CulinaryBlog.API/Program.cs`, `JwtSettings.cs` | TTL 15 phút/7 ngày; JWT `ClockSkew = 0`; auth rate limit 10/phút/IP | Kiểm thử thời điểm biên và ảnh hưởng nhiều user dùng chung địa chỉ Next server |
| `culinary-blog-web/lib/auth.ts` | Đọc refresh cookie từ backend ở server; JWT callback refresh trước expiry 60 giây; thay cặp token; Map gộp request đang chạy | Map chỉ thuộc một process và xóa ngay khi xong; cookie cũ có thể kích hoạt reuse; lỗi mới gắn `RefreshTokenError`, còn giữ token cũ |
| `culinary-blog-web/lib/api/axiosClient.ts` | `getSession()` rồi gắn Bearer, `withCredentials` | Chưa xử lý 401/retry; chưa chặn session có lỗi refresh |
| `proxy.ts`, dashboard layout, `hooks/usePermission.ts` | Guard theo session/role | Chưa xét session refresh thất bại |
| Tests | xUnit cho observability; Node tests cho logging | Chưa có bộ kiểm thử rotation/lockout/concurrency/end-to-end |

Nhận định: đây là công việc hoàn thiện luồng đã có, không phải xây mới toàn bộ cơ chế xác thực.

## 3. Quyết định thiết kế đề xuất

1. **Thời hạn:** mỗi refresh thành công tạo access token hết hạn sau 15 phút và refresh token hết hạn sau 7 ngày kể từ lúc cấp mới (sliding expiration, theo cách code hiện hoạt động). Nếu cần tổng tuổi phiên tối đa 7 ngày kể từ login thì phải bổ sung giới hạn riêng; không đánh đồng hai chính sách.
2. **Điều kiện:** không yêu cầu Access Token còn hạn hay bắt buộc client gửi Access Token vào endpoint refresh. Refresh sớm 60 giây vẫn hợp lệ.
3. **Trạng thái:** thêm cột `IsUsed` bool mặc định false. Giữ `IsRevoked => RevokedAt != null`; cập nhật `RevokedAt` làm `IsRevoked` trở thành true. Không thêm cột bool độc lập dễ lệch với timestamp. Nếu tiêu chí nghiệm thu yêu cầu cột SQL tên `IsRevoked`, dùng generated column suy ra từ `RevokedAt` và cập nhật migration tương ứng.
4. **Token hợp lệ:** `ExpiresAt > now && RevokedAt == null && !IsUsed && ReplacedByTokenHash == null`.
5. **Reuse:** khi tìm được bản ghi đã dùng, đã revoke hoặc đã thay thế, coi là phiên không an toàn. Đề xuất giữ chính sách hiện tại: thu hồi toàn bộ refresh token còn hiệu lực của user, bao gồm token hậu duệ vừa cấp và phiên trên thiết bị khác. Phải mô tả rõ hậu quả đăng xuất các thiết bị. Đây là phạm vi rộng hơn thu hồi một token family; hiện model chưa có `FamilyId`. Family riêng cho từng thiết bị là mở rộng, không giả định đã có.
6. **Chỉ rotation mới đánh dấu `IsUsed`:** logout, khóa tài khoản hoặc thu hồi vì reuse chỉ revoke token chưa dùng; không gán `IsUsed = true` cho token chưa từng được dùng để refresh.
7. **Bí mật:** backend tiếp tục chỉ lưu hash SHA-256; frontend JavaScript không đọc refresh token, không đưa vào localStorage, session JSON hay log. Next server là đầu mối refresh của web app.
8. **Giới hạn thu hồi:** revoke refresh token ngăn cấp token tiếp theo. JWT đã phát hành vẫn có thể hợp lệ đến expiry tối đa 15 phút theo kiến trúc stateless hiện tại; thu hồi access token tức thời cần cơ chế khác và không nằm trong FR này.

## 4. Backend và migration

### 4.1 Domain và dữ liệu

- Thêm `IsUsed` và sửa `IsActive` theo đủ điều kiện trên.
- Tách ý nghĩa `Rotate(newHash, now)` và `Revoke(now)`: rotation đặt used, revoked timestamp, replacement; revoke giữ lịch sử replacement đã có, tránh làm mất dấu chuỗi token.
- Dùng thời gian UTC nhất quán, ưu tiên inject `TimeProvider` để kiểm thử thời điểm biên không phải chờ 15 phút.
- Migration thêm `IsUsed NOT NULL DEFAULT false`; backfill `true` cho bản ghi có `ReplacedByTokenHash` và đảm bảo chúng đã có `RevokedAt`. Không đánh dấu used cho mọi token bị logout.
- Giữ unique index `TokenHash` và index `UserId`; cập nhật model snapshot. Chưa dọn các bản ghi token cũ trong FR này vì còn cần phát hiện reuse.
- Kiểm tra migration trên database mới và database có token active/rotated/revoked từ phiên bản trước. Không sửa migration cũ đã áp dụng.

### 4.2 Luồng xử lý refresh

1. Validate đầu vào, hash token; không log giá trị thô hoặc hash.
2. Thực hiện toàn bộ giao dịch trong execution strategy phù hợp cấu hình Npgsql. Đọc bản ghi không lọc bỏ token used/revoked để vẫn phát hiện reuse.
3. Nếu không có bản ghi: trả 401, không ảnh hưởng tài khoản khác.
4. Với token đã biết, tuần tự hóa các thao tác refresh/revoke theo cùng user bằng khóa trong PostgreSQL; ưu tiên khóa hàng `AspNetUsers` và đọc lại token sau khi lấy khóa. Mọi đường cấp/thu hồi liên quan phải dùng cùng thứ tự khóa. Khóa riêng hàng token cũ không đủ khi token hậu duệ đang được refresh song song.
5. Kiểm tra reuse trước expiry: token cũ đã dùng vẫn phải kích hoạt thu hồi kể cả vừa hết hạn. Thu hồi các token còn hiệu lực, commit rồi mới trả lỗi; không throw trước commit làm rollback việc thu hồi.
6. Với token chưa dùng: từ chối nếu `ExpiresAt <= now`.
7. Kiểm tra user tồn tại, `IsActive` và `UserManager.IsLockedOutAsync(user)`. User không tồn tại/không hoạt động: 401; Identity lockout: 423, tương thích login. Khi user không đủ điều kiện, thu hồi phiên liên quan trước khi trả lỗi. FK hiện cascade delete nên user bị xóa thường dẫn tới nhánh không tìm thấy token.
8. Đọc roles hiện tại; chuẩn bị access token và refresh token mới trước commit để lỗi ký JWT không tiêu thụ token cũ.
9. Conditional update token cũ với đầy đủ điều kiện hợp lệ, đặt `IsUsed = true`, `RevokedAt = now`, `ReplacedByTokenHash = newHash`. Phải cập nhật đúng một hàng; không dùng riêng read-check-save thiếu điều kiện.
10. Insert token mới với used false, revoked null, replacement null và expiry 7 ngày. Token cũ và token mới nằm trong cùng transaction.
11. Commit rồi mới trả kết quả và Set-Cookie. Lỗi trước commit phải rollback cả update và insert.

Không dùng entity tracked đã đọc trước `ExecuteUpdateAsync` để ghi đè trạng thái cũ qua `SaveChanges`. Dùng no-tracking hoặc reload đúng chỗ.

EF Core yêu cầu transaction do ứng dụng tạo phải được phối hợp với execution strategy; mất kết nối lúc commit còn có thể làm kết quả commit không xác định. Vì vậy cần kiểm chứng commit bằng ID token mới/operation ID ổn định trong cùng lần gọi, tạo DbContext sạch khi retry, và không tự chạy lại rotation như một request mới. Nếu không xác minh được, trả lỗi hạ tầng, không báo thành công. Tham chiếu: [EF Core connection resiliency](https://learn.microsoft.com/en-us/ef/core/miscellaneous/connection-resiliency).

Phối hợp cả `CreateAuthResponseAsync` và `RevokeRefreshTokenAsync` với khóa theo user khi chúng cạnh tranh cùng transaction refresh; rà soát thứ tự khóa trong register/Google login để tránh deadlock. Các phần business của login/register không cần thiết kế lại.

### 4.3 API contract

Giữ `POST /api/v1/auth/refresh`, không RequireAuthorization. Cookie `culinary_refresh_token` là nguồn ưu tiên; JSON `{ "refreshToken": "..." }` phục vụ Next server/non-browser client theo contract hiện có. Nếu cả hai khác nhau, giữ quy tắc cookie ưu tiên và có test rõ ràng.

Thành công: `200` với JSON hiện tại gồm `accessToken`, `accessTokenExpiry`, `user`, `roles`; token mới đi qua Set-Cookie HttpOnly/Secure/SameSite=Lax, path `/api/v1/auth`. Không đưa refresh token vào response body public. Thêm `Cache-Control: no-store` cho response xác thực.

| HTTP | Hành vi |
|---|---|
| 401 | Thiếu/không tìm thấy token, hết hạn, used/revoked/replaced, user không tồn tại/không active; xóa refresh cookie |
| 423 | User bị Identity lockout; không cấp token; xóa refresh cookie |
| 422 | Input vượt giới hạn validator; không sửa DB |
| 400 | JSON sai cú pháp; chuẩn hóa ProblemDetails thay vì để rơi vào nhánh 500 hiện tại |
| 429 | Rate limit; không tự coi phiên đã hết hiệu lực |
| 500/503 | Lỗi nội bộ/hạ tầng; không tự xóa phiên như lỗi 401; không lộ chi tiết DB |

Cập nhật `.ProducesProblem`, exception mapping nếu thêm mã lỗi máy đọc được, và HTTP samples. Dùng thông báo 401 chung; chi tiết reuse chỉ ghi audit có UserId/CorrelationId/loại sự kiện. Xóa cookie phải dùng đúng path và thuộc tính của cookie lúc tạo.

## 5. Frontend và duy trì phiên

### 5.1 Một đầu mối làm mới phiên

- Giữ NextAuth làm đầu mối cho web: browser lấy session từ Next server; Next server gọi API refresh và nhận Set-Cookie của backend để cập nhật trạng thái token. Backend cookie nhận bởi server fetch không tự trở thành cookie của browser.
- Tách helper refresh/coordinator ra khỏi `lib/auth.ts` để kiểm thử; xác thực đủ body và cookie mới trước khi cập nhật phiên. Cập nhật cặp token, expiry, roles cùng nhau.
- Không thêm Axios gọi thẳng backend refresh từ browser vì sẽ tạo đường refresh thứ hai cạnh tranh với NextAuth.
- Giữ ngưỡng refresh sớm 60 giây. Không refresh lặp nếu phiên đã gặp lỗi xác thực cuối cùng.

### 5.2 Chống nhiều request cùng refresh

Map Promise hiện tại chỉ gộp các request đang chạy trong cùng process. Một request đến muộn mang cookie cũ, proxy và Server Component chạy khác ngữ cảnh, nhiều tab hoặc nhiều Next instance vẫn có thể gửi lại token cũ. Auth.js cũng nêu race condition khi token dùng một lần được refresh đồng thời: [Auth.js refresh token rotation](https://authjs.dev/guides/refresh-token-rotation).

Thiết kế đích đề xuất cho FR hoàn chỉnh: coordinator phía Next server có trạng thái phiên dùng chung, khóa theo session ID ổn định và version của cặp token; cookie NextAuth chứa session ID. Sau khi lấy khóa, luôn đọc phiên mới nhất: nếu request mang version cũ thì dùng kết quả mới nhất, không gửi refresh token cũ đến backend. Việc này vẫn có thể giữ NextAuth JWT strategy; không mặc định chuyển Credentials provider sang database-session adapter.

- Ưu tiên tận dụng Redis đã có trong Compose cho trạng thái phiên riêng của Next server; hiện chưa có client Redis trong `package.json`, phải bổ sung dependency/cấu hình và module `server-only`.
- Token cần dùng lại ở Next server phải lưu mã hóa trong session store; bảng RefreshTokens của backend tiếp tục chỉ lưu hash. Khóa mã hóa ở biến môi trường server, TTL session không vượt refresh expiry; không log payload/khóa/token.
- Khóa phải có ownership, timeout và cơ chế gia hạn hoặc fencing/CAS theo version; worker mất khóa không được ghi đè phiên mới. Các request chờ dùng kết quả được lưu của phiên mới nhất.
- Redis không khả dụng: trả lỗi tạm thời, không fallback bằng cách cho nhiều request tự refresh độc lập. Việc login, refresh và logout đều phải cập nhật/xóa session store nhất quán.
- Race logout/refresh: logout đánh dấu phiên kết thúc theo version, worker refresh về muộn không được khôi phục phiên hoặc cookie.
- Không bật “chấp nhận lại token cũ vài giây” ở backend: request reuse thật vẫn phải bị từ chối và thu hồi.

Đây là phần tăng phạm vi so với sửa Map đơn thuần. Trước khi triển khai cần làm prototype nhỏ với phiên bản NextAuth đang cài và kiểm thử proxy + Server Component + session endpoint. Nếu chỉ chọn Map trong một process cho bản demo, phải ghi rõ chưa đạt tiêu chí nhiều tab/nhiều instance; không đánh dấu nghiệm thu FR hoàn chỉnh.

### 5.3 Axios, lỗi và route guard

- Request interceptor không gắn access token của session đã lỗi hoặc đã hết hạn mà chưa refresh được.
- Response interceptor chỉ retry tối đa một lần cho request có Bearer bị 401. Lấy phiên mới nhất qua NextAuth; nếu access token đã đổi thì dùng token mới, tránh rotation thừa. Nếu vẫn dùng cùng token, trả lỗi thay vì lặp refresh vô hạn.
- Không refresh khi 403, không áp interceptor refresh cho login/register/refresh/logout. Không tự retry mutation sau timeout/5xx; retry sau 401 chỉ áp dụng khi API đã từ chối ở lớp xác thực trước khi thực hiện nghiệp vụ.
- 401/423 refresh là lỗi cuối cùng: xóa token khỏi trạng thái dùng được, sign out và đưa về login với callbackUrl nội bộ hợp lệ. `proxy.ts`, dashboard layout, provider, permission hook và Navbar phải phản ánh phiên không hợp lệ.
- Lỗi mạng/429/5xx là lỗi tạm thời: báo có thể thử lại, không lập tức đăng xuất. Khi access token đã hết hạn thì tạm chặn thao tác cần auth. Timeout sau khi backend đã commit không được tự retry mù với token cũ; nếu không phục hồi được trạng thái mới thì yêu cầu đăng nhập lại an toàn.
- Đảm bảo phiên được lưu trong đường xử lý có thể ghi cookie; kiểm thử riêng `auth()` trong Server Component, không giả định mọi nơi đọc session đều persist được cookie.
- Logout hiện RequireAuthorization nên access token hết hạn có thể làm thu hồi backend thất bại. Rà soát nhánh này khi làm tích hợp: bảo đảm xóa phiên Next và thu hồi bằng refresh credential qua contract logout phù hợp; mọi thay đổi endpoint logout phải có test CSRF/cookie và không chấp nhận userId từ client.

## 6. Trình tự và file dự kiến

| Bước | Công việc | File/khu vực chính |
|---|---|---|
| 0 | Chốt bản repository; giải quyết merge dở nếu dùng bản gốc; lấy baseline build/test trước khi triển khai | `AuthService.cs`, `lib/auth.ts`, Git state |
| 1 | Chốt trạng thái token, migration/backfill, clock | Domain `RefreshToken.cs`, configuration, migration mới, snapshot, DI |
| 2 | Hoàn thiện rotation/lockout/reuse/khóa DB/execution strategy và kiểm chứng commit | `AuthService.cs`, `JwtService.cs`, contracts nếu đổi expiry/clock |
| 3 | Hoàn thiện cookie, lỗi, cache headers, OpenAPI | `AuthEndpoints.cs`, `GlobalExceptionMiddleware.cs`, `.http` samples |
| 4 | Prototype rồi triển khai coordinator phiên dùng chung; tích hợp NextAuth | `lib/auth.ts`, module server session/coordinator mới, `package.json`, `.env.example`, session types |
| 5 | Retry một lần và xử lý phiên không hợp lệ | `lib/api/axiosClient.ts`, provider, `proxy.ts`, dashboard layout, permission hook, Navbar |
| 6 | Kiểm thử PostgreSQL thật, frontend và E2E; cập nhật hướng dẫn | project auth tests mới, frontend tests, solution, README/spec |

Các bước trên là kế hoạch. Chưa giải quyết conflict, chưa sửa logic ứng dụng, chưa áp dụng migration hoặc thay đổi database trong lần rà soát này.

## 7. Ma trận kiểm thử nghiệm thu

| Ca kiểm thử | Kết quả bắt buộc |
|---|---|
| Access token hết hạn, refresh token hợp lệ | 200; access mới dùng được; refresh mới khác token cũ; giữ phiên người dùng |
| Refresh thành công | Token cũ used=true/revoked=true/replacement đúng; token mới active; đúng một token kế tiếp được tạo |
| TTL và biên thời gian | Access 15 phút, refresh 7 ngày; `ExpiresAt == now` bị từ chối; DTO và JWT expiry nhất quán |
| Token thiếu/sai/không tồn tại | 401; không tạo token, không revoke user khác |
| Token chưa dùng nhưng hết hạn | 401; không cấp cặp token |
| Token có riêng IsUsed hoặc riêng replacement | Vẫn bị từ chối và xử lý reuse, kể cả dữ liệu cũ không đồng bộ |
| Gửi lại R0 sau R0 → R1 → R2 | 401; R1/R2 và các refresh token active của user bị revoke theo chính sách |
| Token cũ đã dùng đồng thời đã hết hạn | Vẫn phát hiện reuse trước nhánh expiry |
| User inactive / Identity lockout / bị xóa | Không cấp token; lần lượt 401/423/401; thu hồi phù hợp |
| Hai HTTP refresh cùng R0, DbContext độc lập | Tối đa một rotation thành công; request reuse bị từ chối; token mới bị thu hồi theo chính sách strict |
| R0 bị replay trong lúc R1 → R2 | Sau xử lý reuse không còn hậu duệ active thoát khỏi thu hồi |
| Lỗi insert hoặc ký JWT | Không tiêu thụ token cũ, không tồn tại token mới mồ côi |
| Lỗi trước commit / kết quả commit không rõ | Rollback hoặc xác minh có kiểm soát; không cấp hai token con, không retry sai thành reuse |
| Migration dữ liệu cũ | Token đã rotate được backfill; token logout không bị đánh dấu used sai; active token vẫn dùng được |
| Cookie/body/security | HttpOnly/Secure/SameSite/path/expiry đúng; cookie ưu tiên; không có raw refresh token trong JSON/log/localStorage |
| N request web đồng thời, nhiều tab/instance | Coordinator chỉ thực hiện một rotation cho cùng version; các caller nhận phiên mới nhất |
| Request cookie cũ đến muộn, response về sai thứ tự | Không gửi token cũ lại backend và không ghi đè trạng thái phiên mới |
| Redis down / mất khóa / worker chết | Không fallback gây refresh đồng thời, không trả thành công giả |
| Refresh lỗi cuối cùng | Guard/permission/Navbar chuyển sang phiên hết hiệu lực, không vòng lặp refresh/login |
| 429/network/5xx | Không đăng xuất oan; request được quản lý theo chính sách lỗi tạm thời |
| API 401/403 | 401 retry tối đa một lần với token mới; 403 không refresh |
| Logout đồng thời refresh | Phiên không sống lại; token mới không tiếp tục dùng để refresh |
| Luồng email và Google login | Cả hai cùng được refresh đúng; không hỏng phân quyền Admin/Author |

Unit test dành cho trạng thái/expiry/validator; integration test transaction và concurrency dùng PostgreSQL thật hoặc Testcontainers với connection/DbContext riêng. EF InMemory không chứng minh được khóa hàng và conditional update. Frontend test helper với fetch mock và test trình duyệt thật cho cookie, nhiều tab, SSR/proxy. Dùng clock/TTL test ngắn ở môi trường test, giữ cấu hình production 15 phút/7 ngày.

Sau triển khai chạy: `dotnet build`, `dotnet test`, frontend lint/build, bộ test logging hiện có và bộ test auth mới. Hiện chưa chạy build/test vì chỉ lập kế hoạch và bản gốc có conflict; không có tuyên bố baseline đang pass.

## 8. Điều kiện hoàn thành

- Rotation atomic với used/revoked/replacement đầy đủ và TTL đúng.
- Đáp ứng cả trạng thái tài khoản vô hiệu hóa lẫn Identity lockout.
- Reuse thu hồi được token hậu duệ ngay cả khi có refresh cạnh tranh.
- Web tự duy trì phiên, không tự tạo reuse do nhiều request/tab; lỗi cuối cùng và lỗi tạm thời được xử lý khác nhau.
- Migration tương thích dữ liệu cũ; các ca kiểm thử bắt buộc ở mục 7 đạt; tài liệu mô tả rõ sliding expiration, phạm vi thu hồi toàn user và giới hạn JWT stateless.
