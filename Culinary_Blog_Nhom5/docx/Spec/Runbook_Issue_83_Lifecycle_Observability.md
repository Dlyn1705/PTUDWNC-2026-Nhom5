# Recipe lifecycle và observability — Issue #83

## Contract

Draft chỉ publish khi có ít nhất một step và một ingredient active (`IsDeleted=false`). Đây là bổ sung nghiệp vụ của Issue #83 so với SRS FR-RCP-005 chỉ nêu step. Thiếu dữ liệu trả `422 application/problem+json` với `errors.steps`/`errors.ingredients`; thiếu cả hai trả cả hai field. Không đổi status/version/timestamp hoặc tăng counter khi bị từ chối.

| Endpoint PATCH `/api/v1/recipes/{id}/...` | Draft | Published | Archived |
|---|---|---|---|
| publish | 200 nếu đủ child, 422 nếu thiếu | 200 idempotent | 409 |
| unpublish | 200 idempotent | 200 → Draft | 409 |
| archive | 200 → Archived | 200 → Archived | 200 idempotent |
| unarchive | 409 | 409 | 200 → Draft |

Chỉ Owner/Admin được thao tác. HTTP Guest trả 401, Author khác/Reader trả 403, ID không tồn tại hoặc đã xóa mềm trả 404. Success giữ wrapper `{ data: { id, status, publishedAt, updatedAt } }`. Restore trong UI gọi `/unarchive`, không phải `/restore` và không phục hồi bản ghi IsDeleted.

Publish lặp không đổi PublishedAt/version/counter. Unpublish/Unarchive clear PublishedAt; Archive giữ lịch sử PublishedAt. Giữ quyền xóa ingredient cuối theo FR-RCP-009; không tự unpublish legacy recipe hoặc áp invariant Published luôn phải có ingredient. Điều kiện được kiểm tra tại thời điểm Draft → Published. Last-step invariant vẫn được giữ.

Publish và các transition dùng khóa Recipe/transaction; mutation child tiếp tục dùng If-Match/ETag hiện tại. Lifecycle không bổ sung If-Match bắt buộc. Không có migration mới hoặc thay đổi dữ liệu hàng loạt.

## Dashboard và cache

`/dashboard/recipes?status=0&page=1` lọc Nháp; `status=1` Published, `status=2` Archived, không có status là Tất cả. Đổi tab về trang 1; URL hỗ trợ reload/back/forward. Mỗi hành động có confirmation, pending ngăn gửi trùng, lỗi không đóng modal; lỗi publish hướng tới editor để bổ sung child.

Mutation thành công await invalidate recipe/category query keys và refresh server route. Public list/search/detail/category/count được invalidation sau commit. Sitemap hiện force-dynamic/no-store, đọc cùng public API; không dựng cache Next thứ hai. Nếu trang sau mutation không còn mục, UI có đường quay về trang đầu.

Invalidation Redis thất bại được giữ bằng generation trong singleton `PendingPublicCacheInvalidations`. Trước khi instance này đọc Redis đã phục hồi, nó xoay version lại rồi mới đọc cache, tránh dùng kết quả public cũ. Khi chưa sửa được version, cache read dùng token riêng và fallback DB. Generation cũ không xóa pending mới.

Giới hạn: pending state là trong bộ nhớ một instance; không phải outbox hoặc distributed invalidation durable. Nếu instance chết trong lúc Redis down, hoặc instance khác chưa biết invalidation thất bại, TTL vẫn là giới hạn staleness. Triển khai nhiều instance cần nghiệm thu thêm cơ chế durable/shared invalidation nếu yêu cầu read-after-write tuyệt đối trong tình huống này.

## Logging

Request/use case success **trên** 500 ms phát Warning; đúng 500 ms chưa phải slow. 4xx/cancel vẫn Warning; 5xx Error. Default và `Observability:SlowRequestThresholdMs` đều là 500.

Console, File và Seq đều đứng sau `SafeLogSink`. Message literal được thay bằng template cố định, dữ liệu chẩn đoán ở structured fields. Chỉ giữ field allowlist và scalar phù hợp; object/array ngoài schema bị redacted. Không xuất exception message/Data/inner exception/stack trace; giữ ExceptionType. RequestPath/Path dùng route template, không dùng URL chứa slug/id/query thực; UserId là định danh kỹ thuật, email không được giữ làm UserId.

Ví dụ cấu hình qua environment:

```powershell
$env:Observability__SlowRequestThresholdMs = '500'
$env:Observability__File__Enabled = 'true'
$env:Observability__File__Directory = 'logs'
$env:Observability__File__InstanceName = 'api-1'
$env:Observability__File__RetainedFileCountLimit = '14'
$env:Observability__File__FileSizeLimitBytes = '20971520'
```

File JSON `culinary-api-1-<yyyyMMdd>[_sequence].json` rolling daily, roll thêm khi đầy 20 MB, giữ tối đa 14 file cho prefix của instance, xấp xỉ tối đa 280 MB. Đây là **14 file**, không phải 14 ngày nếu một ngày có nhiều lần roll. Mỗi replica có Directory riêng hoặc InstanceName ổn định khác nhau; không dùng PID làm prefix để retention còn hiệu lực qua restart.

Directory tương đối tính theo content root API; không nằm trong wwwroot. Ứng dụng kiểm tra cấu hình, tạo directory và thử quyền ghi khi khởi động; cấu hình/path/quyền không hợp lệ phải được sửa trước khi chạy. Mount persistent volume nếu muốn giữ log qua container restart; cấp quyền ghi tối thiểu cho user chạy API. Không đưa log vào web static hoặc Git. File không buffer, logger được dispose/flush khi host dừng.

Seq giữ chính sách SRS: chỉ bật sink khi môi trường Development và `Observability:Seq:Enabled=true`; URL mặc định localhost:5341. API key dùng environment/User Secrets, không ghi trong source:

```powershell
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:Observability__Seq__Enabled = 'true'
$env:Observability__Seq__ServerUrl = 'http://localhost:5341'
```

Bootstrap logger chỉ Console và cũng sanitized. Không dùng `ReadFrom.Configuration` để tự thêm raw sink vượt qua lớp lọc.

## Tracing và metrics

X-Correlation-ID được giữ nếu hợp lệ, sinh mới nếu thiếu/sai, trả cả trên error/rate-limit. HTTP và Application completion có CorrelationId/UserId/TraceId/SpanId khi Activity tồn tại. CorrelationId không bị giả thành TraceId.

```powershell
$env:Observability__OpenTelemetry__Enabled = 'true'
$env:Observability__OpenTelemetry__Protocol = 'http/protobuf'
$env:Observability__OpenTelemetry__Endpoint = 'http://localhost:4318'
$env:Observability__OpenTelemetry__UseConsoleExporter = 'false'
```

Endpoint trong cấu hình trên là base URL; HTTP/protobuf thêm `/v1/traces` và `/v1/metrics`. Không cấu hình phần này thì exporter giữ behavior SDK/biến `OTEL_EXPORTER_OTLP_*` (mặc định gRPC). Đặt token qua OTLP headers/secret environment; không đặt token trong URL được chia sẻ.

ASP.NET/HttpClient/EF instrumentation dùng chung trace pipeline. `SafeTelemetryProcessor` lọc tag theo allowlist, bỏ URL/query/SQL text/PII, làm sạch DisplayName/status description/tracestate trước exporter. Activity không có API xóa events/links: span chứa container payload chưa được duyệt sẽ bị bỏ cờ Recorded trước exporter, thay vì xuất exception data không an toàn. ASP.NET RecordException tắt. Không thêm custom span trùng HTTP root.

Metric giữ aggregate nhưng bỏ tag keys có thể tạo cardinality/PII không kiểm soát. Counter recipe.published chỉ tăng ở transition thật. OTel tắt không khởi tạo exporter. Seq log ingestion và OTLP receiver là hai đường độc lập; có log Seq chưa chứng minh có trace.

## Kiểm thử

Theo README, dùng server PostgreSQL test có quyền tạo/xóa DB riêng, thiết lập `STEPS_TEST_CONNECTION`, `INGREDIENTS_TEST_CONNECTION`, `SEARCH_TEST_CONNECTION`, `RECIPE_UPDATE_TEST_CONNECTION`, `RECIPE_DELETION_TEST_CONNECTION` theo suite. Không dùng database production hoặc ghi connection string thật vào log/Git.

```powershell
# Tại Culinary_Blog_Nhom5
dotnet test tests/CulinaryBlog.Steps.Tests/CulinaryBlog.Steps.Tests.csproj
dotnet test tests/CulinaryBlog.Observability.Tests/CulinaryBlog.Observability.Tests.csproj
dotnet test tests/CulinaryBlog.Ingredients.Tests/CulinaryBlog.Ingredients.Tests.csproj
dotnet test tests/CulinaryBlog.Search.Tests/CulinaryBlog.Search.Tests.csproj
dotnet test tests/CulinaryBlog.RecipeUpdate.Tests/CulinaryBlog.RecipeUpdate.Tests.csproj
dotnet test tests/CulinaryBlog.RecipeDeletion.Tests/CulinaryBlog.RecipeDeletion.Tests.csproj
```

Observability suite mặc định chạy Seq HTTP receiver và distributed-memory khi chưa có live endpoints. Muốn nghiệm thu thật, cung cấp `ISSUE83_SEQ_URL`, `ISSUE83_REDIS_URL`; `OBS_TEST_CONNECTION` cho EF query read-only trên server test. Test Seq đọc lại event đã ingest, Redis dùng namespace GUID riêng và xóa key test, OTLP dùng local HTTP/protobuf receiver thực nhận byte trace/metric; không giả định có collector nếu chỉ thấy cấu hình bật.

```powershell
# Tại culinary-blog-web; LIFECYCLE_TEST_CONNECTION trỏ server PostgreSQL test
npm run typecheck
npm run lint
npm run build
npm run test:api
npm run test:logging
npm run test:common
npm run test:e2e:lifecycle
npm run test:e2e:states
npm run test:a11y
```

E2E lifecycle tự build Next production fixture dùng page/components thật và API/CQRS/repository/migrations thật, tạo DB `culinary_lifecycle_test_<guid>` riêng rồi cleanup. Auth/control chỉ tồn tại trong project test, không được thêm vào Program.cs production. Playwright mặc định dùng Edge; đặt `BROWSER_CHANNEL=chromium` trong CI sau khi cài Chromium. Ảnh kiểm chứng nằm ở `build/lifecycle-fixture/lifecycle-mobile.png`, không đưa cả thư mục build vào Git.

Đặt `LIFECYCLE_TEST_REDIS_URL` để host E2E dùng Redis thật thay vì memory; key dùng namespace theo GUID database test, không dùng namespace production. Sau `npm run build`, đặt `LIFECYCLE_SMOKE_ROOT=1` để kiểm tra thêm frontend production thực cho trang chủ/đăng nhập/danh sách/chi tiết và API liveness/readiness; smoke không submit tài khoản/mật khẩu thật. Redis test nên là instance/container disposable; key còn lại có TTL.

Nghiệm thu trực quan trên môi trường đầy đủ: các tab, bốn confirmation, cancel/Escape/focus, pending/double-click, thiếu ingredient/step, Owner/Admin, cache/sitemap và request correlation. Kiểm tra smoke trang chủ/đăng nhập/danh sách/chi tiết/health theo README trước khi đề nghị merge. Ghi rõ môi trường và các phần chưa kiểm chứng, không suy rộng thành bảo đảm production nhiều instance.
