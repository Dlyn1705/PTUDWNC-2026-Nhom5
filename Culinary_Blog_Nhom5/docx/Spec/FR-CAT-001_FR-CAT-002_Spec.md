# Đặc tả chi tiết chức năng FR-CAT-001 và FR-CAT-002

**Dự án:** Culinary Blog – Blog Ẩm thực và Nấu ăn (Nhóm 5)  
**Phân hệ:** Quản lý và hiển thị danh mục công thức (`FR-CAT`)  
**Yêu cầu được đặc tả:**

- `FR-CAT-001`: Xem danh sách danh mục.
- `FR-CAT-002`: Xem chi tiết danh mục và các công thức thuộc danh mục.

**Thành viên phụ trách:** Đỗ Đặng Diệu Linh – MSSV `2312663`  
**Mức ưu tiên:** Must Have  
**Trạng thái hiện tại:** Đã triển khai  
**Phiên bản tài liệu:** 1.0.0  
**Ngày cập nhật:** 2026-09-27  

## 1. Tài liệu và mã nguồn tham chiếu

Tài liệu này được xây dựng dựa trên mã nguồn hiện tại của dự án:

- `src/CulinaryBlog.Domain/Entities/Category.cs`
- `src/CulinaryBlog.Domain/Entities/Recipe.cs`
- `src/CulinaryBlog.Domain/Interfaces/ICategoryRepository.cs`
- `src/CulinaryBlog.Domain/Interfaces/IRecipeRepository.cs`
- `src/CulinaryBlog.Application/DTOs/CategoryDto.cs`
- `src/CulinaryBlog.Application/Features/Categories/Queries/GetCategories/GetCategoriesQuery.cs`
- `src/CulinaryBlog.Application/Features/Categories/Queries/GetCategoryBySlug/GetCategoryBySlugQuery.cs`
- `src/CulinaryBlog.Infrastructure/Repositories/CategoryRepository.cs`
- `src/CulinaryBlog.Infrastructure/Repositories/RecipeRepository.cs`
- `src/CulinaryBlog.Infrastructure/Persistence/Configurations/CategoryConfiguration.cs`
- `src/CulinaryBlog.API/Endpoints/CategoryEndpoints.cs`
- `culinary-blog-web/app/(public)/categories/page.tsx`
- `culinary-blog-web/app/(public)/categories/[slug]/page.tsx`
- `culinary-blog-web/lib/api/categoryApi.ts`
- `culinary-blog-web/types/category.types.ts`
- `culinary-blog-web/types/recipe.types.ts`

---

## 2. Tổng quan nghiệp vụ

### 2.1. Mục tiêu

Phân hệ danh mục giúp người dùng khám phá công thức theo từng nhóm ẩm thực. Hệ thống cung cấp hai cấp độ truy cập:

1. Trang tổng hợp tất cả danh mục đang hoạt động.
2. Trang chi tiết một danh mục, kèm danh sách công thức đã xuất bản thuộc danh mục đó.

### 2.2. Tác nhân

| Tác nhân | Quyền sử dụng FR-CAT-001 | Quyền sử dụng FR-CAT-002 |
| :--- | :---: | :---: |
| Khách vãng lai (`Guest`) | Có | Có |
| Tác giả (`Author`) | Có | Có |
| Quản trị viên (`Admin`) | Có | Có |

Hai chức năng là chức năng công khai, không yêu cầu JWT hoặc đăng nhập.

### 2.3. Phạm vi

Bao gồm:

- Đọc danh sách danh mục chưa bị xóa mềm.
- Đếm số công thức đã xuất bản trong từng danh mục.
- Truy xuất danh mục theo slug.
- Hiển thị công thức đã xuất bản theo danh mục.
- Phân trang danh sách công thức trong trang chi tiết.
- Tạo metadata SEO cho trang danh sách và trang chi tiết.
- Trả về 404 khi slug danh mục không tồn tại.

Không bao gồm:

- Tạo, cập nhật hoặc xóa danh mục (`FR-CAT-003`, `FR-CAT-004`, `FR-CAT-005`).
- Tìm kiếm toàn văn bản công thức (`FR-SRCH-001`).
- Hiển thị công thức nháp hoặc đã lưu trữ.
- Quản lý vòng đời công thức.

---

## 3. Quy tắc nghiệp vụ dùng chung

| Mã | Quy tắc |
| :--- | :--- |
| `BR-CAT-01` | Chỉ danh mục có `IsDeleted = false` được truy vấn công khai. Quy tắc được áp dụng bằng global query filter của EF Core. |
| `BR-CAT-02` | `Slug` là định danh công khai trên URL và phải duy nhất trong bảng `Categories`. |
| `BR-CAT-03` | Số lượng công thức của danh mục chỉ tính công thức có `Status = Published` và `IsDeleted = false`. |
| `BR-CAT-04` | Trang chi tiết chỉ hiển thị công thức đã xuất bản. Bản nháp và bản lưu trữ không được xuất hiện. |
| `BR-CAT-05` | Danh sách danh mục được sắp xếp tăng dần theo `OrderIndex`, sau đó theo `Name`. |
| `BR-CAT-06` | Trang chi tiết mặc định hiển thị 12 công thức mỗi trang. |
| `BR-CAT-07` | `page` nhỏ hơn 1 được chuẩn hóa thành 1. |
| `BR-CAT-08` | `pageSize` được giới hạn trong khoảng từ 1 đến 50. |
| `BR-CAT-09` | Danh mục tồn tại nhưng chưa có công thức vẫn trả HTTP 200 với danh sách công thức rỗng. |
| `BR-CAT-10` | Slug không tồn tại hoặc thuộc danh mục đã xóa mềm trả HTTP 404. |

---

## 4. Đặc tả FR-CAT-001 – Xem danh sách danh mục

### 4.1. Thông tin yêu cầu

| Thuộc tính | Nội dung |
| :--- | :--- |
| Mã yêu cầu | `FR-CAT-001` |
| Tên yêu cầu | Xem danh sách danh mục |
| Mục tiêu | Cho phép người dùng xem toàn bộ danh mục đang hoạt động và số công thức đã xuất bản của từng danh mục. |
| Tác nhân chính | Guest, Author, Admin |
| Tiền điều kiện | Backend và PostgreSQL hoạt động; dữ liệu migration đã được áp dụng. |
| Hậu điều kiện | Danh sách danh mục được trả về mà không làm thay đổi dữ liệu. |
| Kích hoạt | Người dùng truy cập `/categories` hoặc thành phần khác gọi API danh mục. |

### 4.2. Luồng chính

1. Người dùng truy cập trang `/categories`.
2. Next.js Server Component gọi `categoryApi.getAll()`.
3. API client gửi `GET /api/v1/categories`.
4. Endpoint tạo `GetCategoriesQuery` và gửi qua MediatR.
5. Handler gọi `CategoryRepository.GetAllWithRecipeCountAsync()`.
6. Repository đọc các danh mục chưa bị xóa mềm.
7. Với mỗi danh mục, hệ thống đếm công thức thỏa mãn:
   - `Status = Published`;
   - `IsDeleted = false`.
8. Handler ánh xạ dữ liệu sang `CategoryDto`.
9. Danh sách được sắp xếp theo `OrderIndex`, sau đó theo `Name`.
10. API trả về HTTP 200 theo cấu trúc `ApiResponse<CategoryDto[]>`.
11. Frontend tính tổng số danh mục và tổng số công thức.
12. Frontend hiển thị header thống kê và lưới danh mục.

### 4.3. Luồng thay thế

#### A1 – Chưa có danh mục

1. Repository trả về danh sách rỗng.
2. API trả HTTP 200 với `data: []`.
3. Frontend hiển thị trạng thái rỗng của `CategoryGrid`.

#### A2 – Danh mục chưa có công thức

1. Danh mục vẫn được trả về.
2. Thuộc tính `recipeCount` bằng 0.
3. Người dùng vẫn có thể mở trang chi tiết danh mục.

#### E1 – Backend hoặc cơ sở dữ liệu không khả dụng

1. API client nhận lỗi kết nối hoặc HTTP 5xx.
2. Nếu đang ở development và `NEXT_PUBLIC_ENABLE_MOCKS=true`, frontend dùng dữ liệu mock.
3. Nếu mock mode bị tắt, lỗi được truyền lên để Next.js xử lý; không âm thầm hiển thị dữ liệu giả trong production.

### 4.4. Hợp đồng REST API

#### Request

```http
GET /api/v1/categories
Accept: application/json
```

Không có path parameter, query parameter hoặc request body.

#### Response thành công – HTTP 200

```json
{
  "success": true,
  "message": null,
  "data": [
    {
      "id": "3eb0edd0-83eb-4a7d-8520-60d3895d7c6c",
      "name": "Vegetarian",
      "slug": "vegetarian",
      "description": "Recipes in the Vegetarian category.",
      "imageUrl": null,
      "orderIndex": 5,
      "recipeCount": 8
    }
  ]
}
```

#### Cấu trúc `CategoryDto`

| Trường | Kiểu | Nullable | Mô tả |
| :--- | :--- | :---: | :--- |
| `id` | UUID | Không | Khóa chính của danh mục. |
| `name` | string | Không | Tên hiển thị, tối đa 100 ký tự ở database. |
| `slug` | string | Không | Định danh URL duy nhất, tối đa 120 ký tự. |
| `description` | string | Có | Mô tả danh mục. |
| `imageUrl` | string | Có | URL ảnh đại diện, tối đa 500 ký tự. |
| `orderIndex` | integer | Không | Thứ tự ưu tiên hiển thị. |
| `recipeCount` | integer | Không | Số công thức Published và chưa bị xóa. |

### 4.5. Đặc tả giao diện `/categories`

| Thành phần | Nội dung |
| :--- | :--- |
| Metadata | Tiêu đề `All Categories - Culinary Blog` và mô tả Open Graph tương ứng. |
| `CategoryHeader` | Hiển thị breadcrumb, tổng số danh mục và tổng số công thức. |
| `CategoryGrid` | Hiển thị danh sách thẻ danh mục responsive. |
| `CategoryCard` | Hiển thị ảnh, tên, mô tả ngắn, số công thức và liên kết chi tiết. |
| Điều hướng | Mỗi card dẫn tới `/categories/{slug}`. |
| Ảnh dự phòng | Dùng ảnh dự phòng khi `imageUrl` không có giá trị. |

### 4.6. Điều kiện nghiệm thu FR-CAT-001

- [ ] Truy cập `/categories` không yêu cầu đăng nhập.
- [ ] API trả HTTP 200 và đúng cấu trúc `ApiResponse`.
- [ ] Danh mục đã xóa mềm không xuất hiện.
- [ ] Danh sách được sắp xếp theo `OrderIndex`, rồi theo `Name`.
- [ ] `recipeCount` chỉ đếm công thức Published và chưa bị xóa.
- [ ] Danh mục không có công thức vẫn xuất hiện với `recipeCount = 0`.
- [ ] Frontend hiển thị đúng tổng số danh mục và tổng số công thức.
- [ ] Người dùng có thể mở trang chi tiết từ từng card.
- [ ] Không dùng dữ liệu mock trong production khi API lỗi.

---

## 5. Đặc tả FR-CAT-002 – Xem chi tiết danh mục và công thức

### 5.1. Thông tin yêu cầu

| Thuộc tính | Nội dung |
| :--- | :--- |
| Mã yêu cầu | `FR-CAT-002` |
| Tên yêu cầu | Xem chi tiết danh mục và công thức |
| Mục tiêu | Cho phép người dùng xem thông tin của một danh mục và duyệt các công thức đã xuất bản thuộc danh mục đó. |
| Tác nhân chính | Guest, Author, Admin |
| Tiền điều kiện | Slug được cung cấp trên URL; backend và PostgreSQL hoạt động. |
| Hậu điều kiện | Chi tiết danh mục và trang công thức tương ứng được trả về mà không thay đổi dữ liệu. |
| Kích hoạt | Người dùng truy cập `/categories/{slug}`. |

### 5.2. Luồng chính

1. Người dùng chọn một danh mục hoặc truy cập trực tiếp `/categories/{slug}`.
2. Next.js đọc `slug` từ route và `page` từ query string.
3. Frontend chuẩn hóa trang hiện tại tối thiểu là 1 và dùng `pageSize = 12`.
4. Frontend gọi song song:
   - `categoryApi.getBySlug(slug, page, 12)`;
   - `categoryApi.getAll()` để lấy danh mục liên quan.
5. API client gửi:

   ```http
   GET /api/v1/categories/{slug}?page={page}&pageSize=12
   ```

6. Endpoint chuẩn hóa:
   - `page = max(page, 1)`;
   - `pageSize = clamp(pageSize, 1, 50)`.
7. Endpoint gửi `GetCategoryBySlugQuery` qua MediatR.
8. Handler tìm danh mục bằng `CategoryRepository.GetBySlugAsync(slug)`.
9. Handler gọi `RecipeRepository.GetPagedAsync()` với `categoryId` của danh mục.
10. Repository mặc định chỉ lấy công thức `Published`.
11. Công thức được sắp xếp mặc định theo `CreatedAt` giảm dần.
12. Handler ánh xạ danh mục, tác giả và ảnh công thức sang DTO.
13. API trả thông tin danh mục, danh sách công thức và metadata phân trang.
14. Frontend hiển thị hero danh mục, danh sách công thức, phân trang và ba danh mục khác.

### 5.3. Luồng thay thế và ngoại lệ

#### A1 – Danh mục tồn tại nhưng không có công thức Published

1. API trả HTTP 200.
2. `data.recipes` là mảng rỗng.
3. `meta.totalCount = 0` và `meta.totalPages = 0`.
4. Frontend hiển thị thông báo chưa có công thức trong danh mục.

#### A2 – Danh mục không có ảnh đại diện

Frontend chọn ảnh theo thứ tự ưu tiên:

1. `category.imageUrl`;
2. ảnh primary của công thức đầu tiên;
3. ảnh đầu tiên của công thức đầu tiên;
4. icon `ChefHat` nếu không có ảnh nào.

#### A3 – Có nhiều hơn 12 công thức

1. Frontend hiển thị nút Previous và Next.
2. URL được cập nhật theo dạng `/categories/{slug}?page=N`.
3. Nút Previous bị vô hiệu hóa ở trang đầu.
4. Nút Next bị vô hiệu hóa ở trang cuối.

#### E1 – Slug không tồn tại

1. Handler ném `NotFoundException("Category", slug)`.
2. `GlobalExceptionMiddleware` chuyển thành HTTP 404 theo Problem Details.
3. `categoryApi.getBySlug()` trả về `null`.
4. Next.js gọi `notFound()` và hiển thị trang 404.

#### E2 – Slug thuộc danh mục đã xóa mềm

Global query filter loại bỏ danh mục trước khi repository trả kết quả. Hệ thống xử lý giống trường hợp slug không tồn tại và trả HTTP 404.

#### E3 – `page` vượt quá tổng số trang

API vẫn trả HTTP 200 với danh sách `recipes` rỗng và metadata phản ánh trang được yêu cầu. Hệ thống hiện tại không tự chuyển về trang cuối.

### 5.4. Hợp đồng REST API

#### Request

```http
GET /api/v1/categories/{slug}?page=1&pageSize=12
Accept: application/json
```

#### Path parameter

| Tham số | Kiểu | Bắt buộc | Mô tả |
| :--- | :--- | :---: | :--- |
| `slug` | string | Có | Slug duy nhất của danh mục. |

#### Query parameter

| Tham số | Kiểu | Bắt buộc | Mặc định | Quy tắc |
| :--- | :--- | :---: | :---: | :--- |
| `page` | integer | Không | `1` | Giá trị nhỏ hơn 1 được chuẩn hóa thành 1. |
| `pageSize` | integer | Không | `12` | Được giới hạn từ 1 đến 50. |

#### Response thành công – HTTP 200

```json
{
  "data": {
    "category": {
      "id": "3eb0edd0-83eb-4a7d-8520-60d3895d7c6c",
      "name": "Vegetarian",
      "slug": "vegetarian",
      "description": "Recipes in the Vegetarian category.",
      "imageUrl": null,
      "orderIndex": 5,
      "recipeCount": 8
    },
    "recipes": [
      {
        "id": "65725e7d-7455-4906-852a-a06878ea0a02",
        "title": "Vegetable Soup",
        "slug": "vegetable-soup",
        "createdAt": "2026-09-27T02:00:00Z",
        "description": "A simple vegetable soup.",
        "prepTimeMinutes": 15,
        "cookTimeMinutes": 30,
        "servings": 4,
        "difficulty": 1,
        "status": 1,
        "categoryId": "3eb0edd0-83eb-4a7d-8520-60d3895d7c6c",
        "categoryName": "Vegetarian",
        "categorySlug": "vegetarian",
        "author": {
          "id": "user-id",
          "displayName": "Culinary Author",
          "avatarUrl": null
        },
        "images": [
          {
            "id": "f129a06f-c1cc-42d0-8609-eaa10c1d807d",
            "url": "https://example.com/vegetable-soup-thumbnail.jpg",
            "isPrimary": true,
            "alt": "Vegetable soup"
          }
        ]
      }
    ]
  },
  "meta": {
    "page": 1,
    "pageSize": 12,
    "totalCount": 8,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

#### Response không tìm thấy – HTTP 404

Content type: `application/problem+json`.

```json
{
  "type": "https://tools.ietf.org/html/rfc7231#section-6.5.4",
  "title": "Không tìm thấy tài nguyên.",
  "status": 404,
  "detail": "Thực thể 'Category' với định danh 'not-found' không tồn tại.",
  "instance": "/api/v1/categories/not-found",
  "correlationId": "correlation-id"
}
```

### 5.5. Cấu trúc công thức tóm tắt

| Trường | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `id` | UUID | Mã công thức. |
| `title` | string | Tên công thức. |
| `slug` | string | Slug dùng để mở `/recipes/{slug}`. |
| `createdAt` | datetime UTC | Thời điểm tạo. |
| `description` | string | Mô tả ngắn. |
| `prepTimeMinutes` | integer | Thời gian chuẩn bị, tính bằng phút. |
| `cookTimeMinutes` | integer | Thời gian nấu, tính bằng phút. |
| `servings` | integer | Số khẩu phần. |
| `difficulty` | integer | `1=Easy`, `2=Medium`, `3=Hard`, `4=Expert`. |
| `status` | integer | Trong phản hồi công khai phải là `1=Published`. |
| `categoryId` | UUID | Mã danh mục. |
| `categoryName` | string | Tên danh mục. |
| `categorySlug` | string | Slug danh mục. |
| `author` | object | Thông tin tóm tắt tác giả. |
| `images` | array | Danh sách ảnh, ưu tiên ảnh primary và theo `OrderIndex`. |

### 5.6. Đặc tả giao diện `/categories/[slug]`

| Khu vực | Yêu cầu hiển thị |
| :--- | :--- |
| Breadcrumb | `Home / Categories / {category.name}`. |
| Hero | Tên, mô tả, số công thức và ảnh bìa danh mục. |
| Danh sách công thức | Dùng `RecipeGrid`; mỗi card liên kết tới `/recipes/{slug}`. |
| Thống kê | Hiển thị số công thức trên trang và tổng số công thức. |
| Phân trang | Hiển thị khi `totalPages > 1`; dùng query parameter `page`. |
| Empty state | Thông báo thân thiện khi chưa có công thức Published. |
| Danh mục liên quan | Hiển thị tối đa ba danh mục khác. |
| SEO | Sinh title, description và Open Graph theo danh mục. |
| 404 | Gọi `notFound()` nếu API trả 404. |

### 5.7. Điều kiện nghiệm thu FR-CAT-002

- [ ] URL `/categories/{slug}` mở được mà không cần đăng nhập.
- [ ] Danh mục hợp lệ trả HTTP 200.
- [ ] Slug không tồn tại hoặc đã xóa mềm trả HTTP 404.
- [ ] Chỉ công thức Published và chưa xóa xuất hiện.
- [ ] Dữ liệu tác giả và ảnh công thức được ánh xạ đúng.
- [ ] Ảnh primary đứng trước các ảnh khác.
- [ ] Công thức được sắp xếp mặc định theo `CreatedAt` giảm dần.
- [ ] `page` và `pageSize` được chuẩn hóa đúng quy tắc.
- [ ] Metadata phân trang chính xác.
- [ ] Danh mục không có công thức trả HTTP 200 với mảng rỗng.
- [ ] Frontend hiển thị empty state thay vì phát sinh lỗi.
- [ ] Các card công thức điều hướng đúng tới `/recipes/{recipe.slug}`.
- [ ] Metadata SEO sử dụng tên và mô tả của danh mục.

---

## 6. Mô hình dữ liệu liên quan

### 6.1. Bảng `Categories`

| Cột | Kiểu/giới hạn | Ý nghĩa |
| :--- | :--- | :--- |
| `Id` | UUID, PK | Định danh danh mục. |
| `Name` | varchar(100), required | Tên danh mục. |
| `Slug` | varchar(120), required, unique | Định danh trên URL. |
| `Description` | text, nullable | Mô tả. |
| `ImageUrl` | varchar(500), nullable | Ảnh đại diện. |
| `OrderIndex` | integer, default 0 | Thứ tự hiển thị. |
| `CreatedAt` | timestamp UTC | Ngày tạo. |
| `UpdatedAt` | timestamp UTC, nullable | Ngày cập nhật. |
| `IsDeleted` | boolean | Cờ xóa mềm. |
| `RowVersion` | bytea | Concurrency token. |

### 6.2. Quan hệ dữ liệu

```text
Categories (1)
    │
    └── (N) Recipes
             ├── (1) AspNetUsers/Author
             └── (N) RecipeImages
```

`Recipes.CategoryId` là khóa ngoại tham chiếu `Categories.Id`.

---

## 7. Ánh xạ kiến trúc Clean Architecture và CQRS

| Tầng | Thành phần | Vai trò |
| :--- | :--- | :--- |
| Domain | `Category`, `Recipe`, `RecipeStatus` | Mô hình nghiệp vụ và trạng thái công thức. |
| Domain | `ICategoryRepository`, `IRecipeRepository` | Hợp đồng truy cập dữ liệu. |
| Application | `CategoryDto`, `CategoryDetailDto`, `RecipeSummaryDto` | Hợp đồng dữ liệu trả ra ngoài. |
| Application | `GetCategoriesQuery` | Use case FR-CAT-001. |
| Application | `GetCategoryBySlugQuery` | Use case FR-CAT-002. |
| Infrastructure | `CategoryRepository` | Truy vấn danh mục và đếm công thức Published. |
| Infrastructure | `RecipeRepository` | Lọc và phân trang công thức theo danh mục. |
| Presentation | `CategoryEndpoints` | Công bố REST API công khai. |
| Frontend API | `categoryApi` | Gọi API, giải mã response và quản lý mock mode. |
| Frontend Route | `/categories` | Trang danh sách danh mục. |
| Frontend Route | `/categories/[slug]` | Trang chi tiết danh mục. |

### 7.1. Luồng FR-CAT-001

```text
CategoriesPage
  → categoryApi.getAll()
  → GET /api/v1/categories
  → GetCategoriesQuery
  → CategoryRepository.GetAllWithRecipeCountAsync()
  → CategoryDto[]
  → CategoryGrid
```

### 7.2. Luồng FR-CAT-002

```text
CategoryDetailPage
  → categoryApi.getBySlug(slug, page, pageSize)
  → GET /api/v1/categories/{slug}
  → GetCategoryBySlugQuery
  → CategoryRepository.GetBySlugAsync()
  → RecipeRepository.GetPagedAsync(categoryId)
  → CategoryDetailDto + Pagination Meta
  → RecipeGrid + Pagination
```

---

## 8. Yêu cầu phi chức năng

### 8.1. Hiệu năng

- FR-CAT-001 phải đếm công thức bằng truy vấn database, không tải toàn bộ collection về bộ nhớ trước khi đếm.
- FR-CAT-002 phải phân trang tại database bằng `Skip` và `Take`.
- Danh sách công thức chỉ include dữ liệu cần cho card: Category, Author và ảnh primary.
- `pageSize` tối đa 50 để hạn chế tải dữ liệu quá lớn.
- Mục tiêu phản hồi API trong điều kiện bình thường: dưới 500 ms.

### 8.2. Bảo mật và riêng tư

- Endpoint công khai không yêu cầu token nhưng không được để lộ công thức Draft hoặc Archived.
- Global query filter ngăn dữ liệu danh mục đã xóa mềm xuất hiện.
- EF Core LINQ parameterization được dùng thay cho ghép chuỗi SQL.
- Response không chứa email hoặc thông tin nhạy cảm của tác giả.

### 8.3. Khả dụng và trải nghiệm

- Giao diện responsive trên mobile, tablet và desktop.
- Ảnh phải có thuộc tính `alt` hoặc nội dung thay thế.
- Trang chi tiết có breadcrumb rõ ràng.
- Trạng thái không có dữ liệu phải được giải thích bằng thông báo thân thiện.
- URL dùng slug có ý nghĩa và hỗ trợ SEO.

### 8.4. Quan sát hệ thống

- Request đi qua middleware correlation ID.
- Lỗi 404 và lỗi hệ thống dùng Problem Details.
- CQRS pipeline có thể ghi log thời gian xử lý query.

---

## 9. Ma trận kiểm thử

| Mã test | Chức năng | Dữ liệu/Thao tác | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| `TC-CAT-001-01` | FR-CAT-001 | Gọi API khi có nhiều danh mục | HTTP 200; trả đầy đủ danh mục chưa xóa. |
| `TC-CAT-001-02` | FR-CAT-001 | Danh mục có 3 Published, 1 Draft, 1 Archived | `recipeCount = 3`. |
| `TC-CAT-001-03` | FR-CAT-001 | Danh mục có công thức Published đã soft-delete | Công thức đã xóa không được tính. |
| `TC-CAT-001-04` | FR-CAT-001 | Danh mục đã soft-delete | Danh mục không xuất hiện. |
| `TC-CAT-001-05` | FR-CAT-001 | Hai danh mục cùng `OrderIndex` | Sắp xếp tiếp theo `Name` tăng dần. |
| `TC-CAT-001-06` | FR-CAT-001 | Database không có danh mục | HTTP 200, `data = []`. |
| `TC-CAT-001-07` | FR-CAT-001 | Mở `/categories` | Hiển thị tổng danh mục, tổng công thức và lưới card. |
| `TC-CAT-002-01` | FR-CAT-002 | Slug hợp lệ, dùng mặc định | HTTP 200, page 1, pageSize 12. |
| `TC-CAT-002-02` | FR-CAT-002 | `page=0` | Hệ thống dùng page 1. |
| `TC-CAT-002-03` | FR-CAT-002 | `pageSize=100` | Hệ thống giới hạn pageSize thành 50. |
| `TC-CAT-002-04` | FR-CAT-002 | Slug không tồn tại | HTTP 404 Problem Details. |
| `TC-CAT-002-05` | FR-CAT-002 | Slug danh mục đã soft-delete | HTTP 404. |
| `TC-CAT-002-06` | FR-CAT-002 | Danh mục không có Published recipe | HTTP 200, recipes rỗng, totalCount 0. |
| `TC-CAT-002-07` | FR-CAT-002 | Danh mục có Draft/Archived | Các công thức này không xuất hiện. |
| `TC-CAT-002-08` | FR-CAT-002 | Danh mục có 25 công thức, pageSize 12 | totalPages 3; các cờ Next/Previous chính xác. |
| `TC-CAT-002-09` | FR-CAT-002 | Công thức có nhiều ảnh | Ảnh primary đứng đầu, sau đó theo OrderIndex. |
| `TC-CAT-002-10` | FR-CAT-002 | Danh mục không có ảnh | Dùng ảnh công thức hoặc icon dự phòng. |
| `TC-CAT-002-11` | FR-CAT-002 | Mở card công thức | Điều hướng tới `/recipes/{slug}`. |
| `TC-CAT-002-12` | FR-CAT-002 | Mở trang ngoài phạm vi tổng trang | HTTP 200 với recipes rỗng; UI không bị crash. |

---

## 10. Dữ liệu kiểm thử đề xuất

Tạo tối thiểu ba danh mục:

1. `Vietnamese Cuisine`:
   - 15 công thức Published;
   - 2 Draft;
   - 1 Archived;
   - 1 Published đã soft-delete.
2. `Desserts`:
   - 3 công thức Published;
   - có ảnh đại diện danh mục.
3. `Beverages`:
   - không có công thức;
   - không có ảnh đại diện.

Bộ dữ liệu trên cho phép kiểm tra đồng thời việc đếm, lọc trạng thái, soft delete, phân trang, ảnh dự phòng và empty state.

---

## 11. Hiện trạng triển khai

### 11.1. Đã hoàn thành

- [x] Entity và EF Core configuration cho Category.
- [x] Unique index cho `Slug`.
- [x] Global query filter cho soft delete.
- [x] Repository lấy danh sách và đếm công thức Published.
- [x] CQRS query cho danh sách danh mục.
- [x] CQRS query cho chi tiết danh mục.
- [x] Endpoint `GET /api/v1/categories`.
- [x] Endpoint `GET /api/v1/categories/{slug}`.
- [x] Phân trang công thức theo danh mục.
- [x] DTO tóm tắt công thức, tác giả và ảnh.
- [x] Trang `/categories`.
- [x] Trang `/categories/[slug]`.
- [x] Metadata SEO cơ bản.
- [x] Empty state và ảnh dự phòng.
- [x] Mock mode chỉ kích hoạt trong development khi được cấu hình rõ ràng.

### 11.2. Cải tiến đề xuất

- [ ] Thêm cache Redis cho danh sách danh mục và chi tiết danh mục.
- [ ] Thêm cache invalidation khi tạo, sửa hoặc xóa danh mục.
- [ ] Bổ sung automated integration tests cho hai endpoint.
- [ ] Bổ sung UI error boundary khi API không khả dụng.
- [ ] Chuẩn hóa toàn bộ response của FR-CAT-002 bằng một generic response contract thay vì anonymous object ở endpoint.
- [ ] Cân nhắc chuyển hướng về trang cuối khi `page` vượt quá `totalPages`.
- [ ] Bổ sung canonical URL cho metadata trang chi tiết.
- [ ] Đo và log thời gian truy vấn khi dữ liệu công thức tăng lớn.

---

## 12. Definition of Done

FR-CAT-001 và FR-CAT-002 được xem là hoàn tất khi:

1. Tất cả acceptance criteria đạt yêu cầu.
2. Backend build thành công, không có lỗi biên dịch.
3. Frontend lint và production build thành công.
4. API không để lộ Draft, Archived hoặc dữ liệu đã soft-delete.
5. Các test case quan trọng được kiểm tra bằng integration test hoặc kiểm thử thủ công có bằng chứng.
6. Giao diện hoạt động trên mobile và desktop.
7. Pull Request được ít nhất một thành viên approve.
8. Nhánh được squash merge vào `main` theo Git Workflow của dự án.
