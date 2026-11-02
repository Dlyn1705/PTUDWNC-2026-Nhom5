# Culinary Blog - PTUDWNC 2026 Nhóm 5

Culinary Blog là ứng dụng web full-stack phục vụ việc chia sẻ, tìm kiếm và quản lý công thức nấu ăn. Hệ thống tách frontend và backend qua REST API, được xây dựng theo Clean Architecture kết hợp CQRS.

Tài liệu nghiệp vụ và kiến trúc chính thức: [Culinary_Blog_Spec.md](Culinary_Blog_Nhom5/docx/Spec/Culinary_Blog_Spec.md).

## Chức năng chính

- Khách xem danh mục, xem chi tiết, tìm kiếm, lọc và phân trang công thức đã công khai.
- Người dùng đăng ký, đăng nhập bằng email/mật khẩu và duy trì phiên bằng access token/refresh token.
- Tác giả tạo và quản lý công thức, nguyên liệu, các bước thực hiện, thông tin dinh dưỡng và hình ảnh.
- Quản trị viên quản lý danh mục và nội dung của toàn hệ thống.
- Ảnh được lưu trên MinIO; Redis hỗ trợ cache; Hangfire xử lý tác vụ nền; Seq tập trung log.

## Công nghệ

| Thành phần | Công nghệ |
|---|---|
| Backend | .NET 10, ASP.NET Core Minimal API, Entity Framework Core, MediatR |
| Frontend | Next.js 16.3.5 App Router, React 19, TypeScript, Tailwind CSS 4 |
| Cơ sở dữ liệu | PostgreSQL 16 |
| Cache | Redis 7 |
| Lưu trữ tệp | MinIO (S3-compatible) |
| Tác vụ nền | Hangfire |
| Log | Serilog, Seq |
| Môi trường cục bộ | Docker Compose |

## Cấu trúc dự án

```text
PTUDWNC-2026-Nhom5/
├── docker-compose.yml                 # PostgreSQL, Redis, MinIO và Seq
├── README.md                          # Tổng quan và hướng dẫn chạy
├── CONTRIBUTING.md                    # Quy định branch, commit, push và pull request
└── Culinary_Blog_Nhom5/
    ├── Culinary_Blog_Nhom5.sln        # .NET solution
    ├── run-dev.ps1                    # Chạy full-stack bằng PowerShell
    ├── docx/
    │   └── Spec/
    │       └── Culinary_Blog_Spec.md  # Đặc tả nghiệp vụ và kiến trúc
    ├── src/
    │   ├── CulinaryBlog.Domain/       # Entity, enum, exception và quy tắc nghiệp vụ
    │   ├── CulinaryBlog.Application/  # Use case, CQRS, DTO và contract
    │   ├── CulinaryBlog.Infrastructure/ # EF Core, PostgreSQL, repository, MinIO, JWT
    │   └── CulinaryBlog.API/          # Minimal API, middleware và cấu hình ứng dụng
    └── culinary-blog-web/
        ├── app/                       # Route và layout của Next.js
        ├── components/                # Thành phần giao diện
        ├── hooks/                     # Custom hooks
        ├── lib/                       # API client, auth và tiện ích
        ├── types/                     # Kiểu dữ liệu TypeScript
        └── public/                    # Tài nguyên tĩnh
```

## Yêu cầu môi trường

Cài đặt các công cụ sau trước khi chạy:

- Git.
- Docker Desktop có Docker Compose.
- .NET SDK 10.
- Node.js 20 trở lên và npm.
- PowerShell 5.1 trở lên nếu dùng `run-dev.ps1`.

Kiểm tra nhanh:

```powershell
git --version
docker --version
docker compose version
dotnet --version
node --version
npm --version
```

## Chạy hệ thống trên Windows

Các lệnh dưới đây phản ánh đúng cách hệ thống hiện đang được chạy trong dự án.

### 1. Lấy mã nguồn mới nhất từ `main`

```powershell
git clone https://github.com/Dlyn1705/PTUDWNC-2026-Nhom5.git
cd PTUDWNC-2026-Nhom5
git switch main
git pull --ff-only origin main
```

Nếu đã clone dự án trước đó, chỉ cần chạy ba lệnh cuối.

### 2. Khởi động hạ tầng

Tại thư mục gốc của repository:

Trước khi chạy Docker, sao chép `.env.example` ở gốc repository thành `.env`, rồi đặt `POSTGRES_PASSWORD` và `JWT_KEY` bằng các giá trị bí mật riêng. `run-dev.ps1` đọc `.env`, dùng mật khẩu để kết nối PostgreSQL local và truyền khóa JWT cho API. Với cơ sở dữ liệu đã tồn tại, `POSTGRES_PASSWORD` phải khớp mật khẩu hiện tại cho tới khi bạn chủ động đổi mật khẩu trong PostgreSQL. Không commit `.env`.

Khi chạy API riêng, cung cấp `ConnectionStrings__DefaultConnection` và `Jwt__Key` qua biến môi trường hoặc .NET user secrets. API sẽ dừng lúc khởi động nếu thiếu một trong hai giá trị hoặc khóa JWT ngắn hơn 32 byte.

Khi chạy API ở môi trường Production (hoặc bất kỳ môi trường nào không phải Development), bắt buộc cấu hình ít nhất một origin frontend qua `Cors__AllowedOrigins__0`. Origin phải là URL HTTP(S) chỉ gồm scheme, host và port tùy chọn; không dùng wildcard, path hoặc dấu `/` ở cuối. Nhiều origin dùng các chỉ số tiếp theo (`Cors__AllowedOrigins__1`, `Cors__AllowedOrigins__2`, ...), không dùng chuỗi phân cách bằng dấu phẩy.

Ví dụ cấu hình Production bằng PowerShell:

```powershell
$env:ASPNETCORE_ENVIRONMENT = "Production"
$env:ConnectionStrings__DefaultConnection = "Host=postgres;Port=5432;Database=culinary_blog_db;Username=postgres;Password=<secret>"
$env:Jwt__Key = "<at-least-32-byte-secret>"
$env:Cors__AllowedOrigins__0 = "https://frontend.example.com"
$env:Cors__AllowedOrigins__1 = "https://www.example.com"
dotnet run --project .\Culinary_Blog_Nhom5\src\CulinaryBlog.API
```

```powershell
docker compose up -d
docker compose ps
```

Docker sẽ khởi động PostgreSQL, Redis, MinIO và Seq.

### 3. Cài dependency lần đầu

```powershell
dotnet restore .\Culinary_Blog_Nhom5\Culinary_Blog_Nhom5.sln
cd .\Culinary_Blog_Nhom5\culinary-blog-web
npm ci
cd ..\..
```

Tạo cấu hình frontend cục bộ nếu chưa có:

```powershell
Copy-Item .\Culinary_Blog_Nhom5\culinary-blog-web\.env.example `
  .\Culinary_Blog_Nhom5\culinary-blog-web\.env.local
```

Giữ `.env.local` ngoài Git. Frontend dùng `NEXT_PUBLIC_API_URL` để gọi backend và nhận cookie refresh an toàn.

### 4. Chạy backend và frontend

```powershell
cd .\Culinary_Blog_Nhom5
.\run-dev.ps1
```

Script sẽ chạy đồng thời:

- Frontend: <http://localhost:3000>
- Backend API: <http://localhost:5156>
- API documentation (Scalar): <http://localhost:5156/scalar/v1>
- Health check: <http://localhost:5156/health>

Nhấn `Ctrl + C` tại cửa sổ PowerShell để dừng backend và frontend.

### Chạy thủ công

Terminal backend:

```powershell
cd .\Culinary_Blog_Nhom5
dotnet run --project .\src\CulinaryBlog.API
```

Terminal frontend:

```powershell
cd .\Culinary_Blog_Nhom5\culinary-blog-web
npm run dev
```

## Các dịch vụ cục bộ

| Dịch vụ | Địa chỉ |
|---|---|
| Frontend | <http://localhost:3000> |
| Backend API | <http://localhost:5156> |
| Hangfire Dashboard | <http://localhost:5156/hangfire> (Admin only) |
| Scalar API UI | <http://localhost:5156/scalar/v1> |
| PostgreSQL | `localhost:5433` |
| Redis | `localhost:6379` |
| MinIO API | <http://localhost:9000> |
| MinIO Console | <http://localhost:9001> |
| Seq | <http://localhost:5341> |

## Welcome Email (FR-JOB-001)

Đăng ký mới lưu yêu cầu welcome email cùng transaction tạo tài khoản. Hangfire gửi nền qua SMTP, retry tối đa 4 lần gọi transport và phục hồi yêu cầu còn chờ. Mặc định `Email:Enabled=false`; tài khoản vẫn đăng nhập bình thường và yêu cầu gửi được giữ Pending.

Hướng dẫn bật MailHog local, áp dụng migration mới, cấu hình SMTP production, kiểm thử và xử lý Failed: [Runbook Welcome Email](Culinary_Blog_Nhom5/docx/Spec/Runbook_FR-JOB-001-Welcome-Email.md). Mail capture local dùng file riêng `compose.mail.yml`, cổng 1025/8025 chỉ bind localhost. Hangfire Dashboard nằm ở `/hangfire` và chỉ cho phép Admin. Secret SMTP phải đặt qua environment/User Secrets, không commit.

### Integration test local

Để nghiệm thu recipe/media/jobs trên môi trường sạch, chạy từ thư mục gốc:

```powershell
.\Culinary_Blog_Nhom5\tests\run-integration.ps1
```

Script tạo PostgreSQL, MinIO và MailHog riêng với cổng loopback ngẫu nhiên,
credentials tạm, chạy 8 suite (bao gồm ingredients/steps), rồi tự dọn đúng
Compose project của lần chạy. Hangfire chạy thật trong test host và lưu vào
PostgreSQL test. Không cần tạo `.env` hoặc dùng database development.
Xem [hướng dẫn nghiệm thu #84](Culinary_Blog_Nhom5/docx/Spec/Runbook_Issue84_Recipe_Media_Jobs.md).

Nếu muốn dùng các dịch vụ local đang có thay vì môi trường cô lập:

Các test tạo database riêng không dùng database development. Lưu sáu connection
string test trong User Secrets/CI secret hoặc biến môi trường của process; mẫu tên
biến nằm tại `Culinary_Blog_Nhom5/tests/integration-test.env.example`.

```powershell
$testPassword = Read-Host "Local PostgreSQL test password" -AsSecureString
$testPasswordPlain = [System.Net.NetworkCredential]::new("", $testPassword).Password
$testConnection = "Host=localhost;Port=5433;Database=postgres;Username=postgres;Password=$testPasswordPlain"
foreach ($name in @(
  "RECIPE_IMAGES_TEST_CONNECTION", "RECIPE_DELETION_TEST_CONNECTION",
  "RECIPE_CREATE_TEST_CONNECTION", "RECIPE_UPDATE_TEST_CONNECTION",
  "IMAGE_TEST_CONNECTION", "WELCOME_EMAIL_TEST_CONNECTION"
)) { Set-Item "Env:$name" $testConnection }
Remove-Variable testPasswordPlain, testConnection
dotnet test Culinary_Blog_Nhom5.sln --no-build
```

Không ghi giá trị các biến vào log hoặc Git. PostgreSQL test phải có quyền tạo/xóa
database cô lập; MinIO, Redis và MailHog dùng endpoint local tương ứng theo test
fixture. Mỗi suite tự cleanup dữ liệu và không phụ thuộc thứ tự chạy.

## Kiểm tra trước khi gửi bài

```powershell
dotnet build .\Culinary_Blog_Nhom5\Culinary_Blog_Nhom5.sln
cd .\Culinary_Blog_Nhom5\culinary-blog-web
npm run lint
npm run build
```

Ngoài ra, mở frontend và kiểm tra tối thiểu trang chủ, đăng nhập, danh sách công thức, chi tiết công thức và health check của API.

## Xử lý ảnh nền (FR-JOB-002)

Hangfire tạo medium 800×600 và thumbnail 300×300 từ original. Triển khai migration mới trước khi nhận upload và dừng worker phiên bản cũ để tránh trộn giao thức resize/delete. Runtime cần `dotnet` trong PATH và thư mục temp ghi được cho decoder tiến trình con.

Xem [Runbook Image Resize / Thumbnail](Culinary_Blog_Nhom5/docx/Spec/Runbook_FR-JOB-002-Image-Resize-Thumbnail.md) để chạy test local, theo dõi retry/recovery/cleanup và xử lý Failed. Không cần bật dashboard hoặc cấu hình server Hangfire riêng.

## Xử lý lỗi thường gặp

- API không kết nối PostgreSQL: kiểm tra `docker compose ps`; cổng PostgreSQL trên máy là `5433`, không phải `5432`.
- Frontend báo lỗi gọi API: xác nhận backend đang chạy tại `http://localhost:5156` và các biến `API_INTERNAL_URL`, `NEXT_PUBLIC_API_URL` trong `.env.local` cùng trỏ đến địa chỉ này.
- Cổng đã được sử dụng: dừng tiến trình đang chiếm các cổng `3000`, `5156`, `5433`, `6379`, `9000`, `9001` hoặc `5341` rồi chạy lại.
- Container lỗi hoặc chưa sẵn sàng: xem log bằng `docker compose logs <ten-dich-vu>`.
- Sau khi đổi dependency frontend: chạy lại `npm ci`.

## Quy trình đóng góp

Mọi thành viên phải lấy `main` mới nhất trước khi bắt đầu, làm việc trên nhánh riêng, push nhánh và tạo pull request để nhóm trưởng review. Không được commit hoặc push trực tiếp lên `main`.

Chi tiết cách đặt tên nhánh, viết commit, push bài, xử lý conflict và tạo pull request nằm trong [CONTRIBUTING.md](CONTRIBUTING.md).

## Thành viên nhóm

| MSSV | Họ và tên | GitHub |
|---|---|---|
| 2312567 | Võ Thị Minh Ân | [anvodangiu](https://github.com/anvodangiu) |
| 2312663 | Đỗ Đặng Diệu Linh | [Dlyn1705](https://github.com/Dlyn1705) |
| 2300003 | Nguyễn Lê Anh Tuấn | [anhtuan101](https://github.com/anhtuan101) |
| 2312778 | Phan Thị Bảo Trâm | [btram0812](https://github.com/btram0812) |
