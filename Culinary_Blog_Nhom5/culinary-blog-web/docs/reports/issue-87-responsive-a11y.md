# Issue #87 — Responsive và WCAG 2.1 AA

Ngày chạy: 30/10/2026
Baseline: `f86b7c9` (working tree chưa commit)

## Thay đổi đã thực hiện

- Chuẩn hóa breakpoint desktop theo SRS: `xl = 1200px`; các layout public, search, recipe, category, auth và footer dùng ngưỡng tablet `768px` và desktop `1200px`.
- Bổ sung kiểm tra overflow ở `320`, `375`, `768`, `1024`, `1200px`; thêm `sizes`/`priority` cho hero image.
- Bổ sung touch target tối thiểu cho pointer coarse và hỗ trợ `prefers-reduced-motion` ở cấp global.
- Hoàn thiện accessible name/`aria-hidden` cho icon trang trí, `aria-invalid`/`aria-describedby` cho form, `aria-busy` khi submit và live region cho trạng thái gửi.
- Thay fallback Suspense login rỗng bằng loading state có status và skeleton.
- Giữ focus field lỗi đầu tiên, focus recovery cho menu/dialog, và hiển thị route loading khi redirect quyền truy cập.
- Tích hợp axe-core Playwright với toàn bộ tag WCAG 2.1 A/AA.

## Kiểm thử tự động

| Lệnh | Kết quả |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `npm run test:a11y` | PASS — axe WCAG 2.1 A/AA + keyboard/focus |
| `npm run test:responsive` | PASS — 320/375/768/1024/1200px trong shell fixture |
| `npm run test:e2e:states` | PASS — route loading/error/empty/retry/search |
| `npm run test:e2e:cross-browser` | PASS — Chromium, Firefox, WebKit |
| `npm run test:auth` | PASS |
| `npm run test:auth:e2e` | PASS |

Artifacts JSON được ghi tại `build/accessibility/result-{chromium,firefox,webkit}.json`; mỗi file ghi viewport matrix và trạng thái screen reader là `Not verified`.

## Chưa xác minh thủ công

- NVDA + Chrome/Firefox trên Windows.
- VoiceOver + Safari trên macOS/iOS.
- Thiết bị Mobile Chrome/Mobile Safari thật, zoom 200% và bàn phím ảo.

WebKit headless chỉ là tín hiệu tương thích tự động, không thay thế Safari/VoiceOver thật. Cần nhóm QA chạy checklist thủ công trước khi đóng tiêu chí thiết bị/screen-reader của issue.
