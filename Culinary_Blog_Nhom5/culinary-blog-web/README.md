# Culinary Blog Web

Frontend Next.js 16 của Culinary Blog. Chạy tại thư mục này bằng `npm run dev`; dùng `npm test`, `npm run lint` và `npm run build` trước khi tạo pull request. Các biến môi trường mẫu nằm trong [`.env.example`](.env.example). Không commit `.env.local`, token, cookie, mật khẩu hay secret OAuth.

## Thêm primitive shadcn/ui

Project đã có [`components.json`](components.json), Tailwind CSS 4 và alias `@/`. Để thêm một primitive:

```powershell
npx shadcn@latest add <primitive>
```

Ví dụ: `npx shadcn@latest add tooltip`. Kiểm tra diff sinh ra trước khi dùng, giữ primitive ở `components/ui/`, tái sử dụng `cn` từ `lib/utils.ts`, và dùng semantic token trong `app/globals.css` thay vì thêm màu hoặc CSS rời rạc. Không thay đổi `style`, `baseColor` hay `cssVariables` trong `components.json`, vì các lựa chọn này phải nhất quán với primitive đã tồn tại.

## Quy tắc tạo store

NextAuth là nguồn dữ liệu xác thực. `store/useAuthStore.ts` chỉ là bản chiếu UI tối thiểu của session: trạng thái, user ID và roles; nó không được lưu token, refresh token, cookie, mật khẩu hay toàn bộ session.

Chỉ tạo Zustand store khi dữ liệu là client/UI state dùng chung, không phù hợp với URL và không phải server data cache. Dữ liệu API thuộc React Query hoặc component state. Store persist phải:

- Persist từng trường bằng `partialize`; không persist trạng thái hydrate hay action.
- Dùng `skipHydration: true` và hydrate từ một client provider sau khi mount để server HTML khớp lần render client đầu tiên.
- Có `clear`/reset khi logout hoặc session không còn hợp lệ.
- Xuất factory hoặc helper thuần để kiểm thử việc rehydrate với storage giả.

`store/useUIStore.ts` là mẫu cho persisted UI state; `components/providers/UIStoreHydrator.tsx` là nơi gọi `rehydrate()`.

## API client

Chỉ dùng `lib/api/axiosClient.ts` hoặc module API theo domain. Response lỗi đến component luôn là `ApiProblemError`; dùng `isApiProblemError()` cho status/code/field errors và `getApiErrorMessage()` cho thông báo chung. Không đọc hoặc cast `error.response` trong component.

Recipe API chia theo phạm vi:

- `recipePublicApi.ts`: dữ liệu công khai.
- `recipeEditorApi.ts`: tạo, đọc để sửa, cập nhật.
- `recipeLifecycleApi.ts`: publish/archive/restore/delete.
- `recipeApi.ts`: facade tương thích cho import cũ.
