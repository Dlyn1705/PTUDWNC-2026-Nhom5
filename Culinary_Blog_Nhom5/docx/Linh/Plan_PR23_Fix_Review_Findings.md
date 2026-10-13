# Kế hoạch sửa review PR #23

## Mục tiêu

Khắc phục hai lỗi của structured logging mà không làm thay đổi contract HTTP hoặc hành vi nghiệp vụ:

1. Axios interceptor không được chặn request khi `crypto.randomUUID()` không tồn tại.
2. Log phát sinh bên trong CQRS handler không được gắn nhãn `ApplicationRequestCompleted`.

## Thay đổi thực hiện

### Frontend

- Sinh correlation ID bằng `crypto.randomUUID()` khi API khả dụng.
- Dùng `crypto.getRandomValues()` để tạo UUID v4 khi `randomUUID()` không tồn tại, gồm trường hợp chạy frontend qua HTTP bằng địa chỉ IP trong mạng LAN.
- Nếu Web Crypto không khả dụng hoặc phát sinh lỗi, bỏ qua request correlation header để backend tự sinh ID. Việc ghi log là best-effort và không được làm request thất bại.
- Thêm regression test xác nhận request vẫn được dispatch và fallback tạo correlation ID hợp lệ khi thiếu `randomUUID()`.

### Backend

- Giữ `UserId` trong scope bao quanh handler để log nội bộ vẫn có user context.
- Chỉ đặt `EventType=ApplicationRequestCompleted` trong scope tại thời điểm ghi completion event ở khối `finally`.
- Thêm regression test tạo một log bên trong handler và xác nhận chỉ có đúng một event mang nhãn completion.

## Kiểm tra

- Chạy TypeScript compile và toàn bộ client logging tests.
- Chạy toàn bộ project `CulinaryBlog.Observability.Tests`.
- Chạy ESLint cho các file frontend thay đổi.
- Chạy `git diff --check` để kiểm tra lỗi whitespace.

## Tiêu chí hoàn thành

- Request Axios vẫn tới adapter khi thiếu `crypto.randomUUID()`.
- Correlation ID fallback đúng định dạng hợp lệ.
- Mỗi CQRS request chỉ sinh một `ApplicationRequestCompleted` event.
- Log của handler/service không bị nhận nhầm nhãn completion.
- Các test structured logging hiện có tiếp tục pass.
