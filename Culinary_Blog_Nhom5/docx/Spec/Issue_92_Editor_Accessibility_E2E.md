# Issue #92 — Accessibility và async states cho recipe editor/media

Phụ trách: Phan Thị Bảo Trâm, 2312778 (`btram0812`). Phạm vi NFR-USE-001..004: `/dashboard/recipes/new`, `/dashboard/recipes/[id]/edit`, ingredients, steps, gallery, upload và DeleteRecipeModal. Không thay đổi public/auth/layout toàn cục của #87 hoặc background jobs của #91.

## Thay đổi

- Field arrays có legend, vùng thông báo live/atomic và focus ổn định sau thêm/xóa/đổi thứ tự/lưu. Focus được đặt sau khi fieldset hết pending; xóa hàng cuối quay về nút thêm. Các nút Lên/Xuống hỗ trợ Enter/Space, không phụ thuộc drag/drop.
- Input liên kết label, hint và lỗi qua ID; mô tả bước/URL có hướng dẫn liên kết; đơn vị dinh dưỡng được đọc cùng input. Duy trì focus vào trường không hợp lệ khi validation/API field error.
- Upload có focus-visible quanh file picker, tên file dài không tràn, nút hành động wrap trên mobile. Khi kết thúc/cancel/error, focus về thao tác tiếp theo hoặc status hoàn tất, không về nút đã disabled. Tiến độ lấy từ XHR loaded/total; 100% truyền byte không đồng nghĩa backend processing hoàn tất.
- Gallery đặt/xóa ảnh có pending guard, toast và focus tới control còn hoạt động của hàng kế tiếp (hoặc tải lại khi danh sách rỗng). Lỗi/unknown result yêu cầu đọc đối soát, không tự lặp POST hoặc báo thành công giả.
- Toast cho save/collection/gallery/upload; giữ inline error và correlation ID theo API contract. Ingredients chặn ghi tiếp sau 404/network/5xx cần đối soát. Collection reorder chỉ cập nhật UI sau khi API xác nhận nên lỗi không áp dụng thứ tự chưa được lưu.
- DeleteRecipeModal dùng Radix focus trap, Hủy nhận focus ban đầu, Escape trả focus về trigger; đang xóa thì không đóng bằng Escape và không gửi lặp.

## Chạy kiểm tra

Từ `Culinary_Blog_Nhom5/culinary-blog-web` sau `npm ci`:

```powershell
npm run typecheck
npm run lint
npm run build
npm run test:recipe-editor
npm run test:file-api
npm run test:editor-a11y
node tests/file-api.e2e.cjs
$env:BROWSER_CHANNEL='chrome'
npm run test:a11y
```

Editor/file E2E mặc định dùng Chrome cài trên máy. Có thể chọn bundled Chromium bằng `E2E_BROWSER_CHANNEL=bundled` sau khi cài Playwright browser. Các server con chỉ bind loopback, chọn cổng ngẫu nhiên và được dừng ở `finally`.

`test:editor-a11y` dùng production Next.js, React Hook Form, Radix và API clients thật với HTTP contract được intercept trong Playwright. Đây là kiểm thử frontend/contract, không phải bằng chứng PostgreSQL/MinIO backend thật. Backend/media durability được nghiệm thu riêng ở #84/#91.

## Ma trận nghiệm thu tự động

| Phạm vi | Bằng chứng |
| --- | --- |
| Responsive create, edit/gallery và delete dialog | 320/375/768/1024/1200 px; kiểm tra document overflow và bounding box control/field array, ảnh chụp từng breakpoint |
| Axe | WCAG 2 A/AA + 2.1 AA; 3 audit create/filled arrays, edit/gallery/tên file dài, delete modal; không serious/critical |
| Keyboard/focus | Thêm, xóa, Lên/Xuống nguyên liệu và bước; live announcements; gallery primary/delete; modal Tab/Shift+Tab/Escape và restore |
| Reorder persisted | PUT với If-Match; API 503 giữ thứ tự đã lưu và draft, chặn mutation tiếp cho đến reload |
| Editor regression | Tạo → sửa → upload; notes/nutrition/steps; 401/403/409/422/500, validation focus, chống submit lặp, dirty navigation, Owner/Admin |
| Media async states | 8 browser scenarios: processing failed, cancel, validation/429, network ambiguity/list reconciliation, delete đã commit nhưng reload lỗi, primary conflict, processing deadline, HTTP timeout |
| Unit/contract | 6 recipe-editor tests và 18 file-api tests; gồm status/correlation 401/403/404/409/422/429/5xx, progress từ transport và abort listener cleanup |
| Shared accessibility regression | Radix/nested modal, busy state, trigger removed, retry focus, forced colors, reduced motion, IDs/tab order |

Machine-readable report và ảnh chọn lọc nằm tại `evidence/issue92/`. Toàn bộ ảnh chụp trong `culinary-blog-web/build/lab6-recipe-editor-e2e/` (gitignored). Axe không thay thế kiểm tra screen reader thủ công.

## Kết quả ngày 03/11/2026

Production build, typecheck và lint đạt. Unit/contract **24/24** đạt. Editor E2E đạt **15** kiểm tra responsive (3 trạng thái × 5 breakpoint), **3** axe audit không serious/critical, keyboard collection/gallery/modal và luồng pointer xóa công thức. File API browser regression đạt **8/8** tình huống. Shared accessibility regression Chromium/Chrome cũng đạt (Radix focus, async, forced colors/reduced motion).

- [Báo cáo máy đọc được](evidence/issue92/issue92-a11y-report.json).
- [Create 320 px](evidence/issue92/issue92-create-320.png).
- [Edit/gallery 375 px](evidence/issue92/issue92-edit-gallery-375.png).
- [Delete dialog 320 px](evidence/issue92/issue92-delete-dialog-320.png).

## Checklist NVDA thủ công

Chưa chạy NVDA bằng kiểm thử tự động. Người nghiệm thu dùng Windows + Chrome/Firefox + NVDA, ghi phiên bản, ngày, người kiểm tra và kết quả từng mục; không đánh dấu đạt khi chưa nghe thử.

- [ ] Create: dùng Tab/Shift+Tab tới tên món, danh mục, dinh dưỡng; NVDA đọc tên, đơn vị, hint, required/invalid và lỗi tương ứng; submit sai đưa focus tới lỗi đầu tiên.
- [ ] Ingredients/steps: chỉ dùng bàn phím thêm hai hàng, Lên/Xuống, xóa hàng đầu/cuối; nghe đúng vị trí mới và focus không mất vào body. Kiểm tra gọi lại cùng thao tác vẫn được thông báo.
- [ ] Edit: lưu một hàng, gây 422/409/503; draft không mất, nghe thông báo lỗi/mã hỗ trợ và hướng dẫn tải bản mới; không gửi lặp khi pending.
- [ ] Upload: file picker có focus nhìn thấy; nghe định dạng/dung lượng, progress và sự khác nhau giữa truyền xong/processing/completed. Hủy, lỗi, retry/check status không tự upload trùng.
- [ ] Gallery: đặt primary và xóa ảnh; nghe kết quả, focus sang control còn hoạt động. Nếu request có kết quả chưa rõ, nghe yêu cầu đối soát.
- [ ] Delete modal: Hủy nhận focus; Tab/Shift+Tab ở trong modal; Escape trả về trigger. Đang xóa không cho đóng/gửi lặp; thành công tới danh sách hoặc lỗi có hướng xử lý.
- [ ] 320 px/zoom 200%/forced colors: mọi control có thể đọc và thao tác, focus không bị che, action bar không cắt nút.

Chỉ thêm closing keyword cho #92 trong PR khi đối chiếu đầy đủ tiêu chí và đính kèm kết quả thật; checklist NVDA chưa chạy phải được ghi rõ để người review tiếp tục nghiệm thu.
