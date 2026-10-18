# Báo cáo Phân tích và Phân bổ Giao diện Frontend (Next.js 16 App Router)
**Dự án:** Culinary Blog – Blog Ẩm thực và Nấu ăn (Nhóm 5)  
**Tài liệu tham chiếu:** `SRS_Culinary_Blog_v1.0.0.pdf`, `Culinary_Blog_Spec.md`, `struc.md`  
**Công nghệ Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, TanStack Query v5, Zustand, React Hook Form, Zod, Axios  
**Thư mục mã nguồn:** `culinary-blog-web/`  
**Ngày lập:** 2026-09-19  

---

## 1. Tổng quan Phân chia Công việc Frontend

Dưới đây là bảng đối chiếu phân chia chi tiết các trang (pages), màn hình, components, hooks và dịch vụ phía client mà từng thành viên đảm nhiệm trong thư mục `culinary-blog-web/`.

### Bảng Ma trận Phân công Trách nhiệm

| STT | Thành viên | Mã Yêu Cầu Gốc | Phân hệ / Nghiệp vụ đảm nhiệm | Các Trang (Pages) & Module Frontend Phụ Trách |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **Ân** | `FR-AUTH-001` đến `007`, `FR-OBS-001` | **Xác thực, Hồ sơ cá nhân, Token Management & Sức khỏe hệ thống** | - Trang Đăng ký (`/auth/register`)<br>- Trang Đăng nhập (`/auth/login`)<br>- Tích hợp Google OAuth 2.0 Button<br>- Cơ chế Refresh Token & Axios Interceptor ngầm<br>- Dropdown Đăng xuất (`UserNav`)<br>- Trang Hồ sơ cá nhân & Đổi mật khẩu (`/profile`)<br>- Trang/Widget Trạng thái hệ thống (`/status`) |
| **2** | **Linh** | `FR-CAT-001` đến `005`, `FR-RCP-001`, `002`, `FR-JOB-003` | **Khám phá Công cộng, Danh mục, Chi tiết Công thức, SEO & Quản trị Danh mục** | - Trang Chủ công cộng (`/`)<br>- Trang Danh sách Danh mục (`/categories`)<br>- Trang Chi tiết Danh mục & Món ăn (`/categories/[slug]`)<br>- Trang Danh sách Công thức (`/recipes`)<br>- Trang Chi tiết Công thức Chuẩn SEO (`/recipes/[slug]`)<br>- Trang Quản lý Danh mục Admin (`/dashboard/categories`)<br>- Dynamic Sitemap Generator (`app/sitemap.ts`) |
| **3** | **Tuấn** | `FR-SRCH-001` đến `004`, `FR-FILE-001`, `002`, `FR-OBS-002`, `003`, `FR-RCP-005`, `006` | **Tìm kiếm nâng cao, Quản lý File MinIO, Quản trị Trạng thái Công thức & Giám sát** | - Trang Tìm kiếm Toàn văn bản FTS (`/search`)<br>- Bộ lọc đa tiêu chí, Sắp xếp & Phân trang (`/search`)<br>- Component Upload File lên MinIO (Drag & Drop, Preview)<br>- Component Xóa File MinIO an toàn<br>- Trang Quản lý Trạng thái Recipe (`/dashboard/recipes`)<br>- Workflow Xuất bản (Publish) / Hủy xuất bản (Unpublish)<br>- Workflow Lưu trữ (Archive) / Khôi phục Recipe<br>- Client Structured Logging & Correlation ID Tracing |
| **4** | **Trâm** | `FR-RCP-003`, `004`, `007` đến `010`, `FR-JOB-001`, `002` | **Biên soạn Công thức, Quản lý Dữ liệu Con (Ảnh/Nguyên liệu/Bước) & Onboarding** | - Trang Tạo mới Công thức Nấu ăn (`/dashboard/recipes/new`)<br>- Trang Chỉnh sửa Công thức & Concurrency (`/dashboard/recipes/[id]/edit`)<br>- Component Quản lý Bộ sưu tập Ảnh Recipe & Set Primary (`FR-RCP-008`, `FR-JOB-002`)<br>- Component Quản lý Nguyên liệu Động (`FR-RCP-009`)<br>- Component Quản lý Các bước thực hiện Động (`FR-RCP-010`)<br>- Modal & Thao tác Xóa Công thức an toàn (`FR-RCP-007`)<br>- Banner Chào mừng & Hướng dẫn Thành viên mới (`FR-JOB-001`) |

---

## 2. Sơ đồ Cây Thư mục Frontend Chuẩn hóa (`culinary-blog-web/`)

Dưới đây là cây thư mục các file mã nguồn Frontend mà từng thành viên sẽ trực tiếp tạo và phát triển:

```text
culinary-blog-web/
├── app/
│   ├── (auth)/                                 # PHÂN HỆ XÁC THỰC (Ân phụ trách)
│   │   ├── login/
│   │   │   └── page.tsx                        # [Ân] Trang đăng nhập Email/Password & Google
│   │   ├── register/
│   │   │   └── page.tsx                        # [Ân] Trang đăng ký tài khoản mới
│   │   └── welcome/
│   │       └── page.tsx                        # [Trâm] Trang thông báo chào mừng sau đăng ký
│   │
│   ├── (public)/                               # PHÂN HỆ CÔNG CỘNG (Linh, Tuấn, Ân)
│   │   ├── categories/
│   │   │   ├── page.tsx                        # [Linh] Danh sách toàn bộ danh mục món ăn
│   │   │   └── [slug]/
│   │   │       └── page.tsx                    # [Linh] Chi tiết danh mục kèm danh sách công thức
│   │   ├── recipes/
│   │   │   ├── page.tsx                        # [Linh] Danh sách khám phá công thức công khai
│   │   │   └── [slug]/
│   │   │       └── page.tsx                    # [Linh] Chi tiết công thức nấu ăn chuẩn SEO & Schema.org
│   │   ├── search/
│   │   │   └── page.tsx                        # [Tuấn] Trang tìm kiếm FTS, lọc, sắp xếp, phân trang
│   │   ├── profile/
│   │   │   └── page.tsx                        # [Ân] Trang xem và cập nhật hồ sơ cá nhân
│   │   └── status/
│   │       └── page.tsx                        # [Ân] Trang theo dõi sức khỏe hệ thống (Health Check)
│   │
│   ├── dashboard/                              # PHÂN HỆ QUẢN TRỊ / TÁC GIẢ (Tuấn, Trâm, Linh)
│   │   ├── layout.tsx                          # [Chung] Layout Sidebar & Header cho Dashboard
│   │   ├── page.tsx                            # [Chung] Tổng quan thống kê nhanh cho Author/Admin
│   │   ├── categories/
│   │   │   └── page.tsx                        # [Linh] Quản trị danh mục (CRUD) cho Admin
│   │   └── recipes/
│   │       ├── page.tsx                        # [Tuấn] Quản lý trạng thái bài viết (Publish/Archive)
│   │       ├── new/
│   │       │   └── page.tsx                    # [Trâm] Form biên soạn tạo công thức mới
│   │       └── [id]/
│   │           └── edit/
│   │               └── page.tsx                # [Trâm] Form chỉnh sửa công thức & xử lý RowVersion
│   │
│   ├── layout.tsx                              # [Chung] Root Layout (Navbar, Footer, Providers)
│   ├── page.tsx                                # [Linh] Trang chủ Landing Page (Hero, Featured, Latest)
│   ├── sitemap.ts                              # [Linh] Dynamic XML Sitemap Generator cho SEO
│   └── globals.css                             # [Chung] Style toàn cục và cấu hình Tailwind v4
│
├── components/
│   ├── auth/                                   # COMPONENTS XÁC THỰC (Ân phụ trách)
│   │   ├── LoginForm.tsx                       # [Ân] Form đăng nhập + Zod validation
│   │   ├── RegisterForm.tsx                    # [Ân] Form đăng ký + Zod validation
│   │   ├── GoogleLoginButton.tsx               # [Ân] Nút đăng nhập Google OAuth 2.0
│   │   └── WelcomeBanner.tsx                   # [Trâm] Banner chào mừng user mới
│   │
│   ├── categories/                             # COMPONENTS DANH MỤC (Linh phụ trách)
│   │   ├── CategoryCard.tsx                    # [Linh] Thẻ hiển thị tóm tắt danh mục
│   │   ├── CategoryGrid.tsx                    # [Linh] Lưới hiển thị danh sách danh mục
│   │   └── CategoryHeader.tsx                  # [Linh] Banner tiêu đề trang chi tiết danh mục
│   │
│   ├── recipes/                                # COMPONENTS CÔNG THỨC (Linh, Trâm)
│   │   ├── RecipeCard.tsx                      # [Linh] Thẻ tóm tắt công thức (Ảnh, thời gian, calo)
│   │   ├── RecipeGrid.tsx                      # [Linh] Lưới danh sách công thức
│   │   ├── RecipeHero.tsx                      # [Linh] Phần đầu trang chi tiết (Tiêu đề, ảnh, nút in)
│   │   ├── IngredientList.tsx                  # [Linh] Bảng hiển thị nguyên liệu cho người đọc
│   │   ├── StepByStepList.tsx                  # [Linh] Danh sách các bước nấu ăn tuần tự
│   │   ├── NutritionCard.tsx                   # [Linh] Khối hiển thị bảng thông tin dinh dưỡng
│   │   ├── RecipeTimer.tsx                     # [Linh] Đồng hồ đếm ngược thông minh theo bước
│   │   └── editor/                             # BỘ BIÊN SOẠN CÔNG THỨC (Trâm phụ trách)
│   │       ├── RecipeForm.tsx                  # [Trâm] Form bọc chính quản lý submit & draft
│   │       ├── BasicInfoFields.tsx             # [Trâm] Nhập tiêu đề, mô tả, danh mục, độ khó, thời gian
│   │       ├── NutritionFields.tsx             # [Trâm] Nhập calo, protein, carb, fat, fiber, sodium
│   │       ├── IngredientManager.tsx           # [Trâm] Quản lý thêm/sửa/xóa/đổi vị trí nguyên liệu
│   │       ├── StepManager.tsx                 # [Trâm] Quản lý thêm/sửa/xóa/đánh số thứ tự các bước
│   │       ├── ImageGalleryManager.tsx         # [Trâm] Quản lý gallery ảnh, chọn Primary Image
│   │       └── DeleteRecipeModal.tsx           # [Trâm] Modal xác nhận xóa vĩnh viễn recipe
│   │
│   ├── search/                                 # COMPONENTS TÌM KIẾM (Tuấn phụ trách)
│   │   ├── SearchInput.tsx                     # [Tuấn] Ô nhập tìm kiếm FTS debounce 400ms
│   │   ├── FilterSidebar.tsx                   # [Tuấn] Thanh lọc (Category, Difficulty, CookTime)
│   │   ├── SortDropdown.tsx                    # [Tuấn] Dropdown sắp xếp đa tiêu chí
│   │   ├── PaginationControl.tsx               # [Tuấn] Thanh chuyển trang PagedResult (Prev, Next)
│   │   └── SearchResults.tsx                   # [Tuấn] Hiển thị kết quả tìm kiếm hoặc Empty state
│   │
│   ├── common/                                 # COMPONENTS DÙNG CHUNG (Tuấn, Ân, Linh)
│   │   ├── FileUploadDropzone.tsx              # [Tuấn] Khu vực kéo thả tải ảnh lên MinIO
│   │   ├── FileDeleteConfirmModal.tsx          # [Tuấn] Modal xác nhận xóa file MinIO
│   │   ├── SystemStatusIndicator.tsx           # [Ân] Badge / Widget trạng thái kết nối backend
│   │   ├── ErrorBoundary.tsx                   # [Tuấn] Bắt lỗi React runtime và ghi log
│   │   └── ConfirmationDialog.tsx              # [Chung] Hộp thoại xác nhận thao tác nguy hiểm
│   │
│   ├── dashboard/                              # COMPONENTS DASHBOARD
│   │   ├── CategoryTable.tsx                   # [Linh] Bảng quản trị danh mục (CRUD)
│   │   ├── CategoryModal.tsx                   # [Linh] Modal tạo mới / cập nhật danh mục
│   │   ├── DeleteCategoryModal.tsx             # [Linh] Modal xóa danh mục (chặn nếu có recipe)
│   │   ├── RecipeStatusTable.tsx               # [Tuấn] Bảng recipe kèm nút Publish / Archive
│   │   ├── PublishRecipeModal.tsx              # [Tuấn] Modal xác nhận xuất bản (kiểm tra steps >= 1)
│   │   └── ArchiveRecipeModal.tsx              # [Tuấn] Modal xác nhận lưu trữ recipe
│   │
│   └── layout/                                 # KHUNG GIAO DIỆN CHÍNH
│       ├── Navbar.tsx                          # [Linh] Thanh điều hướng trên cùng
│       ├── Footer.tsx                          # [Linh] Chân trang website
│       ├── UserNav.tsx                         # [Ân] Avatar menu, profile link, nút đăng xuất
│       └── Sidebar.tsx                         # [Chung] Menu điều hướng trong Dashboard
│
├── lib/
│   ├── api/
│   │   ├── axiosClient.ts                      # [Ân, Tuấn] Cấu hình Axios, Interceptors, Correlation-ID
│   │   ├── authApi.ts                          # [Ân] Các hàm gọi API xác thực
│   │   ├── categoryApi.ts                      # [Linh] Các hàm gọi API danh mục
│   │   ├── recipeApi.ts                        # [Linh, Tuấn, Trâm] Các hàm gọi API công thức
│   │   └── fileApi.ts                          # [Tuấn] Các hàm upload/delete tệp MinIO
│   ├── logger.ts                               # [Tuấn] Tiện ích ghi log có cấu trúc tại client
│   └── auth.ts                                 # [Ân] Helpers kiểm tra quyền, giải mã JWT
│
├── store/
│   └── authStore.ts                            # [Ân] Zustand Store quản lý User & AccessToken
│
├── hooks/
│   ├── useAuth.ts                              # [Ân] Hook tiện ích lấy thông tin phiên đăng nhập
│   └── useFileUpload.ts                        # [Tuấn] Hook xử lý kéo thả và upload file MinIO
│
└── types/
    ├── auth.types.ts                           # [Ân] Khai báo kiểu dữ liệu Auth & User
    ├── category.types.ts                       # [Linh] Khai báo kiểu Category & DTOs
    ├── recipe.types.ts                         # [Linh, Trâm, Tuấn] Khai báo kiểu Recipe, Steps, Ingredients
    └── api.types.ts                            # [Chung] Định nghĩa ApiResponse, PagedResult, RFC 7807
```

---

## 3. Đặc tả Chi tiết Công việc Từng Thành viên

---

### 3.1. Thành viên 1: Ân
**Trách nhiệm chính:** Toàn bộ luồng Xác thực tài khoản, Bảo mật phiên làm việc phía Client, Hồ sơ cá nhân và Giám sát Sức khỏe hệ thống.

#### 1. Trang Đăng ký Tài khoản (`Register Page`)
- **Route:** `/auth/register`
- **Tập tin:** `app/(auth)/register/page.tsx`
- **Components:** `components/auth/RegisterForm.tsx`
- **Phân quyền truy cập:** Public (nếu đã đăng nhập, tự động redirect về trang chủ `/`).
- **Nghiệp vụ chi tiết (`FR-AUTH-001`):**
  - Cung cấp form đăng ký gồm các trường:
    - `DisplayName` (Họ và tên hiển thị): Chuỗi 2-100 ký tự.
    - `Email`: Định dạng email hợp lệ, bắt buộc.
    - `Password`: Mật khẩu tối thiểu 8 ký tự, bao gồm ít nhất một chữ hoa, một chữ thường, một chữ số và một ký tự đặc biệt.
    - `ConfirmPassword`: Bắt buộc khớp với `Password`.
  - Validate form bằng **React Hook Form** kết hợp **Zod schema** trước khi gửi.
  - Hiển thị phản hồi lỗi cụ thể theo tiêu chuẩn RFC 7807 dưới từng ô input (ví dụ: email đã được đăng ký -> hiển thị lỗi đỏ bên dưới trường Email).
  - Tích hợp nút Submit có trạng thái Spinner Loading chống click trùng lặp.
  - Khi đăng ký thành công: Hiển thị Toast thông báo và chuyển hướng sang `/auth/welcome` hoặc `/auth/login`.

#### 2. Trang Đăng nhập Tài khoản (`Login Page`)
- **Route:** `/auth/login`
- **Tập tin:** `app/(auth)/login/page.tsx`
- **Components:** `components/auth/LoginForm.tsx`, `components/auth/GoogleLoginButton.tsx`
- **Phân quyền truy cập:** Public (redirect về `/` nếu đã xác thực).
- **Nghiệp vụ chi tiết (`FR-AUTH-002`, `FR-AUTH-003`):**
  - **Đăng nhập Email/Password (`FR-AUTH-002`):**
    - Input Email và Password kèm checkbox "Ghi nhớ phiên đăng nhập".
    - Gọi API `POST /api/v1/auth/login`.
    - Khi thành công: Lưu Access Token (15 phút) vào Zustand Store, lưu Refresh Token vào HttpOnly Cookie hoặc storage an toàn theo kiến trúc, lưu thông tin User (Id, Email, Roles, DisplayName, AvatarUrl).
    - Xử lý chuyển hướng: Điều hướng về trang người dùng đang xem trước đó (thông qua `?callbackUrl=...`) hoặc chuyển vào trang Dashboard `/dashboard`.
  - **Đăng nhập Google OAuth 2.0 (`FR-AUTH-003`):**
    - Nút bấm chuẩn nhận diện Google Sign-In (`GoogleLoginButton`).
    - Khởi tạo luồng xác thực Google, nhận `idToken` hoặc `code` từ Google và gửi đến `POST /api/v1/auth/google`.
    - Tự động đồng bộ tài khoản và đăng nhập ngay khi xác thực thành công.

#### 3. Quản lý Phiên Đăng nhập, Token Refresh & Đăng xuất
- **Tập tin:** `lib/api/axiosClient.ts`, `store/authStore.ts`, `components/layout/UserNav.tsx`
- **Nghiệp vụ chi tiết (`FR-AUTH-004`, `FR-AUTH-005`):**
  - **Zustand Auth Store (`authStore.ts`):** Quản lý state toàn cục: `user`, `accessToken`, `isAuthenticated`, `roles`, `login()`, `logout()`, `setAccessToken()`.
  - **Axios Interceptors & Silent Token Refresh (`FR-AUTH-004`):**
    - `Request Interceptor`: Tự động gắn header `Authorization: Bearer <accessToken>` vào tất cả các request gửi đến backend.
    - `Response Interceptor`: Lắng nghe HTTP Status `401 Unauthorized`. Khi Access Token hết hạn, tạm hoãn các request đang chờ trong hàng đợi (Request Queue), gọi `POST /api/v1/auth/refresh` bằng Refresh Token để lấy cặp token mới.
    - Nếu refresh thành công: Cập nhật Access Token mới vào Store và thực thi lại các request bị hoãn mà người dùng không hề bị gián đoạn trải nghiệm.
    - Nếu refresh thất bại (Token hết hạn 7 ngày hoặc bị thu hồi do phát hiện Token Reuse): Tự động xóa state, điều hướng về `/auth/login` kèm thông báo: "Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại!".
  - **Đăng xuất (`FR-AUTH-005`):**
    - Nút "Đăng xuất" đặt trong dropdown avatar (`components/layout/UserNav.tsx`).
    - Khi click: Gọi API `POST /api/v1/auth/logout` để thu hồi (revoke) Refresh Token ở backend, xóa sạch Access Token khỏi Zustand Store và cookie, chuyển hướng về `/auth/login`.

#### 4. Trang Xem và Cập nhật Hồ sơ Cá nhân (`Profile Page`)
- **Route:** `/profile`
- **Tập tin:** `app/(public)/profile/page.tsx`
- **Components:** `components/profile/ProfileCard.tsx`, `components/profile/ProfileEditForm.tsx`, `components/profile/ChangePasswordForm.tsx`
- **Phân quyền truy cập:** Yêu cầu đăng nhập (Author hoặc Admin).
- **Nghiệp vụ chi tiết (`FR-AUTH-006`, `FR-AUTH-007`):**
  - **Xem hồ sơ (`FR-AUTH-006`):**
    - Gọi API `GET /api/v1/auth/me`.
    - Hiển thị Avatar, Display Name, Email, Vai trò hệ thống (Author / Admin), Ngày gia nhập, và Tiểu sử ngắn (`Bio`).
    - Hiển thị thống kê cá nhân: Số lượng công thức đã tạo, số công thức đã xuất bản.
  - **Cập nhật hồ sơ (`FR-AUTH-007`):**
    - Form cập nhật `DisplayName` và `Bio`.
    - Chọn và tải ảnh đại diện Avatar mới (tích hợp gọi module upload file).
    - Gọi API `PATCH /api/v1/auth/me` để lưu thông tin mới. Cập nhật tức thì hiển thị trên Header/Navbar.
  - **Đổi mật khẩu:** Form nhập Mật khẩu cũ, Mật khẩu mới, Xác nhận mật khẩu mới. Kiểm tra validate chặt chẽ và thông báo kết quả.

#### 5. Trang & Widget Giám sát Sức khỏe Hệ thống (`Health Check Status`)
- **Route:** `/status`
- **Tập tin:** `app/(public)/status/page.tsx`
- **Components:** `components/common/SystemStatusIndicator.tsx`
- **Phân quyền truy cập:** Public (cho phép khách và ban quản trị theo dõi).
- **Nghiệp vụ chi tiết (`FR-OBS-001`):**
  - Gọi các endpoint backend: `GET /health` (Tổng hợp), `GET /health/live` (Liveness), `GET /health/ready` (Readiness).
  - Hiển thị trạng thái trực quan với huy hiệu màu:
    - Xanh lá (Healthy): Toàn bộ hệ thống hoạt động tốt.
    - Vàng (Degraded): Có dịch vụ phụ thuộc phản hồi chậm hoặc đang suy giảm.
    - Đỏ (Unhealthy): Dịch vụ chính (PostgreSQL / Redis / MinIO) mất kết nối.
  - Hiển thị độ trễ phản hồi (Response Latency ms) và thời gian kiểm tra gần nhất.

---

### 3.2. Thành viên 2: Linh
**Trách nhiệm chính:** Giao diện Khám phá công cộng (Trang chủ, Danh mục, Chi tiết công thức), Tối ưu hóa Công cụ Tìm kiếm (SEO & Schema.org), và Quản trị Danh mục cho Admin.

#### 1. Trang Chủ Website (`Landing Page`)
- **Route:** `/`
- **Tập tin:** `app/page.tsx`
- **Components:** `components/layout/Navbar.tsx`, `components/layout/Footer.tsx`, `components/categories/CategoryGrid.tsx`, `components/recipes/RecipeGrid.tsx`
- **Phân quyền truy cập:** Public.
- **Nghiệp vụ chi tiết:**
  - **Hero Banner:** Giới thiệu blog ẩm thực, slogan, thanh tìm kiếm nhanh (dẫn hướng sang `/search`) và nút CTA "Khám phá công thức".
  - **Khối "Danh mục nổi bật":** Hiển thị danh sách các danh mục hàng đầu kèm ảnh và số lượng công thức.
  - **Khối "Công thức mới nhất":** Lưới các bài viết công thức mới xuất bản (`Published`), hiển thị thumbnail, độ khó, thời gian nấu, tên tác giả.
  - **Navbar & Footer:** Tích hợp logo thương hiệu, menu điều hướng đa cấp, liên kết mạng xã hội và link Sitemap.

#### 2. Trang Danh sách Danh mục Món ăn (`Categories List Page`)
- **Route:** `/categories`
- **Tập tin:** `app/(public)/categories/page.tsx`
- **Components:** `components/categories/CategoryCard.tsx`, `components/categories/CategoryGrid.tsx`
- **Phân quyền truy cập:** Public.
- **Nghiệp vụ chi tiết (`FR-CAT-001`):**
  - Gọi API `GET /api/v1/categories` (được tối ưu cache Redis 30 phút từ backend).
  - Hiển thị danh sách dạng lưới thẻ (Grid Cards):
    - Ảnh đại diện danh mục (`ImageUrl`).
    - Tên danh mục (`Name`).
    - Mô tả ngắn gọn (`Description`).
    - Huy hiệu đếm số lượng công thức (`RecipeCount`).
  - Hiệu ứng hover mượt mà, click vào thẻ sẽ điều hướng tới trang chi tiết danh mục `/categories/[slug]`.
  - Tích hợp Skeleton loading khi đang fetch dữ liệu.

#### 3. Trang Chi tiết Danh mục kèm Công thức (`Category Detail Page`)
- **Route:** `/categories/[slug]`
- **Tập tin:** `app/(public)/categories/[slug]/page.tsx`
- **Components:** `components/categories/CategoryHeader.tsx`, `components/recipes/RecipeGrid.tsx`
- **Phân quyền truy cập:** Public.
- **Nghiệp vụ chi tiết (`FR-CAT-002`):**
  - Dựa trên `slug` trên URL, gọi API `GET /api/v1/categories/{slug}` và API lấy danh sách công thức thuộc danh mục tương ứng.
  - **Category Header:** Hiển thị banner lớn, tên danh mục, mô tả chi tiết và tổng số công thức.
  - Breadcrumbs điều hướng: `Trang chủ > Danh mục > [Tên danh mục]`.
  - Danh sách bài viết trong danh mục: Hiển thị dạng card có ảnh đại diện, tiêu đề, thời gian nấu, tác giả.
  - Phân trang bài viết bên trong danh mục nếu số lượng bài viết > 12.

#### 4. Trang Danh sách Công thức Công cộng (`Public Recipes Page`)
- **Route:** `/recipes`
- **Tập tin:** `app/(public)/recipes/page.tsx`
- **Components:** `components/recipes/RecipeCard.tsx`, `components/recipes/RecipeGrid.tsx`
- **Phân quyền truy cập:** Public.
- **Nghiệp vụ chi tiết (`FR-RCP-001`):**
  - Gọi API `GET /api/v1/recipes` với trạng thái mặc định là bài viết đã xuất bản (`Published`).
  - Thẻ công thức (`RecipeCard`):
    - Ảnh đại diện chính (Primary Image Thumbnail) với tỉ lệ chuẩn 16:9.
    - Huy hiệu Độ khó: Dễ (Easy - Xanh lá), Trung bình (Medium - Vàng cam), Khó (Hard - Đỏ), Chuyên gia (Expert - Tím).
    - Tiêu đề món ăn, tên tác giả kèm avatar nhỏ, thời gian nấu (`CookTime`), khẩu phần (`Servings`).
  - Tích hợp tính năng chuyển đổi chế độ xem (Lưới thẻ Grid / Danh sách List).

#### 5. Trang Chi tiết Công thức Chuẩn SEO & Schema.org (`Recipe Detail Page`)
- **Route:** `/recipes/[slug]`
- **Tập tin:** `app/(public)/recipes/[slug]/page.tsx`
- **Components:** `components/recipes/RecipeHero.tsx`, `components/recipes/IngredientList.tsx`, `components/recipes/StepByStepList.tsx`, `components/recipes/NutritionCard.tsx`, `components/recipes/RecipeTimer.tsx`
- **Phân quyền truy cập:** Public (Bài viết `Draft`/`Archived` chỉ Author sở hữu hoặc Admin mới xem được kèm banner cảnh báo).
- **Nghiệp vụ chi tiết (`FR-RCP-002`, `FR-JOB-003`):**
  - **Tối ưu SEO Metadata & JSON-LD:**
    - Tự động sinh `generateMetadata` trong Next.js: Title chuẩn SEO, Meta Description, Open Graph Image, Canonical URL.
    - Nhúng dữ liệu có cấu trúc **Schema.org Recipe JSON-LD** (`application/ld+json`) chứa đầy đủ: tên món ăn, tác giả, ảnh, thời gian chuẩn bị, thời gian nấu, khẩu phần, danh sách nguyên liệu, các bước hướng dẫn và thông số dinh dưỡng để Google hiển thị Rich Snippets (thẻ công thức nổi bật trên Google Search).
  - **Nội dung hiển thị chi tiết:**
    - **Hero Section:** Tiêu đề món ăn, ngày đăng, tên tác giả, danh mục, nút In công thức (Print Mode tối ưu cho giấy in), nút Chia sẻ (Facebook, Twitter, Sao chép liên kết).
    - **Thanh thông số nhanh:** Thời gian chuẩn bị, thời gian nấu, tổng thời gian, khẩu phần ăn.
    - **Bảng Dinh Dưỡng (`NutritionCard`):** Calo, Protein, Carbohydrates, Chất béo, Chất xơ, Natri.
    - **Danh sách Nguyên liệu (`IngredientList`):** Dạng checklist có thể tick chọn khi người dùng đi chợ hoặc nấu ăn.
    - **Các bước thực hiện (`StepByStepList`):** Thứ tự từng bước 1..N, tiêu đề bước, mô tả, ảnh minh họa từng bước.
    - **Bộ đếm giờ nấu ăn (`RecipeTimer`):** Widget bấm giờ thông minh cho từng bước có khai báo `TimerMinutes`, phát chuông báo khi hết giờ.

#### 6. Trang Quản trị Danh mục dành cho Admin (`Admin Category Management`)
- **Route:** `/dashboard/categories`
- **Tập tin:** `app/dashboard/categories/page.tsx`
- **Components:** `components/dashboard/CategoryTable.tsx`, `components/dashboard/CategoryModal.tsx`, `components/dashboard/DeleteCategoryModal.tsx`
- **Phân quyền truy cập:** Chỉ `Admin` (chặn Author và Guest, hiển thị lỗi 403 Forbidden).
- **Nghiệp vụ chi tiết (`FR-CAT-003`, `FR-CAT-004`, `FR-CAT-005`):**
  - **Danh sách Danh mục:** Bảng hiển thị ID, Tên, Slug, Số lượng Recipe liên kết, Thứ tự hiển thị, Nút Thao tác (Sửa, Xóa).
  - **Tạo danh mục mới (`FR-CAT-003`):**
    - Modal nhập: Tên (2-50 ký tự), Slug tự sinh chuẩn tiếng Việt không dấu (có thể chỉnh sửa), Mô tả, URL ảnh đại diện danh mục.
    - Validate Zod và gọi `POST /api/v1/categories`.
  - **Cập nhật danh mục (`FR-CAT-004`):**
    - Modal chỉnh sửa thông tin danh mục, cảnh báo giữ nguyên slug để bảo toàn thứ hạng SEO đã lập chỉ mục.
    - Gọi `PUT /api/v1/categories/{id}`.
  - **Xóa danh mục (`FR-CAT-005`):**
    - Nút Xóa mở hộp thoại xác nhận `DeleteCategoryModal`.
    - Nếu danh mục đang chứa công thức (`RecipeCount > 0`): Vô hiệu hóa nút Xóa và hiển thị thông báo cảnh báo màu đỏ: "Không thể xóa danh mục đang chứa công thức!".
    - Bắt lỗi HTTP 409 Conflict từ backend nếu có xung đột xảy ra.

#### 7. Cơ chế Sinh Sitemap Động (`Dynamic XML Sitemap`)
- **Route:** `/sitemap.xml`
- **Tập tin:** `app/sitemap.ts`
- **Nghiệp vụ chi tiết (`FR-JOB-003`):**
  - Sử dụng tính năng Dynamic Sitemap của Next.js App Router.
  - Tự động gọi API lấy danh sách toàn bộ các URL công thức `Published` và toàn bộ URL `Categories` để tạo ra tệp chuẩn `sitemap.xml` phục vụ công cụ tìm kiếm cào dữ liệu định kỳ.

---

### 3.3. Thành viên 3: Tuấn
**Trách nhiệm chính:** Tính năng Tìm kiếm toàn văn bản (FTS), Bộ lọc - Sắp xếp - Phân trang đa năng, Module Tải/Xóa tệp MinIO, Quản lý Trạng thái Công thức trong Dashboard (Publish/Archive) và Giám sát Client (Structured Logging/Tracing).

#### 1. Trang Tìm kiếm & Khám phá Công thức Toàn diện (`Search Page`)
- **Route:** `/search`
- **Tập tin:** `app/(public)/search/page.tsx`
- **Components:** `components/search/SearchInput.tsx`, `components/search/FilterSidebar.tsx`, `components/search/SortDropdown.tsx`, `components/search/PaginationControl.tsx`, `components/search/SearchResults.tsx`
- **Phân quyền truy cập:** Public.
- **Nghiệp vụ chi tiết (`FR-SRCH-001`, `FR-SRCH-002/003/004`):**
  - **Tìm kiếm Toàn văn bản (`SearchInput - FR-SRCH-001`):**
    - Ô nhập từ khóa tìm kiếm hỗ trợ tiếng Việt có dấu và không dấu (tương thích với cơ chế PostgreSQL `unaccent` ở backend).
    - Kỹ thuật Debounce 400ms: Chỉ phát request tìm kiếm sau khi người dùng dừng gõ 400ms, tiết kiệm băng thông và tài nguyên server.
    - Nút Xóa nhanh từ khóa (Clear input).
  - **Bộ lọc đa tiêu chí (`FilterSidebar - FR-SRCH-002`):**
    - Lọc theo Danh mục (Category Dropdown/Checkboxes).
    - Lọc theo Độ khó (Easy, Medium, Hard, Expert).
    - Lọc theo Thời gian nấu (Dưới 15 phút, 15-30 phút, 30-60 phút, Trên 60 phút).
    - Lọc theo Khẩu phần ăn (1-2 người, 3-4 người, 5+ người).
    - Nút "Đặt lại bộ lọc" (Reset All Filters).
  - **Sắp xếp linh hoạt (`SortDropdown - FR-SRCH-003`):**
    - Sắp xếp theo: Mới nhất (`-createdAt`), Cũ nhất (`createdAt`), Nấu nhanh nhất (`cookTime`), Nấu lâu nhất (`-cookTime`), Tiêu đề A-Z (`title`), Độ liên quan nhất (Relevance rank).
  - **Đồng bộ hóa URL Search Params:**
    - Mọi thay đổi về từ khóa `q`, danh mục `cat`, độ khó `difficulty`, trang `page`, sắp xếp `sort` được đẩy lên URL (ví dụ: `/search?q=bo+kho&difficulty=Medium&sort=-createdAt&page=1`). Giúp người dùng có thể copy link chia sẻ hoặc lưu bookmark chính xác trạng thái tìm kiếm.
  - **Phân trang Chuẩn mực (`PaginationControl - FR-SRCH-004`):**
    - Hiển thị theo mô hình `PagedResult`: Tổng số kết quả (`TotalCount`), Số trang (`TotalPages`), Trang hiện tại (`Page`).
    - Nút Trang trước (Previous), Trang sau (Next), số trang có dấu chấm lửng (`1 2 3 ... 10`).
    - Tự động cuộn mượt mà lên đầu trang kết quả khi chuyển trang.
  - **Khu vực Kết quả (`SearchResults`):**
    - Hiển thị số lượng tìm thấy ("Tìm thấy 18 kết quả cho từ khóa 'Bò kho'").
    - Trạng thái Empty State: Hình minh họa sinh động khi không có kết quả kèm gợi ý từ khóa thay thế.

#### 2. Module Upload và Quản lý Tệp Tin MinIO (`MinIO File Integration`)
- **Tập tin:** `components/common/FileUploadDropzone.tsx`, `components/common/FileDeleteConfirmModal.tsx`, `hooks/useFileUpload.ts`, `lib/api/fileApi.ts`
- **Phân quyền truy cập:** Author và Admin.
- **Nghiệp vụ chi tiết (`FR-FILE-001`, `FR-FILE-002`):**
  - **Kéo thả Tải tệp lên MinIO (`FR-FILE-001`):**
    - Vùng kéo - thả ảnh (Drag & Drop zone) hoặc click để duyệt file từ máy tính.
    - Kiểm tra bảo mật tại client trước khi upload:
      - Dung lượng tối đa cho phép: 5 MB (báo lỗi ngay nếu file > 5MB).
      - Định dạng cho phép: JPEG, PNG, WebP, AVIF.
    - Hiển thị thanh tiến trình tải lên (Progress Bar %) sử dụng sự kiện `onUploadProgress` của Axios.
    - Hiển thị ảnh xem trước (Image Preview) ngay lập tức sau khi hoàn tất.
  - **Xóa tệp khỏi MinIO (`FR-FILE-002`):**
    - Nút icon xóa (thùng rác) trên góc từng ảnh tải lên.
    - Hộp thoại xác nhận `FileDeleteConfirmModal` để tránh thao tác nhầm lẫn.
    - Gọi API xóa tệp phía server để giải phóng dung lượng lưu trữ trên MinIO S3 bucket.

#### 3. Giao diện Quản lý Trạng thái Công thức trong Dashboard (`Recipe State Workflow`)
- **Route:** `/dashboard/recipes`
- **Tập tin:** `app/dashboard/recipes/page.tsx`
- **Components:** `components/dashboard/RecipeStatusTable.tsx`, `components/dashboard/PublishRecipeModal.tsx`, `components/dashboard/ArchiveRecipeModal.tsx`
- **Phân quyền truy cập:** Author (xem và quản lý bài của mình) và Admin (xem và quản lý toàn bộ bài viết).
- **Nghiệp vụ chi tiết (`FR-RCP-005`, `FR-RCP-006`):**
  - **Bảng Quản lý Công thức:**
    - Liệt kê danh sách: Ảnh đại diện, Tiêu đề, Danh mục, Trạng thái (Bản nháp - Draft, Đã xuất bản - Published, Đã lưu trữ - Archived), Ngày cập nhật, Menu Thao tác nhanh.
    - Tabs lọc nhanh theo trạng thái: Tất cả (All), Nháp (Draft), Xuất bản (Published), Lưu trữ (Archived).
  - **Quy trình Xuất bản & Hủy xuất bản (`FR-RCP-005`):**
    - **Nút "Xuất bản" (Publish):** Mở modal xác nhận. Kiểm tra điều kiện nghiệp vụ cốt lõi: công thức bắt buộc phải có ít nhất 1 bước thực hiện (`Steps.length >= 1`). Nếu chưa có bước nào, cảnh báo và chặn xuất bản, chuyển hướng tác giả sang tab thêm bước.
    - Gọi API `POST /api/v1/recipes/{id}/publish`. Khi thành công: Chuyển badge sang màu xanh lá `Published`, kích hoạt cache invalidation và sitemap update.
    - **Nút "Hủy xuất bản" (Unpublish):** Đưa công thức từ `Published` trở lại `Draft` (ẩn khỏi danh sách công cộng và tìm kiếm). Gọi API `POST /api/v1/recipes/{id}/unpublish`.
  - **Quy trình Lưu trữ & Khôi phục (`FR-RCP-006`):**
    - **Nút "Lưu trữ" (Archive):** Ẩn công thức khỏi người đọc công cộng nhưng giữ nguyên lịch sử và dữ liệu bài viết trong kho của tác giả. Gọi API `POST /api/v1/recipes/{id}/archive`.
    - **Khôi phục bài viết:** Hỗ trợ chuyển bài từ `Archived` trở lại trạng thái `Draft` khi tác giả muốn tái xuất bản.

#### 4. Module Giám sát Client, Tracing Header & Structured Logging
- **Tập tin:** `lib/api/axiosClient.ts`, `lib/logger.ts`, `components/common/ErrorBoundary.tsx`
- **Nghiệp vụ chi tiết (`FR-OBS-002`, `FR-OBS-003`):**
  - **Gắn nhãn Distributed Tracing (`FR-OBS-003`):**
    - Thiết lập Axios Interceptor tự động tạo hoặc duy trì header `X-Correlation-ID` (chuỗi UUID ngẫu nhiên cho mỗi phiên thao tác). Header này được gửi kèm mọi API request để liên kết log giữa trình duyệt và backend Serilog/OpenTelemetry.
  - **Ghi log có cấu trúc tại Client (`FR-OBS-002`):**
    - Xây dựng tiện ích `logger.ts` xuất log có định dạng JSON chuẩn gồm: `timestamp`, `level` (INFO/WARN/ERROR), `correlationId`, `path`, `message`, `errorDetails`.
    - Tích hợp `ErrorBoundary.tsx` bao bọc các thành phần quan trọng của React để bắt lỗi sập giao diện, hiển thị màn hình fallback thân thiện và ghi log lỗi hệ thống.

---

### 3.4. Thành viên 4: Trâm
**Trách nhiệm chính:** Bộ công cụ Biên soạn và Chỉnh sửa Công thức Nấu ăn, Quản lý toàn diện các thành phần con của Recipe (Ảnh, Nguyên liệu, Các bước), Cơ chế chống xung đột Concurrency, Xóa công thức và Trải nghiệm chào mừng thành viên mới.

#### 1. Trang Tạo Mới Công thức Nấu ăn (`Create Recipe Page`)
- **Route:** `/dashboard/recipes/new`
- **Tập tin:** `app/dashboard/recipes/new/page.tsx`
- **Components:** `components/recipes/editor/RecipeForm.tsx`, `components/recipes/editor/BasicInfoFields.tsx`, `components/recipes/editor/NutritionFields.tsx`
- **Phân quyền truy cập:** Author và Admin.
- **Nghiệp vụ chi tiết (`FR-RCP-003`):**
  - Giao diện biên soạn công thức chuyên nghiệp với cấu trúc phân khu trực quan:
    - **Thông tin cơ bản (`BasicInfoFields`):**
      - Tiêu đề món ăn (`Title`): Bắt buộc, 3-150 ký tự. Tự động sinh xem trước Slug thân thiện SEO.
      - Danh mục (`CategoryId`): Dropdown chọn danh mục (fetch từ API Category).
      - Mô tả ngắn (`Description`): Tóm tắt hương vị, điểm đặc sắc của món (tối đa 500 ký tự).
      - Độ khó (`Difficulty`): Lựa chọn Easy, Medium, Hard, Expert.
      - Thời gian chuẩn bị (`PrepTimeMinutes`) & Thời gian nấu (`CookTimeMinutes`): Nhập số phút hợp lệ (> 0).
      - Khẩu phần ăn (`Servings`): Số người ăn (> 0).
    - **Thông tin dinh dưỡng (`NutritionFields`):**
      - Nhập các chỉ số: Calories (kcal), Protein (g), Carbohydrates (g), Chất béo Fat (g), Chất xơ Fiber (g), Natri Sodium (mg).
  - Tích hợp nhúng các component con: Quản lý Thư viện ảnh, Quản lý Nguyên liệu, Quản lý Các bước thực hiện.
  - Nút thao tác: "Lưu bản nháp" (`Save as Draft` - tạo recipe với trạng thái Draft) và "Lưu và tiếp tục chỉnh sửa".
  - Quản lý trạng thái form bằng **React Hook Form** và kiểm tra hợp lệ bằng **Zod Schema**.

#### 2. Trang Chỉnh Sửa Công thức & Kiểm soát Concurrency (`Edit Recipe Page`)
- **Route:** `/dashboard/recipes/[id]/edit`
- **Tập tin:** `app/dashboard/recipes/[id]/edit/page.tsx`
- **Components:** `components/recipes/editor/RecipeForm.tsx`
- **Phân quyền truy cập:** Chỉ Author sở hữu công thức (`Recipe.AuthorId == CurrentUserId`) hoặc `Admin` (kiểm tra quyền, nếu vi phạm hiển thị thông báo lỗi 403 Forbidden).
- **Nghiệp vụ chi tiết (`FR-RCP-004`):**
  - Gọi API `GET /api/v1/recipes/{id}` để nạp đầy đủ dữ liệu hiện tại của công thức vào form chỉnh sửa.
  - **Xử lý Xung đột Phiên bản Dữ liệu (Optimistic Concurrency Control):**
    - Lưu giữ giá trị mã phiên bản `RowVersion` từ backend khi nạp dữ liệu.
    - Khi submit form cập nhật (`PUT /api/v1/recipes/{id}`), gửi kèm giá trị `RowVersion` qua HTTP Header `If-Match` hoặc trường trong body request.
    - Nếu có xung đột (người khác hoặc tab khác đã sửa bài viết trước đó, backend trả về lỗi `409 Conflict`): Hiển thị Dialog cảnh báo xung đột dữ liệu: "Dữ liệu công thức đã bị thay đổi bởi phiên làm việc khác. Vui lòng tải lại trang để nhận dữ liệu mới nhất!".
  - Hiển thị Toast thông báo cập nhật thành công và kích hoạt làm mới cache TanStack Query.

#### 3. Component Quản lý Nguyên liệu Động (`Dynamic Ingredient Manager`)
- **Tập tin:** `components/recipes/editor/IngredientManager.tsx`
- **Phân quyền truy cập:** Author và Admin trong trình biên soạn công thức.
- **Nghiệp vụ chi tiết (`FR-RCP-009`):**
  - Ứng dụng hook `useFieldArray` của React Hook Form để quản lý danh sách mảng nguyên liệu linh hoạt:
    - Mỗi hàng nguyên liệu gồm:
      - `Name` (Tên nguyên liệu): 1-100 ký tự, bắt buộc (ví dụ: "Thịt ba chỉ", "Nước mắm").
      - `Quantity` (Số lượng): Số thực > 0 (ví dụ: `500`, `1.5`).
      - `Unit` (Đơn vị tính): Ô chọn hoặc gợi ý thông minh (gram, kg, ml, lít, muỗng canh, muỗng cà phê, quả, củ...).
      - `Notes` (Ghi chú): Tùy chọn (ví dụ: "thái lát mỏng 2mm", "ướp sẵn hành tỏi").
    - Nút "+ Thêm nguyên liệu": Bổ sung một hàng nguyên liệu mới vào danh sách.
    - Nút "Xóa" (icon thùng rác): Xóa hàng nguyên liệu tương ứng.
    - Hỗ trợ đổi thứ tự hiển thị (`OrderIndex`) giữa các nguyên liệu bằng nút di chuyển Lên/Xuống hoặc kéo thả.

#### 4. Component Quản lý Các Bước Thực hiện Động (`Dynamic Step Manager`)
- **Tập tin:** `components/recipes/editor/StepManager.tsx`
- **Phân quyền truy cập:** Author và Admin trong trình biên soạn công thức.
- **Nghiệp vụ chi tiết (`FR-RCP-010`):**
  - Quản lý mảng danh sách các bước tuần tự qua `useFieldArray`:
    - **Tự động đánh số thứ tự liên tục `StepNumber`:** Luôn hiển thị chuẩn xác (Bước 1, Bước 2, Bước 3...). Khi người dùng xóa một bước ở giữa danh sách, hệ thống tự động tính toán và re-index lại các bước còn lại từ 1 đến N mà không bị gián đoạn hay trùng lặp số thứ tự.
    - Các trường trong mỗi bước:
      - `Title` (Tiêu đề bước): Ví dụ "Sơ chế nguyên liệu", "Xào săn thịt", "Hầm nước dùng".
      - `Description` (Mô tả chi tiết): Bắt buộc, chuỗi từ 1 đến 2.000 ký tự. Có bộ đếm số ký tự trực quan.
      - `TimerMinutes` (Hẹn giờ theo phút): Tùy chọn, nhập số phút cần đun nấu/hẹn giờ cho bước này.
      - `ImageUrl` (Ảnh minh họa bước): Tích hợp chọn ảnh minh họa riêng cho từng bước nấu.
    - Nút "+ Thêm bước tiếp theo".
    - Nút di chuyển đổi thứ tự bước (Re-order) và nút Xóa bước.

#### 5. Component Quản lý Thư viện Ảnh Công thức (`Recipe Image Gallery Manager`)
- **Tập tin:** `components/recipes/editor/ImageGalleryManager.tsx`
- **Phân quyền truy cập:** Author và Admin trong trình biên soạn công thức.
- **Nghiệp vụ chi tiết (`FR-RCP-008`, `FR-JOB-002`):**
  - Tích hợp với Component Upload tệp MinIO (`FileUploadDropzone`).
  - Danh sách ảnh của công thức:
    - Hiển thị lưới các ảnh đã tải lên.
    - **Thiết lập Ảnh đại diện chính (`Set as Primary Image - FR-RCP-008`):** Ảnh đầu tiên tải lên tự động được gán cờ `IsPrimary = true`. Tác giả có thể click nút icon ngôi sao trên bất kỳ ảnh nào để chuyển quyền làm ảnh đại diện chính. Ảnh đại diện chính được đánh dấu huy hiệu nổi bật "Ảnh chính / Primary".
    - Khi xóa ảnh đại diện chính: Giao diện tự động chuyển chọn ảnh đầu tiên còn lại làm ảnh chính mới.
    - Nhập văn bản thay thế `AltText` cho từng ảnh để hỗ trợ SEO và người dùng khiếm thị.
    - **Hiển thị Trạng thái Tạo Kích thước Ảnh (`FR-JOB-002`):** Hiển thị trạng thái của các kích thước ảnh sinh bởi Hangfire background job: Ảnh gốc (`OriginalUrl`), Ảnh vừa 800x600 (`MediumUrl`), Ảnh nhỏ 300x300 (`ThumbnailUrl`). Nếu ảnh vừa upload đang chờ xử lý resize, hiển thị badge: "Đang tạo thumbnail...".

#### 6. Chức năng Xóa Công thức Nấu ăn An toàn (`Delete Recipe Action`)
- **Tập tin:** `components/recipes/editor/DeleteRecipeModal.tsx`
- **Phân quyền truy cập:** Author sở hữu bài viết hoặc Admin.
- **Nghiệp vụ chi tiết (`FR-RCP-007`):**
  - Nút "Xóa công thức" hiển thị trong trang chỉnh sửa bài viết và trên menu thao tác của Dashboard.
  - Hộp thoại cảnh báo bảo mật nguy hiểm: "Hành động này sẽ xóa hoàn toàn công thức cùng toàn bộ ảnh, nguyên liệu và các bước liên quan. Bạn có chắc chắn muốn xóa không?".
  - Yêu cầu người dùng xác nhận rõ ràng trước khi gọi `DELETE /api/v1/recipes/{id}`.
  - Khi xóa thành công: Hiển thị Toast thông báo, tự động xóa bài viết khỏi cache và điều hướng người dùng về trang danh sách `/dashboard/recipes`.

#### 7. Giao diện Chào mừng & Hướng dẫn Sau Đăng ký (`Welcome & Onboarding UI`)
- **Route:** `/auth/welcome`
- **Tập tin:** `app/(auth)/welcome/page.tsx`
- **Components:** `components/auth/WelcomeBanner.tsx`
- **Phân quyền truy cập:** User vừa đăng ký tài khoản thành công.
- **Nghiệp vụ chi tiết (`FR-JOB-001`):**
  - Tương thích với tác vụ nền `Welcome Email Job` ở backend.
  - Màn hình hiển thị thông điệp chúc mừng gia nhập cộng đồng Culinary Blog.
  - Nhắc nhở thành viên kiểm tra hộp thư điện tử Email để đọc thư chào mừng và kích hoạt tài khoản.
  - Nút điều hướng nhanh: "Khám phá công thức ngay" dẫn tới `/recipes` hoặc "Tạo công thức đầu tiên của bạn" dẫn tới `/dashboard/recipes/new`.

---

## 4. Kế hoạch Tích hợp và Hợp đồng Giao tiếp Nội bộ (Internal Contracts)

Để đảm bảo 4 thành viên làm việc song song không bị xung đột code và liên kết trơn tru:

### 4.1. Hợp đồng Xác thực và Gọi API (Giữa Ân và 3 Thành viên còn lại)
- **Ân** xây dựng và cung cấp:
  - `lib/api/axiosClient.ts`: Instance Axios đã cài đặt sẵn BaseURL (`http://localhost:5000/api/v1`), cấu hình `Authorization: Bearer <token>` và bộ tự động refresh token ngầm khi gặp 401.
  - `store/authStore.ts` & `hooks/useAuth.ts`: Các hook trả về `user`, `isAuthenticated`, `isAdmin`, `isAuthor`.
- **Linh, Tuấn, Trâm** chỉ cần import `axiosClient` từ `@/lib/api/axiosClient` và `useAuth` từ `@/hooks/useAuth` để gọi API và kiểm tra quyền hiển thị nút bấm/trang.

### 4.2. Hợp đồng Tải và Sử dụng File MinIO (Giữa Tuấn với Trâm và Ân)
- **Tuấn** xây dựng và xuất bản:
  - `components/common/FileUploadDropzone.tsx`: Nhận props `onUploadSuccess(fileUrl: string)`, `maxSizeMb`, `accept`.
  - `lib/api/fileApi.ts`: Chứa hàm `uploadFile(file: File)` và `deleteFile(fileUrl: string)`.
- **Trâm** tái sử dụng `FileUploadDropzone` trong `ImageGalleryManager.tsx` (quản lý ảnh Recipe).
- **Ân** tái sử dụng `FileUploadDropzone` trong `ProfileEditForm.tsx` (tải avatar cá nhân).

### 4.3. Hợp đồng Vòng đời Công thức (Giữa Trâm, Tuấn và Linh)
- **Trâm** phụ trách form Tạo và Sửa công thức (`/dashboard/recipes/new` & `edit`), lưu dữ liệu ở trạng thái mặc định ban đầu là `Draft`.
- **Tuấn** phụ trách bảng điều khiển `/dashboard/recipes`, cung cấp các nút thao tác nghiệp vụ:
  - Nút **Publish** (chuyển Draft sang Published) kèm điều kiện `Steps.length >= 1`.
  - Nút **Unpublish** (chuyển Published về Draft).
  - Nút **Archive** (chuyển sang trạng thái Archived).
- **Linh** phụ trách hiển thị danh sách công khai trên `/recipes` và chi tiết `/recipes/[slug]`, chỉ truy vấn và hiển thị các bài viết có trạng thái `Published`.

### 4.4. Hợp đồng Danh mục Món ăn (Giữa Linh và Trâm)
- **Linh** xây dựng API client `getCategories()` trong `lib/api/categoryApi.ts`.
- **Trâm** gọi `getCategories()` trong `RecipeForm.tsx` để hiển thị danh sách dropdown chọn danh mục khi tạo/sửa công thức.

---

## 5. Danh mục URL và Phân quyền Truy cập Toàn hệ thống

| Đường dẫn Route | Tên Trang / Giao diện | Thành viên phụ trách | Phân quyền truy cập | Mục đích & Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `/` | Trang chủ (Landing Page) | Linh | Public | Giới thiệu, banner, danh mục nổi bật, công thức mới nhất |
| `/auth/login` | Đăng nhập | Ân | Public (Khách) | Form đăng nhập email/mật khẩu & nút Google OAuth |
| `/auth/register` | Đăng ký | Ân | Public (Khách) | Form tạo tài khoản thành viên mới |
| `/auth/welcome` | Chào mừng thành viên | Trâm | User vừa đăng ký | Thông báo kích hoạt tài khoản & email chào mừng |
| `/profile` | Hồ sơ cá nhân | Ân | Author, Admin | Xem/sửa thông tin cá nhân, avatar, đổi mật khẩu |
| `/status` | Sức khỏe hệ thống | Ân | Public | Theo dõi trạng thái API, PostgreSQL, Redis, MinIO |
| `/categories` | Danh sách danh mục | Linh | Public | Khám phá toàn bộ danh mục ẩm thực |
| `/categories/[slug]` | Chi tiết danh mục | Linh | Public | Xem danh mục cụ thể kèm danh sách bài viết trực thuộc |
| `/recipes` | Khám phá công thức | Linh | Public | Danh sách công thức đã xuất bản |
| `/recipes/[slug]` | Chi tiết công thức | Linh | Public | Trang xem chi tiết công thức chuẩn SEO & Schema.org |
| `/search` | Tìm kiếm nâng cao | Tuấn | Public | Tìm kiếm FTS, lọc đa tiêu chí, sắp xếp và phân trang |
| `/dashboard` | Tổng quan Dashboard | Chung | Author, Admin | Trang thống kê tổng quan dành cho người sáng tạo nội dung |
| `/dashboard/categories`| Quản lý danh mục | Linh | **Chỉ Admin** | Thêm, sửa, xóa danh mục món ăn |
| `/dashboard/recipes` | Quản lý công thức | Tuấn | Author, Admin | Xem danh sách bài viết, Publish, Unpublish, Archive |
| `/dashboard/recipes/new`| Tạo công thức mới | Trâm | Author, Admin | Biên soạn bài viết mới, ảnh, nguyên liệu, các bước |
| `/dashboard/recipes/[id]/edit` | Sửa công thức | Trâm | **Owner**, Admin | Cập nhật nội dung bài viết, kiểm soát xung đột RowVersion |
| `/sitemap.xml` | XML Sitemap | Linh | Public / Bot | Tệp sitemap động phục vụ SEO Google |

---

## 6. Tiêu chí Nghiệm thu Giao diện Frontend (Acceptance Checklist)

Từng thành viên dựa trên checklist dưới đây để tự kiểm tra (self-check) trước khi bàn giao:

- [ ] **Ân (Authentication & Profile & Health):**
  - [ ] Đăng ký tài khoản mới thành công, bắt đúng lỗi khi trùng email hoặc sai mật khẩu.
  - [ ] Đăng nhập thành công bằng email/password và nhận JWT Access Token + Refresh Token.
  - [ ] Đăng nhập Google OAuth 2.0 hoạt động trơn tru.
  - [ ] Khi Access Token hết hạn 15 phút, hệ thống tự động refresh token ngầm mà không đăng xuất người dùng.
  - [ ] Nút Đăng xuất thu hồi token và dọn sạch session trên trình duyệt.
  - [ ] Xem và cập nhật được thông tin hồ sơ cá nhân và đổi mật khẩu thành công.
  - [ ] Trang `/status` phản ánh chính xác trạng thái Healthy/Unhealthy của các dịch vụ backend.

- [ ] **Linh (Public Pages, Categories, Detail & SEO):**
  - [ ] Trang chủ nạp đúng danh mục nổi bật và bài viết mới nhất.
  - [ ] Xem danh sách danh mục hiển thị đầy đủ ảnh, tên và số lượng công thức liên kết.
  - [ ] Trang chi tiết công thức hiển thị đầy đủ thông tin, danh sách nguyên liệu tick chọn được và bộ đếm giờ hoạt động.
  - [ ] Thẻ Meta Open Graph và thẻ `application/ld+json` Schema.org Recipe hợp lệ (kiểm tra qua Google Rich Results Test).
  - [ ] Admin tạo mới, sửa và xóa danh mục thành công; chặn xóa danh mục khi còn chứa công thức (HTTP 409).
  - [ ] Dynamic `/sitemap.xml` sinh đầy đủ danh sách liên kết bài viết công khai.

- [ ] **Tuấn (Search, MinIO Upload, Recipe State & Logging):**
  - [ ] Tìm kiếm tiếng Việt không dấu (ví dụ: `pho bo` tìm ra `Phở bò`) hoạt động chính xác với debounce.
  - [ ] Lọc kết hợp danh mục, độ khó, thời gian nấu và sắp xếp hoạt động chuẩn xác; URL phản ánh đúng query params.
  - [ ] Phân trang chuyển tiếp mượt mà, vô hiệu hóa nút Prev/Next ở đầu/cuối danh sách.
  - [ ] Kéo thả tải ảnh lên MinIO thành công, chặn file > 5MB hoặc sai định dạng ảnh; xóa file thành công.
  - [ ] Tác giả xuất bản công thức thành công khi đã có ít nhất 1 bước; chặn xuất bản nếu chưa có bước nào.
  - [ ] Nút Hủy xuất bản và Lưu trữ bài viết cập nhật trạng thái tức thì trên giao diện.
  - [ ] Mọi request gửi đi đều có header `X-Correlation-ID` phục vụ tracing.

- [ ] **Trâm (Recipe Authoring, Children Entities & Onboarding):**
  - [ ] Tạo mới công thức lưu thành công ở trạng thái bản nháp (`Draft`).
  - [ ] Thêm, sửa, xóa hàng nguyên liệu động hoạt động trơn tru; validate không cho để trống tên hoặc số lượng <= 0.
  - [ ] Thêm, sửa, xóa các bước thực hiện tự động đánh lại số thứ tự `StepNumber` liên tục từ 1..N mà không bị gián đoạn.
  - [ ] Tải nhiều ảnh công thức, chọn được ảnh đại diện chính (`Primary`), xóa ảnh chính tự động gán ảnh kế tiếp.
  - [ ] Hiển thị trạng thái ảnh resize Hangfire (Original, Medium, Thumbnail).
  - [ ] Cập nhật công thức bắt đúng lỗi xung đột phiên bản (`409 Conflict`) khi `RowVersion` không khớp.
  - [ ] Xóa công thức hiển thị modal cảnh báo an toàn và thực thi thành công.
  - [ ] Trang chào mừng hiển thị thân thiện sau khi hoàn tất đăng ký.
