# Kế hoạch hoàn thiện FR-OBS-002 — Structured Logging

**Ngày phân tích:** 06/10/2026.  
**Baseline mã nguồn:** `fbc67de`, nhánh `2300003-NguyenLeAnhTuan-xoaanhminio`; đối chiếu cả cấu hình đang có trên workspace.  
**Trạng thái:** Đã triển khai và kiểm thử chức năng ngày 06/10/2026; xem [hướng dẫn và kết quả kiểm thử](Guide_FR-OBS-002-Structured-Logging.md). Các giới hạn về NFR, coverage và kiểm thử browser được ghi riêng trong hướng dẫn.  
**Phạm vi:** Ghi log có cấu trúc tại Backend và Client, liên kết bằng Correlation ID, phục vụ tìm lỗi và theo dõi thời gian xử lý.

## 1. Căn cứ và kết luận phân tích

- `Culinary_Blog_Spec.md`, mục 7.2: `LoggingBehavior` ghi request, user, correlation ID, elapsed time; cảnh báo khi thời gian thực thi **> 1.000 ms**.
- Mục 7.5: structured log bắt buộc có `CorrelationId`, path, method, status, elapsed time, `UserId`; Seq chỉ dành cho development trong kiến trúc mục tiêu.
- Mục 2: Admin được xem structured logs. Mục 6 và checklist mục 12: lỗi API có Correlation ID, theo Problem Details và không lộ stack trace.
- Mục 8: p99 API <= 1.000 ms, tối thiểu 100 concurrent users; coverage Application mục tiêu >= 80%. Cảnh báo request chậm không thay thế phép đo percentile.
- File đặc tả không ghi trực tiếp mã `FR-OBS-002`. Việc ánh xạ mã dựa trên `Bang_Phan_Cong_Va_Mo_Ta_Chi_Tiet_Cong_Viec.md`: chức năng bao gồm **Backend và Client**, phụ trách Tuấn. `struc.md` bổ sung định hướng `lib/logger.ts` và Error Boundary.
- Mục 9 của đặc tả là baseline ngày 21/09/2026, không dùng làm kết luận về code hiện tại.

**Kết luận:** Có nền tảng logging nhưng chưa đủ nghiệm thu. Cần bổ sung log HTTP, context thống nhất, JSON output, Seq development, ghi nhận lỗi/thời gian trong CQRS và client logger. OpenTelemetry exporter, distributed tracing, metrics thuộc **FR-OBS-003**; health probes thuộc **FR-OBS-001**. Chỉ chuẩn bị điểm tích hợp, không mở rộng sang hoàn thiện hai chức năng đó.

Các quy ước về tên field, mức log, giới hạn Correlation ID và retention bên dưới là **đề xuất thiết kế của plan**, không phải yêu cầu nguyên văn của đặc tả.

## 2. Hiện trạng đã kiểm tra

Đường dẫn trong tài liệu tính từ `Culinary_Blog_Nhom5/`, trừ khi ghi rõ khác.

| Thành phần | Hiện trạng | Khoảng thiếu |
|---|---|---|
| `src/CulinaryBlog.API/Program.cs` | Có `Serilog.AspNetCore`, `ReadFrom.Configuration`, `Enrich.FromLogContext`, console sink và `UseSerilog()` | Chưa gọi `UseSerilogRequestLogging`; console chưa cấu hình JSON; chưa có scope đẩy correlation/user vào log; chưa có cơ chế startup logging/flush rõ ràng |
| API `.csproj` | Target `net10.0`, `Serilog.AspNetCore` 10.0.0 | Chưa khai báo trực tiếp Seq sink; cần xác minh dependency formatter/sink trước khi thêm package |
| `appsettings.json`, `appsettings.Development.json` | Có section `Logging` | Chưa có section `Serilog` quản lý level, sink, enrichment theo môi trường |
| `Middlewares/CorrelationIdMiddleware.cs` | Nhận hoặc sinh `X-Correlation-ID`, đặt vào `HttpContext.Items` và response header | Chưa kiểm tra độ dài/ký tự/nhiều giá trị, chưa đưa vào log context |
| `Middlewares/GlobalExceptionMiddleware.cs` | Map exception sang Problem Details; có `correlationId`; lỗi 500 dùng thông điệp chung | Mọi exception đều ghi Error; cần phân biệt lỗi nghiệp vụ và hệ thống, giữ user context khi scope bên trong đã kết thúc |
| `Application/Common/Behaviors/LoggingBehavior.cs` | Ghi tên request và elapsed ở luồng thành công | Ngưỡng đang là 500 ms; `await next()` ném lỗi thì không ghi thời gian/kết quả; chưa có user/correlation rõ ràng |
| `Application/DependencyInjection.cs` | Logging đứng trước Validation | Giữ thứ tự để bao phủ lỗi validation; không thêm behavior logging trùng |
| `ICurrentUserService`, `CurrentUserService` | Đã có UserId từ `ClaimTypes.NameIdentifier` | Tái sử dụng; không tạo dependency từ Application sang API/Serilog |
| `../docker-compose.yml` | Có Seq, cổng host `5341` ánh xạ container `80`, volume `seqdata` | Chưa thấy API gửi log tới Seq; kiểm tra thiết lập tài khoản/quyền khi chạy. File đang có thay đổi local, cần bảo toàn |
| `culinary-blog-web/lib/api/axiosClient.ts` | Gắn Bearer token, response interceptor chỉ trả lại response/error | Chưa gắn/đọc correlation, đo thời gian hoặc ghi log có cấu trúc |
| Frontend logger / Error Boundary | Không thấy `lib/logger.ts` hoặc component `ErrorBoundary` dùng chung; có `app/(public)/categories/error.tsx` | Bổ sung logger và tích hợp ranh giới lỗi phù hợp, tránh ghi trùng |
| Kiểm thử | Chưa tìm thấy test project qua danh sách file đã kiểm tra | Cần lập test harness cho backend/client, sink thu log phục vụ assertion |

## 3. Contract log thống nhất

### 3.1 Backend

Mỗi HTTP request đã đi vào pipeline có một event tổng kết `HttpRequestCompleted`. Request lỗi trước khi vào ứng dụng (ví dụ HTTP không hợp lệ bị server từ chối) không thuộc cam kết này.

| Field | Kiểu / nguồn | Quy tắc |
|---|---|---|
| `Timestamp` | Timestamp của event | UTC; formatter có thể dùng tên chuẩn riêng như `@t`, phải tài liệu hóa mapping |
| `Level`, `MessageTemplate` | Serilog event | Dùng template với placeholder, không nội suy chuỗi chứa dữ liệu người dùng |
| `EventType` | string | `HttpRequestCompleted`, `ApplicationRequestCompleted`, `UnhandledException`, `ClientHttpError`, `ClientRuntimeError` |
| `CorrelationId` | string | ID đã chuẩn hóa từ middleware; giống header phản hồi và Problem Details |
| `RequestPath` | string | Path, không kèm query string hoặc fragment; route nhạy cảm cần redact |
| `RequestMethod` | string | GET, POST, PATCH… |
| `StatusCode` | number | Trạng thái cuối cùng sau xử lý lỗi; không ghi nhầm 200 khi thực tế trả 500 |
| `Elapsed` | number | Milliseconds, >= 0; dùng đồng hồ monotonic |
| `UserId` | string hoặc null | Chỉ từ danh tính server đã xác thực; Guest là null, không lấy header do client tự khai |
| `SourceContext` | string | Thành phần phát event |
| `Application`, `Environment` | string | Tên service và môi trường, không chứa secret |
| `RequestName`, `Outcome` | string | Dành cho CQRS; outcome `Succeeded`, `Failed`, `Canceled` |

HTTP event bắt buộc đủ sáu field theo đặc tả, kể cả `UserId: null`. Log CQRS dùng `RequestName` và context; log startup/background không có HTTP context thì không bịa path/method/status. Có thể thêm `TraceId`, `SpanId` khi `Activity.Current` tồn tại; không đồng nhất Trace ID với Correlation ID.

Ví dụ payload logic sau khi chuẩn hóa tên trường (không áp đặt định dạng nội bộ của Seq):

```json
{
  "Timestamp": "2026-10-06T08:00:00Z",
  "Level": "Information",
  "EventType": "HttpRequestCompleted",
  "MessageTemplate": "HTTP {RequestMethod} {RequestPath} responded {StatusCode} in {Elapsed} ms",
  "CorrelationId": "c2677f27-ae95-4861-846c-b7535edda17e",
  "RequestPath": "/api/v1/recipes",
  "RequestMethod": "GET",
  "StatusCode": 200,
  "Elapsed": 43.8,
  "UserId": null,
  "Application": "CulinaryBlog.API",
  "Environment": "Development"
}
```

### 3.2 Mức log và tránh ghi trùng

- HTTP 2xx/3xx: Information; > 1.000 ms: Warning. HTTP 4xx: Warning; 5xx: Error, ưu tiên mức lỗi hơn ngưỡng thời gian.
- CQRS: start ở Debug; completion Information, chậm Warning; failure theo nhóm lỗi đã biết hoặc lỗi hệ thống. Luôn ghi duration/outcome, kể cả cancellation.
- Lỗi nghiệp vụ đã biết không ghi stack trace mức Error như lỗi không xử lý. GlobalExceptionMiddleware sở hữu event exception chi tiết cho lỗi HTTP không mong đợi; CQRS và HTTP completion chỉ ghi kết quả, không lặp exception payload.
- Cancellation do client ngắt kết nối ghi `Canceled`, không quy thành lỗi hệ thống 500 một cách mặc định; không cố ghi response khi request đã abort hoặc response đã bắt đầu. Event tổng kết thể hiện trạng thái quan sát được và outcome, không giả định response đã đến client.
- Giảm log framework bằng `Serilog:MinimumLevel:Override`; vẫn giữ request summary, không vô tình lọc mất log của Application. Không loại health request ở giai đoạn nghiệm thu.

## 4. Thiết kế Backend

### 4.1 Cấu hình logger và sink

1. Gom cấu hình vào extension ở API nếu cần để `Program.cs` dễ đọc; thống nhất một nơi cấu hình console sink, tránh đăng ký đồng thời trong code và JSON gây trùng log.
2. Console xuất JSON một event/một dòng, có đủ structured properties. Dùng formatter phù hợp dependency thực tế; giữ .NET 10 và version package tương thích hiện có, không nâng toàn bộ framework.
3. Development thêm `Serilog.Sinks.Seq` với server URL cấu hình qua môi trường. API chạy trên host dùng `http://localhost:5341`; nếu sau này chạy cùng Compose network dùng `http://seq:80` theo mapping hiện tại.
4. Production mặc định JSON stdout để nền tảng thu thập; không bật Seq development bằng cấu hình chung. Secrets/API key lấy từ environment hoặc User Secrets.
5. Có bootstrap logger ghi lỗi khởi động, `try/catch/finally` phù hợp và flush khi dừng; không đăng ký provider hai lần. Xác minh shutdown API hỗ trợ trong phiên bản package cài đặt.
6. Sink lỗi không làm hỏng nghiệp vụ HTTP. Dùng cơ chế gửi theo batch có giới hạn; kiểm tra hành vi khi Seq down, tránh hàng đợi vô hạn hoặc retry đồng bộ trong request. Console vẫn là đường quan sát dự phòng; không cam kết lưu bền vững mọi log khi process bị kill.

Serilog hỗ trợ request completion event và tùy biến enrichment/level bằng `UseSerilogRequestLogging`; tham khảo [Serilog.AspNetCore](https://github.com/serilog/serilog-aspnetcore). Kết nối Seq dùng sink chính thức theo [Datalust — Using Serilog](https://docs.datalust.co/docs/using-serilog).

### 4.2 Correlation và user context

- Chấp nhận đúng một `X-Correlation-ID`, tối đa 128 ký tự, chỉ ASCII chữ/số và `-`, `_`, `.`. Thiếu, rỗng hoặc không hợp lệ thì sinh GUID; không log lại giá trị header bị loại.
- Dùng hằng số chung cho header và Items key. Đặt ID vào Items, scope `LogContext` sống suốt request, response header; kiểm tra cả error response.
- Giữ `HttpContext.TraceIdentifier` và Activity ID độc lập; nếu cần ghi thêm `RequestId` để phân biệt nhiều request dùng lại cùng correlation.
- Sau authentication, bổ sung `UserId` vào scope cho log handler/service. Khi scope user bên trong đã dispose, exception middleware vẫn phải lấy UserId từ `HttpContext.User` hoặc scope riêng để event lỗi không mất danh tính.
- HTTP completion enrichment lấy CorrelationId từ Items, UserId từ principal sau thực thi; scope user bên trong không tự động bảo đảm property tồn tại trên event completion bên ngoài.
- Thêm `WithExposedHeaders("X-Correlation-ID")` vào CORS để JavaScript đọc được header; giữ allowlist origins hiện tại.

### 4.3 Thứ tự pipeline đề xuất

```text
CorrelationIdMiddleware (scope ngoài cùng)
  -> UseSerilogRequestLogging (bọc exception handling và các nhánh trả sớm)
    -> GlobalExceptionMiddleware
      -> CORS / HTTPS redirection / routing phù hợp hiện trạng
        -> Authentication
          -> User logging context
            -> Authorization
              -> Rate limiter
                -> Endpoints / MediatR
```

Request logging phải nằm ngoài GlobalExceptionMiddleware để đọc status cuối sau khi exception được chuyển thành Problem Details. Đặt trước authorization/rate limiter để bao phủ 401/403/429. Khi triển khai, xác minh routing của Minimal API và middleware ordering thực tế bằng integration test; không chỉ dựa vào sơ đồ. Các response trả trước authentication có `UserId = null` là hợp lệ.

### 4.4 LoggingBehavior và exception

- Giữ `ILogger<T>` trong Application. Lấy user qua `ICurrentUserService` nếu cần; correlation thừa kế logging scope của API. Nếu cần context ngoài HTTP, định nghĩa contract trung lập ở Application, implement ở lớp ngoài.
- Đổi ngưỡng thành option mặc định `SlowRequestThresholdMs = 1000`, validate > 0; HTTP và CQRS dùng cùng quy ước `>` (đúng 1.000 ms chưa bị coi là chậm).
- Dùng `try/catch/finally` để duration/outcome không mất khi handler lỗi; rethrow giữ stack. Không serialize/destructure toàn bộ command, response hoặc validator input.
- Chỉnh GlobalExceptionMiddleware phân loại level, giữ nguyên mapping status hiện có; kiểm tra `Response.HasStarted` và cancellation trước khi viết body. Không mở rộng sang thay đổi contract nghiệp vụ.
- Log job hiện có tiếp tục hoạt động khi không có HttpContext. Liên kết request với job qua context lưu bền vững là phần mở rộng, không giả định AsyncLocal đi qua hàng đợi Hangfire.

## 5. Thiết kế Client

1. Tạo `culinary-blog-web/lib/logger.ts` với API theo level và danh sách field cho phép: `timestamp`, `level`, `eventType`, `message`, `correlationId`, `path`, `method`, `status`, `elapsedMs`, `outcome`. Client dùng camelCase; ghi rõ mapping sang field backend khi đối chiếu.
2. Xuất JSON; development cho phép Debug, production mặc định Warning/Error. Không gửi trực tiếp browser log tới Seq hoặc đưa Seq API key vào biến `NEXT_PUBLIC_*`.
3. Axios request interceptor sinh ID cho từng lần gửi HTTP, giữ metadata thời điểm bắt đầu; response/error interceptor ưu tiên ID server trả về, rồi Problem Details `correlationId`, sau cùng ID client đã gửi.
4. Log thành công ở Debug để tránh nhiễu; lỗi mạng/timeout có status null và outcome riêng. HTTP error giữ đúng status; trả lại response hoặc reject error như cũ, không nuốt lỗi và không thay đổi cơ chế đăng nhập.
5. Chỉ ghi path đã loại query/fragment, không ghi toàn bộ `AxiosError`, config, headers, session hoặc body. Không log URL chứa credentials.
6. Tích hợp Error Boundary / `error.tsx` phù hợp từng vùng, tái sử dụng `categories/error.tsx`; ghi lỗi runtime một lần và hiển thị thông điệp chung. Chỉ hiển thị mã hỗ trợ khi thật sự có correlation từ request, không gán ID HTTP giả cho mọi lỗi React.
7. Đọc hướng dẫn Next.js cục bộ được `culinary-blog-web/AGENTS.md` yêu cầu trước khi viết code frontend. Kiểm tra cả browser và SSR để không dùng `window`/session sai môi trường.
8. Phạm vi mặc định là client JSON logger và correlation với API. Endpoint thu nhận client logs tập trung là hạng mục mở rộng cần thiết kế rate limit, validation, chống spam riêng; không tự thêm vào FR này.

## 6. Bảo mật và vận hành

- Không ghi password, access/refresh/id token, Authorization, Cookie/Set-Cookie, connection string, khóa MinIO, nội dung file hoặc request/response body nguyên bản.
- Exception message cũng có thể chứa dữ liệu nhạy cảm: kiểm tra các đường lỗi auth/database/storage, redact trước khi xuất sink khi cần; không coi việc bỏ body là đủ. Tắt EF sensitive-data logging.
- Chỉ server-validated UserId dùng để tra cứu; không ghi email/profile khi không cần. Scope phải dispose đúng để không rò context giữa request đồng thời.
- Seq development dùng tài khoản vận hành được cấp cho Admin, không mở công khai. Quyền Admin trong ứng dụng không tự động cấp quyền Seq; tài liệu hóa việc cấp quyền độc lập. Không cần xây trang `/admin/logs` hay public API đọc log.
- Đề xuất retention development 7 ngày, production cấu hình tại collector theo chính sách triển khai; không thêm file sink không giới hạn. Theo dõi dung lượng `seqdata`, khóa image/version phù hợp khi triển khai.
- Tài liệu demo có cách tìm `CorrelationId = '...'`, `StatusCode >= 500`, `Elapsed > 1000`, `UserId = '...'` trên Seq. Dùng dữ liệu test, không chụp secret trong minh chứng.

## 7. Các bước thực hiện và file dự kiến

| Bước | Công việc / file | Đầu ra kiểm chứng |
|---|---|---|
| 1 | Chốt contract, options và constants; kiểm tra package/API hiện có | Danh sách field, level và giới hạn thống nhất |
| 2 | API `.csproj`, `appsettings*.json`, `Program.cs`, extension logging nếu cần | JSON stdout, Seq chỉ development, không lặp sink |
| 3 | `CorrelationIdMiddleware.cs`, middleware/context user mới, CORS | Header, log, Problem Details cùng ID; guest/user đúng |
| 4 | HTTP completion logging, `GlobalExceptionMiddleware.cs` | 2xx/4xx/5xx/429 có duration và status cuối đúng |
| 5 | `LoggingBehavior.cs`, cấu hình options/DI cần thiết | Ngưỡng 1.000 ms; success/failure/cancellation đủ outcome |
| 6 | `lib/logger.ts`, `lib/api/axiosClient.ts`, Error Boundary theo cấu trúc frontend | JSON client, correlation end-to-end, không lộ token |
| 7 | Tạo hoặc dùng test project backend/frontend thích hợp | Tests schema, context isolation, error paths, redaction |
| 8 | Hướng dẫn chạy/tra cứu và minh chứng trong `docx/Spec/` | Demo có thể lặp lại; checklist nghiệm thu hoàn chỉnh |

Thứ tự phụ thuộc: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Chỉ sửa `../docker-compose.yml` nếu cấu hình Seq cần thiết; giữ nguyên thay đổi local và các dịch vụ khác. Không cần database migration hay thay đổi endpoint nghiệp vụ để hoàn thiện logging.

## 8. Kế hoạch kiểm thử

| Nhóm | Ca kiểm thử | Kết quả mong đợi |
|---|---|---|
| Schema | GET public, POST/PATCH có xác thực | Một HTTP completion/event/request, field giữ đúng kiểu; UserId null hoặc ID thật |
| Correlation | Không header; header hợp lệ; rỗng, quá dài, nhiều giá trị, ký tự ngoài allowlist | Sinh/giữ ID đúng quy tắc; header = log = Problem Details nếu có lỗi |
| Error path | 401, 403, 404 route, 409, 422, 423, 429, exception 500 | Status cuối đúng; không lỗi nào mất summary; 500 body không lộ stack |
| CQRS | Handler thành công, validation fail, handler throw, cancellation | Duration/outcome luôn có; không nuốt exception; một nơi giữ exception detail |
| Ngưỡng | 999, 1.000 và 1.001 ms | Hai ca đầu không Warning do thời gian; ca cuối Warning; dùng clock giả hoặc tách logic phân loại để test không chập chờn |
| Isolation | Nhiều request song song với các user/correlation khác nhau | Không trộn scope/ID; request sau không kế thừa context request trước |
| Bảo mật | Login/refresh/google/upload, query chứa dữ liệu test nhạy cảm | Không thấy marker secret trong JSON console, Seq hoặc client logs; exception cũng được kiểm tra |
| CORS / client | Browser khác origin hợp lệ; response lỗi, timeout, network error | Đọc được ID server; fallback đúng; không ghi trùng hoặc lộ Axios config |
| React / SSR | Lỗi render tại boundary, request phía server | Logger không gây lỗi thêm; không truy cập browser API trên server |
| Sink | Seq đang chạy, ngắt kết nối, phục hồi, shutdown bình thường | API vẫn phục vụ; console còn log; hàng đợi có giới hạn; flush theo cấu hình |
| Startup / job | Lỗi cấu hình startup; job chạy không có HttpContext | Có log hữu ích, không lỗi null context hoặc gán nhầm user HTTP |
| Hiệu năng | So sánh cùng workload trước/sau; tối thiểu 100 concurrent users | Báo cáo p50/p95/p99 và overhead; đối chiếu NFR, không coi warning threshold là chứng minh đạt p99 |

Backend dùng sink in-memory để assert structured properties, integration host cho HTTP pipeline; tránh phụ thuộc Seq trong unit tests. Integration host cần thay thế hạ tầng/Hangfire và tắt seed để không sửa database thật. Test Seq và tải là bước smoke/acceptance riêng. Frontend dùng công cụ test phù hợp dependency hiện có; chưa giả định repo đã có test runner.

Lệnh xác minh dự kiến sau triển khai: `dotnet build Culinary_Blog_Nhom5.sln`, `dotnet test Culinary_Blog_Nhom5.sln` khi test project đã được thêm; chạy các script lint/build/test thật sự có trong `culinary-blog-web/package.json`. Không ghi nhận pass nếu chưa chạy hoặc bị chặn bởi dịch vụ/phụ thuộc.

## 9. Definition of Done

- [ ] HTTP event có đủ CorrelationId, path, method, status, elapsed time và UserId, đúng kiểu và đúng giá trị.
- [ ] Backend JSON console và Seq development nhận cùng structured properties; không nhân đôi sink/event.
- [ ] LoggingBehavior bao phủ cả thành công, lỗi và cancellation; ngưỡng mặc định > 1.000 ms.
- [ ] Correlation xuyên client → API → log → response; lỗi Problem Details đồng nhất ID.
- [ ] UserId lấy từ danh tính đã xác thực; request đồng thời không rò context.
- [ ] Client logger và Error Boundary hoạt động, lỗi mạng/SSR được xử lý đúng; không thay đổi luồng xác thực.
- [ ] Không ghi dữ liệu nhạy cảm; log nội bộ có kiểm soát truy cập và retention được tài liệu hóa.
- [ ] Seq ngừng hoạt động không làm API thất bại; startup/shutdown/job logging được kiểm tra.
- [ ] Unit/integration/client tests phù hợp pass; ghi rõ kết quả tải và giới hạn môi trường.
- [ ] Có hướng dẫn chạy, truy vấn Seq và minh chứng guest/auth/4xx/5xx/slow request.
- [ ] Không tuyên bố hoàn thành FR-OBS-001/003 hoặc độ phủ Application 80% nếu chưa có đo lường tương ứng.

## 10. Rủi ro cần theo dõi khi triển khai

1. **Middleware sai thứ tự:** Có thể mất 401/429, ghi 200 thay 500 hoặc thiếu UserId; kiểm thử end-to-end trước khi nghiệm thu.
2. **Cấu hình trùng:** `WriteTo.Console()` trong code và JSON có thể nhân đôi event; chọn một nguồn cấu hình final logger.
3. **Sai scope:** Chỉ enrichment completion không làm mọi log Application có context; cần cả scope trong request lẫn completion enrichment.
4. **Thiếu phạm vi Client:** Chỉ cấu hình Serilog không hoàn thành FR-OBS-002 theo bảng phân công.
5. **Log chứa secret qua exception:** Kiểm thử bằng marker nhạy cảm ở các đường lỗi thay vì chỉ rà template.
6. **Seq/container và test chưa sẵn sàng:** Xác minh version, truy cập và test harness lúc triển khai; plan này dựa trên đọc code/cấu hình, chưa chạy hệ thống.
