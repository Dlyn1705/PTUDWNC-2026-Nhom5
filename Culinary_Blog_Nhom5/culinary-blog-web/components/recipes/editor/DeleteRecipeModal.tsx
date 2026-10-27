"use client";
import type { RefObject } from "react";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DeleteRecipeModalProps {
  open: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
}

export function DeleteRecipeModal({
  open,
  busy = false,
  onCancel,
  onConfirm,
  returnFocusRef,
}: DeleteRecipeModalProps) {
  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !busy) onCancel(); }}>
      <AlertDialogContent onCloseAutoFocus={event => {
        if (returnFocusRef?.current) { event.preventDefault(); returnFocusRef.current.focus(); }
      }}>
        <AlertDialogHeader>
          <AlertDialogTitle>Xóa công thức?</AlertDialogTitle>
          <AlertDialogDescription>
            Công thức sẽ được ẩn ngay. Ảnh được giữ tối thiểu 30 ngày trước khi hệ thống dọn dữ liệu định kỳ.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p role="status" className="text-sm">{busy ? "Đang xóa công thức. Vui lòng chờ kết quả trước khi đóng." : ""}</p>
        <AlertDialogFooter aria-busy={busy}>
          <AlertDialogCancel disabled={busy}>
            Hủy
          </AlertDialogCancel>
          <AlertDialogAction onClick={(event) => { event.preventDefault(); if (!busy) onConfirm(); }} disabled={busy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {busy ? "Đang xóa..." : "Xóa công thức"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
