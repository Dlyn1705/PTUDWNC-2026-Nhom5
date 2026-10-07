# Kế hoạch triển khai chức năng tạo Category có phân quyền Admin

## 1. Thông tin chung

- **Dự án:** Culinary Blog Nhóm 5
- **Chức năng:** Tạo Category mới
- **Vai trò được phép thực hiện:** Admin
- **Trạng thái:** Đã triển khai và kiểm tra phân quyền
- **API chính:** `POST /api/v1/categories`

## 2. Mục tiêu

Chức năng được xây dựng để quản trị viên có thể tạo Category mới, đồng thời bảo đảm:

- Người dùng chưa đăng nhập không thể gọi API tạo Category.
- Người dùng có vai trò `Author` không thể tạo Category.
- Chỉ người dùng có vai trò `Admin` mới được phép thực hiện chức năng.
- Quyền Admin được kiểm tra tại backend, không chỉ dựa vào việc ẩn giao diện frontend.
- Dữ liệu Category được kiểm tra hợp lệ trước khi lưu vào cơ sở dữ liệu.
- Tên và slug của Category không bị trùng với dữ liệu đang tồn tại.

## 3. Phạm vi đã thực hiện

Các phần đã được triển khai gồm:

1. Cấu hình ASP.NET Core Identity hỗ trợ role.
2. Khởi tạo role `Admin` và `Author`.
3. Tạo tài khoản Admin mẫu cho môi trường phát triển.
4. Đưa role của người dùng vào JWT sau khi đăng nhập.
5. Khai báo policy `AdminOnly` ở backend.
6. Bảo vệ API tạo Category bằng policy `AdminOnly`.
7. Kiểm tra lại quyền Admin trong tầng xử lý nghiệp vụ.
8. Validate dữ liệu Category trước khi lưu.
9. Lưu role vào session của frontend.
10. Bảo vệ trang quản lý Category ở frontend.
11. Gắn access token vào request gửi đến backend.
12. Kiểm tra thực tế quyền truy cập bằng tài khoản Admin và Author.

## 4. Luồng xử lý tổng thể

```text
Người dùng đăng nhập
        |
        v
Backend kiểm tra email và mật khẩu
        |
        v
Lấy role từ ASP.NET Core Identity
        |
        v
Phát JWT chứa role Admin hoặc Author
        |
        v
Frontend lưu role và access token vào session
        |
        v
Admin truy cập trang quản lý Category
        |
        v
Frontend gửi POST /api/v1/categories kèm Bearer token
        |
        v
JWT Authentication xác thực token
        |
        v
Policy AdminOnly kiểm tra role Admin
        |
        v
CreateCategoryCommandHandler kiểm tra IsAdmin lần nữa
        |
        v
Validate dữ liệu, tạo slug và lưu Category
        |
        v
Trả về HTTP 201 Created
```

## 5. Các bước triển khai chi tiết

### Bước 1. Cấu hình Identity và role

Hệ thống sử dụng `ApplicationDbContext` kế thừa từ `IdentityDbContext`, nhờ đó cơ sở dữ liệu có các bảng phục vụ người dùng và phân quyền như:

- `AspNetUsers`
- `AspNetRoles`
- `AspNetUserRoles`
- `AspNetRoleClaims`

Trong lớp cấu hình Infrastructure, Identity được đăng ký với `AddRoles<IdentityRole>()`. Việc này cho phép sử dụng `UserManager`, `RoleManager` và các API kiểm tra role của ASP.NET Core.

**Tệp liên quan:**

- `src/CulinaryBlog.Infrastructure/DependencyInjection.cs`
- `src/CulinaryBlog.Infrastructure/Persistence/ApplicationDbContext.cs`

### Bước 2. Khởi tạo role và tài khoản Admin

Seeder đã tạo hai role:

- `Admin`
- `Author`

Seeder cũng hỗ trợ tạo tài khoản Admin dùng trong môi trường phát triển và gán tài khoản này vào role `Admin`.

Tài khoản đăng ký qua chức năng đăng ký thông thường chỉ được gán role `Author`. Người dùng không thể tự chọn hoặc tự đăng ký role Admin từ request.

**Tệp liên quan:**

- `src/CulinaryBlog.Infrastructure/Persistence/Seed/UserSeeder.cs`
- `src/CulinaryBlog.Infrastructure/Services/AuthService.cs`

> Lưu ý: `Database:SeedOnStartup` hiện được đặt là `false`. Chỉ bật seeding có chủ đích trong môi trường phát triển và tắt lại sau khi dữ liệu mẫu đã được tạo.

### Bước 3. Xác định role khi đăng nhập

Sau khi email và mật khẩu được xác thực thành công, `AuthService` sử dụng `UserManager.GetRolesAsync()` để lấy danh sách role của người dùng.

Kết quả đăng nhập trả về:

- Thông tin người dùng.
- Access token.
- Thời điểm hết hạn access token.
- Danh sách role.

Nhờ đó frontend có thể xác định người đăng nhập là Admin hay Author.

**Tệp liên quan:**

- `src/CulinaryBlog.Infrastructure/Services/AuthService.cs`
- `src/CulinaryBlog.API/Endpoints/AuthEndpoints.cs`
- `src/CulinaryBlog.Application/DTOs/AuthResponseDto.cs`

### Bước 4. Đưa role vào JWT

Khi phát access token, `JwtService` thêm từng role vào hai claim:

```csharp
claims.Add(new Claim(ClaimTypes.Role, role));
claims.Add(new Claim("roles", role));
```

`ClaimTypes.Role` là claim được ASP.NET Core Authorization sử dụng để xử lý `RequireRole("Admin")` và `User.IsInRole("Admin")`.

**Tệp liên quan:**

- `src/CulinaryBlog.Infrastructure/Services/JwtService.cs`

### Bước 5. Khai báo policy AdminOnly

Backend đã đăng ký policy `AdminOnly`:

```csharp
.AddPolicy("AdminOnly", policy => policy.RequireRole("Admin"))
```

Policy này yêu cầu request phải:

1. Có access token hợp lệ.
2. Token chưa hết hạn.
3. Token được ký bằng JWT key hợp lệ.
4. Token có role `Admin`.

**Tệp liên quan:**

- `src/CulinaryBlog.Infrastructure/DependencyInjection.cs`

### Bước 6. Bảo vệ API tạo Category

Endpoint tạo Category là:

```http
POST /api/v1/categories
```

Endpoint được gắn policy:

```csharp
.RequireAuthorization("AdminOnly")
```

Kết quả phân quyền:

| Trạng thái người gọi | Kết quả |
|---|---|
| Chưa đăng nhập hoặc token không hợp lệ | `401 Unauthorized` |
| Đã đăng nhập nhưng có role Author | `403 Forbidden` |
| Có role Admin | Được chuyển tới bước xử lý nghiệp vụ |

**Tệp liên quan:**

- `src/CulinaryBlog.API/Endpoints/CategoryEndpoints.cs`

### Bước 7. Kiểm tra quyền lần hai tại tầng Application

Ngoài policy tại endpoint, `CreateCategoryCommandHandler` còn kiểm tra:

```csharp
if (!_currentUser.IsAdmin)
{
    throw new ForbiddenException();
}
```

`CurrentUserService` đọc các `ClaimTypes.Role` trong request và cung cấp thuộc tính `IsAdmin`.

Đây là lớp bảo vệ bổ sung, giúp nghiệp vụ vẫn an toàn nếu command được gọi từ một entry point khác trong tương lai.

**Tệp liên quan:**

- `src/CulinaryBlog.Application/Features/Categories/Commands/CreateCategory/CreateCategoryCommand.cs`
- `src/CulinaryBlog.Infrastructure/Services/CurrentUserService.cs`
- `src/CulinaryBlog.Application/Contracts/ICurrentUserService.cs`

### Bước 8. Validate dữ liệu Category

Trước khi lưu, dữ liệu được kiểm tra theo các quy tắc:

| Trường | Quy tắc |
|---|---|
| `name` | Bắt buộc, sau khi trim dài từ 2 đến 100 ký tự |
| `name` | Phải tạo được slug có ít nhất một chữ cái hoặc chữ số |
| `imageUrl` | Không quá 500 ký tự |
| `imageUrl` | Nếu có giá trị thì phải là URL HTTP hoặc HTTPS hợp lệ |
| `orderIndex` | Phải lớn hơn hoặc bằng 0 |

Handler tiếp tục kiểm tra tên Category có tồn tại hay chưa. Nếu trùng tên, hệ thống trả lỗi conflict với mã `CATEGORY_NAME_ALREADY_EXISTS`.

**Tệp liên quan:**

- `src/CulinaryBlog.Application/Features/Categories/Commands/CreateCategory/CreateCategoryCommand.cs`

### Bước 9. Sinh slug và lưu Category

Tên Category được chuẩn hóa và dùng để sinh slug. Nếu slug đã tồn tại, hệ thống thêm hậu tố số để tạo slug duy nhất.

Ví dụ:

```text
Tên: Món Việt
Slug ban đầu: mon-viet
Nếu đã tồn tại: mon-viet-2
```

Sau đó Category được tạo qua domain entity, thêm vào repository và lưu bằng Unit of Work.

Kết quả trả về là `CategoryDto` gồm:

- `id`
- `name`
- `slug`
- `description`
- `imageUrl`
- `orderIndex`
- `recipeCount`

### Bước 10. Lưu role vào session frontend

Frontend sử dụng Auth.js với Credentials Provider. Sau khi backend trả kết quả đăng nhập, frontend ưu tiên xác định role theo thứ tự:

1. `Admin`
2. `Author`

Role và access token được lưu vào JWT session của Auth.js, sau đó được đưa vào `session.user` để các trang và component sử dụng.

**Tệp liên quan:**

- `culinary-blog-web/lib/auth.ts`
- `culinary-blog-web/types/next-auth.d.ts`

### Bước 11. Bảo vệ trang quản lý Category

Frontend bảo vệ đường dẫn:

```text
/dashboard/categories
```

Các lớp kiểm tra gồm:

- `proxy.ts` chặn request nếu session không có role Admin.
- Layout phía server kiểm tra lại `session.user.role`.
- Tài khoản chưa đăng nhập được chuyển tới trang đăng nhập.
- Tài khoản Author được chuyển về khu vực quản lý công thức.
- Liên kết quản lý Category trên dashboard chỉ hiển thị cho Admin.

Việc kiểm tra ở frontend chỉ phục vụ điều hướng và trải nghiệm người dùng. Backend vẫn là lớp quyết định quyền truy cập cuối cùng.

**Tệp liên quan:**

- `culinary-blog-web/proxy.ts`
- `culinary-blog-web/app/dashboard/categories/layout.tsx`
- `culinary-blog-web/app/dashboard/layout.tsx`

### Bước 12. Gửi request tạo Category

Admin nhập dữ liệu trên `CategoryModal`. Frontend validate dữ liệu trước khi gọi `categoryApi`.

`axiosClient` lấy access token từ session và gắn header:

```http
Authorization: Bearer <access-token>
```

Sau khi tạo thành công, danh sách Category được tải lại hoặc cập nhật để hiển thị bản ghi mới.

**Tệp liên quan:**

- `culinary-blog-web/components/dashboard/CategoryModal.tsx`
- `culinary-blog-web/app/dashboard/categories/page.tsx`
- `culinary-blog-web/lib/api/categoryApi.ts`
- `culinary-blog-web/lib/api/axiosClient.ts`
- `culinary-blog-web/lib/validations/category.ts`

## 6. Hợp đồng API

### Request

```http
POST /api/v1/categories
Authorization: Bearer <admin-access-token>
Content-Type: application/json
```

```json
{
  "name": "Món Việt",
  "description": "Các món ăn truyền thống Việt Nam",
  "imageUrl": "https://example.com/images/mon-viet.jpg",
  "orderIndex": 1
}
```

### Response thành công

```http
HTTP/1.1 201 Created
```

Response chứa thông tin Category vừa được tạo, bao gồm ID và slug đã sinh.

### Các mã lỗi chính

| HTTP status | Trường hợp |
|---|---|
| `401 Unauthorized` | Chưa đăng nhập, token sai hoặc token hết hạn |
| `403 Forbidden` | Đã đăng nhập nhưng không có role Admin |
| `409 Conflict` | Tên Category đã tồn tại |
| `422 Unprocessable Entity` | Dữ liệu đầu vào không hợp lệ |

## 7. Kết quả kiểm tra phân quyền thực tế

Phân quyền đã được kiểm tra trực tiếp trên API đang chạy:

| Tình huống kiểm tra | Kết quả thực tế | Đánh giá |
|---|---:|---|
| Admin đăng nhập | Nhận role `Admin` | Đạt |
| Author đăng nhập | Nhận role `Author` | Đạt |
| Không có token gọi endpoint quản trị | `401 Unauthorized` | Đạt |
| Author gọi endpoint quản trị | `403 Forbidden` | Đạt |
| Admin gọi endpoint quản trị với ID thử nghiệm không tồn tại | `404 Not Found` sau khi vượt qua bước phân quyền | Đạt |

Kết quả `404 Not Found` trong trường hợp Admin là mong đợi vì request sử dụng ID ngẫu nhiên không tồn tại. Điều này chứng minh request Admin đã vượt qua policy `AdminOnly` và được chuyển tới xử lý nghiệp vụ.

## 8. Ma trận kiểm thử chức năng tạo Category

| Mã | Tình huống | Kết quả mong đợi | Trạng thái |
|---|---|---|---|
| TC01 | Không có access token gọi API tạo Category | `401 Unauthorized` | Đã kiểm tra |
| TC02 | Author gọi API tạo Category | `403 Forbidden` | Đã kiểm tra |
| TC03 | Admin gọi API với dữ liệu hợp lệ | `201 Created` | Cần duy trì kiểm thử E2E |
| TC04 | Admin gửi `name` rỗng | `422 Unprocessable Entity` | Cần duy trì regression test |
| TC05 | Admin gửi `name` ngắn hơn 2 ký tự | `422 Unprocessable Entity` | Cần duy trì regression test |
| TC06 | Admin gửi URL ảnh không hợp lệ | `422 Unprocessable Entity` | Cần duy trì regression test |
| TC07 | Admin gửi `orderIndex` âm | `422 Unprocessable Entity` | Cần duy trì regression test |
| TC08 | Admin tạo tên Category đã tồn tại | `409 Conflict` | Cần duy trì regression test |
| TC09 | Author truy cập `/dashboard/categories` | Bị chặn hoặc chuyển hướng | Đạt theo route guard |
| TC10 | Admin truy cập `/dashboard/categories` | Hiển thị trang quản trị | Đạt |

## 9. Tiêu chí nghiệm thu

Chức năng được xem là đạt khi thỏa mãn tất cả các điều kiện sau:

- [x] Hệ thống có role `Admin` và `Author`.
- [x] Role được đưa vào JWT sau khi đăng nhập.
- [x] Frontend nhận và lưu được role trong session.
- [x] Route quản lý Category chỉ dành cho Admin.
- [x] Endpoint tạo Category sử dụng policy `AdminOnly`.
- [x] Command handler kiểm tra lại quyền Admin.
- [x] Người chưa đăng nhập nhận lỗi `401`.
- [x] Author nhận lỗi `403` khi gọi API quản trị.
- [x] Admin vượt qua bước kiểm tra phân quyền.
- [x] Dữ liệu Category được validate trước khi lưu.
- [x] Tên Category trùng được xử lý bằng lỗi `409`.
- [x] Slug được sinh tự động và bảo đảm không trùng.
- [ ] Bổ sung automated integration test cho toàn bộ ma trận quyền.
- [ ] Bổ sung E2E test cho thao tác tạo Category trên giao diện.

## 10. Các tệp mã nguồn chính

| Tệp | Trách nhiệm |
|---|---|
| `src/CulinaryBlog.Infrastructure/Services/AuthService.cs` | Xác thực đăng nhập và lấy role |
| `src/CulinaryBlog.Infrastructure/Services/JwtService.cs` | Ghi role vào JWT |
| `src/CulinaryBlog.Infrastructure/DependencyInjection.cs` | Đăng ký Identity và policy `AdminOnly` |
| `src/CulinaryBlog.API/Endpoints/AuthEndpoints.cs` | Cung cấp API đăng nhập |
| `src/CulinaryBlog.API/Endpoints/CategoryEndpoints.cs` | Bảo vệ endpoint tạo Category |
| `src/CulinaryBlog.Application/Features/Categories/Commands/CreateCategory/CreateCategoryCommand.cs` | Kiểm tra quyền, validate và xử lý tạo Category |
| `src/CulinaryBlog.Infrastructure/Services/CurrentUserService.cs` | Đọc role của người dùng hiện tại |
| `src/CulinaryBlog.Infrastructure/Persistence/Seed/UserSeeder.cs` | Tạo role và tài khoản mẫu |
| `culinary-blog-web/lib/auth.ts` | Đăng nhập và đưa role vào session |
| `culinary-blog-web/proxy.ts` | Bảo vệ route quản trị |
| `culinary-blog-web/app/dashboard/categories/layout.tsx` | Kiểm tra Admin phía server |
| `culinary-blog-web/components/dashboard/CategoryModal.tsx` | Giao diện nhập Category |
| `culinary-blog-web/lib/api/categoryApi.ts` | Gọi API Category |
| `culinary-blog-web/lib/api/axiosClient.ts` | Gắn Bearer token vào request |

## 11. Lưu ý bảo mật và công việc tiếp theo

### 11.1 Không sử dụng mật khẩu seed trong production

Tài khoản seed chỉ dùng cho phát triển. Khi triển khai thật cần:

- Không lưu mật khẩu Admin mặc định trong mã nguồn.
- Tạo Admin bằng quy trình quản trị an toàn.
- Bắt buộc đổi mật khẩu ở lần đăng nhập đầu tiên nếu có tài khoản khởi tạo.

### 11.2 Quản lý JWT key

JWT signing key cần được đưa vào biến môi trường hoặc secret manager thay vì lưu trực tiếp trong `appsettings.json` khi triển khai production.

### 11.3 Hoàn thiện refresh token phía frontend

Access token hiện có thời hạn 15 phút. Frontend cần bổ sung luồng refresh token để tránh tình trạng session vẫn hiển thị đăng nhập nhưng API trả `401` do access token đã hết hạn.

### 11.4 Bổ sung automated test

Nên bổ sung integration test cho ba trường hợp bắt buộc:

1. Anonymous nhận `401`.
2. Author nhận `403`.
3. Admin nhận `201` khi dữ liệu hợp lệ.

## 12. Kết luận

Chức năng tạo Category có phân quyền Admin đã được triển khai theo mô hình nhiều lớp. Frontend kiểm soát việc hiển thị và điều hướng, trong khi backend kiểm tra JWT, policy `AdminOnly` và quyền `IsAdmin` tại tầng nghiệp vụ. Vì vậy, tài khoản Author không thể vượt quyền bằng cách bỏ qua giao diện và gọi API trực tiếp.

Các hạng mục còn lại chủ yếu là tăng cường bảo mật cho môi trường production và bổ sung automated test để ngăn lỗi hồi quy.
