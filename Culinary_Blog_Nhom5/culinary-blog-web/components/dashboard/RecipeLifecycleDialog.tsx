"use client";

import Link from "next/link";
import type { RefObject } from "react";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { errorPresentation } from "@/lib/errorPresentation";
import { Button } from "@/components/ui/button";

export type LifecycleAction = "publish" | "unpublish" | "archive" | "restore";
export const lifecycleLabels = { publish: "Xuất bản", unpublish: "Hủy xuất bản", archive: "Lưu trữ", restore: "Khôi phục" };
const descriptions = {
  publish: "Công thức sẽ được công khai. Cần ít nhất một bước và một nguyên liệu.",
  unpublish: "Công thức trở về bản nháp và được ẩn khỏi danh sách công khai.",
  archive: "Công thức sẽ được lưu trữ và ẩn khỏi danh sách công khai.",
  restore: "Công thức trở về bản nháp. Bạn cần xuất bản lại để công khai.",
};
export function RecipeLifecycleDialog({ target, busy, error, onCancel, onConfirm, onReload, returnFocusRef,
  reloadLabel = "Tải lại danh sách", fallbackFocusId = "recipe-status-heading" }: {
  target: { id: string; title: string; action: LifecycleAction } | null;
  busy: boolean; error: unknown; onCancel: () => void; onConfirm: () => void;
  onReload: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  reloadLabel?: string; fallbackFocusId?: string;
}) {
  const presentation = error ? errorPresentation(error) : null;
  return <AlertDialog open={Boolean(target)} onOpenChange={open => { if (!open && !busy) onCancel(); }}>
    <AlertDialogContent onCloseAutoFocus={event => {
      event.preventDefault();
      if (returnFocusRef.current?.isConnected && !returnFocusRef.current.disabled) {
        returnFocusRef.current.focus();
        return;
      }
      document.getElementById(fallbackFocusId)?.focus();
    }}>
      <AlertDialogHeader>
        <AlertDialogTitle>{target ? lifecycleLabels[target.action] : "Cập nhật"} công thức?</AlertDialogTitle>
        <AlertDialogDescription>{target?.title}. {target && descriptions[target.action]}</AlertDialogDescription>
      </AlertDialogHeader>
      {presentation && <div role="alert" className="space-y-2 text-sm text-destructive">
        <p>{presentation.status === 422 && target?.action === "publish"
          ? "Chưa thể xuất bản. Hãy bổ sung ít nhất một bước và một nguyên liệu trong trình chỉnh sửa."
          : presentation.description}</p>
        {presentation.correlationId && <p>Mã hỗ trợ: {presentation.correlationId}</p>}
        {target && presentation.status === 422 && <Link href={`/dashboard/recipes/${target.id}/edit`} className="underline">Mở trình chỉnh sửa</Link>}
        {[404, 409].includes(presentation.status ?? 0) && <Button type="button" variant="outline" onClick={onReload}>{reloadLabel}</Button>}
      </div>}
      <p role="status" className="text-sm">{busy ? "Đang cập nhật công thức…" : ""}</p>
      <AlertDialogFooter aria-busy={busy}>
        <AlertDialogCancel disabled={busy}>Hủy</AlertDialogCancel>
        <AlertDialogAction disabled={busy} onClick={event => { event.preventDefault(); if (!busy) onConfirm(); }}>
          {busy ? "Đang cập nhật…" : "Xác nhận"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
