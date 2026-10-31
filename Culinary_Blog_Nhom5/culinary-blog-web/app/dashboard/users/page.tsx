"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { listAdminUsers, setUserRole, type AdminUser, type UserRole } from "@/lib/api/adminUsersApi";
import { toApiProblemError } from "@/lib/api/problemDetails";
import { RouteLoading } from "@/components/common/RouteLoading";
import { UnauthorizedState } from "@/components/common/UnauthorizedState";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

function roleError(error: unknown) {
  const problem = toApiProblemError(error);
  if (problem.code === "ADMIN_LAST_ADMIN") return "Không thể gỡ quyền Admin cuối cùng.";
  if (problem.code === "ADMIN_SELF_DEMOTION") return "Bạn không thể tự hạ quyền Admin.";
  if (problem.status === 404) return "Người dùng không còn tồn tại. Hãy tải lại danh sách.";
  if (problem.status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (problem.status === 403) return "Bạn không có quyền thay đổi vai trò.";
  if (problem.status === 422) return "Vai trò được chọn không hợp lệ.";
  if (problem.status === 409) return "Vai trò chưa thể cập nhật do xung đột. Vui lòng thử lại.";
  return "Không thể cập nhật vai trò. Vui lòng thử lại.";
}

export default function UsersPage() {
  const { user } = useAuth();
  const [role, setRole] = useState<UserRole | "">("");
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<{ user: AdminUser; role: UserRole } | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ["admin-users", page, role], queryFn: () => listAdminUsers(page, role),
    enabled: !!user?.roles.includes("Admin"), retry: false });
  const mutation = useMutation({ mutationFn: ({ userId, nextRole }: { userId: string; nextRole: UserRole }) =>
    setUserRole(userId, nextRole), onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    setSelection(null); setMutationError(null);
    toast.success("Đã cập nhật vai trò.");
  }, onError: (error) => {
    const message = roleError(error); setMutationError(message); toast.error(message);
    if (toApiProblemError(error).status === 404) void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  } });
  const openRole = (target: AdminUser, nextRole: UserRole, trigger: HTMLButtonElement) => {
    triggerRef.current = trigger; setMutationError(null); setSelection({ user: target, role: nextRole });
  };

  if (users.isPending) return <RouteLoading variant="table" label="Đang tải người dùng…" />;
  if (users.isError) {
    const status = toApiProblemError(users.error).status;
    if (status === 401 || status === 403) return <div className="p-6"><UnauthorizedState
      mode={status === 401 ? "unauthenticated" : "forbidden"} focusOnMount /></div>;
    return <section className="page-container py-10" role="alert"><h1 className="text-2xl font-semibold">Không thể tải người dùng</h1>
      <p className="mt-2">Dịch vụ đang gặp sự cố. Vui lòng thử lại.</p>
      <button className="submit-button mt-4" disabled={users.isFetching} onClick={() => users.refetch()}>Thử lại</button>
    </section>;
  }
  const result = users.data;
  return <div className="page-container space-y-6 py-8">
    <div><h1 ref={headingRef} tabIndex={-1} className="font-display text-3xl font-bold">Người dùng</h1>
      <p className="mt-2 text-muted-foreground">Quản lý tài khoản và vai trò Admin, Author.</p></div>
    <div className="flex flex-wrap items-end gap-4">
      <div><label htmlFor="user-role-filter" className="field-label">Lọc vai trò</label>
        <select id="user-role-filter" className="field-input mt-1" value={role} onChange={(event) => {
          setRole(event.target.value as UserRole | ""); setPage(1);
        }}><option value="">Tất cả</option><option value="Admin">Admin</option><option value="Author">Author</option></select></div>
      <button className="rounded-lg border px-4 py-2 hover:bg-accent" disabled={users.isFetching} onClick={() => users.refetch()}>
        {users.isFetching ? "Đang tải…" : "Tải lại"}</button>
    </div>
    <p role="status" className="text-sm text-muted-foreground">{result.meta.totalCount} người dùng · Trang {result.meta.page} / {Math.max(1, result.meta.totalPages)}</p>
    {result.data.length === 0 ? <p className="rounded-2xl border p-8 text-center">Không có người dùng phù hợp.</p> :
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[850px] text-left text-sm">
          <caption className="sr-only">Danh sách người dùng và vai trò</caption>
          <thead className="bg-surface"><tr>{["ID", "Email", "Tên hiển thị", "Vai trò", "Trạng thái", "Ngày tạo", "Thao tác"].map((name) =>
            <th key={name} scope="col" className="px-4 py-3 font-semibold">{name}</th>)}</tr></thead>
          <tbody>{result.data.map((item) => {
            const nextRole: UserRole = item.roles.includes("Admin") ? "Author" : "Admin";
            const selfDemotion = item.id === user?.id && nextRole === "Author";
            return <tr key={item.id} className="border-t border-border">
              <td className="break-all px-4 py-3 font-mono text-xs">{item.id}</td>
              <td className="break-all px-4 py-3">{item.email}</td>
              <td className="px-4 py-3">{item.displayName}</td>
              <td className="px-4 py-3">{item.roles.join(", ") || "—"}</td>
              <td className="px-4 py-3">{item.isActive ? "Hoạt động" : "Ngừng hoạt động"}</td>
              <td className="px-4 py-3">{new Date(item.createdAt).toLocaleDateString("vi-VN")}</td>
              <td className="px-4 py-3"><button type="button" disabled={selfDemotion}
                title={selfDemotion ? "Không thể tự hạ quyền Admin" : undefined}
                className="rounded-lg border px-3 py-2 text-primary hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                onClick={(event) => openRole(item, nextRole, event.currentTarget)}>
                {nextRole === "Admin" ? "Cấp Admin" : "Chuyển Author"}</button></td>
            </tr>;
          })}</tbody>
        </table>
      </div>}
    <nav aria-label="Phân trang người dùng" className="flex items-center justify-between gap-4">
      <button className="rounded-lg border px-4 py-2 disabled:opacity-50" disabled={!result.meta.hasPreviousPage || users.isFetching}
        onClick={() => setPage((current) => current - 1)}>Trang trước</button>
      <span>Trang {page}</span>
      <button className="rounded-lg border px-4 py-2 disabled:opacity-50" disabled={!result.meta.hasNextPage || users.isFetching}
        onClick={() => setPage((current) => current + 1)}>Trang sau</button>
    </nav>
    <AlertDialog open={!!selection} onOpenChange={(open) => { if (!open && !mutation.isPending) setSelection(null); }}>
      <AlertDialogContent onCloseAutoFocus={(event) => { event.preventDefault(); requestAnimationFrame(() =>
        (triggerRef.current?.isConnected ? triggerRef.current : headingRef.current)?.focus()); }}>
        <AlertDialogHeader><AlertDialogTitle>Xác nhận đổi vai trò</AlertDialogTitle>
          <AlertDialogDescription>Chuyển {selection?.user.displayName} ({selection?.user.email}) sang vai trò {selection?.role}?</AlertDialogDescription>
        </AlertDialogHeader>
        {mutationError && <p role="alert" className="text-sm text-destructive">{mutationError}</p>}
        <AlertDialogFooter><AlertDialogCancel disabled={mutation.isPending}>Hủy</AlertDialogCancel>
          <AlertDialogAction disabled={mutation.isPending} onClick={(event) => {
            event.preventDefault();
            if (selection) mutation.mutate({ userId: selection.user.id, nextRole: selection.role });
          }}>{mutation.isPending ? "Đang lưu…" : "Xác nhận"}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
