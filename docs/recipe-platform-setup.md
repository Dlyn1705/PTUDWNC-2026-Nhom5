# Thiết lập cho nhóm chức năng công thức

## Phạm vi

Tìm kiếm toàn văn bản; lọc/sắp xếp/phân trang; upload/xóa ảnh MinIO;
logging/tracing/metrics; publish/unpublish/archive/restore.
Tái sử dụng cấu trúc Next.js và các thư viện đã có, không nâng phiên bản hoặc đổi lockfile.

## Bảo mật và hợp đồng API

- CORS lấy danh sách origin chính xác từ `Cors:AllowedOrigins`. Cho phép browser đọc
  `X-Correlation-ID` và `Retry-After`. Khi triển khai, đặt origin của frontend bằng
  `Cors__AllowedOrigins__0`; cấu hình toàn bộ mảng origin cho môi trường tương ứng.
- JWT xác thực issuer, audience, chữ ký và thời hạn. `Jwt__Key` phải có ít nhất
  32 byte; khóa mẫu cũ bị từ chối ngoài Development. Cấu hình hiện tại yêu cầu khóa riêng từ environment/user secrets.
- Upload, xóa ảnh, đọc trạng thái ảnh và các thao tác trạng thái yêu cầu Author/Admin;
  kiểm tra quyền chủ sở hữu/Admin hiện có vẫn chạy tại handler/endpoint.
- Đọc/tìm kiếm: tổng cộng 120 request/phút/người dùng (khách dùng IP).
  Xóa ảnh và đổi trạng thái: tổng cộng 30 request/phút/người dùng.
  Upload giữ mức 5/phút/IP; auth giữ 10/phút/IP.
- Khi vượt giới hạn: HTTP 429, ProblemDetails và `Retry-After`.
  Không tự động retry thao tác ghi. Bộ đếm nằm trong từng API instance;
  nếu chạy nhiều replica, bổ sung giới hạn tổng tại API gateway.
- Không tin `X-Forwarded-For` do client gửi; khi dùng reverse proxy cần cấu hình
  proxy tin cậy trước khi dùng địa chỉ IP chuyển tiếp.
- Versioning theo URL: `/api/v1/recipes`. Không đổi URL đang được các thành viên khác
  sử dụng. Breaking change phải tạo `/api/v2`, giữ v1 trong giai đoạn chuyển đổi.
  Tích hợp Asp.Versioning hiện có trên main, đọc phiên bản từ URL segment và sinh tài liệu theo phiên bản; không dùng query/header version negotiation.
- Development: `/openapi/v1.json` là đặc tả sinh từ endpoint;
  `/scalar/v1` là giao diện xem/thử API. Bearer JWT chỉ được yêu cầu trên thao tác
  có metadata authorization. Production không công khai hai endpoint tài liệu này.

## Môi trường và thư viện

Backend: .NET 10, PostgreSQL, MinIO; cấu hình riêng bằng environment/user secrets:

```text
ASPNETCORE_ENVIRONMENT=Development
ConnectionStrings__DefaultConnection=<chuỗi kết nối PostgreSQL>
Jwt__Key=<khóa ngẫu nhiên riêng, ít nhất 32 byte>
Minio__Endpoint=localhost:9000
Minio__AccessKey=<access key>
Minio__SecretKey=<secret key>
```

Dùng cấu hình Docker/observability hiện có của repository. Bật tracing/metrics bằng
`Observability__OpenTelemetry__Enabled=true`, đặt `OTEL_EXPORTER_OTLP_ENDPOINT`
trỏ tới collector. Seq dùng cấu hình `Observability:Seq` hiện có.
Không đưa khóa MinIO/JWT hoặc địa chỉ collector vào biến `NEXT_PUBLIC_*`.

Frontend, từ `Culinary_Blog_Nhom5/culinary-blog-web`:

```powershell
npm ci
Copy-Item .env.example .env.local # Chỉ chạy khi chưa có .env.local
npm run dev
```

Đặt `AUTH_SECRET` riêng; `NEXT_PUBLIC_API_URL` là origin API mà browser truy cập,
`API_INTERNAL_URL` là origin API cho server. Không thêm `/api/v1` vào hai biến này
vì API client đã có đường dẫn phiên bản. Biến public được đóng gói lúc build.
Không ghi đè `.env.local` hiện có và không commit secrets.

Dependencies đã khai báo đầy đủ: Next.js/React/TypeScript, Axios, Zod,
React Hook Form, TanStack Query, NextAuth, Zustand và thư viện giao diện.
Backend đã có JWT Bearer, OpenAPI/Scalar, MinIO, Serilog/Seq và OpenTelemetry.
Rate limiting dùng ASP.NET Core có sẵn. Không cần package mới cho thay đổi này.

## Cấu trúc frontend và cách dùng

- `app/`: trang và layout hiện có.
- `components/`: giao diện; `hooks/`: logic React dùng lại.
- `lib/api/axiosClient.ts`: session Bearer, timeout, correlation và structured log.
- `lib/api/recipeManagementApi.ts`: danh sách phân trang và thao tác trạng thái,
  trả lỗi thật thay vì dữ liệu giả. Dùng trong browser với session hiện có.
- `lib/api/fileApi.ts`: upload multipart, theo dõi trạng thái xử lý và xóa ảnh.
- `types/recipe-management.types.ts`: hợp đồng ảnh lưu trữ, tham số danh sách,
  kết quả đổi trạng thái và ProblemDetails.
- `types/api.types.ts`, `types/recipe.types.ts`: tái sử dụng hợp đồng tìm kiếm,
  phân trang và enum; Draft=0, Published=1, Archived=2.

```ts
import { listPublicRecipes, changeRecipeState } from "@/lib/api/recipeManagementApi";

const page = await listPublicRecipes({ page: 1, pageSize: 12, sortBy: "cookTime", sortOrder: "asc" });
const state = await changeRecipeState(recipeId, "archive");
```

Ảnh lưu trữ có `originalUrl`, `mediumUrl`, `thumbnailUrl`, `processingStatus`;
khác DTO ảnh hiển thị (`url`). Export kiểu cũ từ `fileApi.ts` được giữ để không
phá các component đang import. Upload bỏ header JSON mặc định để browser tự tạo
multipart boundary. API client trạng thái mới là điểm tích hợp dùng lại; không thay
thế các trang dashboard do thành viên khác đang phụ trách.

## Kiểm tra và commit

```powershell
dotnet restore Culinary_Blog_Nhom5/tests/CulinaryBlog.Observability.Tests
dotnet test Culinary_Blog_Nhom5/tests/CulinaryBlog.Observability.Tests --no-restore
# Trong thư mục frontend:
npx tsc --noEmit --incremental false
npm run test:logging
```

Thay đổi chủ yếu nằm trong file mới. Các điểm sửa chung giới hạn ở:
`Program.cs` (đăng ký, CORS, khóa JWT), `RecipeEndpoints.cs` (metadata giới hạn),
`fileApi.ts` (import types và multipart).
Không đổi migration, schema DB, package/lockfile, layout hoặc trang của thành viên khác.

Trước commit: xem `git diff --check` và `git diff`; chỉ stage các file thuộc thay đổi
này cùng tài liệu và kiểm thử mới. Không stage `.env.local`, `bin`, `obj`, `build`,
`node_modules` hoặc `tsconfig.tsbuildinfo`. Sau commit có thể fetch/rebase theo nhánh
nhóm và chạy lại kiểm thử. Không thể đảm bảo tuyệt đối không conflict nếu người khác
cũng sửa đúng các dòng dùng chung; không force-push nhánh nhóm.

Kiểm thử tự động xác nhận 429/Retry-After và security/version trong OpenAPI, cùng bộ
kiểm thử logging hiện có. Cần kiểm thử tích hợp với PostgreSQL/MinIO đang chạy trước
khi triển khai để xác nhận upload, xóa object và chuyển trạng thái thực tế.
