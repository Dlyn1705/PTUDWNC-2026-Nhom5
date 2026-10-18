# Kế hoạch hoàn thiện FR-JOB-001 — Welcome Email Job

**Ngày phân tích:** 16/10/2026.

**Trạng thái:** Đã triển khai và kiểm thử ngày 16/10/2026 trên nhánh `2312778-phanthibaotram-fr-job-001-welcomeemail`. Kết quả và giới hạn xác minh: [Implementation_FR-JOB-001-Welcome-Email-Job.md](./Implementation_FR-JOB-001-Welcome-Email-Job.md); cấu hình chạy: [runbook](./Runbook_FR-JOB-001-Welcome-Email.md). Nội dung thiết kế dưới đây giữ làm căn cứ, các lựa chọn thực tế được ghi trong báo cáo.

**Mục tiêu:** Thành viên đăng ký thành công được gửi email HTML chào mừng qua tác vụ Hangfire; lỗi dịch vụ mail không làm mất tài khoản, gây lỗi đăng ký giả hoặc làm mất yêu cầu gửi thư.

## 1. Căn cứ và phạm vi

- Nguồn chính: [Culinary_Blog_Spec.md](./Culinary_Blog_Spec.md), mục 2 (quyền), 5 (đăng ký/Google), 7 (Clean Architecture, Hangfire và SMTP/SendGrid), phần triển khai Docker trong mục 7, mục 8 (độ tin cậy), 9 (hiện trạng) và 11 (thứ tự hiện thực).
- Ánh xạ mã FR-JOB-001: [Bang_Phan_Cong_Va_Mo_Ta_Chi_Tiet_Cong_Viec.md](./Bang_Phan_Cong_Va_Mo_Ta_Chi_Tiet_Cong_Viec.md), phần WelcomeEmailJob và tiêu chí đăng ký mới kích hoạt thư chào mừng.
- Phần giao diện liên quan: [Frontend_Spec.md](./Frontend_Spec.md), Welcome & Onboarding UI.
- Đặc tả chính nêu kiến trúc email/background jobs nhưng chưa quy định đầy đủ payload, trạng thái gửi, chống trùng hoặc số lần retry riêng cho email. Các lựa chọn dưới đây được ghi là **đề xuất triển khai**, không coi là yêu cầu đã có sẵn.
- Hiện trạng được đọc tại nhánh `2312778-phanthibaotram-quanlynguyenlieu`, commit `69fb056`. Khi triển khai phải kiểm tra lại main và tình trạng các PR, không mặc định nhánh hiện tại là nền đã merge.

Trong phạm vi: ghi nhận sự kiện tài khoản mới, email HTML/text, SMTP, môi trường bắt thư local, Hangfire, retry/recovery, chống xử lý trùng, quan sát vận hành, test và hướng dẫn cấu hình. Luồng email/password là bắt buộc. Đề xuất cùng gửi welcome khi Google tạo tài khoản nội bộ lần đầu, nhưng không gửi khi chỉ đăng nhập/liên kết tài khoản đã tồn tại.

Không bao gồm: chiến dịch marketing, gửi hàng loạt, xác minh email, reset mật khẩu, thêm public resend API, xây cả hai provider SMTP và SendGrid cùng lúc, thay đổi điều kiện đăng nhập/phân quyền tài khoản.

## 2. Phân biệt nghiệp vụ cần thống nhất

1. **Welcome không phải verification:** Thư chào mừng không chứa mật khẩu, JWT, refresh token hoặc đường dẫn tự cấp quyền. Không đặt `EmailConfirmed = true` cho tài khoản local chỉ vì SMTP nhận thư. Google xác minh danh tính theo luồng hiện có, không do welcome job quyết định.
2. **Mâu thuẫn frontend:** Frontend_Spec nhắc kiểm tra email để “kích hoạt tài khoản”, nhưng luồng local hiện trả token ngay sau đăng ký và chưa thấy verification workflow trong phạm vi này. Đề xuất sửa thông điệp thành “kiểm tra thư chào mừng”; không hứa có link kích hoạt khi chưa hiện thực chức năng xác minh.
3. **Đăng ký thành công trước, thư chạy nền sau:** Response đăng ký hiện có phải giữ tương thích. Không chờ SMTP trong HTTP request; SMTP lỗi sau commit không được biến tài khoản đã tạo thành phản hồi đăng ký thất bại.
4. **Một ý định welcome cho một tài khoản:** Đề xuất unique `(UserId, MessageType)` với MessageType = Welcome. Login, refresh, đăng nhập lại Google, liên kết Google với user có sẵn, update profile và seed không tự phát sinh welcome.
5. **Không cam kết exactly-once ở hộp thư:** DB và SMTP không có transaction chung. Có thể SMTP đã nhận thư nhưng worker chết trước khi lưu Sent. Cần giảm trùng bằng unique intent, claim/lease và kiểm tra Sent, nhưng vẫn ghi nhận khả năng gửi lại ở cửa sổ lỗi này. SMTP Message-Id cố định không bảo đảm server nhận thư tự deduplicate; provider idempotency chỉ được dùng khi provider thực sự hỗ trợ.

## 3. Hiện trạng mã nguồn và khoảng thiếu

Đường dẫn trong bảng tính từ `Culinary_Blog_Nhom5/`.

| Thành phần | Hiện trạng đã đọc | Việc cần hoàn thiện |
|---|---|---|
| `Application/Contracts/IEmailService.cs` | Có `SendWelcomeEmailAsync(toEmail, userName, ct)`. | Chưa thấy implementation hoặc đăng ký DI; cần transport và template thực tế. |
| `RegisterCommandHandler` | Chuyển tiếp sang IAuthService, không điều phối mail. | Không chỉ thêm enqueue tại đây vì sẽ bỏ sót kênh tạo user khác và khó bảo đảm atomicity. |
| `Infrastructure/Services/AuthService.cs` | Local register có transaction user/role/refresh token; dùng execution strategy, fresh scope, stable userId/refresh token để nhận biết commit đã thành công khi retry. | Ghi welcome intent trong chính transaction này, trước commit; không phá cơ chế nhận biết retry. |
| `GoogleLoginCoreAsync` | Tạo user khi Google identity/email chưa có, hoặc liên kết/đăng nhập user cũ; đã có transaction. | Phân biệt nhánh thật sự tạo mới; chỉ nhánh này có welcome intent. Retry/login cũ không tạo bản ghi trùng. |
| `ApplicationUser` | Có Id, Email, DisplayName, IsActive, CreatedAt; EmailConfirmed kế thừa Identity. | Không có trạng thái welcome; đề xuất bảng delivery/outbox riêng thay vì dùng EmailConfirmed làm cờ gửi. |
| `ApplicationDbContext` | Có user/refresh token/recipe data; chưa thấy outbox/delivery email. | Thêm entity/configuration/migration mới cho intent, trạng thái, lease và retry metadata. |
| `API/Program.cs` | Đã cấu hình Hangfire PostgreSQL storage và AddHangfireServer; có recurring job xóa ảnh/purge. | Đăng ký welcome job/dispatcher và lịch recovery; chưa thấy Hangfire Dashboard được map. |
| `Infrastructure.csproj` | Có Hangfire.AspNetCore và Hangfire.PostgreSql; chưa thấy SMTP/SendGrid client package chuyên biệt. | Chọn một SMTP implementation phù hợp khi triển khai, chỉ thêm dependency cần thiết và kiểm tra tương thích runtime. |
| `DependencyInjection.cs` | Có AuthService, JWT, storage và các job ảnh; không có email service/queue welcome. | Thêm options/DI nhỏ, không thay đổi các service/job khác. |
| `docker-compose.yml` | Repo hiện khai báo PostgreSQL, Redis, MinIO, Seq; không có MailHog. | Bổ sung mail capture service development bằng compose override/profile hoặc file riêng. Không suy luận từ container ngoài repo. |
| `RegisterForm.tsx` | Sau 201 chuyển `/login?registered=true`; chưa có welcome page/banner được tìm thấy trong luồng này. | Tích hợp onboarding nếu đưa vào bàn giao đầy đủ; không coi redirect thành bằng chứng email đã gửi. |
| Logging | SafeLogSink lọc allowlist; trường JobId/EmailMessageId/Attempt chưa nằm trong danh sách đã đọc. | Thêm trường chẩn đoán có chọn lọc; không ghi địa chỉ nhận, HTML, credential hay token vào log/job arguments. |

Các nhận xét “chưa tích hợp Hangfire” trong mục hiện trạng của đặc tả chính đã cũ so với mã đang đọc. Tái sử dụng hạ tầng Hangfire hiện có; không cấu hình thêm một storage/server độc lập chỉ cho welcome email.

## 4. Thiết kế đề xuất: intent bền vững và Hangfire

### 4.1. Bản ghi WelcomeEmailDelivery

Thêm bảng chuyên biệt, đóng vai trò outbox cho welcome, chưa cần xây message bus/outbox tổng quát cho toàn hệ thống.

| Dữ liệu | Mục đích |
|---|---|
| `Id` | GUID ổn định làm business message id; là tham số job. |
| `UserId`, `MessageType` | Tra chủ thể và unique constraint chống tạo ý định trùng. |
| `RecipientEmail` hoặc snapshot đã chuẩn hóa | Địa chỉ nhận tại thời điểm đăng ký; là dữ liệu cá nhân trong DB, không đưa vào log/job payload. |
| `TemplateVersion` | Xác định template được dùng; job đọc DisplayName từ user và HTML-encode. |
| `Status` | Pending, Processing, Sent, Failed, Skipped. |
| `CreatedAt`, `UpdatedAt`, `SentAt` | Theo dõi tuổi bản ghi và thời điểm SMTP/provider chấp nhận thư. |
| `AttemptCount`, `NextAttemptAt`, `LastErrorCode` | Đếm lần gửi thực tế, backoff và lỗi phân loại đã làm sạch. |
| `HangfireJobId` | Chẩn đoán dispatch/recovery; không dùng làm khóa nghiệp vụ duy nhất. |
| `LeaseToken`, `LeaseExpiresAt` hoặc cơ chế claim tương đương | Ngăn nhiều worker cùng gửi một message. |

Sent nghĩa là transport đã chấp nhận thông điệp, không đồng nghĩa thư đã tới inbox hoặc được đọc. Không thêm thông báo “đã nhận email” trong UI dựa vào trạng thái này.

Đề xuất lưu snapshot recipient và đối chiếu user hiện hành trước khi gửi. Nếu user bị vô hiệu hóa, không tồn tại hoặc email đã đổi so với snapshot, ghi Skipped với reason code và không tự chuyển thư sang địa chỉ khác. Chốt FK/chính sách xóa user sao cho không hồi sinh tài khoản hoặc phát sinh thư khi tài khoản bị xóa. Không giữ PII vô thời hạn; cấu hình retention cho bản ghi terminal, ví dụ 30 ngày, và không xóa Pending/Processing còn cần recovery.

### 4.2. Ghi intent trong transaction đăng ký

1. Validate request và tạo Identity user như hiện có.
2. Sau khi tạo/gán role thành công, thêm welcome intent vào cùng ApplicationDbContext và transaction trước lần SaveChanges/commit cuối. Local register hiện có SaveChanges trong CreateAuthResponseAsync; đặt điểm ghi intent để intent cũng được flush trước commit, không chỉ Add sau lần Save cuối.
3. Nếu transaction rollback, cả user/role/token/intent không được để lại một phần. Không tạo intent cho request sai dữ liệu/trùng email hoặc role assignment thất bại.
4. Commit xong, có thể enqueue nhanh `WelcomeEmailJob(messageId)` theo kiểu best effort. Enqueue lỗi chỉ log chẩn đoán an toàn; response đăng ký vẫn thành công vì intent đã lưu và dispatcher có thể phục hồi.
5. Recurring dispatcher đọc intent đã commit để xử lý trường hợp API chết ngay sau commit, enqueue lỗi hoặc chưa cập nhật HangfireJobId. Không đưa email/name/password/token vào hàng đợi.
6. Retry của AuthService gặp user đã commit phải trả response như hiện tại, không sinh intent mới. Unique constraint là hàng rào bổ sung, không thay thế việc giữ đúng transaction/retry flow.

Hangfire storage dùng cùng PostgreSQL connection string không có nghĩa enqueue tự tham gia transaction Identity/EF. Không đặt enqueue trước commit rồi giả định worker chắc chắn đọc được user và intent.

### 4.3. Thực thi, claim và chống trùng

1. Job nhận duy nhất messageId; load delivery và user từ DB, kiểm tra trạng thái/quyền tồn tại của tài khoản.
2. Sent/Skipped hoặc message không còn tồn tại: kết thúc không gửi. Failed không tự reset chỉ vì có job trùng/manual retry trong Dashboard.
3. Claim atomic trong transaction ngắn: kiểm tra trạng thái/lease, cấp LeaseToken, tăng AttemptCount khi sắp thực sự gọi transport, đánh Processing; commit trước I/O. Không giữ DB lock trong lúc chờ SMTP.
4. Worker khác gặp lease còn hiệu lực không được gửi. Timeout SMTP phải nhỏ hơn thời gian lease hoặc có lease renewal; không tự coi mọi Processing lâu là an toàn để chạy chồng.
5. Render HTML/text và gửi qua IEmailService. Địa chỉ nhận, sender, URL đều lấy từ dữ liệu/options server đã kiểm tra; không lấy từ job argument do client cung cấp.
6. Thành công: cập nhật Sent/SentAt và giải phóng lease bằng điều kiện đúng LeaseToken. Thất bại: ghi reason code, giải phóng lease và chuyển Pending/Failed theo chính sách retry; ném lỗi phù hợp để Hangfire quan sát được thất bại, không swallow rồi ghi Sent.

## 5. Retry, recovery và thao tác vận hành

- **Đề xuất email retry 3 lần ngoài lần đầu**, tối đa 4 lần gọi SMTP tự động cho một intent; khai báo rõ ở job thay vì phụ thuộc mặc định Hangfire. Đây là lựa chọn riêng cho welcome; số 3 trong đặc tả chính hiện được ghi cho purge ảnh, không tự coi đã quy định email.
- Hangfire chịu trách nhiệm retry chính; AttemptCount bền vững giới hạn tổng số lần gửi, kể cả job trùng. Backoff ví dụ 1/5/15 phút là cấu hình triển khai cần ghi vào test/README, không hứa lịch chính xác khi worker ngừng chạy.
- Dispatcher/recovery đề xuất mỗi phút, xử lý batch hữu hạn; enqueue bản ghi Pending chưa có job sống. Không enqueue liên tục bản ghi đã có job Enqueued/Processing/Scheduled còn hợp lệ. Nếu metadata giữa hai store lệch, job claim vẫn là hàng rào cuối.
- Kiểm tra NextAttemptAt trước khi gửi. Recovery không được vượt qua backoff, reset AttemptCount hoặc mở vòng retry vô hạn cho Failed.
- Worker/API restart, enqueue thành công nhưng chưa lưu JobId, lease hết hạn, job bị mất/xóa và lease còn sống phải có đường kiểm tra riêng. Mọi thao tác recovery phải idempotent và an toàn khi nhiều instance chạy.
- Hết retry ghi Failed, giữ dữ liệu đủ cho chẩn đoán và cảnh báo. Với lỗi SMTP vĩnh viễn có thể bổ sung phân loại để dừng sớm; phải phối hợp filter/retry state thực tế, không dùng log “thành công” che lỗi business.
- Runbook retry thủ công: operator kiểm tra trạng thái/provider trước; chỉ reset/requeue một message cụ thể qua thao tác có audit. Không chỉ nhấn Retry rồi mặc định worker sẽ gửi lại Failed đã chạm giới hạn. Không tạo public resend API trong FR-JOB-001.
- Hangfire Dashboard nằm ở `/hangfire` và chỉ Admin được truy cập kể cả production; không mở anonymous để tiện debug. Không mở endpoint gửi thư tùy ý nhận toEmail/userName từ người dùng.

## 6. Email transport, template và cấu hình

### Transport

Ưu tiên một implementation SMTP của IEmailService để dùng được cả development mail capture và SMTP thật. SendGrid chỉ là lựa chọn thay thế nếu nhóm yêu cầu; không triển khai và vận hành hai provider cùng lúc cho bản đầu. Giữ contract Application độc lập thư viện SMTP; nếu cần message id/template metadata, mở rộng bằng request có kiểu rõ ràng và cập nhật caller/test cùng lúc. Interface hiện chưa thấy consumer nên chưa có luồng gửi cũ cần bảo tồn.

Options đề xuất: `Email:Enabled`, `Email:Provider`, `Email:Smtp:Host`, `Port`, `Username`, `Password`, `SecurityMode`, `Email:FromAddress`, `FromName`, `Email:PublicWebBaseUrl`, timeout và giới hạn retry. Secret đặt qua environment/User Secrets, ví dụ `Email__Smtp__Password`; file cấu hình commit chỉ có placeholder/default development không nhạy cảm.

- Khi Enabled=true, validate host/port/sender/base URL/TLS options ngay lúc startup. Không tắt kiểm tra chứng chỉ TLS ở production; không bật debug dump toàn bộ SMTP conversation chứa dữ liệu nhạy cảm.
- Khi Enabled=false, giữ intent Pending và không drain queue/đếm lần gửi/đánh Sent; dispatcher tạm dừng gửi. Bật lại phải có khả năng dispatch intent còn chờ. Ghi rõ chính sách này để tránh “email đã gửi” giả.
- Development dùng mail capture local, ví dụ MailHog SMTP 1025/UI 8025. Bind UI/SMTP về localhost khi publish cổng trên máy; nếu API chạy trong container thì dùng service hostname và cổng nội bộ. Tên image/version sẽ được kiểm tra và pin trong bước triển khai.
- SMTP outage lúc runtime không làm lỗi request đăng ký đã commit; cấu hình sai khi triển khai phải được báo rõ để sửa, không âm thầm fallback sang console/no-op được coi là gửi thành công.

### Nội dung thư

Subject đề xuất: “Chào mừng bạn đến với Culinary Blog”. Có HTML và plain-text thay thế, hỗ trợ tiếng Việt UTF-8, tên hiển thị đã encode, nội dung ngắn gọn giới thiệu cộng đồng và lời mời khám phá công thức. Link lấy từ PublicWebBaseUrl tin cậy; không ghép URL từ Host header của request đăng ký.

CTA: `/recipes` và hướng dẫn đăng nhập để tạo công thức tại `/dashboard/recipes/new`. Không đưa access token vào URL; không nói “tài khoản đã xác minh” hoặc dựng link kích hoạt. Có fallback khi DisplayName trống trong dữ liệu cũ, và kiểm thử chuỗi chứa HTML/ký tự đặc biệt.

## 7. Tích hợp giao diện có giới hạn

- Bắt buộc giữ response đăng ký và cookie/token flow hiện có. Không thay đăng ký thành response chờ email, không poll trạng thái delivery bằng một public API mới.
- Để đáp ứng phần onboarding của Frontend_Spec, có thể thêm WelcomeBanner tại `/login?registered=true` trước, hoặc trang welcome riêng trong cùng phạm vi; phải chọn một luồng rõ ràng trước khi triển khai.
- Đề xuất bản đầu giữ redirect hiện có và bổ sung banner trên login: đăng ký đã hoàn tất, email chào mừng có thể đến sau, có thể đăng nhập và khám phá công thức. Không hiển thị địa chỉ email từ query string và không hứa thư đã tới inbox.
- Tài liệu phụ ghi route `/auth/welcome` nhưng file `app/(auth)/welcome/page.tsx` thực tế của Next.js tạo `/welcome`, không tạo `/auth/welcome`. Nếu chọn route riêng phải thống nhất đường dẫn thật, redirect và quyền truy cập; không tạo hai route sai lệch.
- RegisterForm hiện chưa tự tạo NextAuth session sau API register; nút tạo công thức từ welcome phải hướng dẫn đăng nhập hoặc sử dụng redirect đăng nhập hiện có. Không giả định chỉ có backend token là frontend đã đăng nhập.
- Banner/onboarding không được kích hoạt gửi lại email khi refresh trang. Việc enqueue phải nằm ở backend theo sự kiện tạo tài khoản, không ở useEffect/click của banner.

## 8. Trình tự triển khai và file dự kiến

1. **Chốt contract và trạng thái:** Viết state transitions/unique intent, retry cap và phạm vi Google. Đối chiếu luồng transaction/retry trong AuthService với người phụ trách auth; chỉ sửa các điểm tạo user thật sự cần.
2. **Domain/persistence:** Thêm entity delivery, configuration, DbSet, migration/snapshot mới; unique UserId/MessageType, index dispatch theo Status/NextAttemptAt/lease. Không sửa migration đã áp dụng hoặc ép welcome state vào EmailConfirmed.
3. **Application contracts:** Tái sử dụng IEmailService; thêm queue/intent abstraction nhỏ nếu giúp tách AuthService khỏi Hangfire. Đường ghi intent phải dùng transaction/context hiện tại, không ẩn một scope riêng làm commit lệch.
4. **Auth integration:** Local transaction ghi intent; Google chỉ ở nhánh new user nếu chọn phạm vi đề xuất; stable id/unique constraint bảo vệ retries. Thêm integration test trước khi thay đổi logic token/role hiện có.
5. **Transport/template:** Thêm SMTP service, options validation và template HTML/text vào Infrastructure; DI đăng ký. Timeout/cancellation rõ ràng, không log recipient/body/credential.
6. **Jobs:** Thêm `WelcomeEmailJob`, dispatcher/recovery job, claim/lease và state updates; đăng ký ở Infrastructure và lịch trong Program bằng thay đổi nhỏ. Bảo đảm HangfireServer đang consume queue nếu dùng queue riêng `emails`; nếu không cấu hình queue riêng thì dùng default hiện có.
7. **Local environment/observability:** Compose override/profile mail capture, hướng dẫn env, runbook failed/retry, log allowlist và metric phù hợp hệ thống. Các trường an toàn đề xuất: message id, user id, job id, attempt, status, elapsed, error category; không raw SMTP exception message nếu chứa địa chỉ nhận.
8. **Onboarding/documentation:** Chọn banner tối thiểu hoặc route welcome đúng; cập nhật Frontend_Spec để không nhầm với activation; ghi cấu hình và trạng thái gửi vào báo cáo triển khai.
9. **Kiểm thử/bàn giao:** Unit, PostgreSQL thật, Hangfire thật với mail capture, hồi quy auth và kiểm tra UI nếu có thay đổi. Ghi rõ bằng chứng và giới hạn xác minh; không coi email fake service là bằng chứng SMTP đã gửi.

## 9. Ma trận kiểm thử và nghiệm thu

| Nhóm | Tình huống | Kết quả mong đợi |
|---|---|---|
| Đăng ký | Local hợp lệ; invalid/trùng email; lỗi role/token/DB | Thành công có đúng một intent; thất bại rollback không để intent rác; giữ HTTP/token/cookie contract. |
| Retry transaction | Commit đã thành công nhưng mất response; execution strategy chạy lại | Không tạo user/refresh token/welcome intent trùng ngoài hành vi retry đã thiết kế. |
| Google | User mới; user cũ; liên kết email có sẵn; đăng nhập lặp | Chỉ tài khoản nội bộ mới có welcome; không gửi lại mỗi login. |
| Async/recovery | SMTP chậm/down; queue enqueue lỗi; API chết sau commit | Register không chờ SMTP; intent không mất; recovery tiếp tục khi hạ tầng phục hồi. |
| Chống trùng | Hai worker/job cùng message; job Sent chạy lại; dispatcher song song | Không gửi song song cho cùng intent; Sent không gửi lại; attempt cap không bị vượt. |
| Cửa sổ lỗi SMTP/DB | SMTP nhận nhưng lưu Sent lỗi; crash trước/sau SMTP | Không tuyên bố exactly-once; recovery/lease có hành vi và cảnh báo rõ, ghi nhận nguy cơ gửi lặp. |
| Retry | Lỗi transport trước thành công; hết tối đa 4 lần; Failed được enqueue lại | Retry có backoff/cap; cuối cùng Failed quan sát được; không tự reset vô hạn. |
| Lease/cancellation | Worker dừng; lease còn hạn/hết hạn; SMTP timeout | Không chạy chồng khi lease còn sống; việc bị bỏ dở có đường phục hồi hữu hạn. |
| Nội dung | Tên có HTML, tiếng Việt, tên trống; base URL cấu hình | HTML encode, text alternative, link đúng; không token/mật khẩu/link activation giả. |
| User/config | User inactive/mất/email đổi; Enabled=false; cấu hình sai | Skip/Pending/validation đúng chính sách, không Sent giả hoặc gửi sang địa chỉ tự đổi. |
| Vận hành | Log/Hangfire arguments/Dashboard/compose | Không lộ email/secret/body; dashboard chỉ Admin nếu bật; mail capture không là production provider. |
| Hồi quy/UI | Login/refresh/logout, đăng ký và banner | Không đổi auth semantics; banner không tự gửi lại mail và không bắt user chờ thư để đăng nhập. |

Unit test tập trung template/options và state transitions. Integration dùng PostgreSQL thật cho unique constraint, transaction, claim và recovery; Hangfire storage thật cho enqueue/retry. SMTP smoke test dùng MailHog/mail capture của test, địa chỉ giả thuộc miền test, không gửi đến hộp thư người thật.

Smoke test đề xuất: khởi động PostgreSQL/Hangfire/mail capture → đăng ký user test → HTTP 201 trả trước khi gửi mail hoàn tất → thấy đúng intent → worker chuyển Sent → kiểm tra subject/HTML/text ở mail capture → chạy lại job không thêm thư → tắt SMTP và kiểm tra retry/Failed/recovery → đăng nhập tài khoản vẫn hoạt động.

Build solution và chạy test auth/hồi quy hiện có. Nếu sửa frontend, chạy lint, TypeScript và production build theo scripts thực tế; kiểm tra luồng sau đăng ký. Test project độc lập có thể chạy theo csproj, dùng database/mailbox tạm riêng và dọn dữ liệu sau test.

## 10. Tổ chức nhánh và giảm conflict

- Yêu cầu ban đầu chỉ lập plan; yêu cầu tiếp theo đã cho phép triển khai. Công việc hiện nằm trên nhánh welcomeemailjob riêng, không đưa vào PR nguyên liệu #40. Commit/push thực hiện theo yêu cầu tiếp theo của người dùng.
- Khi triển khai, đọc README/CONTRIBUTING, cập nhật main và tạo nhánh riêng, ví dụ `2312778-phanthibaotram-fr-job-001-welcomeemail`. Không mặc định PR ảnh/nguyên liệu hoặc nhánh bảo mật đã merge.
- Các điểm dễ conflict: AuthService (nhóm auth), ApplicationDbContext/migrations/snapshot, DI, Program, compose và RegisterForm/LoginForm. Tách service/job/options/template/dispatcher thành file riêng; điểm sửa auth chỉ là ghi intent trong transaction tạo tài khoản.
- Không rewrite auth service, refresh-token rotation hoặc Google linking chỉ để enqueue thư. Không sửa lại cấu hình Hangfire chung làm ngừng queue xử lý ảnh.
- Dùng migration tên/timestamp mới, không chỉnh migration đã áp dụng; kiểm tra snapshot sau khi cập nhật main. Không commit SMTP credential, .env, mail capture data hoặc file build.
- Trước push/PR: fetch/merge main, xử lý conflict theo hành vi nghiệp vụ rồi kiểm tra lại; commit Conventional Commits và PR chỉ chứa FR-JOB-001. Không tự merge khi chưa có review theo quy định nhóm.

## 11. Checklist hoàn tất

- [x] Local register ghi welcome intent atomic với user/role/token, retry không tạo intent trùng.
- [x] Chính sách Google mới/cũ được chốt và kiểm thử đúng phạm vi.
- [x] SMTP/template HTML/text hoạt động với mail capture và cấu hình hợp lệ.
- [x] WelcomeEmailJob thực thi sau commit, job arguments chỉ chứa message id.
- [x] Claim/lease, unique intent, retry cap và recovery được kiểm chứng khi lỗi/crash/chạy đồng thời.
- [x] Sent/Failed/Skipped/Pending phản ánh đúng trạng thái; không hứa exactly-once hoặc inbox delivery.
- [x] Auth không bị thay đổi bởi trạng thái welcome; email chào mừng không đóng vai trò xác minh tài khoản.
- [x] Observability/runbook không lộ PII/secret; dashboard có phân quyền nếu bổ sung.
- [x] Onboarding có nội dung/route đúng và không kích hoạt resend trên frontend.
- [x] Build/test/smoke test có bằng chứng thực tế; README/spec/config mẫu được cập nhật và không chứa secret.

**Ưu tiên:** P0 atomic intent + transport + job/recovery; P1 retry/chống trùng/observability + SMTP smoke test; P2 onboarding và hoàn thiện vận hành. Không nghiệm thu chỉ bằng việc đăng ký trả 201 hoặc thấy một job trong Hangfire.
