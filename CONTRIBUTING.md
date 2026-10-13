# Quy định đóng góp mã nguồn

Tài liệu này quy định cách tạo nhánh, commit, push và tạo pull request cho dự án Culinary Blog. Mục tiêu là bảo vệ nhánh `main`, giảm conflict và giúp nhóm trưởng review thuận tiện.

## 1. Nguyên tắc bắt buộc

- Không commit hoặc push trực tiếp lên `main`.
- Mỗi chức năng hoặc lỗi phải được thực hiện trên một nhánh riêng.
- Trước khi bắt đầu phải cập nhật `main` mới nhất từ remote.
- Trước khi mở pull request phải cập nhật lại thay đổi mới nhất từ `main`, xử lý conflict và kiểm tra lại hệ thống.
- Mọi thay đổi chỉ được merge sau khi nhóm trưởng review và chấp thuận.
- Người tạo pull request không tự merge nếu chưa được nhóm trưởng cho phép.
- Không commit secret, mật khẩu, token, file `.env.local`, dữ liệu cá nhân hoặc file build.

## 2. Bắt đầu một công việc mới

Kiểm tra và lưu lại công việc đang làm dở trước khi chuyển nhánh. Sau đó cập nhật `main`:

```powershell
git status
git switch main
git pull --ff-only origin main
git switch -c <mssv>-<ho-ten>-<ten-cong-viec>
```

Tên nhánh viết thường, không dấu, dùng dấu gạch ngang và mô tả đúng một công việc.

Ví dụ:

```text
2312567-vo-thi-minh-an-dang-nhap-email
2300003-nguyen-le-anh-tuan-xoa-anh-minio
2312663-do-dang-dieu-linh-sua-danh-muc
```

Không dùng tên chung chung như `new`, `update`, `fix`, `test-branch`.

## 3. Quy tắc commit

Commit theo định dạng Conventional Commits:

```text
<type>(<scope>): <mo-ta-ngan-gon>
```

Các `type` thường dùng:

| Type | Khi sử dụng |
|---|---|
| `feat` | Thêm tính năng mới |
| `fix` | Sửa lỗi |
| `docs` | Cập nhật tài liệu |
| `refactor` | Đổi cấu trúc nhưng không đổi hành vi |
| `test` | Thêm hoặc sửa kiểm thử |
| `style` | Định dạng mã nguồn, không đổi logic |
| `perf` | Cải thiện hiệu năng |
| `build` | Thay đổi dependency hoặc quy trình build |
| `ci` | Thay đổi pipeline CI/CD |
| `chore` | Công việc bảo trì khác |

Ví dụ commit hợp lệ:

```text
feat(recipes): thêm api tạo công thức
fix(auth): xử lý refresh token hết hạn
docs(project): cập nhật hướng dẫn chạy hệ thống
```

Mỗi commit cần:

- Chỉ chứa một thay đổi logic rõ ràng.
- Có nội dung có thể build hoặc kiểm tra được.
- Không dùng thông điệp mơ hồ như `update code`, `fix bug`, `done`.
- Không trộn format toàn dự án, file sinh tự động hoặc thay đổi không liên quan.

Trước khi commit:

```powershell
git status
git diff
```

Chỉ stage đúng file thuộc công việc:

```powershell
git add <duong-dan-file>
git commit -m "<type>(<scope>): <mo-ta>"
```

## 4. Kiểm tra trước khi push

Chạy các kiểm tra phù hợp với phần đã sửa. Khi thay đổi ảnh hưởng toàn hệ thống, chạy đầy đủ:

```powershell
dotnet build .\Culinary_Blog_Nhom5\Culinary_Blog_Nhom5.sln
cd .\Culinary_Blog_Nhom5\culinary-blog-web
npm run lint
npm run build
cd ..\..
```

Kiểm tra lại danh sách file và commit:

```powershell
git status
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
```

## 5. Cập nhật `main` và xử lý conflict

Trước khi push lần cuối hoặc mở pull request:

```powershell
git fetch origin
git merge origin/main
```

Nếu có conflict:

1. Mở từng file được Git đánh dấu và hiểu thay đổi của cả hai phía.
2. Chọn hoặc kết hợp nội dung đúng theo đặc tả, không xóa tùy tiện thay đổi của thành viên khác.
3. Xóa đầy đủ các marker `<<<<<<<`, `=======`, `>>>>>>>`.
4. Chạy lại build, lint và kiểm thử liên quan.
5. Đánh dấu đã xử lý và commit:

```powershell
git add <cac-file-da-xu-ly>
git commit -m "merge: resolve conflicts with main"
```

Không dùng `git push --force` để xử lý conflict. Tuyệt đối không force-push lên `main`.

## 6. Push bài

Lần đầu push nhánh:

```powershell
git push -u origin <ten-nhanh>
```

Các lần sau:

```powershell
git push
```

Sau khi push, kiểm tra trên GitHub để chắc chắn đúng nhánh, đúng commit và không có file ngoài phạm vi công việc.

## 7. Quy tắc pull request

Tạo pull request với:

- Base branch: `main`.
- Compare branch: nhánh công việc của thành viên.
- Tiêu đề: `<HoTen>-<MSSV>: <mô tả thay đổi>`.
- Nội dung mô tả rõ yêu cầu, thay đổi chính, cách kiểm tra và ảnh chụp màn hình nếu có giao diện.
- Gắn issue hoặc mã yêu cầu trong đặc tả nếu công việc có liên quan.
- Chỉ chứa một chức năng hoặc một nhóm thay đổi có liên quan trực tiếp.
- Không còn conflict, build/lint/test phải thành công trước khi yêu cầu review.

Mẫu nội dung pull request:

```markdown
## Mô tả

Tóm tắt mục tiêu của pull request.

## Thay đổi chính

- Thay đổi 1
- Thay đổi 2

## Cách kiểm tra

1. Bước kiểm tra 1
2. Bước kiểm tra 2

## Kết quả kiểm tra

- [ ] Backend build thành công
- [ ] Frontend lint thành công
- [ ] Frontend build thành công
- [ ] Đã kiểm tra thủ công luồng liên quan

## Tài liệu/Issue liên quan

- FR-XXX-000 hoặc liên kết issue
```

Sau khi tạo pull request:

1. Gửi pull request cho nhóm trưởng review.
2. Không tự merge khi chưa được duyệt.
3. Sửa tất cả nhận xét còn mở và push bổ sung lên cùng nhánh.
4. Nếu `main` thay đổi, merge lại `origin/main`, xử lý conflict và kiểm tra lại.
5. Chỉ nhóm trưởng hoặc người được nhóm trưởng chỉ định tiến hành merge.
6. Ưu tiên **Squash and merge** để lịch sử `main` gọn; xóa nhánh sau khi merge.

## 8. Cập nhật theo nhận xét review

```powershell
git switch <ten-nhanh>
git pull --ff-only origin <ten-nhanh>
# Chỉnh sửa và kiểm tra lại
git add <cac-file-da-sua>
git commit -m "fix(<scope>): xu ly nhan xet review"
git push
```

Pull request sẽ tự động nhận các commit mới. Không đóng rồi tạo pull request khác nếu không cần thiết.

## 9. Checklist trước khi yêu cầu merge

- [ ] Nhánh được tạo từ `main` mới nhất.
- [ ] Đã cập nhật lại `origin/main` và không còn conflict.
- [ ] Commit đúng định dạng và không chứa thay đổi ngoài phạm vi.
- [ ] Không có secret hoặc file cấu hình cá nhân.
- [ ] Build, lint và kiểm thử liên quan thành công.
- [ ] Pull request có mô tả và cách kiểm tra rõ ràng.
- [ ] Mọi nhận xét review đã được xử lý.
- [ ] Nhóm trưởng đã chấp thuận merge.
