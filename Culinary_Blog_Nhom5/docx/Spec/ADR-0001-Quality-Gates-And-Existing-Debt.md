# ADR-0001 — Quality gates và nợ hiện hữu

Status: Proposed for owner review (#89). Ngày 06/11/2026.

## Bối cảnh

SRS mục 4.5 yêu cầu static analysis, unit coverage Application >=80%, happy/error cho mọi endpoint, năm critical E2E và dependency rules. Không được suy diễn có thư mục test hoặc issue đã đóng thành bằng chứng từng requirement đã đạt.

## Quyết định triển khai

- `quality/requirements-catalog.json` cố định 64 mã FR/NFR trích từ PDF và `FR-JOB-004` bổ sung từ bảng phân công. SHA-256 nguồn làm gate yêu cầu re-extract/review khi tài liệu thay đổi.
- JSON traceability là nguồn, Markdown sinh tự động. Status Verified đòi code/test/evidence, reviewer và commit; trạng thái thiếu evidence được giữ rõ. `--acceptance` thất bại nếu chưa đủ, trong khi gate inventory chặn bỏ sót requirement/endpoint mới.
- Architecture tests kiểm tra project graph và assembly references; Roslyn phát hiện các lời gọi persistence mutation trong Query Handle và helper cùng class. Không phải chứng minh thuần túy mọi side effect động hoặc reflection; những thay đổi contract vẫn cần reviewer.
- Sonar safety rules + .NET analyzers + EditorConfig; warning trong CI là error. Các style/Sonar rule còn lại là suggestion để không tạo commit format toàn dự án. Đây là baseline an toàn ban đầu, chưa phải toàn bộ ruleset đã được chuẩn hóa.
- ESLint Next.js/TypeScript được giữ thay Airbnb vì ruleset framework đang hoạt động. Prettier chặn file mới/thay đổi chưa format; file cũ chưa format được baseline bằng content hash, không bị tự format hàng loạt. Muốn chuẩn hóa toàn bộ phải giảm dần baseline qua PR riêng.
- Coverage gộp theo `(source file,line)` bằng OR của hit; không trung bình phần trăm, không loại file Application để làm đẹp số liệu, báo cáo rỗng phải fail. Ngưỡng tối thiểu 80 và không thấp hơn baseline đã review. Báo cáo unit riêng không được thay bằng số gộp integration.
- Báo cáo artifact có retention 14 ngày. Evidence nghiệm thu dài hạn cần lưu summary đã lọc vào tài liệu, không dùng artifact hết hạn làm bằng chứng duy nhất.

## Nợ/điểm chưa được chấp thuận thay SRS

1. Domain có `ApplicationUser : IdentityUser` và `Recipe.SearchVector : NpgsqlTsVector`. Package allowlist hiện hữu gồm Identity.Stores/Npgsql; architecture tests chặn thêm package hoặc reference layer khác, nhưng **không** tuyên bố đã đáp ứng Domain không framework/package theo SRS. Ân cần review phương án domain user thuần và EF shadow search vector trước refactor dữ liệu/API.
2. Unit coverage đo riêng đạt 1221/1444 dòng (84,556787%) ở Release với 55 unit tests ngày 06/11/2026; baseline CI 84,55%. Coverage combined chỉ là góc nhìn bổ sung, không được hạ threshold để pass.
3. Mỗi owner phải map symbol happy/error thực sự cho endpoint và cung cấp evidence của requirement mình sở hữu. Candidate directory không đủ để Verified. `--acceptance` vẫn fail đến khi hoàn tất.
4. Các flow auth/editor dùng mocked API hiện hữu được ghi là contract/UI test. Năm flow mới chạy bằng Playwright API với JWT/handler/PostgreSQL thật, không route mock; báo cáo phân biệt API E2E và UI E2E. Nếu nghiệm thu yêu cầu cả năm đi qua UI production thì còn cần phối hợp bổ sung, không gọi API E2E là browser UI evidence.
5. Branch protection requiring >=1 approval và required checks là cấu hình GitHub của quản trị viên; PR template không thay thế được server-side protection. Không thay rule repository nếu chưa có quyền/chấp thuận phù hợp.

## Đóng #89

Chỉ dùng closing keyword khi unit coverage, endpoint coverage, fullstack critical E2E, evidence owner và cấu hình review bắt buộc được kiểm chứng; không tự đóng dựa vào gate inventory xanh.
