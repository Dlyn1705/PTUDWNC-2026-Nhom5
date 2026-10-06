# Kế hoạch hoàn thiện FR-SRCH-002/003/004

**Phạm vi:** Lọc, sắp xếp và phân trang kết quả tìm kiếm công thức tại `/search`.
**Căn cứ:** `Culinary_Blog_Spec.md` (mục 4, 6, 7.3) và các mô tả liên quan trong `FR-SRCH-001_Spec.md`, `Frontend_Spec.md`.

## 1. Mục tiêu

Hoàn thiện một luồng thống nhất từ URL đến API và giao diện: người dùng kết hợp nhiều tiêu chí lọc, đổi thứ tự kết quả, chuyển trang, tải lại hoặc chia sẻ URL mà vẫn nhận đúng trạng thái. Backend áp dụng lọc trước khi đếm và phân trang, chỉ trả công thức đã công khai, và luôn sắp xếp ổn định.

## 2. Yêu cầu theo chức năng

### FR-SRCH-002 — Lọc đa tiêu chí

- Hỗ trợ lọc theo danh mục, độ khó, thời gian nấu và khẩu phần. Các điều kiện được kết hợp bằng `AND`.
- Giá trị thời gian/khẩu phần được truyền thành khoảng min/max để hỗ trợ các lựa chọn giao diện (ví dụ thời gian dưới 15, 15–30, 30–60, trên 60 phút; khẩu phần 1–2, 3–4, từ 5 người). Quy tắc biên phải nhất quán, không để giá trị ở hai nhóm.
- Không có bộ lọc nghĩa là không giới hạn theo thuộc tính đó. Kết quả công khai vẫn chỉ gồm recipe `Published`, chưa xóa mềm.
- Khi đổi bất kỳ bộ lọc nào, quay về trang 1 và giữ từ khóa cùng tiêu chí sắp xếp.
- Có thao tác đặt lại bộ lọc; thao tác này xóa các filter khỏi URL, đặt trang về 1 và giữ từ khóa/sort.

### FR-SRCH-003 — Sắp xếp

- API chuẩn dùng `sortBy` và `sortOrder`; cho phép `createdAt`, `title`, `cookTime`, với `createdAt`/`desc` là mặc định.
- Giao diện tìm kiếm cần có thêm lựa chọn `relevance` mặc định khi có từ khóa, sau đó là mới nhất, cũ nhất, nấu nhanh nhất, nấu lâu nhất, tiêu đề A–Z. Đây là chế độ riêng của endpoint tìm kiếm; `relevance` sắp theo `ts_rank` giảm dần.
- Hỗ trợ tương thích ngược tham số cũ `sort` (`-createdAt`, `createdAt`, `cookTime`, `-cookTime`, `title`, `relevance`) trong giai đoạn chuyển đổi. Tham số chuẩn mới có ưu tiên nếu cả hai dạng cùng được gửi.
- Thêm khóa phụ ổn định (`CreatedAt` rồi `Id`, theo hướng phù hợp) để các trang không trùng/lọt bản ghi khi nhiều recipe có cùng giá trị sắp xếp. Với relevance, dùng rank giảm dần rồi `CreatedAt`/`Id` giảm dần.
- Khi đổi sort, trang trở về 1 và các filter/từ khóa được giữ lại.

### FR-SRCH-004 — Phân trang

- Offset pagination với `page >= 1`, `pageSize` mặc định 12, giới hạn tối đa 50.
- Tổng số lượng và tổng trang phải được tính sau khi áp dụng tìm kiếm và toàn bộ filter, trước `Skip/Take`.
- Response dùng `PagedResult<T>` và API response wrapper hiện có: `data.items`, `data.page`, `data.pageSize`, `data.totalCount`, `data.totalPages`, `data.hasNextPage`, `data.hasPreviousPage`.
- UI có trang trước/sau, các số trang và dấu lược khi cần; vô hiệu hóa điều khiển ở biên. Không hiện điều khiển khi không có trang để chuyển.
- Chuyển trang giữ nguyên mọi tham số truy vấn. Trang vượt quá `totalPages` phải được xử lý nhất quán (khuyến nghị trả kết quả rỗng kèm metadata trang được yêu cầu; UI cung cấp đường quay về trang hợp lệ, không âm thầm hiển thị dữ liệu trang khác).
- Sau khi chuyển trang, đưa vùng kết quả về đầu viewport một cách dễ truy cập; bảo đảm điều hướng bằng bàn phím và trạng thái trang hiện tại có thể nhận biết bằng screen reader.

## 3. Contract URL và API đề xuất

Ví dụ URL chia sẻ:

```text
/search?q=bo+kho&categoryId=<guid>&difficulty=2&minCookTime=15&maxCookTime=30&minServings=3&maxServings=4&sortBy=cookTime&sortOrder=asc&page=2&pageSize=12
```

| Tham số | Quy tắc |
|---|---|
| `q` | Từ khóa hiện tại; giữ nguyên hành vi FR-SRCH-001 (tối thiểu 2 ký tự khi gọi tìm kiếm). |
| `categoryId` | GUID danh mục tùy chọn. |
| `difficulty` | Enum hợp lệ theo backend; từ chối giá trị ngoài miền bằng lỗi validation rõ ràng. |
| `minCookTime`, `maxCookTime` | Số nguyên phút không âm; cho phép từng đầu khoảng độc lập. |
| `minServings`, `maxServings` | Số nguyên dương; cho phép từng đầu khoảng độc lập. |
| `sortBy`, `sortOrder` | Giá trị allowlist; không nội suy chuỗi người dùng vào SQL. |
| `page`, `pageSize` | Mặc định 1/12; `pageSize` tối đa 50. |

`GET /api/v1/recipes/search` tiếp tục trả `ApiResponse<PagedResult<SearchRecipeSummaryDto>>`. Cần thống nhất camelCase JSON casing và cập nhật TypeScript types theo đúng DTO thực tế. Tham số legacy `sort` chỉ là cầu nối tương thích, không dùng để tạo URL mới.

## 4. Hiện trạng và khoảng thiếu

| Lớp | Đã có | Cần hoàn thiện |
|---|---|---|
| Frontend `/search` | Server Component đọc `q`, `page`, `categoryId`, `difficulty`, `sort`; gọi API và có form, kết quả, empty/error state, nút trước/sau. | Chưa có filter thời gian/khẩu phần; chưa có reset; chưa có số trang/dấu lược; sort còn dùng dạng legacy và thiếu chiều title Z–A; mọi filter/sort chưa có UX cập nhật độc lập; trang vượt tổng trang chưa chuẩn hóa. |
| API recipe search | Đã dùng `SearchRecipesQuery`, wrapper `ApiResponse<PagedResult<...>>`; có `page`, `pageSize`, `categoryId`, `difficulty`, `sort`; validation từ khóa, trang, page size và allowlist sort. | Query/endpoint chưa nhận khoảng thời gian/khẩu phần hoặc `sortBy`/`sortOrder`; chuẩn hóa page size phải nhất quán; bổ sung validation cho khoảng và enum. |
| Application/repository | Search chỉ Published, lọc category/difficulty, đếm, sort, Skip/Take và trả điểm relevance. | Truyền filter mới xuyên suốt; tính count sau filter; sort hai chiều theo contract mới; thứ tự ổn định; bảo vệ offset khỏi tràn số. |
| Shared types/API client | Có `ApiResponse`, `PagedResult` và `recipeApi.search`. | Khai báo đầy đủ params/meta, bỏ kiểu `sort: string` tùy ý, chuẩn hóa response camelCase và API contract. |
| Đặc tả | Master spec quy định AND, bốn nhóm filter, `sortBy`/`sortOrder`, page size 12/50 và metadata chuẩn. | Một số tài liệu frontend cũ dùng `sort` và cách gọi filter không hoàn toàn đồng nhất. Kế hoạch này ưu tiên contract chuẩn của master spec, giữ `sort` chỉ để tương thích. |

Lưu ý: endpoint `/recipes` và `/recipes/search` hiện không hoàn toàn chung contract. Phạm vi này ưu tiên `/recipes/search` vì ba FR nằm trong luồng tìm kiếm; chỉ mở rộng danh sách công khai `/recipes` nếu cần dùng chung UI/API, tránh vô tình đổi endpoint quản lý `/mine`.

## 5. Kế hoạch triển khai

### Giai đoạn 1 — Chốt contract và validation

1. Cập nhật query DTO/record để nhận `MinCookTime`, `MaxCookTime`, `MinServings`, `MaxServings`, `SortBy`, `SortOrder`; giữ `Sort` legacy trong thời gian chuyển đổi.
2. Quy định precedence và chuyển legacy sort sang cặp chuẩn; `relevance` chỉ hợp lệ cho search.
3. Validate giá trị min/max, min không lớn hơn max, enum độ khó, allowlist sort, `page >= 1`; chuẩn hóa `pageSize` về mặc định 12 và tối đa 50 theo một chính sách thống nhất.
4. Cập nhật tài liệu/OpenAPI summary, ví dụ request và response để mô tả đúng contract.

### Giai đoạn 2 — Backend query pipeline

1. Truyền các điều kiện mới từ endpoint → Application query/handler → `IRecipeRepository.SearchRecipesAsync` → EF Core repository.
2. Thực hiện điều kiện Published/not deleted, FTS, category, difficulty, cook-time range và servings range trong cùng `IQueryable`.
3. Chạy `CountAsync` sau tất cả điều kiện; áp dụng allowlisted ordering với tie-breaker; sau đó mới `Skip/Take`.
4. Bảo đảm `totalPages`, `HasNextPage`, `HasPreviousPage` phản ánh metadata thật; giới hạn/phòng overflow khi tính offset.
5. Kiểm tra query vẫn được EF Core dịch sang SQL và không tải toàn bộ tập kết quả về memory để lọc/sắp xếp.

### Giai đoạn 3 — Frontend URL-state và điều khiển

1. Tạo kiểu SearchParams dùng chung cho parser URL, `recipeApi.search` và query key; chuẩn hóa giá trị mặc định và loại bỏ tham số rỗng.
2. Bổ sung lựa chọn thời gian/khẩu phần và nút đặt lại; giữ category/difficulty hiện hữu.
3. Chuyển dropdown sang `sortBy`/`sortOrder`; hiển thị các lựa chọn relevance, mới/cũ, nhanh/lâu, A–Z. Mọi submit filter/sort đặt `page=1`.
4. Sinh URL trang bằng cách giữ tất cả params hiện tại và chỉ thay `page`; sinh dãy số trang có dấu lược, bao gồm trang đầu/cuối và lân cận trang hiện tại.
5. Thêm trạng thái trang hiện tại, disable previous/next đúng biên, xử lý trang vượt phạm vi và cuộn đến tiêu đề kết quả với focus/ARIA phù hợp.
6. Giữ giao diện initial state, loading/error/empty hiện tại; không làm mất từ khóa hoặc filter khi người dùng điều hướng hay tải lại.

### Giai đoạn 4 — Tích hợp, kiểm thử chấp nhận và hoàn tất

1. Kiểm thử backend: từng filter riêng, phối hợp AND, biên min/max, filter không có kết quả, sort asc/desc, relevance, tie-breaker, count và trang đầu/cuối.
2. Kiểm thử API: giá trị mặc định/giới hạn, query hợp lệ, query sai, legacy `sort`, `sortBy` ưu tiên, JSON metadata.
3. Kiểm thử frontend: URL được giữ sau refresh/chia sẻ, filter/sort reset page, pagination giữ nguyên query, reset filter, mobile/keyboard/ARIA, loading/error/empty.
4. Chạy build/lint/test liên quan theo scripts của repository; cập nhật tài liệu triển khai và ghi nhận các giới hạn nếu một lớp vẫn chưa hoàn thành.

## 6. Tiêu chí nghiệm thu

- Có thể kết hợp category, difficulty, cook-time và servings; chỉ kết quả thỏa tất cả điều kiện được trả về.
- Filter được áp dụng trước count/pagination; không trả Draft, Archived hoặc recipe đã xóa trong public search.
- Sort chuẩn hóa cho kết quả đúng chiều, relevance mặc định khi không truyền sort, và thứ tự ổn định giữa các trang.
- `pageSize` mặc định 12, tối đa 50; metadata chính xác khi có kết quả, không có kết quả, trang đầu/cuối.
- Thay đổi filter/sort đưa trang về 1; chuyển trang giữ nguyên `q`, filter và sort; URL có thể reload/chia sẻ để tái tạo trạng thái.
- Form reset chỉ xóa filter; các điều khiển phân trang hỗ trợ bàn phím, screen reader và disabled state đúng.
- Request filter/sort/page không hợp lệ trả lỗi có cấu trúc, thông điệp rõ ràng; không gây lỗi SQL hay trả lỗi server không kiểm soát.

## 7. Thứ tự ưu tiên

1. **P0:** Contract backend + filter query + sort chuẩn + metadata pagination đúng.
2. **P1:** Filter UI đủ bốn tiêu chí, đồng bộ URL, reset page khi đổi điều kiện.
3. **P1:** Pagination số trang/dấu lược và giữ query state.
4. **P2:** Tối ưu chỉ mục theo workload thực tế và cache search theo toàn bộ query string/params; bảo đảm cache key không bỏ sót filter/sort/page.
