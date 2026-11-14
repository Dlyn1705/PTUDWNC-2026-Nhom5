# Báo cáo Phân tích Kiến trúc và Danh mục Cấu trúc Mã nguồn (Backend & Frontend)
**Dự án:** Culinary Blog – Blog Ẩm thực và Nấu ăn  
**Tài liệu tham chiếu:** `SRS_Culinary_Blog_v1.0.0.pdf`, `Culinary_Blog_Spec.md`, `Frontend_Spec.md`  
**Kiến trúc Backend:** Clean Architecture (.NET 10 Minimal APIs, CQRS with MediatR, EF Core 10, PostgreSQL)  
**Kiến trúc Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, TanStack Query v5, Zustand, React Hook Form, Zod  
**Ngày cập nhật:** 2026-09-19  

---

## 1. Tổng quan Kiến trúc Hệ thống

Hệ thống Culinary Blog được xây dựng theo mô hình Full-stack tách biệt rõ ràng giữa **Backend API** và **Frontend Web App**:

```text
               ┌────────────────────────────────────────────────────────┐
               │         Frontend: Next.js 16 App Router                │
               │   (SSR / ISR cho Public SEO; CSR cho Dashboard & Auth)  │
               └───────────────────────────┬────────────────────────────┘
                                           │ HTTP / HTTPS (REST API)
                                           │ Bearer JWT + Correlation-ID
                                           ▼
               ┌────────────────────────────────────────────────────────┐
               │       Backend API: ASP.NET Core .NET 10 Minimal APIs   │
               └───────────────────────────┬────────────────────────────┘
                                           │
                       ┌───────────────────┴───────────────────┐
                       ▼                                       ▼
        ┌─────────────────────────────┐     ┌───────────────────────────────┐
        │ CulinaryBlog.Infrastructure │────►│   CulinaryBlog.Application    │ (CQRS, Handlers, Validators)
        └─────────────────────────────┘     └──────────────┬────────────────┘
                                                           │
                                                           ▼
                                            ┌───────────────────────────────┐
                                            │      CulinaryBlog.Domain      │ (Entities, Enums, Rules)
                                            └───────────────────────────────┘
```

1. **Backend Clean Architecture (`src/`):**
   - **Domain Layer (`CulinaryBlog.Domain`):** Nhân lõi nghiệp vụ. Chứa các thực thể cốt lõi, giá trị (value objects), enums, domain rules và các interface repository. Độc lập 100% không phụ thuộc thư viện ngoài.
   - **Application Layer (`CulinaryBlog.Application`):** Tầng điều phối nghiệp vụ (Orchestration). Chứa các use cases theo pattern CQRS (Commands, Queries), DTOs, FluentValidation validators, MediatR pipeline behaviors và service contracts.
   - **Infrastructure Layer (`CulinaryBlog.Infrastructure`):** Tầng tích hợp ngoại vi. Chứa Entity Framework Core `DbContext`, cấu hình bảng Fluent API, Audit Interceptor, hiện thực Repository/UnitOfWork, mã hóa JWT, lưu trữ tệp tin (MinIO/Local) và kết nối PostgreSQL/Redis.
   - **Presentation Layer (`CulinaryBlog.API`):** Tầng giao tiếp HTTP. Minimal APIs, Middleware (RFC 7807 Problem Details, Correlation ID), cấu hình DI, CORS, JWT Bearer Authentication, Rate Limiting và Scalar OpenAPI UI.

2. **Frontend Web Architecture (`culinary-blog-web/`):**
   - **Next.js 16 App Router:** Phân chia rõ ràng giữa các Route Groups: `(auth)` cho đăng nhập/đăng ký, `(public)` cho khách xem bài viết chuẩn SEO (SSR/ISR), và `dashboard` cho tác giả/admin quản trị (CSR).
   - **State Management & Caching:** **Zustand** quản lý client state toàn cục (Auth Session, Tokens), **TanStack Query (React Query)** quản lý server state, tự động cache và invalidate dữ liệu khi mutation.
   - **Form & Validation:** **React Hook Form** tối ưu hiệu năng render kết hợp **Zod** kiểm tra tính hợp lệ dữ liệu ngay tại client trước khi gửi lên API.
   - **Styling & Design System:** **Tailwind CSS v4** thiết kế giao diện hiện đại, responsive, hỗ trợ Dark Mode và chuẩn trợ năng WCAG 2.1 AA.

---

## 2. Sơ đồ cây thư mục mã nguồn Backend (`src/`)

```text
src/
├── CulinaryBlog.Domain/                     # TẦNG 1: DOMAIN CORE
│   ├── Common/
│   │   └── BaseEntity.cs                   # Lớp thực thể cơ sở (Id, Timestamps, Soft Delete, RowVersion)
│   ├── Entities/
│   │   ├── ApplicationUser.cs              # Tài khoản người dùng (mở rộng IdentityUser)
│   │   ├── Category.cs                     # Danh mục món ăn
│   │   ├── Recipe.cs                       # Công thức nấu ăn (Aggregate Root)
│   │   ├── RecipeImage.cs                  # Ảnh công thức (Primary, Original/Medium/Thumb)
│   │   ├── RecipeIngredient.cs             # Nguyên liệu công thức
│   │   ├── RecipeNutrition.cs              # Owned Entity: Thông tin dinh dưỡng
│   │   ├── RecipeStep.cs                   # Các bước thực hiện nấu ăn
│   │   └── RefreshToken.cs                 # Quản lý refresh token, rotation, reuse detection
│   ├── Enums/
│   │   └── RecipeEnums.cs                  # Enum RecipeDifficulty, RecipeStatus
│   ├── Exceptions/
│   │   └── DomainExceptions.cs             # Ngoại lệ nghiệp vụ (NotFound, Conflict, Forbidden, Validation)
│   ├── Interfaces/
│   │   ├── ICategoryRepository.cs          # Hợp đồng truy vấn danh mục
│   │   ├── IRecipeRepository.cs            # Hợp đồng truy vấn công thức (phân trang, lọc, FTS)
│   │   ├── IRepository.cs                  # Hợp đồng CRUD generic repository
│   │   └── IUnitOfWork.cs                  # Hợp đồng quản lý transaction và lưu dữ liệu
│   └── CulinaryBlog.Domain.csproj          # File cấu hình project Domain
│
├── CulinaryBlog.Application/                # TẦNG 2: APPLICATION (CQRS & USE CASES)
│   ├── Common/
│   │   ├── Behaviors/
│   │   │   ├── LoggingBehavior.cs          # MediatR behavior ghi log & cảnh báo thời gian > 500ms
│   │   │   └── ValidationBehavior.cs       # MediatR behavior tự động validate bằng FluentValidation
│   │   ├── Helpers/
│   │   │   └── SlugHelper.cs               # Tiện ích tạo URL Slug tiếng Việt không dấu chuẩn SEO
│   │   └── Models/
│   │       ├── ApiResponse.cs              # Định dạng JSON trả về chuẩn { success, message, data }
│   │       └── PagedResult.cs              # Mô hình phân trang chuẩn { items, totalCount, page, pageSize }
│   ├── Contracts/
│   │   ├── ICurrentUserService.cs          # Hợp đồng lấy thông tin User hiện tại từ JWT
│   │   ├── IEmailService.cs                # Hợp đồng gửi email chào mừng/kích hoạt
│   │   ├── IFileStorageService.cs          # Hợp đồng upload/xóa file ảnh
│   │   └── IJwtService.cs                  # Hợp đồng tạo Access Token & Refresh Token
│   ├── DTOs/
│   │   └── CategoryDto.cs                  # Data Transfer Objects cho Category
│   ├── Features/
│   │   └── Categories/
│   │       ├── Commands/
│   │       │   ├── CreateCategory/
│   │       │   │   └── CreateCategoryCommand.cs # Lệnh tạo danh mục, Validator và Handler
│   │       │   └── DeleteCategory/
│   │       │       └── DeleteCategoryCommand.cs # Lệnh xóa danh mục (chặn nếu còn recipe -> 409)
│   │       └── Queries/
│   │           └── GetCategories/
│   │               └── GetCategoriesQuery.cs    # Truy vấn danh sách category kèm recipe count
│   ├── DependencyInjection.cs              # Đăng ký MediatR, Validators và Behaviors vào DI
│   └── CulinaryBlog.Application.csproj     # File cấu hình project Application
│
├── CulinaryBlog.Infrastructure/             # TẦNG 3: INFRASTRUCTURE (DATABASE & ADAPTERS)
│   ├── Persistence/
│   │   ├── ApplicationDbContext.cs         # EF Core DbContext kết hợp Identity & Npgsql
│   │   ├── UnitOfWork.cs                   # Hiện thực IUnitOfWork & bắt lỗi Concurrency 409
│   │   ├── Configurations/
│   │   │   ├── ApplicationUserConfiguration.cs # Cấu hình bảng AspNetUsers
│   │   │   ├── CategoryConfiguration.cs        # Cấu hình bảng Categories
│   │   │   ├── RecipeConfiguration.cs          # Cấu hình bảng Recipes (Owned Nutrition, FKs, Indexes)
│   │   │   ├── RecipeImageConfiguration.cs     # Cấu hình bảng RecipeImages
│   │   │   ├── RecipeIngredientConfiguration.cs# Cấu hình bảng RecipeIngredients
│   │   │   ├── RecipeStepConfiguration.cs      # Cấu hình bảng RecipeSteps
│   │   │   └── RefreshTokenConfiguration.cs    # Cấu hình bảng RefreshTokens (SHA-256 hash unique)
│   │   └── Interceptors/
│   │       └── AuditInterceptor.cs         # Interceptor tự động điền CreatedAt và UpdatedAt
│   ├── Repositories/
│   │   ├── CategoryRepository.cs           # Hiện thực ICategoryRepository truy vấn DB
│   │   ├── RecipeRepository.cs             # Hiện thực IRecipeRepository kèm eager load & paging
│   │   └── Repository.cs                   # Hiện thực generic repository hỗ trợ Soft Delete
│   ├── Services/
│   │   ├── CurrentUserService.cs           # Đọc ClaimsPrincipal từ IHttpContextAccessor
│   │   ├── JwtService.cs                   # Ký JWT token HMAC-SHA256 & băm SHA-256 Refresh Token
│   │   └── LocalFileStorageService.cs      # Lưu file ảnh bằng GUID chống Path Traversal
│   ├── DependencyInjection.cs              # Đăng ký DbContext, Identity, Repositories, Services
│   └── CulinaryBlog.Infrastructure.csproj  # File cấu hình project Infrastructure
│
└── CulinaryBlog.API/                        # TẦNG 4: PRESENTATION (MINIMAL APIS & HTTP)
    ├── Endpoints/
    │   ├── AuthEndpoints.cs                # Nhóm endpoint xác thực (/api/v1/auth)
    │   ├── CategoryEndpoints.cs            # Nhóm endpoint danh mục (/api/v1/categories)
    │   ├── HealthEndpoints.cs              # Endpoint health check (/health, /live, /ready)
    │   └── RecipeEndpoints.cs              # Nhóm endpoint công thức (/api/v1/recipes)
    ├── Middlewares/
    │   ├── CorrelationIdMiddleware.cs      # Tạo và quản lý header X-Correlation-ID
    │   └── GlobalExceptionMiddleware.cs    # Chuẩn hóa toàn bộ lỗi theo RFC 7807 Problem Details
    ├── Properties/
    │   └── launchSettings.json             # Cấu hình cổng chạy dev (HTTP/HTTPS, Kestrel)
    ├── appsettings.json                    # File cấu hình ConnectionStrings, JWT, CORS
    ├── appsettings.Development.json        # File cấu hình môi trường phát triển cục bộ
    ├── CulinaryBlog.API.http               # File kịch bản test nhanh HTTP request
    ├── Program.cs                          # Điểm khởi chạy ứng dụng, thiết lập middleware pipeline
    └── CulinaryBlog.API.csproj             # File cấu hình project API
```

---

## 3. Sơ đồ cây thư mục mã nguồn Frontend (`culinary-blog-web/`)

```text
culinary-blog-web/
├── app/                                        # NEXT.JS APP ROUTER (ĐỊNH TUYẾN & TRANG)
│   ├── (auth)/                                 # Route Group: Phân hệ Xác thực tài khoản
│   │   ├── login/
│   │   │   └── page.tsx                        # Trang đăng nhập Email/Mật khẩu & Google OAuth
│   │   ├── register/
│   │   │   └── page.tsx                        # Trang đăng ký tài khoản thành viên mới
│   │   └── welcome/
│   │       └── page.tsx                        # Trang chào mừng & nhắc nhở kiểm tra email kích hoạt
│   │
│   ├── (public)/                               # Route Group: Phân hệ Người dùng công cộng (SEO / SSR)
│   │   ├── categories/
│   │   │   ├── page.tsx                        # Trang danh sách tất cả các danh mục món ăn
│   │   │   └── [slug]/
│   │   │       └── page.tsx                    # Trang chi tiết danh mục kèm bài viết thuộc danh mục
│   │   ├── recipes/
│   │   │   ├── page.tsx                        # Trang danh sách công thức cộng đồng (Published)
│   │   │   └── [slug]/
│   │   │       └── page.tsx                    # Trang chi tiết công thức chuẩn SEO & Schema.org
│   │   ├── search/
│   │   │   └── page.tsx                        # Trang tìm kiếm toàn văn bản FTS, bộ lọc, sắp xếp
│   │   ├── profile/
│   │   │   └── page.tsx                        # Trang xem hồ sơ cá nhân & chỉnh sửa thông tin/mật khẩu
│   │   └── status/
│   │       └── page.tsx                        # Trang theo dõi sức khỏe hệ thống (Health Check Monitor)
│   │
│   ├── dashboard/                              # Route Group: Phân hệ Quản trị & Tác giả (CSR)
│   │   ├── layout.tsx                          # Layout chung cho Dashboard (Sidebar, Header, Breadcrumbs)
│   │   ├── page.tsx                            # Trang tổng quan thống kê nhanh cho Author/Admin
│   │   ├── categories/
│   │   │   └── page.tsx                        # Trang quản trị danh mục CRUD (Dành riêng cho Admin)
│   │   └── recipes/
│   │       ├── page.tsx                        # Quản lý danh sách bài viết & Publish / Archive
│   │       ├── new/
│   │       │   └── page.tsx                    # Trình biên soạn tạo mới công thức nấu ăn
│   │       └── [id]/
│   │           └── edit/
│   │               └── page.tsx                # Trình chỉnh sửa công thức & xử lý RowVersion Concurrency
│   │
│   ├── layout.tsx                              # Root Layout (Navbar, Footer, QueryProvider, AuthProvider)
│   ├── page.tsx                                # Landing Page / Trang chủ (Hero, Featured, Latest)
│   ├── sitemap.ts                              # Next.js Dynamic XML Sitemap Generator cho SEO
│   ├── robots.ts                               # Khai báo cấu hình robots.txt cho web crawlers
│   ├── favicon.ico                             # Favicon biểu tượng website
│   └── globals.css                             # Cấu hình Tailwind CSS v4 và styles toàn cục
│
├── components/                                 # CÁC THÀNH PHẦN GIAO DIỆN TÁI SỬ DỤNG
│   ├── auth/                                   # Components phục vụ module xác thực
│   │   ├── LoginForm.tsx                       # Form đăng nhập kèm react-hook-form + zod
│   │   ├── RegisterForm.tsx                    # Form đăng ký kèm validate độ mạnh mật khẩu
│   │   ├── GoogleLoginButton.tsx               # Nút đăng nhập Google OAuth 2.0
│   │   └── WelcomeBanner.tsx                   # Banner chào mừng người dùng mới
│   │
│   ├── categories/                             # Components danh mục món ăn
│   │   ├── CategoryCard.tsx                    # Thẻ hiển thị tóm tắt danh mục (Ảnh, tên, số bài)
│   │   ├── CategoryGrid.tsx                    # Lưới hiển thị danh sách các danh mục
│   │   └── CategoryHeader.tsx                  # Banner tiêu đề trang chi tiết danh mục
│   │
│   ├── recipes/                                # Components công thức nấu ăn công cộng
│   │   ├── RecipeCard.tsx                      # Thẻ tóm tắt món ăn (Ảnh 16:9, độ khó, thời gian, calo)
│   │   ├── RecipeGrid.tsx                      # Lưới danh sách bài viết công thức
│   │   ├── RecipeHero.tsx                      # Header bài viết (Tiêu đề lớn, ảnh chính, nút chia sẻ, in)
│   │   ├── IngredientList.tsx                  # Checklist danh sách nguyên liệu có thể tick chọn
│   │   ├── StepByStepList.tsx                  # Danh sách hướng dẫn từng bước tuần tự kèm ảnh
│   │   ├── NutritionCard.tsx                   # Bảng chi tiết thành phần dinh dưỡng (Calories, Protein...)
│   │   ├── RecipeTimer.tsx                     # Widget đồng hồ đếm ngược thông minh theo bước nấu
│   │   └── editor/                             # Bộ công cụ biên soạn công thức (Author / Admin)
│   │       ├── RecipeForm.tsx                  # Form container chính điều phối submit & lưu nháp
│   │       ├── BasicInfoFields.tsx             # Nhập tiêu đề, slug, danh mục, độ khó, thời gian, khẩu phần
│   │       ├── NutritionFields.tsx             # Nhập chi tiết các chỉ số dinh dưỡng
│   │       ├── IngredientManager.tsx           # Quản lý dynamic field array nguyên liệu (Thêm, Xóa, Thứ tự)
│   │       ├── StepManager.tsx                 # Quản lý dynamic steps (Tự động đánh số liên tục 1..N, Timer)
│   │       ├── ImageGalleryManager.tsx         # Quản lý bộ sưu tập ảnh, chọn Primary Image, resize state
│   │       └── DeleteRecipeModal.tsx           # Hộp thoại xác nhận xóa vĩnh viễn công thức
│   │
│   ├── search/                                 # Components tìm kiếm & lọc nâng cao
│   │   ├── SearchInput.tsx                     # Thanh tìm kiếm FTS tiếng Việt có debounce 400ms
│   │   ├── FilterSidebar.tsx                   # Khối lọc đa năng (Category, Độ khó, Thời gian, Khẩu phần)
│   │   ├── SortDropdown.tsx                    # Dropdown sắp xếp (Mới nhất, Cũ nhất, Nấu nhanh, A-Z)
│   │   ├── PaginationControl.tsx               # Điều khiển chuyển trang phân trang PagedResult
│   │   └── SearchResults.tsx                   # Hiển thị lưới kết quả hoặc Empty State minh họa
│   │
│   ├── dashboard/                              # Components dành riêng cho trang Dashboard
│   │   ├── CategoryTable.tsx                   # Bảng dữ liệu danh mục dành cho Admin
│   │   ├── CategoryModal.tsx                   # Modal tạo mới / sửa danh mục món ăn
│   │   ├── DeleteCategoryModal.tsx             # Modal xóa danh mục (kiểm tra chặn xóa nếu còn recipe)
│   │   ├── RecipeStatusTable.tsx               # Bảng công thức kèm bộ lọc Tab (All, Draft, Published, Archived)
│   │   ├── PublishRecipeModal.tsx              # Modal xuất bản bài viết (kiểm tra điều kiện steps >= 1)
│   │   └── ArchiveRecipeModal.tsx              # Modal lưu trữ công thức bài viết
│   │
│   ├── common/                                 # Components dùng chung toàn ứng dụng
│   │   ├── FileUploadDropzone.tsx              # Vùng kéo thả tải file MinIO (validate <= 5MB, preview, progress)
│   │   ├── FileDeleteConfirmModal.tsx          # Modal xác nhận xóa file MinIO
│   │   ├── SystemStatusIndicator.tsx           # Badge hiển thị tình trạng Healthy/Unhealthy của backend
│   │   ├── ErrorBoundary.tsx                   # Bắt lỗi React runtime và hiển thị UI phục hồi
│   │   └── ConfirmationDialog.tsx              # Dialog xác nhận thao tác quan trọng
│   │
│   └── layout/                                 # Khung giao diện dùng chung
│       ├── Navbar.tsx                          # Thanh điều hướng chính trên cùng
│       ├── Footer.tsx                          # Chân trang website kèm liên kết sitemap
│       ├── UserNav.tsx                         # Menu avatar người dùng, profile, nút đăng xuất
│       └── Sidebar.tsx                         # Menu bên thanh điều hướng của Dashboard
│
├── lib/                                        # THƯ VIỆN, TIỆN ÍCH & GỌI API CLIENT
│   ├── api/
│   │   ├── axiosClient.ts                      # Instance Axios cấu hình sẵn, JWT interceptor, Correlation-ID
│   │   ├── authApi.ts                          # Các hàm gọi API xác thực (/api/v1/auth)
│   │   ├── categoryApi.ts                      # Các hàm gọi API danh mục (/api/v1/categories)
│   │   ├── recipeApi.ts                        # Các hàm gọi API công thức (/api/v1/recipes)
│   │   └── fileApi.ts                          # Các hàm tải và xóa file trên MinIO
│   ├── logger.ts                               # Tiện ích ghi log có cấu trúc tại client
│   └── auth.ts                                 # Tiện ích giải mã token, kiểm tra role/quyền hạn
│
├── store/                                      # QUẢN LÝ TRẠNG THÁI CLIENT (ZUSTAND)
│   └── authStore.ts                            # Zustand Store lưu thông tin User, AccessToken, Auth state
│
├── hooks/                                      # CUSTOM REACT HOOKS
│   ├── useAuth.ts                              # Hook kiểm tra đăng nhập, lấy user hiện tại và phân quyền
│   └── useFileUpload.ts                        # Hook xử lý kéo thả tải file lên MinIO và tiến trình %
│
└── types/                                      # ĐỊNH NGHĨA KIỂU DỮ LIỆU (TYPESCRIPT)
    ├── auth.types.ts                           # Interface User, LoginRequest, RegisterRequest, AuthResponse
    ├── category.types.ts                       # Interface CategoryDto, CreateCategoryDto, UpdateCategoryDto
    ├── recipe.types.ts                         # Interface RecipeDto, StepDto, IngredientDto, NutritionDto
    └── api.types.ts                            # Interface ApiResponse<T>, PagedResult<T>, ProblemDetails (RFC 7807)
```

---

## 4. Phân tích chi tiết chức năng từng file Backend

### 4.1. Tầng Domain (`CulinaryBlog.Domain`)

| Tên File | Đường dẫn | Mục đích & Chức năng cụ thể |
| :--- | :--- | :--- |
| `BaseEntity.cs` | `Common/` | Lớp trừu tượng định nghĩa các thuộc tính chung mà mọi entity kế thừa: `Id` (UUID v4 ngẫu nhiên), `CreatedAt` (thời điểm tạo), `UpdatedAt` (thời điểm sửa), `IsDeleted` (cờ soft delete) và `RowVersion` (mã kiểm soát xung đột dữ liệu Optimistic Concurrency). |
| `RecipeEnums.cs` | `Enums/` | Khai báo 2 kiểu liệt kê chuẩn theo SRS: `RecipeDifficulty` (`Easy=1, Medium=2, Hard=3, Expert=4`) và `RecipeStatus` (`Draft=0, Published=1, Archived=2`). |
| `Recipe.cs` | `Entities/` | Thực thể trung tâm (Aggregate Root) của hệ thống. Chứa toàn bộ logic nghiệp vụ của công thức nấu ăn, quản lý các collection con (`Steps`, `Ingredients`, `Images`), sở hữu owned entity `Nutrition`. Cung cấp domain methods: `Publish()` (kiểm tra điều kiện ít nhất 1 step), `Unpublish()`, `Archive()`, `SetNutrition()`, và `Update()`. |
| `Category.cs` | `Entities/` | Đại diện cho bảng danh mục phân loại món ăn. Quản lý `Name`, `Slug` (dùng cho URL thân thiện SEO), `Description`, `ImageUrl`, `OrderIndex` và quan hệ 1-Nhiều với `Recipe`. |
| `RecipeNutrition.cs` | `Entities/` | Thực thể sở hữu (Owned Entity). Không có bảng độc lập mà được nhúng trực tiếp vào bảng `Recipes` dưới dạng các cột có tiền tố `Nutrition_` (`Calories`, `Protein`, `Carbohydrates`, `Fat`, `Fiber`, `Sodium`). |
| `RecipeStep.cs` | `Entities/` | Đại diện cho từng bước hướng dẫn nấu ăn. Lưu trữ `StepNumber` (thứ tự), `Title`, `Description`, `TimerMinutes` (thời gian hẹn giờ tính bằng phút) và `ImageUrl`. Có quan hệ ràng buộc cascade delete với Recipe. |
| `RecipeIngredient.cs`| `Entities/` | Đại diện cho danh sách nguyên liệu của công thức. Lưu trữ `Name`, `Quantity` (số lượng số thực), `Unit` (đơn vị tính: gram, ml, thìa), `Notes` và `OrderIndex`. |
| `RecipeImage.cs` | `Entities/` | Đại diện cho hình ảnh của công thức. Lưu `OriginalUrl`, `MediumUrl` (800x600), `ThumbnailUrl` (300x300), `AltText` (phục vụ accessibility), cờ `IsPrimary` (đánh dấu ảnh đại diện chính) và `OrderIndex`. |
| `ApplicationUser.cs` | `Entities/` | Lớp tài khoản người dùng kế thừa `IdentityUser<string>` của ASP.NET Core Identity. Mở rộng thêm các thuộc tính: `DisplayName`, `AvatarUrl`, `Bio`, `IsActive` (hỗ trợ ban tài khoản), `CreatedAt` và navigation tới các Recipe/Token của user. |
| `RefreshToken.cs` | `Entities/` | Quản lý phiên xác thực người dùng dài hạn (7 ngày). Lưu trữ chuỗi băm `TokenHash` (SHA-256), thời gian hết hạn `ExpiresAt`, thời gian thu hồi `RevokedAt`, `ReplacedByTokenHash` để truy vết họ token (Token Family) và phát hiện tấn công tái sử dụng (Reuse Detection). |
| `DomainExceptions.cs`| `Exceptions/`| Tập hợp các ngoại lệ miền chuẩn hóa: `DomainException` (vi phạm quy tắc nghiệp vụ), `NotFoundException` (không tìm thấy thực thể), `ConflictException` (trùng dữ liệu hoặc lỗi concurrency), `ForbiddenException` (không có quyền), và `ValidationException` (lỗi dữ liệu đầu vào). |
| `IRepository.cs` | `Interfaces/`| Interface generic định nghĩa các thao tác CRUD cơ bản (`GetByIdAsync`, `GetAllAsync`, `FindAsync`, `AddAsync`, `Update`, `Delete` soft-delete) cho mọi thực thể kế thừa `BaseEntity`. |
| `ICategoryRepository.cs`| `Interfaces/`| Interface mở rộng riêng cho Category: tìm kiếm theo slug, kiểm tra trùng tên/slug, và lấy toàn bộ danh mục kèm số lượng công thức đã xuất bản. |
| `IRecipeRepository.cs` | `Interfaces/`| Interface mở rộng riêng cho Recipe: truy vấn chi tiết kèm các collection con (eager loading), kiểm tra slug, đếm số recipe theo danh mục, và truy vấn phân trang có lọc theo độ khó, danh mục, thời gian nấu và sắp xếp. |
| `IUnitOfWork.cs` | `Interfaces/`| Interface định nghĩa Unit of Work pattern, tập trung quản lý commit dữ liệu đa thực thể qua phương thức `SaveChangesAsync` và đảm bảo toàn vẹn transaction. |
| `CulinaryBlog.Domain.csproj` | Gốc Domain | Khai báo framework `.NET 10.0`, cấu hình `ImplicitUsings`, `Nullable` và tham chiếu gói `Microsoft.Extensions.Identity.Stores` (cung cấp các lớp cơ sở cho Identity). |

---

### 4.2. Tầng Application (`CulinaryBlog.Application`)

| Tên File | Đường dẫn | Mục đích & Chức năng cụ thể |
| :--- | :--- | :--- |
| `IJwtService.cs` | `Contracts/` | Interface định nghĩa hợp đồng tạo JWT Access Token (15 phút, chứa claims userId, email, roles, jti), sinh Refresh Token ngẫu nhiên và băm SHA-256 token. |
| `IFileStorageService.cs`| `Contracts/`| Interface trừu tượng hóa dịch vụ lưu trữ tệp (MinIO / S3 / Local storage), cho phép hoán đổi nơi lưu ảnh mà không làm ảnh hưởng tầng nghiệp vụ. |
| `ICurrentUserService.cs`| `Contracts/`| Interface định nghĩa việc truy xuất danh tính người dùng đang gọi API (`UserId`, `Email`, danh sách `Roles`, `IsAdmin`). |
| `IEmailService.cs` | `Contracts/` | Interface định nghĩa gửi email bất đồng bộ (email chào mừng thành viên mới). |
| `ValidationBehavior.cs` | `Common/Behaviors/` | Pipeline Behavior của MediatR. Tự động thu thập tất cả các class `AbstractValidator<T>` tương ứng với Request, thực hiện validate trước khi request tới Handler; nếu có lỗi lập tức ném ra `ValidationException` chứa danh sách chi tiết các trường bị lỗi. |
| `LoggingBehavior.cs` | `Common/Behaviors/` | Pipeline Behavior của MediatR. Ghi log khi bắt đầu và kết thúc mỗi Command/Query, bấm giờ xử lý và phát cảnh báo `LogWarning` nếu thời gian xử lý vượt quá 500ms (theo yêu cầu hiệu năng NFR-PERF). |
| `SlugHelper.cs` | `Common/Helpers/` | Chuyển đổi tiêu đề món ăn thành đường dẫn URL thân thiện SEO: loại bỏ toàn bộ dấu tiếng Việt (unaccent), chuyển chữ thường, thay khoảng trắng và ký tự đặc biệt thành dấu gạch nối `-`. |
| `PagedResult.cs` | `Common/Models/` | Lớp dữ liệu generic đóng gói kết quả phân trang theo chuẩn SRS: danh sách bản ghi `Items`, `TotalCount`, `Page`, `PageSize`, `TotalPages`, cùng 2 cờ `HasNextPage` và `HasPreviousPage`. |
| `ApiResponse.cs` | `Common/Models/` | Lớp wrapper chuẩn hóa cấu trúc dữ liệu JSON trả về cho client: `Success`, `Message`, `Data`. |
| `CategoryDto.cs` | `DTOs/` | Chứa các đối tượng truyền dữ liệu (DTO) của Module danh mục: `CategoryDto` (trả về chi tiết kèm số lượng công thức `RecipeCount`), `CreateCategoryDto`, `UpdateCategoryDto`. |
| `GetCategoriesQuery.cs` | `Features/Categories/Queries/GetCategories/` | Chứa `GetCategoriesQuery` và `GetCategoriesQueryHandler`. Sử dụng MediatR để xử lý truy vấn danh sách danh mục và ánh xạ sang `CategoryDto`. |
| `CreateCategoryCommand.cs` | `Features/Categories/Commands/CreateCategory/` | Chứa `CreateCategoryCommand`, `CreateCategoryCommandValidator` (kiểm tra tên 2-50 ký tự), và `CreateCategoryCommandHandler` (tự động tạo slug, kiểm tra trùng tên/slug, lưu vào DB và trả về DTO). |
| `DeleteCategoryCommand.cs` | `Features/Categories/Commands/DeleteCategory/` | Chứa `DeleteCategoryCommand` và Handler. Áp dụng quy tắc nghiệp vụ FR-CAT-005: nếu danh mục vẫn còn công thức (kể cả Draft), từ chối xóa và ném `ConflictException` (409). |
| `DependencyInjection.cs` | Gốc Application | Extension method `AddApplication(this IServiceCollection services)` quét assembly để đăng ký tự động MediatR, FluentValidation và 2 Pipeline Behaviors (Logging, Validation). |
| `CulinaryBlog.Application.csproj` | Gốc Application | Cấu hình tham chiếu thư viện: `MediatR`, `FluentValidation`, `Mapster`, `Microsoft.Extensions.Logging.Abstractions` và liên kết trực tiếp tới project `CulinaryBlog.Domain`. |

---

### 4.3. Tầng Infrastructure (`CulinaryBlog.Infrastructure`)

| Tên File | Đường dẫn | Mục đích & Chức năng cụ thể |
| :--- | :--- | :--- |
| `ApplicationDbContext.cs` | `Persistence/` | Lớp kết nối CSDL trung tâm của Entity Framework Core, kế thừa `IdentityDbContext` với `ApplicationUser`. Đăng ký các `DbSet`, khai báo extension PostgreSQL (`unaccent`, `pg_trgm`) và tự động nạp cấu hình các bảng. |
| `AuditInterceptor.cs` | `Persistence/Interceptors/`| Can thiệp vào chu trình `SavingChangesAsync` của EF Core để tự động quét qua các entity kế thừa `BaseEntity`, tự động gán `CreatedAt` khi thêm mới và cập nhật `UpdatedAt` khi chỉnh sửa. |
| `UnitOfWork.cs` | `Persistence/` | Hiện thực `IUnitOfWork`. Quản lý tập trung các repository `Categories` và `Recipes`. Trong `SaveChangesAsync`, bắt ngoại lệ `DbUpdateConcurrencyException` của EF Core và ánh xạ thành `ConflictException` (HTTP 409) cho API. |
| `CategoryConfiguration.cs` | `Persistence/Configurations/` | Cấu hình bảng `Categories` bằng Fluent API: khóa chính, độ dài `Name` (100), `Slug` (120 - Unique Index), cột `RowVersion`, và Global Query Filter tự động lọc bỏ các bản ghi `IsDeleted == true`. |
| `RecipeConfiguration.cs` | `Persistence/Configurations/` | Cấu hình bảng `Recipes`: tiêu đề, độ dài slug (Unique Index), cấu hình nhúng Owned Entity `Nutrition` (tạo ra các cột `Nutrition_Calories`, v.v.), cấu hình quan hệ Khóa ngoại với Category (`OnDelete Restrict`) và Author, đánh chỉ mục tìm kiếm và lọc. |
| `RecipeStepConfiguration.cs` | `Persistence/Configurations/` | Cấu hình bảng `RecipeSteps`: trường mô tả, thời gian, thiết lập quan hệ cascade delete với Recipe và composite index trên `(RecipeId, StepNumber)`. |
| `RecipeIngredientConfiguration.cs`| `Persistence/Configurations/` | Cấu hình bảng `RecipeIngredients`: tên, số lượng (precision 10, 3), đơn vị đo và cascade delete theo Recipe. |
| `RecipeImageConfiguration.cs`| `Persistence/Configurations/` | Cấu hình bảng `RecipeImages`: lưu URL ảnh gốc, ảnh vừa, ảnh nhỏ, cờ `IsPrimary` và cascade delete theo Recipe. |
| `RefreshTokenConfiguration.cs`| `Persistence/Configurations/` | Cấu hình bảng `RefreshTokens`: ràng buộc unique index trên `TokenHash` (64 ký tự), quan hệ cascade delete theo User. |
| `ApplicationUserConfiguration.cs`| `Persistence/Configurations/` | Cấu hình mở rộng cho bảng `AspNetUsers`: độ dài `DisplayName` (100), `AvatarUrl` (500), `Bio` (text) và giá trị mặc định cho `IsActive = true`. |
| `Repository.cs` | `Repositories/` | Hiện thực hóa generic `IRepository<T>` bằng EF Core. Khi thực hiện `Delete`, chuyển đổi thao tác xóa vật lý thành Soft Delete (`IsDeleted = true`, cập nhật `UpdatedAt`). |
| `CategoryRepository.cs` | `Repositories/` | Hiện thực `ICategoryRepository`: truy vấn DB PostgreSQL, đếm số công thức đã xuất bản tương ứng với từng danh mục. |
| `RecipeRepository.cs` | `Repositories/` | Hiện thực `IRecipeRepository`: thực hiện truy vấn phân trang, eager loading các liên kết (`Category`, `Author`, `Steps`, `Ingredients`, `Images`), hỗ trợ lọc linh hoạt theo tác giả, độ khó, thời gian và sắp xếp. |
| `CurrentUserService.cs` | `Services/` | Hiện thực `ICurrentUserService`: đọc thông tin định danh `UserId`, `Email`, vai trò `Roles` từ `ClaimsPrincipal` trong `HttpContext` của ASP.NET Core. |
| `JwtService.cs` | `Services/` | Hiện thực `IJwtService`: nạp Secret Key và cấu hình từ `appsettings.json`, ký access token theo thuật toán HMAC-SHA256 (15 phút), sinh refresh token 64-byte ngẫu nhiên bảo mật cao và mã hóa chuỗi băm SHA-256. |
| `LocalFileStorageService.cs`| `Services/` | Hiện thực `IFileStorageService`: lưu ảnh cục bộ vào thư mục `wwwroot/uploads/{folder}` trong môi trường development, sinh tên file bằng GUID ngẫu nhiên để triệt tiêu nguy cơ tấn công Path Traversal. |
| `DependencyInjection.cs` | Gốc Infrastructure | Extension method `AddInfrastructure`: cấu hình kết nối PostgreSQL Npgsql, đăng ký `AuditInterceptor`, cấu hình Identity Core, đăng ký các Repositories, `UnitOfWork` và các dịch vụ cơ sở hạ tầng. |
| `CulinaryBlog.Infrastructure.csproj`| Gốc Infrastructure | File cấu hình project: tham chiếu `Npgsql.EntityFrameworkCore.PostgreSQL`, `Microsoft.AspNetCore.Identity.EntityFrameworkCore`, `System.IdentityModel.Tokens.Jwt`, `FrameworkReference Microsoft.AspNetCore.App`, và tham chiếu `CulinaryBlog.Application`. |

---

### 4.4. Tầng Presentation & API (`CulinaryBlog.API`)

| Tên File | Đường dẫn | Mục đích & Chức năng cụ thể |
| :--- | :--- | :--- |
| `CorrelationIdMiddleware.cs` | `Middlewares/` | Middleware kiểm tra header `X-Correlation-ID` trong HTTP request. Nếu client chưa truyền, tự động sinh UUID mới, gắn vào `HttpContext.Items` và trả ngược lại qua HTTP Response Header để phục vụ truy vết log phân tán (Distributed Tracing). |
| `GlobalExceptionMiddleware.cs`| `Middlewares/` | Middleware trung tâm xử lý toàn bộ ngoại lệ chưa được bắt (unhandled exceptions). Chuẩn hóa phản hồi lỗi theo đúng tiêu chuẩn quốc tế **RFC 7807 Problem Details** (`application/problem+json`). Tự động ánh xạ: `ValidationException` ➔ 422 (kèm chi tiết lỗi từng trường), `NotFoundException` ➔ 404, `ConflictException` ➔ 409, `ForbiddenException` ➔ 403, `UnauthorizedAccessException` ➔ 401, và các lỗi hệ thống khác ➔ 500 (che giấu stack trace khi ở Production). |
| `CategoryEndpoints.cs` | `Endpoints/` | Định nghĩa các Minimal API Endpoints cho danh mục món ăn: `GET /api/v1/categories` (xem danh sách), `POST /api/v1/categories` (tạo mới - trả về 201 Created kèm Location header), và `DELETE /api/v1/categories/{id}` (xóa danh mục). |
| `AuthEndpoints.cs` | `Endpoints/` | Định nghĩa route group cho module xác thực người dùng `/api/v1/auth`. |
| `RecipeEndpoints.cs` | `Endpoints/` | Định nghĩa route group và endpoint phân trang, lọc công thức nấu ăn `GET /api/v1/recipes`. |
| `HealthEndpoints.cs` | `Endpoints/` | Hiện thực module quan sát FR-OBS-001: cung cấp 3 endpoint kiểm tra sức khỏe hệ thống: `GET /health` (tổng hợp), `GET /health/live` (Liveness probe cho container), `GET /health/ready` (Readiness probe sẵn sàng nhận tải). |
| `Program.cs` | Gốc API | File khởi chạy chính (Composition Root) của Backend API: thiết lập Serilog logging, đăng ký DI của Application và Infrastructure, cấu hình xác thực JWT Bearer & RBAC Authorization policies (`AuthorPolicy`, `AdminPolicy`), cấu hình CORS cho client Next.js (port 3000), kích hoạt Scalar OpenAPI UI (`/scalar`), đăng ký pipeline middleware và map toàn bộ endpoint groups. |
| `appsettings.json` | Gốc API | File cấu hình ứng dụng: chuỗi kết nối CSDL PostgreSQL (`DefaultConnection`), khóa bí mật và thời hạn JWT (`Jwt`), danh sách tên miền được phép truy cập CORS (`Cors:AllowedOrigins`), và mức độ ghi log Serilog. |
| `appsettings.Development.json`| Gốc API | File cấu hình ghi đè dành riêng cho môi trường phát triển cục bộ. |
| `CulinaryBlog.API.http` | Gốc API | File kịch bản chứa các HTTP request mẫu phục vụ việc kiểm thử nhanh API trực tiếp từ Visual Studio / VS Code. |
| `launchSettings.json` | `Properties/` | Cấu hình các profile khởi chạy ứng dụng cục bộ qua Kestrel hoặc IIS Express (cổng HTTP: 5000, HTTPS: 7000). |
| `CulinaryBlog.API.csproj` | Gốc API | Khai báo SDK `Microsoft.NET.Sdk.Web`, tham chiếu các gói `Microsoft.AspNetCore.Authentication.JwtBearer`, `Scalar.AspNetCore`, `Serilog.AspNetCore` và project references tới `Application` và `Infrastructure`. |

---

## 5. Phân tích chi tiết chức năng từng file Frontend (`culinary-blog-web/`)

### 5.1. Phân hệ Định tuyến & Trang (`app/`)

| Tên File | Đường dẫn Route | Mục đích & Chức năng cụ thể | Thành viên |
| :--- | :--- | :--- | :--- |
| `page.tsx` | `/` | Trang chủ Landing Page. Hiển thị Hero banner, thanh tìm kiếm nhanh, danh sách danh mục nổi bật (`CategoryGrid`) và công thức mới xuất bản (`RecipeGrid`). | **Linh** |
| `layout.tsx` | Toàn hệ thống | Root Layout. Bao bọc ứng dụng bằng `QueryClientProvider`, nạp font chữ Geist, tích hợp `Navbar`, `Footer`, Toast notifications container. | Chung |
| `sitemap.ts` | `/sitemap.xml` | Dynamic XML Sitemap generator. Gọi API lấy toàn bộ URLs của công thức đã xuất bản và danh mục để tạo sitemap chuẩn Google bot (FR-JOB-003). | **Linh** |
| `(auth)/login/page.tsx` | `/auth/login` | Trang đăng nhập. Chứa form nhập Email/Mật khẩu và nút Google OAuth 2.0. Xử lý lưu session và redirect thông minh qua callbackUrl (FR-AUTH-002, 003). | **Ân** |
| `(auth)/register/page.tsx` | `/auth/register` | Trang đăng ký. Form nhập DisplayName, Email, Mật khẩu và Xác nhận mật khẩu với validation chặt chẽ bằng Zod (FR-AUTH-001). | **Ân** |
| `(auth)/welcome/page.tsx` | `/auth/welcome` | Trang chào mừng người dùng mới sau đăng ký thành công, thông báo kiểm tra email kích hoạt tài khoản (FR-JOB-001). | **Trâm** |
| `(public)/categories/page.tsx` | `/categories` | Trang danh sách toàn bộ danh mục món ăn. Gọi API `GET /api/v1/categories`, hiển thị card kèm ảnh và số lượng bài viết (FR-CAT-001). | **Linh** |
| `(public)/categories/[slug]/page.tsx` | `/categories/[slug]` | Trang chi tiết danh mục theo URL slug. Hiển thị thông tin danh mục và danh sách các công thức thuộc danh mục đó (FR-CAT-002). | **Linh** |
| `(public)/recipes/page.tsx` | `/recipes` | Trang khám phá công thức công cộng. Danh sách bài viết trạng thái `Published` dạng lưới card kèm phân loại nhanh (FR-RCP-001). | **Linh** |
| `(public)/recipes/[slug]/page.tsx` | `/recipes/[slug]` | Trang chi tiết công thức chuẩn SEO: Tích hợp Schema.org Recipe JSON-LD, Hero ảnh lớn, Checklist nguyên liệu, Các bước tuần tự kèm đếm giờ RecipeTimer (FR-RCP-002). | **Linh** |
| `(public)/search/page.tsx` | `/search` | Trang tìm kiếm & lọc nâng cao. Thanh tìm kiếm FTS debounce 400ms, bộ lọc đa tiêu chí (danh mục, độ khó, thời gian), sắp xếp, phân trang PagedResult (FR-SRCH-001..004). | **Tuấn** |
| `(public)/profile/page.tsx` | `/profile` | Trang xem và chỉnh sửa hồ sơ cá nhân. Sửa DisplayName, Bio, thay avatar qua MinIO và form đổi mật khẩu (FR-AUTH-006, 007). | **Ân** |
| `(public)/status/page.tsx` | `/status` | Trang theo dõi sức khỏe hệ thống. Gọi `GET /health` hiển thị tình trạng hoạt động và độ trễ phản hồi của PostgreSQL, Redis, MinIO (FR-OBS-001). | **Ân** |
| `dashboard/layout.tsx` | `/dashboard/*` | Layout khu vực quản trị/tác giả. Tích hợp Sidebar điều hướng, Topbar thông tin user, kiểm tra quyền truy cập (Auth Guard). | Chung |
| `dashboard/page.tsx` | `/dashboard` | Trang tổng quan dashboard dành cho Author/Admin: Thống kê số lượng bài viết nháp, đã xuất bản, lưu trữ. | Chung |
| `dashboard/categories/page.tsx` | `/dashboard/categories` | Trang quản trị danh mục dành riêng cho **Admin**. Xem bảng danh mục, modal thêm mới (FR-CAT-003), sửa (FR-CAT-004), xóa kèm chặn xóa nếu còn recipe (FR-CAT-005). | **Linh** |
| `dashboard/recipes/page.tsx` | `/dashboard/recipes` | Bảng quản lý bài viết của Author/Admin. Lọc theo tab trạng thái, thực hiện Xuất bản (FR-RCP-005), Hủy xuất bản và Lưu trữ / Khôi phục bài viết (FR-RCP-006). | **Tuấn** |
| `dashboard/recipes/new/page.tsx` | `/dashboard/recipes/new` | Trình tạo mới công thức nấu ăn. Form biên soạn thông tin chung, calo dinh dưỡng, nguyên liệu, các bước và ảnh; lưu ở trạng thái Draft (FR-RCP-003). | **Trâm** |
| `dashboard/recipes/[id]/edit/page.tsx`| `/dashboard/recipes/[id]/edit` | Trình sửa công thức (Chỉ Owner/Admin). Nạp dữ liệu cũ, xử lý kiểm soát xung đột dữ liệu Optimistic Concurrency qua `RowVersion` (FR-RCP-004). | **Trâm** |

---

### 5.2. Phân hệ Thành phần Giao diện (`components/`)

| Tên File | Thư mục con | Mục đích & Chức năng cụ thể | Thành viên |
| :--- | :--- | :--- | :--- |
| `LoginForm.tsx` | `components/auth/` | Form đăng nhập bằng Email/Password, tích hợp `react-hook-form` + `zod`, xử lý loading và hiển thị lỗi xác thực. | **Ân** |
| `RegisterForm.tsx` | `components/auth/` | Form đăng ký tài khoản mới, kiểm tra độ mạnh mật khẩu và xử lý lỗi trùng email (RFC 7807). | **Ân** |
| `GoogleLoginButton.tsx` | `components/auth/` | Nút đăng nhập Google OAuth 2.0 chuẩn giao diện Google Sign-In. | **Ân** |
| `WelcomeBanner.tsx` | `components/auth/` | Khối banner chào mừng thành viên mới sau đăng ký, hướng dẫn kích hoạt tài khoản qua email. | **Trâm** |
| `CategoryCard.tsx` | `components/categories/` | Thẻ card hiển thị tóm tắt danh mục: ảnh thumbnail, tên danh mục, mô tả ngắn và badge số lượng công thức. | **Linh** |
| `CategoryGrid.tsx` | `components/categories/` | Lưới hiển thị danh sách các card danh mục, tích hợp hiệu ứng hover và skeleton loading. | **Linh** |
| `CategoryHeader.tsx` | `components/categories/` | Banner đầu trang chi tiết danh mục: tiêu đề lớn, ảnh nền và breadcrumbs điều hướng. | **Linh** |
| `RecipeCard.tsx` | `components/recipes/` | Thẻ card tóm tắt công thức món ăn: ảnh đại diện chính (Primary Image), badge độ khó, thời gian nấu, khẩu phần và tác giả. | **Linh** |
| `RecipeGrid.tsx` | `components/recipes/` | Lưới bài viết công thức responsive, hỗ trợ chuyển đổi giao diện dạng lưới (Grid) hoặc danh sách (List). | **Linh** |
| `RecipeHero.tsx` | `components/recipes/` | Khu vực đầu bài viết chi tiết: ảnh lớn tỉ lệ vàng, tiêu đề, ngày đăng, tác giả, nút chia sẻ mạng xã hội và nút In bài viết (Print Recipe). | **Linh** |
| `IngredientList.tsx` | `components/recipes/` | Danh sách nguyên liệu nấu ăn dạng checklist cho phép người đọc tick chọn các mục đã chuẩn bị. | **Linh** |
| `StepByStepList.tsx` | `components/recipes/` | Danh sách các bước nấu ăn hiển thị tuần tự số thứ tự (Bước 1, 2, 3), mô tả chi tiết và ảnh minh họa từng bước. | **Linh** |
| `NutritionCard.tsx` | `components/recipes/` | Bảng hiển thị thông tin dinh dưỡng: Calo, Protein, Carbohydrates, Chất béo, Chất xơ, Natri. | **Linh** |
| `RecipeTimer.tsx` | `components/recipes/` | Tiện ích đồng hồ đếm ngược thông minh (Timer) nhúng trong các bước nấu có thời gian, phát âm thanh khi kết thúc. | **Linh** |
| `RecipeForm.tsx` | `components/recipes/editor/` | Form container chính quản lý state của toàn bộ công thức khi tạo/sửa, điều phối validation Zod và các nút Submit/Draft. | **Trâm** |
| `BasicInfoFields.tsx` | `components/recipes/editor/` | Các trường nhập thông tin cơ bản: Tiêu đề (tự sinh slug preview), Danh mục (dropdown), Mô tả ngắn, Độ khó, Thời gian chuẩn bị/nấu, Khẩu phần. | **Trâm** |
| `NutritionFields.tsx` | `components/recipes/editor/` | Các trường nhập thông số dinh dưỡng của món ăn. | **Trâm** |
| `IngredientManager.tsx` | `components/recipes/editor/` | Quản lý danh sách nguyên liệu động bằng `useFieldArray`: Thêm, Sửa tên/định lượng/đơn vị/ghi chú, Xóa, Đổi thứ tự sắp xếp (FR-RCP-009). | **Trâm** |
| `StepManager.tsx` | `components/recipes/editor/` | Quản lý danh sách các bước nấu ăn bằng `useFieldArray`: Tự động đánh số liên tục 1..N khi thêm/xóa bước, nhập tiêu đề, mô tả, hẹn giờ, upload ảnh bước (FR-RCP-010). | **Trâm** |
| `ImageGalleryManager.tsx` | `components/recipes/editor/` | Quản lý bộ sưu tập ảnh công thức: tải nhiều ảnh lên MinIO, nút chọn ảnh chính (Primary Image), nhập AltText, hiển thị trạng thái tạo thumbnail từ Hangfire (FR-RCP-008, FR-JOB-002). | **Trâm** |
| `DeleteRecipeModal.tsx` | `components/recipes/editor/` | Hộp thoại modal xác nhận xóa vĩnh viễn công thức cùng ảnh, nguyên liệu và các bước liên quan (FR-RCP-007). | **Trâm** |
| `SearchInput.tsx` | `components/search/` | Ô nhập tìm kiếm từ khóa FTS tiếng Việt có dấu/không dấu, tích hợp cơ chế Debounce 400ms chống spam request (FR-SRCH-001). | **Tuấn** |
| `FilterSidebar.tsx` | `components/search/` | Thanh bên lọc đa năng theo Danh mục, Độ khó, Khoảng thời gian nấu và Khẩu phần ăn (FR-SRCH-002). | **Tuấn** |
| `SortDropdown.tsx` | `components/search/` | Menu thả xuống lựa chọn tiêu chí sắp xếp: Mới nhất, Cũ nhất, Thời gian nấu tăng/giảm, Tiêu đề A-Z (FR-SRCH-003). | **Tuấn** |
| `PaginationControl.tsx` | `components/search/` | Thanh điều hướng phân trang chuẩn `PagedResult`: Trang trước, Trang sau, danh sách số trang, tự động cuộn lên đầu khi chuyển trang (FR-SRCH-004). | **Tuấn** |
| `SearchResults.tsx` | `components/search/` | Khu vực hiển thị kết quả tìm kiếm kèm số lượng tìm thấy hoặc giao diện Empty State thân thiện khi không có kết quả. | **Tuấn** |
| `FileUploadDropzone.tsx` | `components/common/` | Component kéo thả tải tệp lên MinIO: Validate dung lượng <= 5MB, lọc MIME types, hiển thị thanh tiến trình % và preview ảnh tức thì (FR-FILE-001). | **Tuấn** |
| `FileDeleteConfirmModal.tsx`| `components/common/` | Hộp thoại xác nhận xóa tệp tin an toàn khỏi MinIO (FR-FILE-002). | **Tuấn** |
| `SystemStatusIndicator.tsx` | `components/common/` | Badge/Widget hiển thị trạng thái kết nối backend và các dịch vụ PostgreSQL/Redis/MinIO (FR-OBS-001). | **Ân** |
| `ErrorBoundary.tsx` | `components/common/` | Thành phần bắt lỗi React runtime, ngăn ngừa sập ứng dụng và tự động ghi log lỗi có cấu trúc (FR-OBS-002). | **Tuấn** |
| `ConfirmationDialog.tsx` | `components/common/` | Hộp thoại modal dùng chung xác nhận các thao tác nguy hiểm (Xóa, Hủy xuất bản). | Chung |
| `CategoryTable.tsx` | `components/dashboard/` | Bảng danh sách danh mục dành cho Admin: hiển thị Tên, Slug, Số công thức, Nút sửa, Nút xóa. | **Linh** |
| `CategoryModal.tsx` | `components/dashboard/` | Modal tạo mới hoặc chỉnh sửa danh mục món ăn (FR-CAT-003, 004). | **Linh** |
| `DeleteCategoryModal.tsx` | `components/dashboard/` | Modal xóa danh mục: tự động cảnh báo và chặn xóa nếu danh mục đang chứa công thức (FR-CAT-005). | **Linh** |
| `RecipeStatusTable.tsx` | `components/dashboard/` | Bảng quản lý bài viết của Author/Admin kèm các nút action Xuất bản, Hủy xuất bản, Lưu trữ. | **Tuấn** |
| `PublishRecipeModal.tsx` | `components/dashboard/` | Modal xuất bản bài viết: kiểm tra điều kiện bắt buộc `Steps.length >= 1` trước khi kích hoạt publish (FR-RCP-005). | **Tuấn** |
| `ArchiveRecipeModal.tsx` | `components/dashboard/` | Modal xác nhận lưu trữ hoặc khôi phục công thức (FR-RCP-006). | **Tuấn** |
| `Navbar.tsx` | `components/layout/` | Thanh điều hướng chính của website: Logo, Menu links, Search bar nhanh, Nút Đăng nhập/Đăng ký hoặc Avatar menu. | **Linh** |
| `Footer.tsx` | `components/layout/` | Chân trang website: Giới thiệu blog, liên kết mạng xã hội, link sitemap và thông tin bản quyền. | **Linh** |
| `UserNav.tsx` | `components/layout/` | Dropdown menu góc phải khi đã đăng nhập: Hiển thị avatar, tên, email, liên kết Profile, Dashboard và nút Đăng xuất (FR-AUTH-005). | **Ân** |
| `Sidebar.tsx` | `components/layout/` | Thanh điều hướng bên trái trang Dashboard (Tổng quan, Quản lý công thức, Quản lý danh mục, Cài đặt). | Chung |

---

### 5.3. Phân hệ Tiện ích, Hooks, Store & API (`lib/`, `store/`, `hooks/`, `types/`)

| Tên File | Đường dẫn | Mục đích & Chức năng cụ thể | Thành viên |
| :--- | :--- | :--- | :--- |
| `axiosClient.ts` | `lib/api/` | Khởi tạo Axios client với `baseURL: /api/v1`. Cài đặt Request Interceptor tự động gắn `Bearer token` và header `X-Correlation-ID`; Response Interceptor tự động refresh token ngầm khi gặp lỗi 401 (FR-AUTH-004, FR-OBS-003). | **Ân, Tuấn** |
| `authApi.ts` | `lib/api/` | Chứa các hàm gọi API xác thực: `login()`, `register()`, `googleLogin()`, `refreshToken()`, `logout()`, `getMe()`, `updateMe()`. | **Ân** |
| `categoryApi.ts` | `lib/api/` | Chứa các hàm gọi API danh mục: `getCategories()`, `getCategoryBySlug()`, `createCategory()`, `updateCategory()`, `deleteCategory()`. | **Linh** |
| `recipeApi.ts` | `lib/api/` | Chứa các hàm gọi API công thức: `getRecipes()`, `getRecipeBySlug()`, `createRecipe()`, `updateRecipe()`, `deleteRecipe()`, `publishRecipe()`, `unpublishRecipe()`, `archiveRecipe()`. | **Linh, Trâm, Tuấn** |
| `fileApi.ts` | `lib/api/` | Chứa các hàm upload ảnh lên MinIO (`uploadFile`) và xóa ảnh (`deleteFile`) kèm theo dõi tiến trình upload (FR-FILE-001, 002). | **Tuấn** |
| `logger.ts` | `lib/` | Tiện ích ghi log có cấu trúc tại client (Structured Logging): xuất log JSON chuẩn kèm timestamp, level, correlationId, path, message (FR-OBS-002). | **Tuấn** |
| `auth.ts` | `lib/` | Tiện ích giải mã JWT token, kiểm tra hạn dùng token, kiểm tra role người dùng (`isAdmin`, `isAuthor`). | **Ân** |
| `authStore.ts` | `store/` | Zustand Store quản lý trạng thái phiên làm việc toàn cục: `user`, `accessToken`, `isAuthenticated`, `login()`, `logout()`, `setAccessToken()`. | **Ân** |
| `useAuth.ts` | `hooks/` | Custom hook tiện ích cho các component dễ dàng đọc thông tin user, quyền hạn và trạng thái xác thực. | **Ân** |
| `useFileUpload.ts` | `hooks/` | Custom hook quản lý logic kéo thả file, validate file type/size, theo dõi thanh tiến trình upload % và gọi API MinIO. | **Tuấn** |
| `auth.types.ts` | `types/` | Định nghĩa interface TypeScript: `User`, `LoginRequest`, `RegisterRequest`, `AuthResponse`, `ProfileUpdateRequest`. | **Ân** |
| `category.types.ts` | `types/` | Định nghĩa interface: `CategoryDto`, `CreateCategoryRequest`, `UpdateCategoryRequest`. | **Linh** |
| `recipe.types.ts` | `types/` | Định nghĩa interface: `RecipeDto`, `RecipeStepDto`, `RecipeIngredientDto`, `RecipeNutritionDto`, `RecipeImageDto`, `CreateRecipeRequest`, `UpdateRecipeRequest`. | **Trâm, Linh, Tuấn** |
| `api.types.ts` | `types/` | Định nghĩa interface generic: `ApiResponse<T>`, `PagedResult<T>`, và `ProblemDetails` theo chuẩn lỗi RFC 7807. | Chung |

---

## 6. Tóm tắt nhanh vai trò theo tầng và module

### 6.1. Tóm tắt các tầng Backend

| Tầng Kiến trúc | Dự án tương ứng | Trách nhiệm chính | Mức độ độc lập |
| :--- | :--- | :--- | :--- |
| **Domain** | `CulinaryBlog.Domain` | Chứa dữ liệu nghiệp vụ, quy tắc bất biến của hệ thống, định nghĩa thực thể và ngoại lệ miền. | **Độc lập 100%**: Không phụ thuộc tầng nào, không dùng thư viện ngoài. |
| **Application** | `CulinaryBlog.Application` | Xử lý các luồng nghiệp vụ (CQRS Use Cases), điều phối dữ liệu qua MediatR, tự động validate dữ liệu và giám sát thời gian xử lý. | Chỉ phụ thuộc vào Domain. |
| **Infrastructure** | `CulinaryBlog.Infrastructure` | Tương tác trực tiếp với Database (EF Core / PostgreSQL), hệ thống file MinIO, mã hóa JWT, Identity và lưu vết kiểm toán. | Phụ thuộc vào Application và Domain. |
| **Presentation** | `CulinaryBlog.API` | Tiếp nhận HTTP Request, lọc bảo mật (JWT/CORS), chuẩn hóa lỗi RFC 7807, cung cấp tài liệu API tương tác và định tuyến tới Application. | Phụ thuộc vào Application và Infrastructure (để cấu hình DI). |

### 6.2. Tóm tắt phân bổ Module Frontend theo Thành viên

| Thành viên | Phân hệ chính đảm nhiệm | Các trang (Pages) phụ trách | Các Component cốt lõi phụ trách | Dịch vụ & Store phụ trách |
| :--- | :--- | :--- | :--- | :--- |
| **1. Ân** | Xác thực, Phiên làm việc, Hồ sơ & Sức khỏe hệ thống | `/auth/login`<br>`/auth/register`<br>`/profile`<br>`/status` | `LoginForm`, `RegisterForm`, `GoogleLoginButton`, `ProfileCard`, `ProfileEditForm`, `UserNav`, `SystemStatusIndicator` | `authStore.ts`, `useAuth.ts`, `authApi.ts`, `axiosClient.ts` (Interceptor refresh token) |
| **2. Linh** | Khám phá công cộng, Danh mục, Chi tiết công thức SEO, Admin Danh mục | `/`<br>`/categories`<br>`/categories/[slug]`<br>`/recipes`<br>`/recipes/[slug]`<br>`/dashboard/categories`<br>`/sitemap.xml` | `Navbar`, `Footer`, `CategoryCard`, `CategoryGrid`, `CategoryHeader`, `RecipeCard`, `RecipeGrid`, `RecipeHero`, `IngredientList`, `StepByStepList`, `NutritionCard`, `RecipeTimer`, `CategoryTable`, `CategoryModal`, `DeleteCategoryModal` | `categoryApi.ts`, `recipeApi.ts` (Public), `sitemap.ts` |
| **3. Tuấn** | Tìm kiếm FTS, Lọc/Sắp xếp/Phân trang, MinIO File, Quản lý Trạng thái Recipe, Giám sát Client | `/search`<br>`/dashboard/recipes` | `SearchInput`, `FilterSidebar`, `SortDropdown`, `PaginationControl`, `SearchResults`, `FileUploadDropzone`, `FileDeleteConfirmModal`, `RecipeStatusTable`, `PublishRecipeModal`, `ArchiveRecipeModal`, `ErrorBoundary` | `fileApi.ts`, `useFileUpload.ts`, `logger.ts`, `axiosClient.ts` (Correlation ID) |
| **4. Trâm** | Trình tạo/sửa công thức, Quản lý con (Ảnh/Nguyên liệu/Bước), Xóa Recipe, Onboarding | `/dashboard/recipes/new`<br>`/dashboard/recipes/[id]/edit`<br>`/auth/welcome` | `RecipeForm`, `BasicInfoFields`, `NutritionFields`, `IngredientManager`, `StepManager`, `ImageGalleryManager`, `DeleteRecipeModal`, `WelcomeBanner` | `recipeApi.ts` (Mutation/Editor), `types/recipe.types.ts` |
