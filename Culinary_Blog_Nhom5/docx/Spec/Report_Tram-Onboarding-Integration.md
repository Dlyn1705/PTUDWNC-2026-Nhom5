# Hoàn thiện onboarding và tích hợp công thức của Trâm

Ngày rà soát: 26/10/2026. Thành viên: Phan Thị Bảo Trâm, MSSV 2312778.
Nhánh thực hiện: `2312778-PhanThiBaoTram-hoanthien-onboarding`, từ main `583992d`.

## Phạm vi đã thống nhất

Chỉ hoàn thiện phần Trâm và các điểm tích hợp liên quan. Phân công tham chiếu: `Frontend_Spec.md`, mục 3.4 và `Bang_Phan_Cong_Va_Mo_Ta_Chi_Tiet_Cong_Viec.md`. Đặc tả nghiệp vụ hiện hành và contract API được ưu tiên khi tài liệu mô tả frontend cũ khác backend.

| Yêu cầu được đưa ra | Người phụ trách theo phân công | Phần Trâm tham gia |
|---|---|---|
| Đăng ký, đăng nhập, đăng xuất, đổi/quên mật khẩu | Ân | Onboarding sau đăng ký thành công; điều hướng vào editor theo phiên và quyền |
| Xem và cập nhật profile | Ân | Giữ tương thích phiên và điều hướng; không tự triển khai module profile của Ân |
| Trang chủ, chi tiết công thức | Linh | Tương thích dữ liệu công thức/ảnh/bước do editor tạo; liên kết khám phá công thức từ onboarding |
| Tìm kiếm | Tuấn | Sử dụng route công khai hiện có; không sửa thuật toán/module tìm kiếm |
| Danh sách category | Linh | Tái sử dụng API danh mục để chọn category khi tạo/sửa công thức |

Không đánh dấu các tính năng thuộc thành viên khác là hoàn tất trong báo cáo cá nhân này. Tại main đã kiểm tra, `/profile` mới hiển thị thông tin phiên; chưa có form cập nhật hồ sơ. Những yêu cầu này tiếp tục do người được phân công xử lý.

## Phần hoàn thiện

- Giữ luồng đã có: `RegisterForm` chỉ chuyển tới `/auth/login?registered=true` khi API đăng ký trả 201. Đăng ký lỗi không mở trang chào mừng.
- `WelcomeBanner` hiển thị thông báo thành viên mới và liên kết `/recipes`; không nhận email từ query string, không gọi API gửi lại thư và không hứa thư đã tới inbox.
- Làm rõ email chào mừng không dùng để xác minh/kích hoạt tài khoản; có thể đăng nhập ngay. Thông tin này phù hợp FR-JOB-001 và mục onboarding đã cập nhật trong Frontend_Spec.
- Đổi màu banner sang semantic token của design system mới, giữ live region `role=status`, không tạo thêm thư viện hay luồng auth riêng.
- Bổ sung E2E vào bộ `test:lab6-editor` đang chạy trong CI để kiểm tra cả onboarding và điểm vào editor. Tái sử dụng Auth.js và Redis của fixture hiện có.

## Kịch bản nghiệm thu

1. Trang đăng nhập bình thường và `registered=false` không hiện banner thành viên mới.
2. Đăng ký bị 409 giữ người dùng ở trang đăng ký; sau khi sửa email và API trả 201, chuyển đúng trang đăng nhập có banner.
3. Banner hướng dẫn đăng nhập ngay, giải thích email không phải bước kích hoạt và có link khám phá công thức.
4. Email riêng tư được chèn vào query string không bị đưa ra màn hình; form đăng nhập không tự lấy email từ query.
5. Banner và thao tác khám phá không gọi API gửi/gửi lại welcome email. Frontend chỉ gọi đăng ký khi người dùng submit form.
6. Giao diện onboarding không tràn ngang ở 320 px; link khám phá dẫn tới `/recipes`.
7. Khách mở `/dashboard/recipes/new` bị chuyển tới đăng nhập; các ca Author/Admin, quyền sở hữu, 401/403/409/422 và giữ bản nháp tiếp tục chạy trong cùng suite.

## Kiểm tra và giới hạn

Lệnh tại `culinary-blog-web`: `npm run lint`, `npm run build`, `npm run test:lab6-editor`.
Browser E2E chạy production Next.js với backend fixture và session Auth.js/Redis thật. Đây là kiểm tra UI/tích hợp frontend, không phải bằng chứng SMTP đã giao email thật hoặc nghiệm thu đầy đủ module auth/profile của nhóm.

Kết quả ngày 26/10/2026:

| Kiểm tra | Kết quả |
|---|---|
| npm ci theo lockfile vừa pull | Đạt |
| ESLint | Đạt |
| Production build Next.js 16.4.3 và TypeScript | Đạt |
| Chrome E2E onboarding và hồi quy editor | Đạt toàn bộ kịch bản nêu trên |
| git diff --check | Đạt |

Lượt E2E đầu không hoàn tất đăng nhập vì Docker/Redis local đang tắt. Đã khởi động Docker và container Redis sẵn có, kiểm tra PONG rồi chạy lại suite thành công. Không sửa logic auth để bỏ qua Redis hay nới kiểm tra quyền.

Nhánh bàn giao: `2312778-PhanThiBaoTram-hoanthien-onboarding`. Báo cáo Word Lab 6 chưa commit được giữ nguyên, không trộn vào phạm vi onboarding mới.
