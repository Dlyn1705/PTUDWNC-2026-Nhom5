# FR-RCP-010 — Báo cáo triển khai quản lý các bước thực hiện

Ngày: 18/10/2026.

## Phạm vi và nhánh

- Thực hiện [Plan_FR-RCP-010-Step-Management.md](Plan_FR-RCP-010-Step-Management.md) theo đặc tả chính.
- Nhánh riêng: `2312778-phanthibaotram-quanlybuocthuchien`, từ main và đã đồng bộ main mới nhất tại `7e5a78f` (PR #42 xử lý ảnh).
- Không đưa code FR-RCP-007 vào nhánh này; PR #49/nhánh xóa công thức được giữ nguyên. Một vài điểm dùng chung như key của editor và chính sách no-store có cùng mục tiêu tích hợp; cần giữ cả hai khi review các PR.
- Bàn giao trên nhánh `2312778-phanthibaotram-quanlybuocthuchien` bằng commit Conventional Commits và PR vào main theo README/CONTRIBUTING; không tự merge.

## Chức năng đã hoàn thiện

### Backend

- Thêm Application feature Steps và `IRecipeStepStore`; xác thực phiên/role/owner ở Application, kiểm tra lại dưới khóa ở persistence. Không dựa riêng vào nút ẩn ở frontend.
- API quản lý: GET collection, GET item, POST thêm, PUT nội dung, DELETE và PUT reorder. Tất cả thuộc `/api/v1/recipes/{recipeId}/steps`, yêu cầu AuthorPolicy và dùng các policy rate limit recipe-read/recipe-write hiện có.
- API GET quản lý trả strong ETag của Recipe và no-store. Các mutation bắt buộc If-Match và trả ETag mới, bao gồm DELETE 204. POST Location trỏ GET item thực sự tồn tại. CORS đã expose ETag, không sửa policy chung.
- Title trim, tối đa 200; trắng/null được đặt `Bước n`. Description trim, bắt buộc, tối đa 2.000; timer null/0/int dương hợp lệ; URL ảnh null hoặc HTTP/HTTPS tối đa 500 và không chứa user/password. Tối đa 100 bước active.
- DTO quản lý dùng stepNumber/description. Public DTO giữ order/text; repository/mapping tiếp tục trả steps active theo StepNumber.
- API step write không cho điều khiển StepNumber/RecipeId/IsDeleted; parser cục bộ từ chối trường không hỗ trợ, trường lặp, timer phân số/overflow bằng 422. Không đổi JSON parser toàn hệ thống. JSON sai cú pháp hoặc kiểu không bind được ở request typed khác vẫn có thể trả 400 ở tầng HTTP, không phải lỗi nghiệp vụ 422.
- Nested create dùng cùng rules, nhận thêm imageUrl và ghi toàn aggregate; lỗi một bước không lưu Recipe. Draft không có bước hợp lệ. Instructions legacy không bị ghi đè khi CRUD/reorder; form tạo mới dùng Steps thay vì nhân đôi nội dung vào Instructions.
- StepStore khóa hàng Recipe, đọc version/trạng thái/steps mới nhất rồi mutation trong transaction. Mỗi execution-strategy attempt có scope/context riêng; replay nhận biết version đã lưu của chính attempt khi commit thành công nhưng ACK bị mất.
- Xóa riêng một bước là soft-delete. Delete renumber phần còn lại; reorder chỉ nhận đúng tập ID active và giữ Title đã lưu. Ghi số tạm vào vùng dương không trùng hiện hành, sau đó 1..N trong cùng transaction; kiểm tra overflow và không trông chờ thứ tự UPDATE của EF.
- Publish được chuyển sang Application/StepStore cùng khóa Recipe với Delete step. Domain Publish bỏ qua child IsDeleted ngay cả khi vẫn nằm trong tracker. Published còn một bước không xóa được; Draft/Archived cho phép xóa bước cuối. Publish vẫn idempotent và giữ metric khi thực sự chuyển trạng thái.
- Sau commit gọi IRecipeCacheInvalidator theo ID/slug/version contract có sẵn, không để HTTP cancellation ngắt invalidation sau khi DB đã ghi. HTML chứa công thức dùng private/no-store, tránh CDN/browser trả bước cũ; không đưa framework cache mới vào phạm vi này.

### Frontend

- `StepManager` dùng React Hook Form/useFieldArray và Zod; có tiêu đề, mô tả kèm bộ đếm, timer nullable, URL ảnh/preview, thêm/xóa/Lên/Xuống và trạng thái đang lưu/lỗi/thành công.
- Tạo mới: hàng local không gọi child API khi chưa có RecipeId, cho xóa hết và gửi nested steps một lần khi lưu Draft. Khóa bằng ref chống hai lần submit tạo Recipe. Sau tạo thành công, manager chuyển sang persisted và đọc các bước server để tiếp tục sửa.
- Editor đã lưu: CRUD/reorder qua stepApi, dùng ETag mới; khóa ref chống gửi lặp. Reorder yêu cầu lưu mọi hàng dirty/hàng mới trước để không đổi nhầm nội dung theo index.
- 409 giữ nội dung đang nhập, yêu cầu tải bản mới có xác nhận nếu bỏ draft. Lỗi mạng/5xx chưa rõ đã commit hay chưa sẽ khóa ghi cho tới khi đọc lại, tránh POST trùng khi mất response.
- Callback cập nhật version của form cơ bản nhưng chỉ khi snapshot nội dung nền chưa đổi. Form cơ bản đang nhập được giữ nguyên; mutation ảnh/nguyên liệu làm version cũ bị từ chối hoặc yêu cầu reload.
- Ba manager có key riêng, tránh lỗi React nhân đôi child khi render lại. Published một bước có hướng dẫn Unpublish và khóa nút xóa; server vẫn chặn 422.
- Ảnh bước dùng URL, có preview và thông báo khi nguồn ảnh không truy cập được/CSP chặn. Có thể dùng URL ảnh đã tải qua gallery; không xây upload/storage riêng cho step, không tự xóa object ảnh dùng chung khi xóa step và không nới CSP wildcard.

## Migration và dữ liệu

Migration mới: `20261017171627_EnforceActiveRecipeStepOrder`.

1. Khóa ghi ngắn hạn trên Recipes/RecipeSteps trong transaction migration.
2. Đánh lại StepNumber active theo `(StepNumber, CreatedAt, Id)` thành 1..N, giữ nguyên ID, Title, Description và dữ liệu ảnh/timer.
3. Quay vòng RowVersion của các step thay số và Recipe chưa xóa bị ảnh hưởng, khiến editor cũ nhận conflict; không đổi UpdatedAt của Recipe đã xóa vì đang dùng làm thời điểm retention.
4. Thay index thường bằng unique index `(RecipeId, StepNumber) WHERE IsDeleted=false`. Các step đã xóa giữ nguyên số cũ và không cản tái sử dụng vị trí.

Configuration, Designer và ModelSnapshot được tạo lại từ main mới có RecipeImageWork, không làm mất metadata durable image processing. Down migration chỉ gỡ unique/filter và tạo lại index thường; không khôi phục thứ tự legacy trước chuẩn hóa. Backup/đối chiếu dữ liệu trước khi áp dụng lên môi trường thật.

Đã chạy migration thật trên database thử nghiệm, gồm nâng cấp từ schema trước migration step có số âm/trùng/hổng và hàng soft-delete. Chưa áp dụng migration vào database ứng dụng của người dùng. API Development chạy migration khi khởi động theo cấu hình hiện có; môi trường khác cần áp dụng migration bằng quy trình triển khai của dự án trước khi dùng API Steps.

## Kết quả kiểm thử

| Kiểm tra | Kết quả |
|---|---|
| Steps backend | 25 test: validation/domain, quyền, CRUD, soft-delete, nullable, alias public, If-Match, foreign ID, reorder, version ảnh/nguyên liệu, limit 100, migration, rollback, retry commit ACK và race Publish/Delete/Recipe delete |
| Step form frontend | 14 test: title/description boundary, timer 0/null/int max và giá trị sai, URL an toàn, không gửi StepNumber, Draft rỗng |
| Nguyên liệu regression | 21 test đạt, chạy lại sau ghép main |
| API/observability regression | 44 test đạt |
| Backend security | 10 test đạt |
| Frontend security/cache | 24 test đạt, gồm 7 URL chứa công thức không cache HTML cũ |
| Frontend logging | 9 test đạt |
| Build solution | Thành công, 0 warning/error |
| Frontend lint/typecheck/production build | Thành công |
| Chrome E2E | Thành công trên Next.js production |

Tổng **147 unit/integration/API test**, cộng runner Chrome. Các tập test backend tạo database `fr_rcp010_test_<guid>` hoặc database riêng của bộ test nguyên liệu rồi tự dọn, không sửa database ứng dụng.

Browser test dùng session mã hóa với secret ngẫu nhiên chỉ cho server test và HTTP recipe API fixture tại browser; không có bypass production. Backend API dùng TestServer với test authentication handler và PostgreSQL thật. Đây là hai lớp kiểm thử riêng, không tuyên bố browser đang nối trực tiếp vào DB hoặc đã thử Google OAuth.

Chrome đã kiểm tra: local add/remove/reorder, validation, nested create title/timer, chuyển sang persisted sau lưu Draft, CRUD/reorder đã lưu, timer 0, hai click chỉ một write, giữ form cơ bản chưa lưu, giữ draft khi 409 và reload, chặn xóa bước cuối Published. Không có JavaScript pageerror. Ảnh QA tại `culinary-blog-web/build/steps-e2e/published-step-manager.png` (ignored).

Không chạy riêng test browser JSON-LD hay upload file ảnh bước; public alias/mapping được API test kiểm tra và HTML no-store được test. Storage/resize không bị viết lại bởi FR-RCP-010.

## Chạy lại

Từ thư mục gốc, cấu hình connection test có quyền tạo database riêng, không commit giá trị bí mật:

```powershell
$env:STEPS_TEST_CONNECTION = '<PostgreSQL connection test có CREATE DATABASE>'
dotnet test .\Culinary_Blog_Nhom5\tests\CulinaryBlog.Steps.Tests\CulinaryBlog.Steps.Tests.csproj
dotnet build .\Culinary_Blog_Nhom5\Culinary_Blog_Nhom5.sln

Set-Location .\Culinary_Blog_Nhom5\culinary-blog-web
node --test tests/step-form.unit.cjs
npm run test:security
npm run test:logging
npm run lint
npm run typecheck
npm run build
node tests/steps.e2e.cjs
```

- Project Steps.Tests chạy bằng lệnh riêng, chưa sửa solution/CI dùng chung để giảm va chạm; cần thêm vào CI khi bàn giao PR nếu nhóm muốn chạy suite này tự động.
- E2E mặc định dùng Chrome cài trên máy; CI có thể cài Playwright Chromium và đặt E2E_BROWSER_CHANNEL=bundled. Runner tự dừng server/browser do nó tạo, không dừng dịch vụ người dùng.
- Build Next dùng Google Fonts theo cấu hình có sẵn; cần kết nối mạng để tải font. Không đổi dependency hoặc khóa phiên bản chỉ để làm test chạy.

## Tích hợp và bàn giao

- Main `7e5a78f` đã được ghép bằng fast-forward; khôi phục working tree không có conflict. Migration metadata được tái tạo sau khi ghép, test Steps/nguyên liệu và frontend đã kiểm tra lại.
- File mới tập trung ở Steps feature/store/endpoints/client/component/test project. Điểm tích hợp dùng chung chỉ gồm create/publish, route registration/DI, editor, schema snapshot và spec. Không format toàn repo hoặc sửa migration đã áp dụng.
- PR #43 tạo công thức và #45 cập nhật công thức còn có thể overlap RecipeEndpoints/editor. Khi ghép phải giữ StepRules cho nested create, ImageUrl và StepManager/callback cùng logic validation/ownership/version của các PR đó; không lấy nguyên file ours/theirs.
- Chính sách no-store có cùng mục tiêu với FR-RCP-007; giữ khi ghép để không hiển thị HTML cũ. Cache CDN đã tồn tại từ bản deploy cũ cần purge khi phát hành, no-store chỉ điều khiển response mới.
- Không bảo đảm tránh được mọi conflict với commit tương lai. Trước commit/push phải fetch main, xem lại diff và chạy kiểm tra phù hợp nếu có thay đổi mới.
