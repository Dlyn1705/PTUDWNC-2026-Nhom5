# Kế hoạch hoàn thiện FR-OBS-003 — Distributed Tracing & Metrics

**Ngày phân tích:** 06/10/2026.
**Phạm vi:** Tích hợp OpenTelemetry để cung cấp Distributed Tracing và Metrics cho hệ thống Backend, phục vụ giám sát hiệu năng, theo dõi giao dịch phân tán và đo lường các chỉ số NFR.

## 1. Căn cứ từ Đặc tả (Culinary_Blog_Spec.md)

- **Mục 7.5 (Triển khai và vận hành):** Yêu cầu cấu hình OpenTelemetry cho HTTP request, EF Core, và custom metrics (đếm số lượng recipe created/published).
- **Mục 8 (Yêu cầu phi chức năng):** 
  - Hiệu năng API: p50 <= 150 ms (GET cache hit), p95 <= 500 ms, p99 <= 1.000 ms.
  - Tỉ lệ Redis hit rate mục tiêu >= 80% ở steady state.
- **Mục 7.2 & FR-OBS-002:** Structured Logging đã triển khai cung cấp `TraceId`, `SpanId` (nếu `Activity.Current` tồn tại). Distributed tracing sẽ cung cấp context (Activity) để log được đính kèm đúng Trace ID.

## 2. Phạm vi triển khai

1. **Distributed Tracing (Truy vết phân tán):**
   - Theo dõi luồng xử lý từ lúc nhận HTTP Request (API) đi qua Application (MediatR), truy vấn CSDL (EF Core), gọi Redis (Caching), đến các Background Jobs (Hangfire).
   - Tự động sinh và truyền `TraceId`, `SpanId` theo chuẩn W3C Trace Context.
2. **Metrics (Đo lường chỉ số):**
   - System/Framework Metrics: Thu thập thời gian phản hồi HTTP, EF Core query execution time, memory usage.
   - Custom Business Metrics: Bộ đếm (Counter) cho số lượng Recipe được tạo (`recipe.created`) và xuất bản (`recipe.published`).
3. **Export và Quan sát:**
   - Cấu hình OpenTelemetry Protocol (OTLP) Exporter để xuất dữ liệu tracing và metrics ra hệ thống collector (vd: Prometheus, Jaeger, hoặc APM tools tùy môi trường triển khai thực tế). Local testing có thể dùng Console Exporter hoặc container (Jaeger/Prometheus) trong docker-compose.

## 3. Thiết kế kỹ thuật

### 3.1 Cài đặt thư viện OpenTelemetry
Bổ sung các package vào `CulinaryBlog.API`:
- `OpenTelemetry.Extensions.Hosting`
- `OpenTelemetry.Instrumentation.AspNetCore` (HTTP Requests tracing)
- `OpenTelemetry.Instrumentation.Http` (Outbound HTTP)
- `OpenTelemetry.Instrumentation.EntityFrameworkCore` (EF Core tracing)
- `OpenTelemetry.Instrumentation.StackExchangeRedis` (Redis tracing - tùy chọn)
- `OpenTelemetry.Exporter.OpenTelemetryProtocol` (OTLP Exporter)
- `OpenTelemetry.Exporter.Console` (cho Development/Debug)

### 3.2 Khởi tạo Custom Metrics
Định nghĩa một lớp `DiagnosticsConfig` hoặc `InstrumentationOptions` chứa `Meter` dùng chung:
- Khởi tạo Meter: `new Meter("CulinaryBlog.Domain.Metrics", "1.0.0")`
- Khởi tạo các Counters: `RecipeCreatedCounter`, `RecipePublishedCounter`.
- Tại các Handlers tương ứng (`CreateRecipeCommandHandler`, `PublishRecipeCommandHandler`), gọi `Counter.Add(1, tags)` sau khi lưu database thành công.

### 3.3 Cấu hình Pipeline (Program.cs / DependencyInjection)
```csharp
builder.Services.AddOpenTelemetry()
    .WithTracing(tracing => tracing
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddEntityFrameworkCoreInstrumentation()
        // .AddRedisInstrumentation() (nếu dùng chung IConnectionMultiplexer)
        .AddOtlpExporter()
    )
    .WithMetrics(metrics => metrics
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddRuntimeInstrumentation()
        .AddMeter("CulinaryBlog.Domain.Metrics") // Custom meter for recipe logic
        .AddOtlpExporter()
    );
```

### 3.4 Đồng bộ với Structured Logging
- Đảm bảo `Serilog` đọc `TraceId` và `SpanId` từ `Activity.Current` và đưa vào log event (đã hỗ trợ qua `SafeLogSink` và enricher).
- `CorrelationId` từ `FR-OBS-002` phục vụ tra cứu mức HTTP, còn `TraceId` dùng để nối chuỗi phân tán đa dịch vụ/thành phần.

## 4. Cấu hình & Môi trường

- Khai báo OTLP Endpoint qua `appsettings.json` hoặc Environment Variable: `OTEL_EXPORTER_OTLP_ENDPOINT`.
- Tách biệt cấu hình: Có thể cấu hình bật/tắt tracing/metrics qua appsettings (`Observability:OpenTelemetry:Enabled`) để tối ưu chi phí hạ tầng khi chưa cần thiết.
- Tích hợp hạ tầng local: Bổ sung `jaeger` hoặc `prometheus` vào `compose.observability.yml` để dev nghiệm thu trực quan.

## 5. Kiểm thử & Nghiệm thu

- [ ] HTTP GET request sinh ra Trace Span với đầy đủ nhãn (tags) của request: url, method, status code.
- [ ] Các thao tác lấy dữ liệu sinh ra Span con từ EF Core (đoạn SQL query/thông tin DB).
- [ ] Luồng tạo Recipe thành công gọi `.Add(1)` trên metric `recipe.created`.
- [ ] Luồng publish Recipe thành công gọi `.Add(1)` trên metric `recipe.published`.
- [ ] Dữ liệu trace/metrics được xuất ra console (nếu cấu hình debug) hoặc OTLP endpoint cấu hình.
- [ ] `TraceId` tự động gắn vào các log được ghi thông qua Serilog trong context của một span HTTP/Background Job.
