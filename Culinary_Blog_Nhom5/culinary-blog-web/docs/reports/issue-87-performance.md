# Issue #87 — Performance evidence and follow-up

Ngày chạy: 30/10/2026
Production build: `npm run build` — PASS (Next.js 16.4.3, Turbopack).

## Đã khóa trong code

- Landing hero dùng `priority` và `sizes` theo breakpoint.
- Các ảnh recipe/card giữ `sizes` phù hợp; layout dùng `minmax(0, 1fr)`/`min-w-0` ở các vùng có nguy cơ tràn.
- Không thêm dependency runtime cho axe; `@axe-core/playwright` chỉ nằm trong devDependencies.

## Chưa đo trong môi trường này

LCP, CLS, INP, Lighthouse CI và First Load JS gzip chưa được đo bằng môi trường production ổn định với network/device profile. Không tuyên bố các ngưỡng NFR-PERF-005 đã đạt từ kết quả build cục bộ. Cần chạy Lighthouse CI nhiều lần và bundle-budget trên CI hoặc BrowserStack, ghi median cùng commit SHA trước khi đóng tiêu chí hiệu năng.
