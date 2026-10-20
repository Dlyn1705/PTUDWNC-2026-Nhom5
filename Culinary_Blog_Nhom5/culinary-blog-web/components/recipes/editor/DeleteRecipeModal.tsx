"use client";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DeleteRecipeModalProps {
  open: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteRecipeModal({
  open,
  busy = false,
  onCancel,
  onConfirm,
}: DeleteRecipeModalProps) {
  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !busy) onCancel(); }}>
      <AlertDialogContent>
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
          <AlertDialogAction onClick={(event) => { event.preventDefault(); if (!busy) onConfirm(); }} disabled={busy} className="bg-red-600 text-white hover:bg-red-700">
            {busy ? "Đang xóa..." : "Xóa công thức"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
