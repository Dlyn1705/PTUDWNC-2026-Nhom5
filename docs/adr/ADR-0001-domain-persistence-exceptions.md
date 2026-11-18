# ADR-0001: Ngoại lệ phụ thuộc persistence trong Domain

- Trạng thái: Chấp nhận có phạm vi
- Ngày quyết định: 2026-11-15
- Phạm vi: HT-06

## Bối cảnh

Đặc tả ban đầu yêu cầu Domain chỉ phụ thuộc .NET BCL. Mô hình hiện hữu lại có hai ràng buộc đã đi vào schema và migration: `ApplicationUser` kế thừa ASP.NET Core Identity, và `Recipe.SearchVector` dùng `NpgsqlTsVector` cho full-text search PostgreSQL. Tách ngay hai mô hình này cần đổi mapping, quan hệ, repository, auth/search và kiểm tra tương thích migration trên dữ liệu thật.

## Quyết định

Chấp nhận tạm thời đúng hai ngoại lệ sau:

1. `Microsoft.Extensions.Identity.Stores` chỉ được sử dụng bởi `Domain/Entities/ApplicationUser.cs`.
2. `Npgsql`/`NpgsqlTypes` chỉ được sử dụng bởi `Domain/Entities/Recipe.cs` cho `SearchVector`.

Không được thêm package hạ tầng khác vào Domain hoặc mở rộng hai namespace trên sang file Domain khác. Architecture test khóa package và vị trí sử dụng.

## Hệ quả và tiêu chí nghiệm thu

- HT-06 được nghiệm thu theo phương án “ngoại lệ có phạm vi và truy vết được”, không phải phương án tách hoàn toàn.
- Tiêu chí hiện hành của `NFR-MAINT-004` được điều chỉnh tại ADR-0003 và Markdown 1.4.0: phân tầng và đúng hai ngoại lệ có phạm vi. Không tuyên bố Domain thuần BCL; chỉ chuyển Verified khi kiểm chứng đủ tiêu chí mới trên phiên bản nghiệm thu.
- Auth, search, schema và migration không đổi trong quyết định này, vì vậy không phát sinh data migration.
- Mọi thay đổi chạm `ApplicationUser`, `Recipe.SearchVector`, Identity mapping hoặc search mapping phải chạy architecture, application, auth và search/integration suites liên quan.

## Phương án thoát ngoại lệ

Khi cần tuân thủ nghiêm ngặt, tạo persistence identity model ở Infrastructure và ánh xạ sang user/domain profile độc lập; đồng thời chuyển search vector thành shadow property hoặc persistence projection thuộc Infrastructure. Việc đó phải có kế hoạch migration, rollback và kiểm thử dữ liệu trước khi bỏ ADR này.

## Đồng bộ đặc tả 16/11/2026

Đặc tả Markdown 1.3.0 ghi rõ hai ngoại lệ trên theo hướng người dùng đã yêu cầu giữ cấu trúc hiện tại. Đây là thay đổi yêu cầu thiết kế chuẩn hóa, không sửa SRS PDF gốc. Tiếp tục giữ NFR-MAINT-004 ở MissingEvidence cho yêu cầu thuần BCL ban đầu và review trên commit nghiệm thu; không tự nâng trạng thái vì cập nhật tài liệu.

## Hiệu lực sau ADR-0003

ADR-0003 thay thế blocker yêu cầu Domain thuần BCL trong các ghi chú lịch sử bên trên bằng tiêu chí phân tầng và ngoại lệ có phạm vi. Giữ MissingEvidence trong hồ sơ hiện tại vì chưa có lần review/test hoàn chỉnh trên phiên bản nghiệm thu, không còn vì chưa quyết định có chấp nhận ngoại lệ hay không.
