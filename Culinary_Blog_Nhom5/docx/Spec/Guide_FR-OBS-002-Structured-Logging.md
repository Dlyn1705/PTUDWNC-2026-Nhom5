# FR-OBS-002 — Hướng dẫn chạy và kết quả kiểm thử

**Ngày:** 06/10/2026. **Baseline:** `fbc67de`. **Phạm vi:** Backend + Client structured logging; không triển khai FR-OBS-001/003.

## 1. Những gì đã triển khai

- API dùng Serilog JSON console (CLEF), Seq chỉ bật trong Development, cấu hình mức log trong `Serilog:MinimumLevel`.
- `HttpRequestCompleted` bao phủ thành công, lỗi, authorization và rate limiting. Có `CorrelationId`, `RequestPath`, `RequestMethod`, `StatusCode`, `Elapsed` (ms), `UserId` (null với Guest).
- Correlation ID cho phép một giá trị ASCII chữ/số/`-_.`, dài 1–128 ký tự; giá trị sai hoặc thiếu được thay bằng GUID. Response header và Problem Details dùng cùng ID. CORS expose `X-Correlation-ID`.
- User context lấy từ principal đã xác thực. HTTP summary và exception handler vẫn lấy đúng user sau khi scope bên trong kết thúc.
- CQRS completion có `RequestName`, `Outcome`, thời gian kể cả failure/cancellation; ngưỡng chậm mặc định **> 1.000 ms**. Không log toàn bộ command/response.
- GlobalExceptionMiddleware phân biệt lỗi nghiệp vụ và lỗi hệ thống. Request abort không viết Problem Details, sử dụng status quan sát 499 khi chưa gửi header. Lỗi sau khi response bắt đầu không viết đè body; summary giữ status đã gửi, `Outcome=Failed`, level Error.
- `SafeLogSink` là cổng duy nhất trước console/Seq: property ngoài allowlist được thay bằng `[REDACTED]`; exception chỉ giữ type và stack trace, bỏ message/inner message/Data. HTTP completion không lặp exception detail.
- Client có JSON logger, Axios correlation/duration, xử lý HTTP error/network/timeout/cancel, không nuốt rejection. Error boundary ở app/global/categories ghi lỗi một lần, không in exception payload.
- Seq sink giới hạn queue 10.000 event, tối đa 65.536 byte/event; gửi theo batch của sink. Shutdown dispose/flush logger. Không cam kết lưu mọi event khi bị kill hoặc queue đầy.
- Sửa điểm khởi tạo recurring job sang `IRecurringJobManager` từ DI: tránh `JobStorage.Current` chưa khởi tạo khi API startup. Không đổi lịch hay logic xóa ảnh.

## 2. Cấu hình

| Cấu hình | Mặc định | Ý nghĩa |
|---|---|---|
| `Observability:SlowRequestThresholdMs` | `1000` | Số dương hữu hạn; HTTP và CQRS dùng chung ngưỡng |
| `Observability:Seq:Enabled` | false; Development true | Chỉ có tác dụng trong Development |
| `Observability:Seq:ServerUrl` | `http://localhost:5341` ở Development | API chạy trên host; cùng Compose network dùng `http://seq:80` |
| `Observability:Seq:ApiKey` | Không lưu trong repo | Cấp qua environment/User Secrets nếu bật khóa ingestion ở Seq |
| `Serilog:MinimumLevel:Default` | Information | Mức log ứng dụng |
| `Serilog:MinimumLevel:Override` | Microsoft/System/Hangfire = Warning | Giảm log framework |

Sinks được đăng ký trong code để bảo đảm đi qua sanitizer. Không thêm `WriteTo` vào JSON rồi kỳ vọng tự áp dụng. Khi bổ sung trường nghiệp vụ vào log, rà soát tính nhạy cảm trước khi thêm vào allowlist `SafeLogSink`. Chỉ dùng message template cố định; không truyền thông điệp người dùng hoặc exception message làm template. Không bật EF sensitive-data logging.

CLEF dùng `@t` cho timestamp UTC, `@mt` cho message template, `@l` cho level (Information có thể không xuất `@l`), `@tr`/`@sp` cho trace/span có sẵn. Những trường HTTP khác giữ đúng tên trong plan. Client dùng camelCase: `correlationId` ↔ `CorrelationId`, `elapsedMs` ↔ `Elapsed`, `path` ↔ `RequestPath`, `status` ↔ `StatusCode`.

Client production chỉ xuất Warning/Error; development thêm Debug cho HTTP thành công. Browser không kết nối trực tiếp Seq. Lỗi framework Next.js do chính framework in ra nằm ngoài client logger; không chủ động đưa Axios config hoặc exception vào `console.*` trong code ứng dụng.

## 3. Chạy Seq local

Từ **thư mục gốc repository**, dùng Docker Compose >= 2.24.4. File bổ sung `compose.observability.yml` giữ nguyên `docker-compose.yml`, cố định image digest đã kiểm tra và chỉ bind Seq trên `127.0.0.1:5341`.

Tạo `.env.seq.local` (đã được `.gitignore` bỏ qua) chứa mật khẩu mạnh do bạn tự chọn:

```dotenv
SEQ_ADMIN_PASSWORD=<mat-khau-quan-tri-local>
```

```powershell
docker compose --env-file .env.seq.local -f docker-compose.yml -f compose.observability.yml up -d seq
```

Mở `http://localhost:5341`, đăng nhập `admin`. Với volume mới, Seq có thể yêu cầu đổi mật khẩu lần đầu. Với volume đã tồn tại, biến `SEQ_FIRSTRUN_*` không thay mật khẩu đã lưu. Cập nhật bản ghi mật khẩu local sau khi đổi; không xóa volume để reset tài khoản.

**Workspace hiện tại:** đã tạo `.env.seq.local` bằng mật khẩu ngẫu nhiên và hoàn tất đổi mật khẩu lần đầu. File này chứa mật khẩu đăng nhập hiện tại, không đưa vào commit. Seq đã được khởi động; tiến trình API dùng kiểm thử đã được dừng sau khi chạy smoke/load.

Quyền Admin của ứng dụng không tự cấp quyền Seq. Chỉ cấp tài khoản Seq cho người vận hành được phép xem log. Đề xuất đặt retention Development **7 ngày** trong Settings của Seq; production dùng retention của collector theo chính sách triển khai. Retention 7 ngày là đề xuất vận hành, chưa tự động áp dụng vào dữ liệu hiện có. Nếu bật yêu cầu API key cho ingestion, cấu hình `Observability__Seq__ApiKey` tương ứng.

## 4. Chạy API và frontend

API vẫn cần cấu hình PostgreSQL và MinIO như trước. Cổng PostgreSQL phải khớp Compose trên máy: workspace kiểm thử dùng **5434**, khác giá trị 5433 trong `appsettings.Development.json`. Không sửa cấu hình database của thành viên khác; override bằng biến môi trường:

```powershell
$env:ConnectionStrings__DefaultConnection = '<connection-string-local>'
$env:Minio__AccessKey = '<access-key-local>'
$env:Minio__SecretKey = '<secret-key-local>'
dotnet run --project Culinary_Blog_Nhom5/src/CulinaryBlog.API --launch-profile http
```

Không bật `Database:SeedOnStartup` cho kiểm thử logging. API không thêm migration nghiệp vụ trong thay đổi này. Hangfire vẫn chạy theo cấu hình ứng dụng hiện hữu.

Ở `Culinary_Blog_Nhom5/culinary-blog-web`:

```powershell
npm run dev
```

API cần hoạt động trước `npm run build` vì các trang static hiện có gọi API khi prerender. Nếu API tắt, build có thể thất bại tại `/categories`; đây là phụ thuộc của các trang hiện tại, không phải lỗi TypeScript/logger.

## 5. Demo và truy vấn

```powershell
Invoke-WebRequest http://localhost:5156/api/v1/categories -Headers @{'X-Correlation-ID'='obs-demo-001'}
Invoke-WebRequest http://localhost:5156/route-khong-ton-tai -Headers @{'X-Correlation-ID'='obs-demo-404'} -SkipHttpErrorCheck
```

Trong Seq, tìm theo các biểu thức:

```text
CorrelationId = 'obs-demo-001'
StatusCode >= 500
Elapsed > 1000
UserId = '<id-tai-khoan-test>'
EventType = 'HttpRequestCompleted'
```

Một request đi qua MediatR có thể có một `ApplicationRequestCompleted` và một `HttpRequestCompleted`; đây là hai lớp đo khác nhau, không phải duplicate HTTP log. Kiểm thử authenticated/4xx/5xx/slow boundary trong test project sử dụng endpoint và danh tính giả **chỉ trong test host**, không thêm endpoint gây lỗi vào API thật.

Muốn tắt Seq nhưng vẫn ghi JSON console:

```powershell
$env:Observability__Seq__Enabled = 'false'
```

Nếu Seq ngừng hoạt động, API vẫn phục vụ; event chờ trong queue có giới hạn được gửi lại khi kết nối phục hồi. Không đưa Seq vào dependency bắt buộc của request.

## 6. Kiểm thử tự động

Từ gốc repo:

```powershell
dotnet build Culinary_Blog_Nhom5/Culinary_Blog_Nhom5.sln
dotnet test Culinary_Blog_Nhom5/Culinary_Blog_Nhom5.sln
```

Từ thư mục frontend:

```powershell
npm run test:logging
npm run lint
npm run build
```

Test client dùng TypeScript + Node test runner có sẵn, không thêm npm dependency. File biên dịch test nằm trong `build/logging-tests` và không commit. Backend TestHost không kết nối PostgreSQL/MinIO/Hangfire thật.

Trên máy kiểm thử, npm shim trong profile người dùng bị thiếu file. Đã dùng các lệnh tương đương trực tiếp, không sửa cài đặt Node của máy:

```powershell
node node_modules/typescript/bin/tsc -p tsconfig.logging-tests.json
node --test build/logging-tests/tests/logging.test.js
node node_modules/eslint/bin/eslint.js .
node node_modules/next/dist/bin/next build
```

## 7. Kết quả ngày 06/10/2026

| Hạng mục | Kết quả |
|---|---|
| Backend build | Thành công, không lỗi/cảnh báo |
| Backend tests | **33/33 pass**: header validation, status 200/401/403/404/409/422/423/429/500, CQRS success/failure/cancel, scope isolation, response đã bắt đầu, user trong exception, ngưỡng 999/1000/1001 ms, options invalid, redaction |
| Client tests | **8/8 pass**: JSON allowlist, bỏ query/credentials, runtime deduplication, correlation ưu tiên header → body → request, HTTP/network/timeout/cancel, giữ rejection identity |
| ESLint / TypeScript | Pass |
| Next production build | Pass khi API đang hoạt động; build đầu tiên khi API tắt thất bại do prerender gọi API |
| API thật | `GET /api/v1/categories` trả 200, header giữ đúng `obs-smoke-20261006` |
| Seq thật | Truy vấn bằng tài khoản admin thấy 1 HTTP completion và 1 CQRS completion cùng ID; HTTP event đủ field và UserId null |
| Seq outage/recovery | Dừng Seq → API vẫn 200; khởi động lại → truy vấn thấy đủ 2 event của `obs-seq-outage-20261006` |
| Đồng thời | Test 100 request không lẫn user/correlation |
| Tải local | 300 GET categories, concurrency 100, 0 lỗi; p50 **245,3 ms**, p95 **508,5 ms**, p99 **552,4 ms** (đo phía client, sau warmup) |
| Git | Fetch origin và kiểm tra nhánh hiện tại: ahead 0 / behind 0 tại thời điểm rà soát; `git diff --check` sạch |

**Giới hạn:** Chưa có phép đo trước/sau trên cùng deployment để kết luận overhead, chưa đo coverage Application >=80%, chưa chứng nhận NFR production. p95 local ở lần đo này hơi cao hơn mục tiêu 500 ms; endpoint này chưa chứng minh là cache hit. Các tests đảm bảo chức năng logging; không tuyên bố hoàn thành toàn bộ health/tracing/caching. Error boundary đã qua lint/typecheck/build; chưa chạy kiểm thử tương tác browser tự động.

## 8. Phạm vi commit và phối hợp

- Không commit `.env.seq.local`, `bin/`, `obj/`, `build/`, `.nuget-packages/`, `.local-build-profile/`, tài liệu cá nhân hoặc các thư mục Postman không thuộc thay đổi này.
- `docker-compose.yml` có thay đổi từ trước và đã giữ nguyên; dùng riêng `compose.observability.yml` cho Seq.
- Các điểm cần phối hợp khi merge: `Program.cs` (thứ tự middleware, DI recurring job), `GlobalExceptionMiddleware.cs`, `LoggingBehavior.cs`, `axiosClient.ts`, file solution thêm tests. Phần logic mới chủ yếu nằm trong file riêng.
- Chưa tạo commit/push. Nhánh đang đồng bộ upstream tại thời điểm kiểm tra; không thể bảo đảm không xung đột với commit mới của người khác sau đó. Trước commit/merge, fetch lại và kiểm tra diff; không dùng `git add .` khi còn các file local không liên quan.

## 9. Tài liệu kỹ thuật

- [Serilog.AspNetCore — request logging và bootstrap](https://github.com/serilog/serilog-aspnetcore)
- [Datalust Seq sink — buffering và flush](https://github.com/datalust/serilog-sinks-seq)
- Hướng dẫn Next.js đã đọc từ `culinary-blog-web/node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md` và `01-app/03-api-reference/03-file-conventions/error.md`; dùng `retry()` cho phiên bản Next hiện tại.
