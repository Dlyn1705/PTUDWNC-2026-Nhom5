# PTUDWNC-2026-Nhom5: Culinary Blog

> **Đồ án môn học:** Phát triển Ứng dụng Web Nâng cao (V4)  
> **Kiến trúc:** Clean Architecture + CQRS (.NET 10 Minimal APIs) & Next.js 15 App Router

---

## 📖 1. Giới thiệu Dự án
**Culinary Blog** là hệ thống web chia sẻ, tìm kiếm và quản lý công thức nấu ăn. Hệ thống phát triển theo mô hình **API-Driven Architecture**, tách biệt độc lập giữa Backend (.NET 10) và Frontend (Next.js 15) giao tiếp qua RESTful API.

* **Quản lý công thức:** Tạo, duyệt, xuất bản công thức với nguyên liệu, các bước thực hiện và thông tin dinh dưỡng.
* **Tìm kiếm thông minh:** Full-Text Search tiếng Việt không dấu qua PostgreSQL (`tsvector`, `unaccent`).
* **Bảo mật & Phân quyền:** JWT Stateless, Refresh Token Rotation, Google OAuth 2.0, phân quyền RBAC & Resource-Based.
* **Hiệu năng & Tối ưu:** Redis Cache, Next.js ISR, MinIO Object Storage (ảnh), Hangfire Background Jobs.

---

## 👥 2. Thành viên Nhóm & Phân công Công việc

<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; border: 1px solid #d0d7de;">
  <thead>
    <tr bgcolor="#f6f8fa" style="text-align: center;">
      <th style="border: 1px solid #d0d7de; width: 50px;">STT</th>
      <th style="border: 1px solid #d0d7de; width: 110px;">MSSV</th>
      <th style="border: 1px solid #d0d7de; width: 180px;">Họ và Tên</th>
      <th style="border: 1px solid #d0d7de; width: 130px;">GitHub</th>
      <th style="border: 1px solid #d0d7de;">Vai trò & Công việc chính</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td align="center" style="border: 1px solid #d0d7de;">1</td>
      <td align="center" style="border: 1px solid #d0d7de;"><b>2312663</b></td>
      <td style="border: 1px solid #d0d7de;"><b>Đỗ Đặng Diệu Linh</b></td>
      <td align="center" style="border: 1px solid #d0d7de;">
        <a href="https://github.com/Dlyn1705">Dlyn1705</a>
      </td>
      <td style="border: 1px solid #d0d7de;">
        <b>Module Xác thực & Quản lý Tài khoản (FR-AUTH)</b><br/>
        - Xác thực JWT Stateless & Refresh Token Rotation.<br/>
        - Tích hợp đăng nhập Google OAuth 2.0 và quản lý Profile.<br/>
        - Thiết lập Middleware phân quyền RBAC và Policy-based.
      </td>
    </tr>
    <tr>
      <td align="center" style="border: 1px solid #d0d7de;">2</td>
      <td align="center" style="border: 1px solid #d0d7de;"><b>2312567</b></td>
      <td style="border: 1px solid #d0d7de;"><b>Võ Thị Minh Ân</b></td>
      <td align="center" style="border: 1px solid #d0d7de;">
        <a href="https://github.com/anvodangiu">anvodangiu</a>
      </td>
      <td style="border: 1px solid #d0d7de;">
        <b>Module Danh mục & Tìm kiếm (FR-CAT, FR-SRCH)</b><br/>
        - Quản lý danh mục món ăn (Category) cho Admin.<br/>
        - Xây dựng Full-Text Search tiếng Việt không dấu (PostgreSQL).<br/>
        - Xử lý bộ lọc đa tiêu chí, sắp xếp và phân trang danh sách.
      </td>
    </tr>
    <tr>
      <td align="center" style="border: 1px solid #d0d7de;">3</td>
      <td align="center" style="border: 1px solid #d0d7de;"><b>2300003</b></td>
      <td style="border: 1px solid #d0d7de;"><b>Nguyễn Lê Anh Tuấn</b></td>
      <td align="center" style="border: 1px solid #d0d7de;">
        <a href="https://github.com/anhtuan101">anhtuan101</a>
      </td>
      <td style="border: 1px solid #d0d7de;">
        <b>Module Soạn thảo & Vòng đời Công thức (FR-RCP)</b><br/>
        - CRUD Recipe, xử lý trạng thái Draft / Published / Archive.<br/>
        - Kiểm soát đồng thời với Concurrency Token (RowVersion).<br/>
        - Áp dụng Resource-Based Authorization cho tác giả.
      </td>
    </tr>
    <tr>
      <td align="center" style="border: 1px solid #d0d7de;">4</td>
      <td align="center" style="border: 1px solid #d0d7de;"><b>2312778</b></td>
      <td style="border: 1px solid #d0d7de;"><b>Phan Thị Bảo Trâm</b></td>
      <td align="center" style="border: 1px solid #d0d7de;">
        <a href="https://github.com/btram0812">btram0812</a>
      </td>
      <td style="border: 1px solid #d0d7de;">
        <b>Module Chi tiết Công thức, File & Background Jobs (FR-RCP, FR-FILE, FR-JOB)</b><br/>
        - Quản lý các bước (Steps), nguyên liệu (Ingredients) và dinh dưỡng.<br/>
        - Tích hợp lưu trữ ảnh qua MinIO, validate MIME type & magic bytes.<br/>
        - Cấu hình Hangfire Background Jobs (resize ảnh, welcome email).
      </td>
    </tr>
  </tbody>
</table>

---

## 📂 3. Cấu trúc Thư mục Dự án

```text
CulinaryBlog.sln
├── src/
│   ├── CulinaryBlog.Domain/                          ← Tầng trong cùng, không phụ thuộc gì
│   │   ├── Entities/
│   │   │   ├── Category.cs
│   │   │   ├── Recipe.cs
│   │   │   └── RecipeStep.cs
│   │   ├── Interfaces/                               ← Interfaces cho Repository (abstraction)
│   │   │   └── IRepository.cs
│   │   └── Exceptions/
│   │       └── DomainException.cs
│   │
│   ├── CulinaryBlog.Application/                     ← Use cases, phụ thuộc Domain
│   │   ├── Features/                                 ← Vertical Slices theo tính năng
│   │   │   ├── Categories/
│   │   │   │   ├── Commands/
│   │   │   │   │   ├── CreateCategory/
│   │   │   │   │   └── UpdateCategory/
│   │   │   │   └── Queries/
│   │   │   │       └── GetCategories/
│   │   │   └── Recipes/
│   │   ├── DTOs/                                     ← Data Transfer Objects
│   │   ├── Common/
│   │   │   ├── Models/PaginatedResult.cs
│   │   │   └── Mappings/MappingConfig.cs
│   │   ├── Contracts/
│   │   │   └── Persistence/IApplicationDbContext.cs
│   │   └── DependencyInjection.cs                    ← Extension method đăng ký DI
│   │
│   ├── CulinaryBlog.Infrastructure/                  ← EF Core, file storage, ...
│   │   ├── Persistence/
│   │   │   ├── ApplicationDbContext.cs
│   │   │   └── Configurations/                       ← Fluent API entity configurations
│   │   ├── Repositories/
│   │   └── DependencyInjection.cs
│   │
│   └── CulinaryBlog.API/                             ← Presentation layer (Minimal APIs)
│       ├── Endpoints/
│       │   ├── CategoryEndpoints.cs
│       │   └── RecipeEndpoints.cs
│       └── Program.cs
│
├── tests/
│   ├── CulinaryBlog.Application.Tests/               ← Unit tests cho handlers
│   └── CulinaryBlog.Integration.Tests/               ← Integration tests với TestContainers
│
├── frontend/                                         ← Next.js 15 App Router + Tailwind CSS
│   ├── src/
│   │   ├── app/                                      ← Route Groups: (auth), (public), dashboard, profile
│   │   ├── components/                               ← Reusable UI Components
│   │   └── services/                                 ← API Services mapping Backend endpoints
│   └── package.json
│
├── docker-compose.yml                                ← Hạ tầng dịch vụ: PostgreSQL, Redis, MinIO, Seq
└── README.md
