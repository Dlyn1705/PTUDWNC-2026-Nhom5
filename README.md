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
      <td align="center" style="border: 1px solid #d0d7de;"><b>2312567</b></td>
      <td style="border: 1px solid #d0d7de;"><b>Võ Thị Minh Ân</b></td>
      <td align="center" style="border: 1px solid #d0d7de;">
        <a href="https://github.com/anvodangiu">anvodangiu</a>
      </td>
      <td style="border: 1px solid #d0d7de; text-align: left;">
        <b>Xác thực, Quản lý tài khoản &amp; Giám sát cơ bản</b>
        <ul>
          <li><code>FR-AUTH-001</code>: Đăng ký tài khoản</li>
          <li><code>FR-AUTH-002</code>: Đăng nhập bằng Email / Mật khẩu</li>
          <li><code>FR-AUTH-003</code>: Đăng nhập bằng Google OAuth 2.0</li>
          <li><code>FR-AUTH-004</code>: Làm mới Access Token</li>
          <li><code>FR-AUTH-005</code>: Đăng xuất</li>
          <li><code>FR-AUTH-006</code>: Xem hồ sơ cá nhân</li>
          <li><code>FR-AUTH-007</code>: Cập nhật Hồ sơ cá nhân</li>
          <li><code>FR-OBS-001</code>: Health Check Endpoints</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td align="center" style="border: 1px solid #d0d7de;">2</td>
      <td align="center" style="border: 1px solid #d0d7de;"><b>2312663</b></td>
      <td style="border: 1px solid #d0d7de;"><b>Đỗ Đặng Diệu Linh</b></td>
      <td align="center" style="border: 1px solid #d0d7de;">
        <a href="https://github.com/Dlyn1705">Dlyn1705</a>
      </td>
      <td style="border: 1px solid #d0d7de; text-align: left;">
        <b>Quản lý Danh mục, Xem Công thức &amp; Sitemap</b>
        <ul>
          <li><code>FR-CAT-001</code>: Xem danh sách danh mục</li>
          <li><code>FR-CAT-002</code>: Xem chi tiết danh mục và công thức</li>
          <li><code>FR-CAT-003</code>: Tạo danh mục mới (Phân quyền Admin)</li>
          <li><code>FR-CAT-004</code>: Cập nhật danh mục (Phân quyền Admin)</li>
          <li><code>FR-CAT-005</code>: Xóa danh mục (Phân quyền Admin)</li>
          <li><code>FR-RCP-001</code>: Xem danh sách công thức</li>
          <li><code>FR-RCP-002</code>: Xem chi tiết công thức</li>
          <li><code>FR-JOB-003</code>: Sitemap Generation Job*</li>
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
        <b>Tìm kiếm, Lưu trữ File &amp; Vòng đời Công thức</b>
        <ul>
          <li><code>FR-SRCH-001</code>: Tìm kiếm toàn văn bản</li>
          <li><code>FR-SRCH-002/003/004</code>: Lọc, sắp xếp và phân trang*</li>
          <li><code>FR-FILE-001</code>: Upload File lên MinIO*</li>
          <li><code>FR-FILE-002</code>: Xóa File khỏi MinIO*</li>
          <li><code>FR-OBS-002</code>: Structured Logging*</li>
          <li><code>FR-OBS-003</code>: Distributed Tracing &amp; Metrics*</li>
          <li><code>FR-RCP-005</code>: Xuất bản / Hủy xuất bản công thức</li>
          <li><code>FR-RCP-006</code>: Lưu trữ công thức (Archive)</li>
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
        <b>Soạn thảo Chi tiết Công thức &amp; Background Jobs</b>
        <ul>
          <li><code>FR-RCP-003</code>: Tạo công thức nấu ăn mới (Phân quyền tác giả/Admin)</li>
          <li><code>FR-RCP-004</code>: Cập nhật công thức (Phân quyền)</li>
          <li><code>FR-RCP-007</code>: Xóa công thức</li>
          <li><code>FR-RCP-008</code>: Quản lý ảnh công thức</li>
          <li><code>FR-RCP-009</code>: Quản lý nguyên liệu</li>
          <li><code>FR-RCP-010</code>: Quản lý các bước thực hiện</li>
          <li><code>FR-JOB-001</code>: Welcome Email Job*</li>
          <li><code>FR-JOB-002</code>: Image Resize / Thumbnail Job*</li>
        </ul>
      </td>
    </tr>
  </tbody>
</table>

</div>

---

<h2>📂 3. Cấu trúc Thư mục Dự án</h2>

<pre><code>PTUDWNC-2026-Nhom5/
│
├── docker-compose.yml                    # Hạ tầng Docker: PostgreSQL 16, Redis 7, MinIO, Seq
├── README.md                             # Tài liệu tổng quan dự án &amp; quy ước làm việc nhóm
│
└── Culinary_Blog_Nhom5/                  # Thư mục mã nguồn chính của hệ thống
    ├── Culinary_Blog_Nhom5.sln           # Solution liên kết 4 projects Backend
    ├── run-dev.bat                       # Script Windows Command Prompt khởi chạy Full-stack
    ├── run-dev.ps1                       # Script Windows PowerShell khởi chạy Full-stack
    │
    ├── src/                              # BACKEND (.NET 10 - Clean Architecture + CQRS)
    │   ├── CulinaryBlog.Domain/          # 1. Tầng Domain: Entities, Enums, Exceptions, Value Objects
    │   ├── CulinaryBlog.Application/     # 2. Tầng Application: CQRS Commands/Queries, DTOs, Behaviors
    │   ├── CulinaryBlog.Infrastructure/  # 3. Tầng Infrastructure: EF Core, PostgreSQL, Repositories, MinIO, Redis
    │   └── CulinaryBlog.API/             # 4. Tầng Presentation: Minimal APIs, Endpoints, Scalar UI, Middlewares
    │
    └── culinary-blog-web/                # FRONTEND (Next.js 15 App Router, TypeScript, Tailwind CSS)
        ├── app/                          # Định tuyến trang &amp; Layouts ((public), (auth), (dashboard))
        ├── components/                   # UI Components (Navbar, Footer, CategoryCard, Forms...)
        ├── hooks/                        # Custom hooks (TanStack Query, Infinite scroll)
        ├── lib/                          # Axios Client, Auth setup
        ├── store/                        # Quản lý State phía client (Zustand)
        ├── types/                        # TypeScript types &amp; DTO schemas
        ├── .env.local                    # Cấu hình biến môi trường kết nối Backend (Port 5156)
        └── package.json                  # Dependencies frontend
</code></pre>

---

<h2>🌿 4. Quy ước Làm việc Nhóm với Git (Git Workflow)</h2>

<p>Toàn bộ thành viên trong nhóm bắt buộc phải tuân thủ nghiêm ngặt các quy ước Git dưới đây nhằm đảm bảo tính đồng nhất, an toàn và chuyên nghiệp cho mã nguồn dự án.</p>

<h3>4.1. Nguyên tắc An toàn &amp; Bảo mật</h3>
<ul>
  <li><b>Tuyệt đối không commit trực tiếp lên nhánh <code>main</code></b> — mọi thay đổi đều phải thông qua Pull Request (PR).</li>
  <li><b>Tuyệt đối không commit file <code>.env</code></b> hoặc các file chứa mật khẩu, connection string máy cá nhân, secret key lên Git.</li>
  <li>Mỗi khi thực hiện một chức năng mới hoặc sửa lỗi, bắt buộc phải tạo nhánh riêng biệt từ nhánh <code>main</code> cập nhật nhất.</li>
</ul>

<h3>4.2. Quy ước Commit (Conventional Commits)</h3>
<p>Nhóm áp dụng chuẩn <b>Conventional Commits</b>. Mọi commit bắt buộc theo định dạng:</p>

<pre><code>&lt;type&gt;(&lt;scope&gt;): &lt;mô tả ngắn&gt;</code></pre>

<h4>Danh sách Type</h4>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; border: 1px solid #d0d7de;">
  <thead>
    <tr bgcolor="#f6f8fa">
      <th style="border: 1px solid #d0d7de; width: 15%;">Type</th>
      <th style="border: 1px solid #d0d7de; width: 45%;">Dùng khi</th>
      <th style="border: 1px solid #d0d7de; width: 40%;">Ví dụ</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>feat</code></td>
      <td style="border: 1px solid #d0d7de;">Thêm tính năng mới</td>
      <td style="border: 1px solid #d0d7de;"><code>feat(recipes): thêm api tạo công thức</code></td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>fix</code></td>
      <td style="border: 1px solid #d0d7de;">Sửa lỗi</td>
      <td style="border: 1px solid #d0d7de;"><code>fix(auth): sửa lỗi refresh token bị revoke sớm</code></td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>chore</code></td>
      <td style="border: 1px solid #d0d7de;">Việc lặt vặt, cấu hình, không đổi logic</td>
      <td style="border: 1px solid #d0d7de;"><code>chore(deps): cập nhật ef core lên bản mới</code></td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>docs</code></td>
      <td style="border: 1px solid #d0d7de;">Sửa tài liệu, README</td>
      <td style="border: 1px solid #d0d7de;"><code>docs(readme): bổ sung hướng dẫn cài minio</code></td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>style</code></td>
      <td style="border: 1px solid #d0d7de;">Format code, không đổi logic</td>
      <td style="border: 1px solid #d0d7de;"><code>style(frontend): format lại theo prettier</code></td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>refactor</code></td>
      <td style="border: 1px solid #d0d7de;">Sửa cấu trúc, không thêm tính năng</td>
      <td style="border: 1px solid #d0d7de;"><code>refactor(categories): tách query handler</code></td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>perf</code></td>
      <td style="border: 1px solid #d0d7de;">Tối ưu hiệu năng, caching, query</td>
      <td style="border: 1px solid #d0d7de;"><code>perf(search): thêm index cho tsvector</code></td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>test</code></td>
      <td style="border: 1px solid #d0d7de;">Thêm hoặc sửa test</td>
      <td style="border: 1px solid #d0d7de;"><code>test(auth): thêm unit test cho login handler</code></td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>build</code></td>
      <td style="border: 1px solid #d0d7de;">Sửa Dockerfile, cấu hình build</td>
      <td style="border: 1px solid #d0d7de;"><code>build(docker): tối ưu layer cache backend</code></td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>ci</code></td>
      <td style="border: 1px solid #d0d7de;">Sửa GitHub Actions</td>
      <td style="border: 1px solid #d0d7de;"><code>ci: thêm workflow chạy test và lint</code></td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>revert</code></td>
      <td style="border: 1px solid #d0d7de;">Hoàn tác commit trước</td>
      <td style="border: 1px solid #d0d7de;"><code>revert: feat(recipes): thêm api tạo công thức</code></td>
    </tr>
  </tbody>
</table>

<h4>Danh sách Scope</h4>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; border: 1px solid #d0d7de;">
  <thead>
    <tr bgcolor="#f6f8fa">
      <th style="border: 1px solid #d0d7de; width: 25%;">Scope</th>
      <th style="border: 1px solid #d0d7de;">Phạm vi ảnh hưởng</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>auth</code></td>
      <td style="border: 1px solid #d0d7de;">Xác thực, JWT, Refresh Token, Google OAuth, Profile</td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>categories</code></td>
      <td style="border: 1px solid #d0d7de;">Danh mục công thức</td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>recipes</code></td>
      <td style="border: 1px solid #d0d7de;">Công thức, nguyên liệu, các bước, trạng thái bài viết</td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>search</code></td>
      <td style="border: 1px solid #d0d7de;">Tìm kiếm (FTS), lọc, sắp xếp, phân trang</td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>media</code></td>
      <td style="border: 1px solid #d0d7de;">Upload và quản lý ảnh trên MinIO</td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>jobs</code></td>
      <td style="border: 1px solid #d0d7de;">Background jobs (email, thumbnail, sitemap)</td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>shared</code></td>
      <td style="border: 1px solid #d0d7de;">Package/thư viện types dùng chung</td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>backend</code></td>
      <td style="border: 1px solid #d0d7de;">Thay đổi chung phía backend (.NET 10)</td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>frontend</code></td>
      <td style="border: 1px solid #d0d7de;">Thay đổi chung phía frontend (Next.js 15)</td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>docker</code></td>
      <td style="border: 1px solid #d0d7de;">Docker, Docker Compose, Nginx, Seq</td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>deps</code></td>
      <td style="border: 1px solid #d0d7de;">Cập nhật dependencies, NuGet packages, npm packages</td>
    </tr>
  </tbody>
</table>

<h4>Quy tắc viết mô tả</h4>
<ul>
  <li>Viết bằng <b>tiếng Việt có dấu</b>.</li>
  <li>Dùng <b>động từ nguyên thể</b>: "thêm", "sửa", "xóa" — không dùng "đã thêm", "đang sửa".</li>
  <li><b>Không viết hoa</b> chữ cái đầu, <b>không có dấu chấm</b> cuối câu.</li>
  <li>Dòng đầu giới hạn tối đa <b>72 ký tự</b>.</li>
  <li>Cần giải thích thêm thì để trống một dòng rồi viết phần body.</li>
</ul>

<h4>Ví dụ commit đầy đủ</h4>
<pre><code>feat(auth): thêm cơ chế refresh token rotation

Mỗi lần refresh, token cũ được đánh dấu isRevoked = true và sinh
token mới. Phát hiện reuse attack sẽ ghi log cảnh báo mức WARNING.

Closes #12</code></pre>

<h4>Commit chung nhiều người</h4>
<p>Khi hai người trở lên cùng làm một commit, thêm dòng <code>Co-authored-by</code> ở cuối, cách phần trên <b>hai dòng trống</b>:</p>
<pre><code>feat(recipes): thêm api upload ảnh công thức


Co-authored-by: Phan Thị Bảo Trâm &lt;2312778@dlu.edu.vn&gt;</code></pre>

<h3>4.3. Quy ước Branch</h3>
<p>Định dạng tên nhánh bắt buộc:</p>
<pre><code>mssv-hoten-tenchucnang</code></pre>

<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; border: 1px solid #d0d7de;">
  <thead>
    <tr bgcolor="#f6f8fa">
      <th style="border: 1px solid #d0d7de; width: 45%;">Ví dụ nhánh mẫu</th>
      <th style="border: 1px solid #d0d7de;">Ý nghĩa</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>2312567-VoThiMinhAn-dangnhapoauth</code></td>
      <td style="border: 1px solid #d0d7de;">Thêm đăng nhập Google OAuth 2.0 (Minh Ân)</td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>2312663-DoDangDieuLinh-danhmuccongthuc</code></td>
      <td style="border: 1px solid #d0d7de;">Quản lý danh mục công thức (Diệu Linh)</td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>2300003-NguyenLeAnhTuan-timkiemfts</code></td>
      <td style="border: 1px solid #d0d7de;">Tìm kiếm Full-Text Search tiếng Việt (Anh Tuấn)</td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>2312778-PhanThiBaoTram-uploadanhminio</code></td>
      <td style="border: 1px solid #d0d7de;">Tích hợp upload ảnh lên MinIO (Bảo Trâm)</td>
    </tr>
  </tbody>
</table>

<ul>
  <li>Tên nhánh viết <b>không dấu tiếng Việt</b>, các phần ngăn cách bằng dấu gạch ngang (<code>-</code>).</li>
  <li><b>Không commit trực tiếp vào <code>main</code></b> — mọi thay đổi phải qua Pull Request.</li>
  <li><b>Xóa branch</b> sau khi PR đã merge thành công.</li>
</ul>

<h4>Quy trình thao tác chi tiết</h4>
<p><b>Bước 1: Lấy code mới nhất từ nhánh chính:</b></p>
<pre><code>git checkout main
git pull origin main</code></pre>

<p><b>Bước 2: Tạo và chuyển sang nhánh làm việc riêng:</b></p>
<pre><code>git checkout -b 2312663-DoDangDieuLinh-danhmuccongthuc</code></pre>

<p><b>Bước 3: Lập trình, kiểm thử và commit đúng chuẩn:</b></p>
<pre><code>git add .
git commit -m "feat(categories): thêm api xem danh mục công thức"</code></pre>

<p><b>Bước 4: Đẩy nhánh lên Remote Repository:</b></p>
<pre><code>git push -u origin 2312663-DoDangDieuLinh-danhmuccongthuc</code></pre>

<h3>4.4. Quy ước Pull Request (PR)</h3>

<h4>Tiêu đề PR</h4>
<p>Tiêu đề PR <b>bắt buộc</b> theo định dạng:</p>
<pre><code>Tên-MSSV: Title</code></pre>

<p><b>Ví dụ tiêu đề PR theo từng thành viên nhóm:</b></p>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; border: 1px solid #d0d7de;">
  <thead>
    <tr bgcolor="#f6f8fa">
      <th style="border: 1px solid #d0d7de; width: 25%;">Thành viên</th>
      <th style="border: 1px solid #d0d7de; width: 15%;">MSSV</th>
      <th style="border: 1px solid #d0d7de; width: 20%;">Scope chính</th>
      <th style="border: 1px solid #d0d7de;">Tiêu đề PR mẫu</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border: 1px solid #d0d7de;">Võ Thị Minh Ân</td>
      <td align="center" style="border: 1px solid #d0d7de;">2312567</td>
      <td align="center" style="border: 1px solid #d0d7de;"><code>auth</code>, <code>docker</code></td>
      <td style="border: 1px solid #d0d7de;"><code>Ân-2312567: Thêm cơ chế refresh token rotation</code></td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;">Đỗ Đặng Diệu Linh</td>
      <td align="center" style="border: 1px solid #d0d7de;">2312663</td>
      <td align="center" style="border: 1px solid #d0d7de;"><code>categories</code>, <code>jobs</code></td>
      <td style="border: 1px solid #d0d7de;"><code>Linh-2312663: Thêm CRUD danh mục công thức</code></td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;">Nguyễn Lê Anh Tuấn</td>
      <td align="center" style="border: 1px solid #d0d7de;">2300003</td>
      <td align="center" style="border: 1px solid #d0d7de;"><code>search</code>, <code>media</code></td>
      <td style="border: 1px solid #d0d7de;"><code>Tuấn-2300003: Hoàn thiện Full-Text Search tiếng Việt</code></td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;">Phan Thị Bảo Trâm</td>
      <td align="center" style="border: 1px solid #d0d7de;">2312778</td>
      <td align="center" style="border: 1px solid #d0d7de;"><code>recipes</code>, <code>jobs</code></td>
      <td style="border: 1px solid #d0d7de;"><code>Trâm-2312778: Tích hợp upload ảnh lên MinIO</code></td>
    </tr>
  </tbody>
</table>

<h4>Mô tả PR (PR Template)</h4>
<p>⚠️ <b>PR không có mô tả sẽ bị đóng.</b> Mô tả phải trả lời được: làm gì, tại sao, và kiểm thử thế nào.</p>

<pre><code>## Mô tả
Ngắn gọn PR này làm gì và giải quyết vấn đề gì.

## Yêu cầu liên quan
- FR-AUTH-004: Làm mới Access Token

## Thay đổi chính
- Thêm RefreshTokenCommand và handler tương ứng
- Cập nhật schema bảng refresh_tokens
- Thêm logic phát hiện reuse attack

## Cách kiểm thử
1. Đăng nhập để lấy cặp token
2. Gọi POST /api/v1/auth/refresh với refresh token
3. Xác nhận token cũ bị revoke, token mới được cấp

## Ảnh chụp màn hình
(Đính kèm nếu có thay đổi giao diện)

## Checklist
- [ ] Code chạy được ở local và build thành công
- [ ] Đã kiểm tra format, không còn cảnh báo thừa
- [ ] Không commit file `.env` hoặc thông tin nhạy cảm
- [ ] Đã tự review lại diff trước khi tạo PR</code></pre>

<h4>Quy tắc review</h4>
<ul>
  <li>Mỗi PR cần <b>ít nhất một approve</b> trước khi merge.</li>
  <li>Người phụ trách hạ tầng (<code>FR-AUTH</code> / <code>FR-OBS</code>) review các PR chạm vào cấu hình chung, <code>docker-compose.yml</code> hoặc các thành phần dùng chung.</li>
  <li>PR nên <b>dưới 400 dòng thay đổi</b> — quá lớn thì tách nhỏ.</li>
  <li>Merge bằng <b>Squash and merge</b> để giữ lịch sử <code>main</code> gọn.</li>
  <li>Người tạo PR chịu trách nhiệm giải quyết conflict trước khi merge.</li>
</ul>

---

<h2>🚀 5. Hướng dẫn Thiết lập Môi trường Cục bộ (Local Setup)</h2>

<h3>5.1. Yêu cầu Môi trường (Prerequisites)</h3>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; border: 1px solid #d0d7de;">
  <thead>
    <tr bgcolor="#f6f8fa">
      <th style="border: 1px solid #d0d7de; width: 25%;">Công cụ</th>
      <th style="border: 1px solid #d0d7de; width: 25%;">Phiên bản yêu cầu</th>
      <th style="border: 1px solid #d0d7de;">Mục đích sử dụng</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border: 1px solid #d0d7de;"><b>.NET SDK</b></td>
      <td style="border: 1px solid #d0d7de;">.NET 10.0 (hoặc 9.0+)</td>
      <td style="border: 1px solid #d0d7de;">Biên dịch và chạy Backend Clean Architecture API</td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><b>Node.js &amp; npm</b></td>
      <td style="border: 1px solid #d0d7de;">Node 20.x+ / npm 10.x+</td>
      <td style="border: 1px solid #d0d7de;">Chạy Frontend Next.js 15 App Router</td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><b>Docker &amp; Docker Desktop</b></td>
      <td style="border: 1px solid #d0d7de;">Bản mới nhất</td>
      <td style="border: 1px solid #d0d7de;">Chạy PostgreSQL, Redis, MinIO và Seq</td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><b>IDE / Code Editor</b></td>
      <td style="border: 1px solid #d0d7de;">VS 2022 (v17.12+) / VS Code</td>
      <td style="border: 1px solid #d0d7de;">Môi trường phát triển lập trình</td>
    </tr>
  </tbody>
</table>

<h3>5.2. Các Bước Thiết lập Chi tiết</h3>

<h4>Bước 1: Clone mã nguồn về máy</h4>
<pre><code>git clone https://github.com/Dlyn1705/PTUDWNC-2026-Nhom5.git
cd PTUDWNC-2026-Nhom5</code></pre>

<h4>Bước 2: Khởi chạy hạ tầng dịch vụ với Docker</h4>
<p>Đảm bảo ứng dụng <b>Docker Desktop</b> đang hoạt động trên máy tính của bạn, sau đó mở terminal tại thư mục gốc của repository và chạy lệnh:</p>
<pre><code>docker compose up -d</code></pre>
<p><i>Lệnh này sẽ khởi động 4 dịch vụ container chạy ngầm: PostgreSQL (5432), Redis (6379), MinIO (9000/9001), và Seq (5341).</i></p>

<h4>Bước 3: Cấu hình và Khởi chạy Backend (.NET 10)</h4>
<p><b>1. Di chuyển vào thư mục chứa mã nguồn dự án:</b></p>
<pre><code>cd Culinary_Blog_Nhom5</code></pre>

<p><b>2. Kiểm tra thông số kết nối Database trong file <code>src/CulinaryBlog.API/appsettings.json</code>:</b></p>
<pre><code>"ConnectionStrings": {
  "DefaultConnection": "Host=localhost;Port=5432;Database=culinary_blog_db;Username=postgres;Password=Password123!"
}</code></pre>
<p>⚠️ <i>Lưu ý: Tuyệt đối không commit file cấu hình chứa mật khẩu nhạy cảm của cá nhân lên Git.</i></p>

<p><b>3. Khởi chạy Backend API bằng .NET CLI:</b></p>
<pre><code>dotnet run --project src/CulinaryBlog.API</code></pre>
<p><i>(Hoặc mở file solution <code>Culinary_Blog_Nhom5.sln</code> bằng Visual Studio 2022, chọn <code>CulinaryBlog.API</code> làm Startup Project và nhấn <code>F5</code> / <code>Ctrl + F5</code>).</i></p>

<p>Khi khởi động thành công, tài liệu OpenAPI tương tác (Scalar UI) có sẵn tại:</p>
<ul>
  <li>Scalar API Reference: <code>http://localhost:5156/scalar/v1</code></li>
</ul>

<h4>Bước 4: Cài đặt và Khởi chạy Frontend (Next.js 15)</h4>
<p><b>1. Mở cửa sổ terminal mới và di chuyển vào thư mục giao diện:</b></p>
<pre><code>cd Culinary_Blog_Nhom5/culinary-blog-web</code></pre>

<p><b>2. Cài đặt các gói thư viện phụ thuộc:</b></p>
<pre><code>npm install</code></pre>

<p><b>3. Kiểm tra biến môi trường kết nối Backend tại file <code>.env.local</code>:</b></p>
<pre><code>NEXT_PUBLIC_API_URL=http://localhost:5156</code></pre>

<p><b>4. Khởi chạy máy chủ phát triển (Dev server):</b></p>
<pre><code>npm run dev</code></pre>
<p><i>Giao diện người dùng sẽ chạy sẵn sàng tại: <code>http://localhost:3000</code>.</i></p>

---

<h3>⚡ 5.3. Khởi động Nhanh Toàn bộ Hệ thống (One-Click Dev Script)</h3>
<p>Dự án đã tích hợp sẵn script tự động kích hoạt đồng thời cả Backend (.NET 10) và Frontend (Next.js) trong 2 cửa sổ dòng lệnh riêng biệt:</p>

<p><b>Dành cho Windows Command Prompt / Batch:</b></p>
<pre><code>cd Culinary_Blog_Nhom5
run-dev.bat</code></pre>

<p><b>Dành cho Windows PowerShell:</b></p>
<pre><code>cd Culinary_Blog_Nhom5
.\run-dev.ps1</code></pre>

---

<h3>🌐 5.4. Bảng Tổng hợp URL &amp; Cổng Dịch vụ</h3>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; border: 1px solid #d0d7de;">
  <thead>
    <tr bgcolor="#f6f8fa">
      <th style="border: 1px solid #d0d7de; width: 25%;">Dịch vụ</th>
      <th style="border: 1px solid #d0d7de; width: 35%;">Địa chỉ (URL / Port)</th>
      <th style="border: 1px solid #d0d7de;">Thông tin xác thực / Ghi chú</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border: 1px solid #d0d7de;"><b>Frontend Web App</b></td>
      <td style="border: 1px solid #d0d7de;"><code>http://localhost:3000</code></td>
      <td style="border: 1px solid #d0d7de;">Giao diện người dùng Next.js 15 App Router</td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><b>Backend API Docs (Scalar)</b></td>
      <td style="border: 1px solid #d0d7de;"><code>http://localhost:5156/scalar/v1</code></td>
      <td style="border: 1px solid #d0d7de;">Khám phá và kiểm thử tương tác API trực tiếp</td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><b>MinIO Console Web UI</b></td>
      <td style="border: 1px solid #d0d7de;"><code>http://localhost:9001</code></td>
      <td style="border: 1px solid #d0d7de;">User: <code>minioadmin</code> | Pass: <code>minioadminpassword</code></td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><b>MinIO S3 API Endpoint</b></td>
      <td style="border: 1px solid #d0d7de;"><code>http://localhost:9000</code></td>
      <td style="border: 1px solid #d0d7de;">Cổng kết nối lưu trữ tệp media và ảnh</td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><b>Seq Log Dashboard</b></td>
      <td style="border: 1px solid #d0d7de;"><code>http://localhost:5341</code></td>
      <td style="border: 1px solid #d0d7de;">Trực quan hóa structured logs và tracing</td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><b>PostgreSQL Database</b></td>
      <td style="border: 1px solid #d0d7de;"><code>localhost:5432</code></td>
      <td style="border: 1px solid #d0d7de;">DB: <code>culinary_blog_db</code> | User: <code>postgres</code> | Pass: <code>Password123!</code></td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><b>Redis Caching</b></td>
      <td style="border: 1px solid #d0d7de;"><code>localhost:6379</code></td>
      <td style="border: 1px solid #d0d7de;">Bộ nhớ đệm phân tán</td>
    </tr>
  </tbody>
</table>

---

<h3>🛠️ 5.5. Các Lệnh Thường Dùng (Cheatsheet)</h3>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; border: 1px solid #d0d7de;">
  <thead>
    <tr bgcolor="#f6f8fa">
      <th style="border: 1px solid #d0d7de; width: 40%;">Lệnh</th>
      <th style="border: 1px solid #d0d7de;">Chức năng</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>docker compose up -d</code></td>
      <td style="border: 1px solid #d0d7de;">Khởi động các dịch vụ hạ tầng (Postgres, Redis, MinIO, Seq)</td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>docker compose down</code></td>
      <td style="border: 1px solid #d0d7de;">Dừng và gỡ bỏ các container hạ tầng</td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>dotnet run --project src/CulinaryBlog.API</code></td>
      <td style="border: 1px solid #d0d7de;">Chạy Backend .NET 10 API (trong thư mục <code>Culinary_Blog_Nhom5</code>)</td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>dotnet build Culinary_Blog_Nhom5.sln</code></td>
      <td style="border: 1px solid #d0d7de;">Biên dịch toàn bộ solution backend</td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>npm run dev</code></td>
      <td style="border: 1px solid #d0d7de;">Chạy Frontend Next.js (trong thư mục <code>culinary-blog-web</code>)</td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>npm run build</code></td>
      <td style="border: 1px solid #d0d7de;">Đóng gói kiểm tra build production của Frontend</td>
    </tr>
    <tr>
      <td style="border: 1px solid #d0d7de;"><code>npm run lint</code></td>
      <td style="border: 1px solid #d0d7de;">Kiểm tra lỗi cú pháp và lint của Frontend</td>
    </tr>
  </tbody>
</table>
