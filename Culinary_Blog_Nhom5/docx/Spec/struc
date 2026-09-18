# Báo cáo Phân tích Kiến trúc và Danh mục File Backend
**Dự án:** Culinary Blog – Blog Ẩm thực và Nấu ăn  
**Tài liệu tham chiếu:** `SRS_Culinary_Blog_v1.0.0.pdf`  
**Kiến trúc:** Clean Architecture (.NET 10 Minimal APIs, CQRS with MediatR, EF Core 10, PostgreSQL)  
**Ngày cập nhật:** 2026-09-18  

---

## 1. Tổng quan Kiến trúc Backend

Hệ thống Backend được xây dựng theo nguyên lý **Clean Architecture** (Robert C. Martin) với nguyên tắc bất biến: **Quy tắc phụ thuộc một chiều (Dependency Rule)** hướng dần vào lõi trung tâm Domain:

```text
               ┌────────────────────────┐
               │    CulinaryBlog.API    │ (Presentation / HTTP / Middlewares)
               └───────────┬────────────┘
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

1. **Domain Layer (`CulinaryBlog.Domain`):** Nhân lõi nghiệp vụ. Chứa các thực thể cốt lõi, giá trị (value objects), enums, domain rules và các interface repository. Không phụ thuộc vào bất kỳ tầng nào khác hay thư viện bên ngoài (chỉ dùng .NET BCL).
2. **Application Layer (`CulinaryBlog.Application`):** Tầng điều phối (Orchestration). Chứa các use cases theo pattern CQRS (Commands, Queries), DTOs, FluentValidation validators, MediatR pipeline behaviors và các contract interfaces dịch vụ. Chỉ phụ thuộc vào Domain.
3. **Infrastructure Layer (`CulinaryBlog.Infrastructure`):** Tầng hiện thực và tích hợp ngoại vi. Chứa Entity Framework Core `DbContext`, cấu hình bảng Fluent API, Interceptor kiểm toán thời gian, hiện thực Repository/UnitOfWork, mã hóa JWT, lưu trữ tệp tin (MinIO/Local) và kết nối cơ sở dữ liệu. Phụ thuộc vào Application và Domain.
4. **Presentation Layer (`CulinaryBlog.API`):** Tầng giao tiếp HTTP. Sử dụng ASP.NET Core Minimal APIs, quản lý Middleware (chuẩn hóa lỗi RFC 7807, Correlation ID), cấu hình DI, CORS, JWT Bearer Authentication, Rate Limiting và Scalar OpenAPI UI.

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

## 3. Phân tích chi tiết chức năng từng file

### 3.1. Tầng Domain (`CulinaryBlog.Domain`)

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

### 3.2. Tầng Application (`CulinaryBlog.Application`)

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

### 3.3. Tầng Infrastructure (`CulinaryBlog.Infrastructure`)

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

### 3.4. Tầng Presentation & API (`CulinaryBlog.API`)

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

## 4. Tóm tắt nhanh vai trò theo tầng

| Tầng Kiến trúc | Dự án tương ứng | Trách nhiệm chính | Mức độ độc lập |
| :--- | :--- | :--- | :--- |
| **Domain** | `CulinaryBlog.Domain` | Chứa dữ liệu nghiệp vụ, quy tắc bất biến của hệ thống, định nghĩa thực thể và ngoại lệ miền. | **Độc lập 100%**: Không phụ thuộc tầng nào, không dùng thư viện ngoài. |
| **Application** | `CulinaryBlog.Application` | Xử lý các luồng nghiệp vụ (CQRS Use Cases), điều phối dữ liệu qua MediatR, tự động validate dữ liệu và giám sát thời gian xử lý. | Chỉ phụ thuộc vào Domain. |
| **Infrastructure** | `CulinaryBlog.Infrastructure` | Tương tác trực tiếp với Database (EF Core / PostgreSQL), hệ thống file, mã hóa JWT, Identity và lưu vết kiểm toán. | Phụ thuộc vào Application và Domain. |
| **Presentation** | `CulinaryBlog.API` | Tiếp nhận HTTP Request, lọc bảo mật (JWT/CORS), chuẩn hóa lỗi RFC 7807, cung cấp tài liệu API tương tác và định tuyến tới Application. | Phụ thuộc vào Application và Infrastructure (để cấu hình DI). |
