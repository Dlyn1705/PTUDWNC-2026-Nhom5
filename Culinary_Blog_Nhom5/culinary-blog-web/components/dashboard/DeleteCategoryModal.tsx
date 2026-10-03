"use client";

import React, { useState } from "react";
import { AlertTriangle, Trash2, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { categoryApi } from "@/lib/api/categoryApi";
import { CategoryDto } from "@/types/category.types";

interface DeleteCategoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: CategoryDto | null;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export function DeleteCategoryModal({
  open,
  onOpenChange,
  category,
  onSuccess,
  onError,
}: DeleteCategoryModalProps) {
  const [deleting, setDeleting] = useState(false);

  if (!category) return null;

  const hasRecipes = (category.recipeCount || 0) > 0;

  const handleDelete = async () => {
    if (hasRecipes) {
      onError("Không thể xóa danh mục đang chứa công thức!");
      return;
    }

    setDeleting(true);
    try {
      await categoryApi.delete(category.id);
      onSuccess(`Đã xóa danh mục "${category.name}" thành công.`);
      onOpenChange(false);
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error
          ? err.message
          : "Không thể xóa danh mục (Lỗi HTTP 409 Conflict: xung đột dữ liệu).";
      onError(errorMsg);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md rounded-2xl">
        <AlertDialogHeader className="space-y-3">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <Trash2 className="size-6" />
          </div>

          <AlertDialogTitle className="text-center font-display text-xl font-bold">
            Xác nhận xóa danh mục
          </AlertDialogTitle>

          <AlertDialogDescription className="text-center text-xs text-muted-foreground leading-relaxed">
            Bạn có chắc chắn muốn xóa danh mục{" "}
            <strong className="text-foreground">&ldquo;{category.name}&rdquo;</strong>{" "}
            khỏi hệ thống?
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Business Invariant Check: Block deletion if recipes count > 0 */}
        {hasRecipes ? (
          <div className="my-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive flex items-start gap-2.5">
            <Ban className="size-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">
                Không thể xóa danh mục đang chứa công thức!
              </p>
              <p className="mt-1 text-[11px] opacity-90 leading-relaxed">
                Danh mục này hiện đang có{" "}
                <strong>{category.recipeCount} công thức nấu ăn</strong> liên kết. Bạn cần
                chuyển các công thức sang danh mục khác hoặc xóa chúng trước khi có thể xóa
                danh mục này.
              </p>
            </div>
          </div>
        ) : (
          <div className="my-2 rounded-xl border border-amber-300 bg-amber-50/70 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300 flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0 text-amber-600" />
            <span>Thao tác này sẽ áp dụng xóa mềm (Soft Delete) danh mục.</span>
          </div>
        )}

        <AlertDialogFooter className="gap-2 pt-2">
          <AlertDialogCancel className="rounded-full px-5">
            Đóng
          </AlertDialogCancel>

          <Button
            type="button"
            variant="destructive"
            disabled={hasRecipes || deleting}
            className="rounded-full px-5 shadow-soft"
            onClick={handleDelete}
          >
            {deleting ? "Đang xóa..." : "Xác nhận xóa"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default DeleteCategoryModal;
