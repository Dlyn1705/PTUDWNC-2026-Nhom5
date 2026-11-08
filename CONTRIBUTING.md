# Quy định đóng góp mã nguồn

Tài liệu này quy định cách tạo nhánh, commit, push và tạo pull request cho dự án Culinary Blog. Mục tiêu là bảo vệ nhánh `main`, giảm conflict và giúp nhóm trưởng review thuận tiện.

Mọi công việc đã được tạo thành GitHub Issue phải được theo dõi trong GitHub Project **Culinary Blog**. Quy trình chuẩn là `Todo` → `In Progress` → `In Review` → `Done`; issue chỉ tự động đóng khi pull request có closing keyword hợp lệ được merge vào `main`.

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

Tên nhánh viết hoa, không dấu, dùng dấu gạch ngang và mô tả đúng một công việc.

Ví dụ:

```text
2312567-VoThiMinhAn-dangnhapemail
2300003-NguyenLeAnhTuan-xoaanhminio
2312663-DoDangDieuLinh-suadanhmuc
```

Không dùng tên chung chung như `new`, `update`, `fix`, `test-branch`.

Nếu công việc đã có GitHub Issue:

1. Mở issue và đọc đầy đủ phần phạm vi, tiêu chí nghiệm thu và tài liệu đối chiếu.
2. Kiểm tra đúng người được gán trong mục **Assignees**.
3. Trong GitHub Project **Culinary Blog**, chuyển issue từ `Todo` sang `In Progress` trước khi bắt đầu code.
4. Ưu tiên tạo branch từ mục **Development → Create a branch** trong issue để GitHub hiển thị branch đang xử lý công việc.
5. Tên nhánh vẫn phải tuân thủ quy tắc hiện có; có thể bổ sung số issue để dễ truy vết:

```text
<mssv>-<ho-ten>-<ten-cong-viec>
```

Ví dụ:

```text
2312663-DoDangDieuLinh-trangchu
2312567-VoThiMinhAn-authstore
2300003-NguyenLeAnhTuan-timkiem
```

Mỗi branch chỉ xử lý một issue chính. Nếu phát hiện công việc ngoài phạm vi, tạo issue khác hoặc trao đổi với nhóm trưởng trước khi thực hiện.

## 3. Quy tắc commit

Commit theo định dạng Conventional Commits:

```text
<type>(<scope>): <motangangon>
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

Khi commit thuộc một GitHub Issue, có thể thêm số issue ở cuối thông điệp mà vẫn giữ nguyên định dạng Conventional Commits:

```text
feat(auth): thêm Zustand auth store (#67)
feat(home): xây dựng trang chủ Culinary Blog (#72)
fix(search): giữ bộ lọc khi chuyển trang (#74)
```

Số issue trong commit dùng để truy vết. Việc tự động đóng issue phải thực hiện bằng closing keyword trong phần mô tả pull request, không phụ thuộc vào thông điệp commit.

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

Nếu branch được tạo thủ công thay vì từ issue, mở issue trên GitHub, tìm mục **Development**, liên kết branch vừa push và chọn **Apply**. Không đóng issue ở bước này.

## 7. Quy tắc pull request

Tạo pull request với:

- Base branch: `main`.
- Compare branch: nhánh công việc của thành viên.
- Tiêu đề: `<HoTen>-<MSSV>: <mô tả thay đổi>`.
- Nội dung mô tả rõ yêu cầu, thay đổi chính, cách kiểm tra và ảnh chụp màn hình nếu có giao diện.
- Gắn issue hoặc mã yêu cầu trong đặc tả nếu công việc có liên quan.
- Với công việc có issue, phần mô tả bắt buộc có `Closes #<so-issue>` để GitHub tự động đóng issue sau khi pull request được merge vào `main`.
- Chỉ chứa một chức năng hoặc một nhóm thay đổi có liên quan trực tiếp.
- Không còn conflict, build/lint/test phải thành công trước khi yêu cầu review.

Mẫu nội dung pull request:

```markdown
## Mô tả

Tóm tắt mục tiêu của pull request.

## Issue liên quan

Closes #<so-issue>

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
- GitHub Project: Culinary Blog
```

Ví dụ với issue #67:

```markdown
## Issue liên quan

Closes #67
```

Chỉ dùng `Closes`, `Fixes` hoặc `Resolves` khi pull request hoàn thành toàn bộ tiêu chí nghiệm thu của issue. Nếu pull request mới thực hiện một phần, dùng `Refs #<so-issue>` và không đóng issue tự động.

Closing keyword chỉ tự động đóng issue khi pull request được merge vào nhánh mặc định `main`. Không đặt `Closes #...` cho pull request thử nghiệm hoặc pull request chưa hoàn thành toàn bộ issue.

Sau khi tạo pull request:

1. Gửi pull request cho nhóm trưởng review.
2. Không tự merge khi chưa được duyệt.
3. Sửa tất cả nhận xét còn mở và push bổ sung lên cùng nhánh.
4. Nếu `main` thay đổi, merge lại `origin/main`, xử lý conflict và kiểm tra lại.
5. Chỉ nhóm trưởng hoặc người được nhóm trưởng chỉ định tiến hành merge.
6. Ưu tiên **Squash and merge** để lịch sử `main` gọn; xóa nhánh sau khi merge.
7. Kiểm tra mục **Development** của pull request đã hiển thị đúng issue cần đóng.
8. Trong GitHub Project **Culinary Blog**, chuyển issue từ `In Progress` sang `In Review`.

Không cần thêm cả pull request vào Project nếu Project đã có issue tương ứng, tránh xuất hiện hai card cho cùng một công việc. Pull request phải được liên kết với issue qua `Closes #...` hoặc mục **Development**.

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

Khi nhóm trưởng yêu cầu sửa:

1. Giữ nguyên issue và pull request hiện tại.
2. Có thể chuyển issue từ `In Review` về `In Progress` trong Project nếu cần sửa nhiều.
3. Push các commit sửa lỗi lên cùng branch.
4. Sau khi xử lý hết nhận xét, chuyển issue lại `In Review` và yêu cầu review lại.

## 9. Checklist trước khi yêu cầu merge

- [ ] Nhánh được tạo từ `main` mới nhất.
- [ ] Đã cập nhật lại `origin/main` và không còn conflict.
- [ ] Commit đúng định dạng và không chứa thay đổi ngoài phạm vi.
- [ ] Không có secret hoặc file cấu hình cá nhân.
- [ ] Build, lint và kiểm thử liên quan thành công.
- [ ] Pull request có mô tả và cách kiểm tra rõ ràng.
- [ ] Pull request có đúng `Closes #<so-issue>` nếu đã hoàn thành toàn bộ issue.
- [ ] Pull request đã liên kết đúng issue trong mục **Development**.
- [ ] Issue đang ở trạng thái `In Review` trong GitHub Project.
- [ ] Checklist nghiệm thu trong issue đã được đối chiếu và có bằng chứng kiểm tra.
- [ ] Mọi nhận xét review đã được xử lý.
- [ ] Nhóm trưởng đã chấp thuận merge.

## 10. Đồng bộ Issue với GitHub Project

GitHub Project **Culinary Blog** là nơi theo dõi trạng thái công việc; GitHub Issue là nơi mô tả phạm vi và tiêu chí nghiệm thu; pull request là nơi review mã nguồn. Ba đối tượng phải được liên kết theo quy trình sau:

```text
Issue ở Todo
    ↓ Thành viên nhận việc và bắt đầu code
Issue chuyển sang In Progress
    ↓ Push branch và mở pull request có Closes #<so-issue>
Issue chuyển sang In Review
    ↓ Nhóm trưởng duyệt và merge pull request vào main
Issue tự động đóng
    ↓ Workflow Item closed của Project
Issue tự động chuyển sang Done
```

### 10.1. Khi bắt đầu thực hiện issue

- Không bắt đầu issue chưa được gán nếu chưa thống nhất với nhóm trưởng.
- Chuyển issue sang `In Progress` trước khi sửa mã nguồn.
- Tạo branch riêng theo quy tắc tại mục 2 và liên kết branch trong mục **Development** của issue.
- Không thay đổi checklist nghiệm thu để hợp thức hóa phần triển khai chưa đầy đủ.

### 10.2. Khi mở pull request

- Base branch phải là `main` theo quy tắc hiện có.
- Phần mô tả phải có `Closes #<so-issue>` nếu pull request hoàn thành toàn bộ issue.
- Sau khi mở pull request, chuyển issue sang `In Review`.
- Không tự đóng issue và không tự kéo card sang `Done` trước khi pull request được merge.

### 10.3. Khi pull request được merge

- Nếu pull request có closing keyword hợp lệ và được merge vào `main`, GitHub tự động đóng issue.
- Workflow `Item closed` của Project tự động đặt `Status = Done`.
- Kiểm tra issue đã đóng và card đã sang `Done`; nếu automation chưa chạy, báo nhóm trưởng kiểm tra workflow trước khi cập nhật thủ công.
- Xóa branch sau khi merge theo quy tắc tại mục 7.

### 10.4. Khi issue được mở lại

- Workflow Project đưa issue về `Todo` nếu đã cấu hình `Item reopened → Status: Todo`.
- Thành viên được giao chuyển issue sang `In Progress` khi bắt đầu sửa lại.
- Tạo branch mới hoặc sử dụng branch sửa lỗi theo quyết định của nhóm trưởng; pull request mới vẫn phải liên kết đúng issue.

### 10.5. Closing keyword được chấp nhận

Có thể dùng một trong các từ khóa sau trong phần mô tả pull request:

```text
Closes #67
Fixes #67
Resolves #67
```

Nhóm thống nhất ưu tiên `Closes #<so-issue>`. Nếu một pull request hợp lệ hoàn thành nhiều issue, phải ghi rõ từng issue:

```text
Closes #65
Closes #67
```

Không gộp nhiều issue vào một pull request nếu các thay đổi không liên quan trực tiếp, phù hợp với nguyên tắc mỗi nhánh và pull request chỉ chứa một công việc rõ ràng.
