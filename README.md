# 🍳 PTUDWNC-2026-Nhom5: Culinary Blog

> **Đồ án môn học:** Phát triển Ứng dụng Web Nâng cao (V4)  
> **Kiến trúc:** Clean Architecture + CQRS (.NET 10 Minimal APIs) & Next.js 15 App Router

---

## 📖 1. Giới thiệu Dự án
**Culinary Blog** là hệ thống web chia sẻ, tìm kiếm và quản lý công thức nấu ăn[cite: 2]. Hệ thống phát triển theo mô hình **API-Driven Architecture**, tách biệt độc lập giữa Backend (.NET 10) và Frontend (Next.js 15) giao tiếp qua RESTful API[cite: 2].

* **Quản lý công thức:** Tạo, duyệt, xuất bản công thức với nguyên liệu, các bước thực hiện và thông tin dinh dưỡng[cite: 2].
* **Tìm kiếm thông minh:** Full-Text Search tiếng Việt không dấu qua PostgreSQL (`tsvector`, `unaccent`)[cite: 2].
* **Bảo mật & Phân quyền:** JWT Stateless, Refresh Token Rotation, Google OAuth 2.0, phân quyền RBAC & Resource-Based[cite: 2].
* **Hiệu năng & Tối ưu:** Redis Cache, Next.js ISR, MinIO Object Storage (ảnh), Hangfire Background Jobs[cite: 2].

---

## 👥 2. Thành viên Nhóm & Phân công Công việc

<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; border: 1px solid #d0d7de;">
  <thead>
    <tr bgcolor="#f6f8fa" style="text-align: center;">
      <th style="border: 1px solid #d0d7de; width: 45px;">STT</th>
      <th style="border: 1px solid #d0d7de; width: 100px;">MSSV</th>
      <th style="border: 1px solid #d0d7de; width: 170px;">Họ và Tên</th>
      <th style="border: 1px solid #d0d7de; width: 110px;">GitHub</th>
      <th style="border: 1px solid #d0d7de;">Chức năng & Nhiệm vụ đảm nhiệm</th>
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
        <b>Xác thực và Quản lý tài khoản</b>
        <ul>
          <li><code>FR-AUTH-001</code>: Đăng ký tài khoản</li>
          <li><code>FR-AUTH-002</code>: Đăng nhập bằng Email / Mật khẩu</li>
          <li><code>FR-AUTH-003</code>: Đăng nhập bằng Google OAuth 2.0</li>
          <li><code>FR-AUTH-004</code>: Làm mới Access Token</li>
          <li><code>FR-AUTH-005</code>: Đăng xuất</li>
          <li><code>FR-AUTH-006</code>: Xem hồ sơ cá nhân</li>
          <li><code>FR-AUTH-007</code>: Cập nhật Hồ sơ cá nhân</li>
          <li><code>FR-JOB-001</code>: Welcome Email Job</li>
        </ul>
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
        <b>Quản lý Danh mục, Tìm kiếm & Giám sát hệ thống</b>
        <ul>
          <li><code>FR-CAT-001</code>: Xem danh sách danh mục</li>
          <li><code>FR-CAT-002</code>: Xem chi tiết danh mục và công thức</li>
          <li><code>FR-CAT-003</code>: Tạo danh mục mới (Phân quyền Admin)</li>
          <li><code>FR-CAT-004</code>: Cập nhật danh mục (Phân quyền Admin)</li>
          <li><code>FR-CAT-005</code>: Xóa danh mục (Phân quyền Admin)</li>
          <li><code>FR-SRCH-001</code>: Tìm kiếm toàn văn bản (FTS)</li>
          <li><code>FR-SRCH-002/003/004</code>: Lọc, sắp xếp và phân trang</li>
          <li><code>FR-OBS-001</code>: Health Check Endpoints</li>
          <li><code>FR-OBS-002</code>: Structured Logging</li>
          <li><code>FR-OBS-003</code>: Distributed Tracing & Metrics</li>
        </ul>
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
        <b>Soạn thảo, Vòng đời Công thức & Lưu trữ File</b>
        <ul>
          <li><code>FR-RCP-001</code>: Xem danh sách công thức</li>
          <li><code>FR-RCP-002</code>: Xem chi tiết công thức</li>
          <li><code>FR-RCP-003</code>: Tạo công thức nấu ăn mới (Phân quyền tác giả/Admin)</li>
          <li><code>FR-RCP-004</code>: Cập nhật công thức (Phân quyền)</li>
          <li><code>FR-RCP-005</code>: Xuất bản / Hủy xuất bản công thức</li>
          <li><code>FR-FILE-001</code>: Upload File lên MinIO</li>
          <li><code>FR-FILE-002</code>: Xóa File khỏi MinIO</li>
        </ul>
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
        <b>Hiển thị Chi tiết Công thức & Background Jobs</b>
        <ul>
          <li><code>FR-RCP-006</code>: Lưu trữ công thức (Archive)</li>
          <li><code>FR-RCP-007</code>: Xóa công thức</li>
          <li><code>FR-RCP-008</code>: Quản lý ảnh công thức</li>
          <li><code>FR-RCP-009</code>: Quản lý nguyên liệu</li>
          <li><code>FR-RCP-010</code>: Quản lý các bước thực hiện</li>
          <li><code>FR-JOB-002</code>: Image Resize / Thumbnail Job</li>
          <li><code>FR-JOB-003</code>: Sitemap Generation Job</li>
        </ul>
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
