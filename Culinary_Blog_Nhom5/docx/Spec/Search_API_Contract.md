# Contract tìm kiếm công thức — FR-SRCH-001

Ngày chuẩn hóa: 01/11/2026. Áp dụng `GET /api/v1/recipes/search` public và UI `/search`.

## Dữ liệu và thứ tự

- Chỉ Published, không soft-delete; title/description/tên nguyên liệu active được index với trọng số A/B/C. Hỗ trợ không dấu và đ/Đ. Các từ khóa kết hợp AND, hỗ trợ prefix.
- Mặc định relevance giảm dần. Sort tường minh theo `createdAt`, `title`, `cookTime` hỗ trợ asc/desc; `relevance` luôn desc. Ngày/ID làm khóa phụ ổn định. Đây là ngoại lệ so với mặc định createdAt desc của listing `/recipes`.
- Cặp `sortBy`/`sortOrder` thắng `sort` legacy khi ít nhất một trường chuẩn không trắng. `sort=-createdAt`, `sort=title` còn tương thích; field lạ trả 422 trừ alias đã bị tham số chuẩn ghi đè.
- `categoryId` UUID, `difficulty` enum 1–4, `minCookTime`/`maxCookTime` số phút không âm; `servings` lọc bằng chính xác. Range servings mở rộng giữ tương thích, min/max dương và min <= max. Alias servings chỉ được cùng xuất hiện khi các giá trị range tương ứng bằng alias.
- `page` >= 1, `pageSize` mặc định 12, khoảng 1–50, không vượt offset int32. Trang vượt tổng trang trả 200 rỗng, không tự đổi page. `hasPreviousPage` phản ánh page > 1, kể cả khi vượt tổng trang.

## Keyword, lỗi và response

- q thiếu/rỗng/trắng: 200 rỗng; không trở thành listing. q chỉ dấu câu sau normalize: 200 rỗng. q sau trim 1 ký tự hoặc raw length >100: 422.
- Không tìm thấy: 200 rỗng với totalCount/totalPages bằng 0. Sai kiểu HTTP (UUID, int...) trả 400; sai ngữ nghĩa đã bind được trả 422 Problem Details. Rate limit public read 100/phút/IP (hoặc user ID nếu đã xác thực).
- Thành công đúng một tầng `{ "data": [...], "meta": { "page": 1, "pageSize": 12, "totalCount": 0, "totalPages": 0, "hasNextPage": false, "hasPreviousPage": false } }`.
- Cache Application TTL 3 phút, key bao gồm toàn bộ trạng thái truy vấn; recipe/category version invalidation. Request cùng key/version chia sẻ lần tải trong một tiến trình; các key khác không khóa lẫn nhau, khóa rảnh được gỡ ngay. Redis lỗi fallback DB. HTTP và Next fetch dùng no-store. Cơ chế này không phải distributed lock giữa nhiều instance.

## UI và URL

- Giữ `app/search/page.tsx`, RecipeCard và PaginationControl chung; không tạo route `/search` thứ hai dưới route group.
- URL giữ keyword, filter, sort, page/pageSize; đổi q/filter/sort đưa page về 1. Alias cũ được đọc và chuẩn hóa ở liên kết phân trang.
- q debounce 400 ms; Enter hủy timer, composition tiếng Việt không tự gửi giữa chừng. Filter áp dụng bằng nút submit.
- Link không hợp lệ hiển thị lỗi kiểm tra đầu vào và không gọi search với điều kiện đã âm thầm bỏ bớt. Form kiểm tra khoảng min/max trước điều hướng. Empty, loading, API error/retry và lỗi danh mục có trạng thái riêng.

## Kiểm chứng

Tại `Culinary_Blog_Nhom5`:

```powershell
# SEARCH_TEST_CONNECTION cung cấp qua môi trường; dùng server PostgreSQL dành cho test.
dotnet test tests/CulinaryBlog.Search.Tests/CulinaryBlog.Search.Tests.csproj
```

Tại `culinary-blog-web`:

```powershell
npm ci
npm run test:search
npm run test:api
npm run test:common
npm run test:e2e:states
npm run test:e2e:search
npm run typecheck
npm run lint
npm run build
```

`test:e2e:search` yêu cầu .NET 10, PostgreSQL và browser Playwright. Script tự khởi động test host dùng endpoint/CQRS/repository/migration thật, frontend build production dùng trang search thật và layout tối giản. Host tạo `culinary_search_test_<guid>` riêng, seed dữ liệu; runner đóng stdin trong finally để host xóa database. Không sửa Program.cs production, không dùng tài khoản production. Cache test host là distributed-memory; outage cache có unit test riêng, không thay cho nghiệm thu Redis thực tế.

Tài liệu `docx/Linh/Phan_Cong_Cac_Cong_Viec_Blog_App.md` trong ảnh Issue chưa có trong checkout; tham chiếu phân công chính là `Bang_Phan_Cong_Va_Mo_Ta_Chi_Tiet_Cong_Viec.md`. Báo cáo triển khai ghi riêng kết quả và giới hạn kiểm chứng, không đánh dấu NFR chỉ từ fixture nhỏ.

## Đo tải local tùy chọn

Tại `Culinary_Blog_Nhom5`, sau khi thiết lập `SEARCH_TEST_CONNECTION`:

```powershell
$env:SEARCH_E2E_BENCHMARK = 'warm' # hoặc 'cold'
dotnet run --no-launch-profile --project tests/CulinaryBlog.Search.E2E
Remove-Item Env:SEARCH_E2E_BENCHMARK
```

Mỗi lượt tạo 5.000 recipes riêng và gửi 100 HTTP requests đồng thời qua endpoint thật. Host làm nóng HTTP trước, chờ 61 giây để cửa sổ rate limit thật reset, rồi đo; cold xoay version cache ngay trước đo. JSON `SEARCH_BENCHMARK` ghi p50/p95/p99, status, CPU/memory/OS. Cache là distributed-memory, PostgreSQL local; kết quả là smoke benchmark, không chứng nhận Redis/network/deployment production. Không đặt biến benchmark khi chạy E2E UI.
