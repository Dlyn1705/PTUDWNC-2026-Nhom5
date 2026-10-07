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
    ├── run-dev.bat                    # Chạy full-stack bằng Command Prompt
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

Thay giá trị `AUTH_SECRET` trong `.env.local` bằng chuỗi bí mật riêng của máy. Không commit `.env.local` lên Git.

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

### Chạy bằng Command Prompt

```bat
cd Culinary_Blog_Nhom5
run-dev.bat
```

Script này mở backend và frontend trong hai cửa sổ riêng.

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
| Scalar API UI | <http://localhost:5156/scalar/v1> |
| PostgreSQL | `localhost:5433` |
| Redis | `localhost:6379` |
| MinIO API | <http://localhost:9000> |
| MinIO Console | <http://localhost:9001> |
| Seq | <http://localhost:5341> |

## Kiểm tra trước khi gửi bài

```powershell
dotnet build .\Culinary_Blog_Nhom5\Culinary_Blog_Nhom5.sln
cd .\Culinary_Blog_Nhom5\culinary-blog-web
npm run lint
npm run build
```

Ngoài ra, mở frontend và kiểm tra tối thiểu trang chủ, đăng nhập, danh sách công thức, chi tiết công thức và health check của API.

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
