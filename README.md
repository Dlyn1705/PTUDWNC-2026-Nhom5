# 🍳 PTUDWNC-2026-Nhom5: Culinary Blog

> <b>Đồ án môn học:</b> Phát triển Ứng dụng Web Nâng cao (V4)<br/>
> <b>Kiến trúc:</b> Clean Architecture + CQRS (.NET 10 Minimal APIs) & Next.js 15 App Router

---

<h2>📖 1. Giới thiệu Dự án</h2>

<p><b>Culinary Blog</b> là hệ thống web cho phép người dùng chia sẻ, tìm kiếm và quản lý các công thức nấu ăn từ nhiều nền ẩm thực khác nhau. Dự án áp dụng mô hình <b>API-Driven Architecture</b>, tách biệt độc lập giữa Backend (.NET 10) và Frontend (Next.js 15) giao tiếp hoàn toàn qua chuẩn RESTful API.</p>

<h3>🌟 Tính năng chính</h3>
<ul>
  <li><b>Quản lý công thức:</b> Đăng tải, tùy chỉnh công thức với nguyên liệu, các bước thực hiện tuần tự và bảng dinh dưỡng.</li>
  <li><b>Tìm kiếm thông minh:</b> Tìm kiếm tiếng Việt không dấu sử dụng PostgreSQL <code>tsvector</code>, <code>tsquery</code> và <code>unaccent</code>.</li>
  <li><b>Bảo mật &amp; Phân quyền:</b> Xác thực JWT stateless kèm Refresh Token Rotation; hỗ trợ đăng nhập Google OAuth 2.0; phân quyền Role-Based (Guest, Author, Admin) và Resource-Based (chỉ tác giả mới được sửa/xóa bài của mình).</li>
  <li><b>Hiệu năng &amp; Tối ưu:</b> Caching phân tán với Redis, Next.js ISR, lưu trữ ảnh trên MinIO S3-compatible, xử lý tác vụ nền bất đồng bộ với Hangfire.</li>
</ul>

---

<h2>👥 2. Thành viên Nhóm &amp; Phân công Công việc</h2>

<div align="center">

<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; border: 1px solid #d0d7de;">
  <thead>
    <tr bgcolor="#f6f8fa" style="text-align: center;">
      <th style="border: 1px solid #d0d7de; width: 45px;">STT</th>
      <th style="border: 1px solid #d0d7de; width: 100px;">MSSV</th>
      <th style="border: 1px solid #d0d7de; width: 170px;">Họ và Tên</th>
      <th style="border: 1px solid #d0d7de; width: 110px;">GitHub</th>
      <th style="border: 1px solid #d0d7de;">Chức năng &amp; Nhiệm vụ đảm nhiệm</th>
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
      <td style="border: 1px solid #d0d7de; text-align: left;">
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
        <a href="https://github.com/github_user_2">github_user_2</a>
      </td>
      <td style="border: 1px solid #d0d7de; text-align: left;">
        <b>Quản lý Danh mục, Tìm kiếm &amp; Giám sát hệ thống</b>
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
          <li><code>FR-OBS-003</code>: Distributed Tracing &amp; Metrics</li>
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
      <td style="border: 1px solid #d0d7de; text-align: left;">
        <b>Soạn thảo, Vòng đời Công thức &amp; Lưu trữ File</b>
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
      <td style="border: 1px solid #d0d7de; text-align: left;">
        <b>Hiển thị Chi tiết Công thức &amp; Background Jobs</b>
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

</div>

---

<h2>📂 3. Cấu trúc Thư mục Dự án</h2>

<pre><code>CulinaryBlog.sln
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
├── docker-compose.yml                                ← Hạ tầng dịch vụ: PostgreSQL, Redis, MinIO, Seq
└── README.md</code></pre>

---

<h2>🌿 4. Quy ước Làm việc Nhóm với Git (Git Workflow)</h2>

<h3>1. Nguyên tắc cơ bản</h3>
<ul>
  <li><b>Không được phép push trực tiếp code lên nhánh chính (<code>main</code> hoặc <code>master</code>).</b></li>
  <li>Mỗi khi bắt đầu thực hiện một chức năng mới hoặc sửa một lỗi (bug), bắt buộc phải tạo nhánh riêng biệt xuất phát từ nhánh phát triển mới nhất.</li>
</ul>

<h3>2. Cú pháp đặt tên nhánh (Branch Naming Convention)</h3>
<p><b>Đối với tính năng mới:</b></p>
<pre><code>mssv-hoten-tenchucnang</code></pre>

<p><b>Ví dụ minh họa:</b></p>
<pre><code>2312663-DoDangDieuLinh-dangnhapoauth</code></pre>

<h3>3. Quy trình làm việc nhóm (Workflow)</h3>
<p><b>Lấy code mới nhất từ nhánh chính:</b></p>
<pre><code>git checkout main
git pull origin main</code></pre>

<p><b>Tạo và chuyển sang nhánh làm việc riêng:</b></p>
<pre><code>git checkout -b 2312663-DoDangDieuLinh-dangnhapoauth</code></pre>

<p><b>Tiến hành lập trình, commit và đẩy nhánh lên Remote Repository:</b></p>
<pre><code>git add .
git commit -m "feat: implement google oauth authentication"
git push origin 2312663-DoDangDieuLinh-dangnhapoauth</code></pre>

<p><b>Tạo Pull Request (PR):</b></p>
<ul>
  <li>Truy cập giao diện quản lý Git (GitHub), tạo Pull Request từ nhánh cá nhân vào nhánh <code>main</code>.</li>
  <li>Thêm ít nhất 1 thành viên khác trong nhóm làm Reviewer để kiểm tra mã nguồn trước khi tiến hành Merge.</li>
</ul>

---

<h2>🚀 5. Hướng dẫn Thiết lập Môi trường Cục bộ (Local Setup)</h2>

<h3>1. Khởi chạy hạ tầng dịch vụ (Docker)</h3>
<p>Đảm bảo đã mở Docker Desktop, sau đó chạy lệnh:</p>
<pre><code>docker compose up -d</code></pre>
<p><i>Lệnh này khởi chạy PostgreSQL (5432), Redis (6379), MinIO (9000/9001), và Seq (5341).</i></p>

<h3>2. Cấu hình &amp; Chạy Backend (.NET 10)</h3>
<p><b>Clone dự án về máy:</b></p>
<pre><code>git clone https://github.com/Dlyn1705/PTUDWNC-2026-Nhom5.git
cd PTUDWNC-2026-Nhom5</code></pre>

<p><b>Cấu hình chuỗi kết nối cơ sở dữ liệu:</b></p>
<ul>
  <li>Mở file <code>appsettings.Development.json</code> trong project <code>src/CulinaryBlog.API</code>.</li>
  <li>Cập nhật thông số kết nối PostgreSQL (Host, Port, Database, Username, Password) cho phù hợp với máy cá nhân.</li>
</ul>

<p><b>Chạy ứng dụng:</b></p>
<ul>
  <li>Mở file solution <code>CulinaryBlog.sln</code> bằng Visual Studio 2022 (đã cập nhật .NET 10 SDK).</li>
  <li>Đặt project <code>CulinaryBlog.API</code> làm Startup Project và nhấn <code>F5</code> hoặc <code>Ctrl + F5</code>.</li>
</ul>

<p><b>Trải nghiệm tài liệu API trực quan:</b></p>
<ul>
  <li>Truy cập đường dẫn: <code>https://localhost:5001/scalar/v1</code> trên trình duyệt để khám phá giao diện Scalar UI và kiểm thử API.</li>
</ul>

<h3>3. Chạy Frontend (Next.js 15)</h3>
<pre><code>cd frontend
npm install
npm run dev</code></pre>
<p><i>Giao diện người dùng sẽ chạy tại: <code>http://localhost:3000</code>.</i></p>
