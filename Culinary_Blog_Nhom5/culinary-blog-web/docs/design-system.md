# Culinary Blog design system

Design system của Culinary Blog dùng shadcn/ui theo style `new-york`, Tailwind CSS v4, Radix UI và Lucide. Component là source code trong repository, vì vậy feature có thể mở rộng variant khi cần nhưng phải giữ token semantic và hành vi accessibility.

## Cài thêm component

Chạy lệnh từ `culinary-blog-web` và thêm từng component cần dùng:

```bash
npx shadcn@latest add <component>
```

Không chạy `--overwrite` trên toàn bộ thư mục `components/ui`. Các primitive hiện có đã có tùy chỉnh focus và focus recovery cho dự án; hãy xem diff trước khi chấp nhận thay đổi từ CLI.

## Import chuẩn

```tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
```

Class ghép điều kiện dùng `cn` từ `@/lib/utils`. Không import Radix trực tiếp trong feature nếu đã có wrapper tương ứng trong `components/ui`.

## Token semantic

Token được khai báo một lần trong `app/globals.css`, có light/dark value và được ánh xạ vào Tailwind v4 trong `@theme inline`.

| Nhóm | Token nên dùng | Ví dụ |
|---|---|---|
| Trang/nội dung | `background`, `foreground`, `surface` | `bg-background text-foreground` |
| Bề mặt | `card`, `card-foreground`, `popover`, `popover-foreground` | `bg-card`, `bg-popover` |
| Hành động | `primary`, `secondary`, `accent`, `muted` | `bg-primary text-primary-foreground` |
| Lỗi | `destructive` | `text-destructive`, `border-destructive/30` |
| Thành công/cảnh báo | `success`, `warning` | `text-success`, `bg-warning/10`, `border-success/30` |
| Trạng thái recipe | `draft`, `published`, `archived` và foreground tương ứng | Badge trạng thái |
| Control | `border`, `input`, `ring` | `border-input focus:ring-ring` |
| Layout | `spacing-page`, `spacing-section`, Tailwind spacing scale | `px-page`, `py-section` |
| Elevation | `shadow-soft`, `shadow-lift` | Card, Dialog, popover |

Không thêm mã màu hex hoặc palette shade vào feature component. Mã hex chỉ được khai báo trong `app/globals.css` để tạo semantic token; SVG minh họa có thể giữ màu nội bộ khi đó là artwork, không phải UI state. Nếu cần trạng thái mới, bổ sung semantic token ở `globals.css` trước rồi tạo variant.

Các alias cũ `ink`, `orange`, `orange-dark`, `line` chỉ tồn tại để tương thích; code mới dùng token chuẩn.

## Typography

`lib/fonts.ts` khai báo:

- Geist (`--font-geist-sans`) cho nội dung, form và điều khiển.
- Playfair Display (`--font-playfair`) cho tiêu đề qua utility `font-display`.

Root layout gắn các CSS variable từ `next/font`; không thêm `<link>` tới Google Fonts và không gọi font loader trong Client Component.

## Component contract

- `Button`: dùng `variant` (`default`, `secondary`, `outline`, `ghost`, `destructive`, `link`) và `size` thay vì tự viết lại màu/nút. Nút icon phải có `aria-label` hoặc accessible name từ nội dung.
- `Input`/`Textarea`: đặt trong `FormControl` khi thuộc React Hook Form để tự nhận `id`, `aria-invalid` và `aria-describedby`.
- `Form`: dùng React Hook Form + Zod; `FormMessage` dành cho lỗi field, còn lỗi API tổng thể có thể hiển thị thêm bằng alert/toast.
- `Select`: đặt `name` trên `Select` nếu nằm trong native form; trigger phải có label hoặc `aria-label`. Người dùng phải thao tác được bằng Arrow keys, Home/End, Enter và Escape.
- `DropdownMenu`: dùng cho action menu và account menu; không tự triển khai roving focus hoặc typeahead lần nữa.
- `Dialog`: luôn có `DialogTitle`; thêm `DialogDescription` nếu nội dung cần mô tả. Giữ focus recovery về trigger.
- `Card`: dùng `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` để giữ cấu trúc nhất quán; không đưa logic API vào primitive.
- `Toaster`: đã đặt một lần trong root layout. Dùng `toast.success/error/warning/info` cho kết quả toàn cục; không dùng toast thay cho lỗi cạnh field.
- `Skeleton`: chỉ là placeholder trang trí (`aria-hidden`); route vẫn cần trạng thái loading có mô tả phù hợp.
- `Badge`/`Separator`: dùng variant/token semantic; separator decorative hay semantic phải đúng ngữ cảnh.

## Server/Client boundary

Layout và page là Server Component mặc định. Các primitive thuần trình bày như Card, Skeleton, Badge và Separator không cần `"use client"`. Form, Select, Dropdown Menu, Dialog và Sonner có tương tác nên giữ client boundary ở chính component đó. Không thêm `"use client"` vào layout/page chỉ để dùng một primitive.

## Accessibility checklist

- Mọi field có label liên kết và thông báo lỗi được liên kết bằng `aria-describedby`.
- Focus-visible phải nhìn thấy ở nền sáng và tối; không dùng `outline-none` nếu không có focus ring thay thế.
- Dialog đóng bằng Escape và trả focus về trigger; menu/select điều hướng được bằng bàn phím.
- Nút chỉ có icon cần accessible name; ảnh cần alt phù hợp.
- Kiểm tra viewport 320 px, reduced motion và forced colors trước khi merge.
- Kiểm tra contrast của text chính/phụ, action, destructive và status badge sau khi đổi token.

## Kiểm tra trước PR

```bash
npm run typecheck
npm run lint
npm run build
npm run test:ui-contract
npm run test:common
npm run test:a11y
npm run test:e2e:states
```

PR thêm component phải ghi rõ token/variant mới, bằng chứng keyboard flow và thay đổi ở 320 px; PR hoàn thành issue phải dùng `Closes #<issue-number>`.
