# Báo cáo thực hiện HT-07 đến HT-11

- Ngày chạy: 2026-11-16 (Asia/Bangkok)
- Base commit: `2ee1915717a513b8191badc9530b0df7830fe851`
- Working-tree identity lúc bắt đầu rà soát: `3b634f2a355582f111ddef3e7200a4a0b78d6b1d`
- Máy: Dell Inspiron 5593, 8 logical processors, 8.35 GB RAM; Windows 10.0.19043; .NET SDK 10.0.401; Node 22.19.0; npm 10.9.3; Docker Engine 20.10.12; Compose 2.2.3.

Báo cáo này phân biệt kết quả kiểm tra local với nghiệm thu môi trường thật. Không đổi `MissingEvidence` thành `Verified` cho điều kiện chưa được quan sát.

## HT-07 — Cache

Thiết kế dùng `IPublicContentCache`/`PublicContentCache` và `IRecipeCacheInvalidator`/`RecipeCacheInvalidator`; MediatR chỉ đăng ký Logging và Validation. Public cache dùng version key, cache-aside và fallback database; query quản lý Owner/Admin không dùng shared public cache. TTL backend mặc định: category 45 phút, detail 60 phút, list/search 3 phút. Next.js và TanStack Query có policy/invalidation riêng như đặc tả §4 và §7.3.5.

Kết quả chạy local:

- `PublicContentCacheTests`: 6/6 đạt — cache hit, recipe/category version invalidation, detail/list round-trip, Redis read/write failure fallback.
- `PublicCacheRecoveryTests`: 2/2 đạt — invalidation hỏng được sửa trước read sau khi cache phục hồi; generation cũ không xóa generation mới.
- `CulinaryBlog.Observability.Tests`: 78/78 đạt sau khi sửa explicit service binding của Admin endpoint.
- Frontend security contract: 12/12 đạt, gồm protected UI không shared-cache và public/private cache boundary; mutation hooks/revalidation contract được giữ ở test frontend hiện có.

Giới hạn đã chấp nhận trong ADR-0002: pending invalidation nằm trong process, không phải durable queue qua restart hoặc toàn cluster. TTL và durable `cache_epoch` giới hạn/điều phối các trường hợp còn lại; không tuyên bố loại bỏ tuyệt đối stale read.

## HT-08 — Hiệu năng và database

Tooling dùng project Docker cô lập `culinary-ht08`, dataset 5.000 recipe, hai API sau gateway và giới hạn tổng 2 CPU/4 GiB theo cấu hình. `prepare` đã tạo fixture; kết quả các lượt load/query plan được bổ sung vào chính báo cáo này sau khi stack build thành công. Smoke không được dùng làm bằng chứng latency/load.

SQL capture và `EXPLAIN ANALYZE` trên dataset 5.000 recipe:

| Luồng | Query count | Max execution page size 12 | Max execution page size 50 |
|---|---:|---:|---:|
| list | 2 | 19,084 ms | 13,311 ms |
| search | 2 | 21,095 ms | 54,559 ms |
| category | 3 | 3,248 ms | 2,977 ms |
| detail | 1 | 0,887 ms | 0,682 ms |

Query count không tăng theo số item trong page và khớp baseline 2/2/3/1, nên không quan sát thấy N+1 trong bốn luồng đo. File gốc: `build/issue85/query-plans.json`.

Smoke 2 VU hoàn thành 73 iteration/1.866 HTTP request, 586 endpoint check với 100% check đạt và 0 correctness error. API metric có median 32,95 ms, p95 411,21 ms, p99 932,65 ms; đây chỉ là functional smoke, không dùng để chứng nhận NFR tải. Cache application-read window hợp lệ, hit rate 73,72%; ngưỡng 80% không áp cho smoke có mutation.

Trạng thái nghiệm thu định lượng: **chưa đủ bằng chứng** cho ba lượt warm độc lập, 100 VU, p50 cache-hit, p95/p99, hit rate steady-state và query plans trên working tree cuối.

## HT-09 — UI, responsive và accessibility

Kết quả local trên production route-state fixture:

- Route error/global error, retry, 404/noindex, streamed loading, empty/error states, permission state, pagination và 320 px: đạt.
- Axe WCAG 2.1 A/AA, keyboard/focus/dialog/escape, labels, forced colors, reduced motion và overflow ở 320/375/768/1024/1200: đạt trên Chromium 151, Firefox 153 và WebKit 26.5.
- Kiểm tra trực quan screenshot dialog 320 px và trạng thái dashboard empty không thấy clipping/overflow hoặc nội dung bị che; đây không thay thế screen-reader audit.
- Critical browser register/login/create/publish/search phải được chạy lại sau bản sửa host để chốt working tree cuối.

Automation không chứng minh toàn bộ WCAG. **Chưa có** audit thủ công NVDA/VoiceOver, BrowserStack iOS/Android và đánh giá thị giác bởi reviewer trên môi trường production thật.

## HT-10 — Triển khai và vận hành

Topology, URL, TLS termination, migration, secret/CORS/cookie policy, dependency degradation, backup schedule/retention và restore procedure được chốt tại [Runbook_HT10_Deployment_Operations.md](./Runbook_HT10_Deployment_Operations.md).

Secret scan lịch sử đầy đủ và npm audit trong lượt 16/11 đạt. Không có Google/SMTP/age/public-origin credentials nghiệm thu trong process hiện tại; vì vậy không giả lập kết quả provider. Reliability drill local cần chạy lại sau bản sửa host. Lịch backup production, ACL kho backup và cửa sổ uptime 99,5% cần evidence từ môi trường được chỉ định.

## HT-11 — Đặc tả và hồ sơ

Đặc tả 1.4.0 đã:

- tách baseline 21/09 khỏi hiện trạng;
- đồng bộ publish gate cho step/ingredient và chốt ingredient là điều kiện tại transition publish;
- thống nhất cảnh báo slow request 500 ms với mục tiêu p99 1.000 ms;
- sửa Category 1:N Recipe, làm rõ CQRS và giới hạn của HttpOnly;
- lấy phiên bản frontend từ package/lockfile, mô tả ba lớp cache;
- ghi nhận HT-03/04/06/07 qua contract và ADR-0001/0002/0003.

CHANGELOG và acceptance checklist đã được cập nhật. Thay đổi yêu cầu theo ADR-0003 có căn cứ người dùng ngày 16/11; các kết quả còn thiếu không được tự chuyển sang Verified.

