"use client";

import { useEffect } from "react";
import Image from "next/image";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { categoryApi } from "@/lib/api/categoryApi";
import { ApiProblemError } from "@/lib/api/problemDetails";
import {
  categoryFormSchema,
  type CategoryFormValues,
} from "@/lib/validations/category";
import { CategoryDto } from "@/types/category.types";

interface CategoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingCategory: CategoryDto | null;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

function slugifyVietnamese(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

const emptyForm: CategoryFormValues = {
  name: "",
  description: "",
  imageUrl: "",
  orderIndex: 0,
};

export function CategoryModal({
  open,
  onOpenChange,
  editingCategory,
  onSuccess,
  onError,
}: CategoryModalProps) {
  const isEditing = Boolean(editingCategory);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: emptyForm,
  });

  useEffect(() => {
    if (!open) return;

    reset(
      editingCategory
        ? {
            name: editingCategory.name,
            description: editingCategory.description ?? "",
            imageUrl: editingCategory.imageUrl ?? "",
            orderIndex: editingCategory.orderIndex,
          }
        : emptyForm,
    );
  }, [editingCategory, open, reset]);

  const name = useWatch({ control, name: "name" });
  const imageUrl = useWatch({ control, name: "imageUrl" });
  const slugPreview = editingCategory?.slug ?? slugifyVietnamese(name);
  const canPreviewImage = /^https?:\/\//i.test(imageUrl);

  const applyApiErrors = (error: ApiProblemError) => {
    const fields: Record<string, keyof CategoryFormValues> = {
      name: "name",
      description: "description",
      imageurl: "imageUrl",
      orderindex: "orderIndex",
    };
    let mappedFieldError = false;

    for (const [serverField, messages] of Object.entries(error.errors)) {
      const field = fields[serverField.toLowerCase()];
      if (!field || messages.length === 0) continue;
      setError(field, { type: "server", message: messages[0] });
      mappedFieldError = true;
    }

    if (error.status === 401) {
      onError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
      return;
    }

    if (error.status === 403) {
      onError("Bạn không có quyền Admin để thực hiện thao tác này.");
      return;
    }

    if (!mappedFieldError || error.status === 409) {
      onError(error.message);
    }
  };

  const submitForm = async (values: CategoryFormValues) => {
    try {
      const payload = {
        name: values.name,
        description: values.description || undefined,
        // Keep the empty value so PUT can explicitly clear an old image URL.
        imageUrl: values.imageUrl,
        orderIndex: values.orderIndex,
      };

      if (editingCategory) {
        await categoryApi.update(editingCategory.id, payload);
        onSuccess(`Đã cập nhật danh mục "${values.name}" thành công.`);
      } else {
        await categoryApi.create(payload);
        onSuccess(`Đã tạo danh mục mới "${values.name}" thành công.`);
      }

      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiProblemError) {
        applyApiErrors(error);
      } else {
        onError(error instanceof Error ? error.message : "Thao tác thất bại.");
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-lg">
        <form onSubmit={handleSubmit(submitForm)} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">
              {isEditing ? "Chỉnh sửa danh mục" : "Tạo danh mục món ăn mới"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {isEditing
                ? "Cập nhật thông tin danh mục món ăn. Slug hiện tại được giữ nguyên."
                : "Nhập thông tin danh mục. Slug chính thức sẽ được máy chủ tạo tự động."}
            </DialogDescription>
          </DialogHeader>

          {isEditing && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50/70 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <span>
                <strong>Lưu ý SEO:</strong> Hệ thống giữ nguyên slug để tránh làm hỏng
                các liên kết đã được chia sẻ.
              </span>
            </div>
          )}

          <div className="space-y-3.5 pt-2">
            <div className="space-y-1">
              <label htmlFor="category-name" className="text-xs font-semibold text-foreground">
                Tên danh mục <span className="text-destructive">*</span>
              </label>
              <Input
                id="category-name"
                {...register("name")}
                placeholder="VD: Món Tráng Miệng, Món Chay..."
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "category-name-error" : undefined}
                className="h-10 rounded-xl bg-background"
              />
              {errors.name && (
                <p id="category-name-error" className="text-[11px] font-medium text-destructive">
                  {errors.name.message}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label htmlFor="category-slug" className="text-xs font-semibold text-foreground">
                Slug xem trước
              </label>
              <Input
                id="category-slug"
                value={slugPreview}
                readOnly
                tabIndex={-1}
                placeholder="Máy chủ sẽ tạo slug"
                className="h-10 rounded-xl bg-muted font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Chỉ để xem trước; máy chủ quyết định slug cuối cùng và tự thêm hậu tố nếu bị trùng.
              </p>
            </div>

            <div className="space-y-1">
              <label htmlFor="category-description" className="text-xs font-semibold text-foreground">
                Mô tả ngắn
              </label>
              <Textarea
                id="category-description"
                {...register("description")}
                placeholder="Giới thiệu tóm tắt về danh mục này..."
                rows={3}
                className="resize-none rounded-xl bg-background text-xs"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="category-image-url" className="text-xs font-semibold text-foreground">
                URL ảnh đại diện danh mục
              </label>
              <Input
                id="category-image-url"
                {...register("imageUrl")}
                placeholder="https://images.example.com/category.jpg"
                aria-invalid={Boolean(errors.imageUrl)}
                aria-describedby={errors.imageUrl ? "category-image-url-error" : undefined}
                className="h-10 rounded-xl bg-background text-xs"
              />
              {errors.imageUrl && (
                <p id="category-image-url-error" className="text-[11px] font-medium text-destructive">
                  {errors.imageUrl.message}
                </p>
              )}
              {canPreviewImage && (
                <div className="relative mt-2 aspect-[16/9] max-w-xs overflow-hidden rounded-xl border border-border bg-muted">
                  <Image
                    src={imageUrl}
                    alt="Xem trước ảnh danh mục"
                    width={640}
                    height={360}
                    unoptimized
                    className="size-full object-cover"
                  />
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label htmlFor="category-order-index" className="text-xs font-semibold text-foreground">
                Thứ tự hiển thị
              </label>
              <Input
                id="category-order-index"
                type="number"
                min={0}
                {...register("orderIndex", { valueAsNumber: true })}
                aria-invalid={Boolean(errors.orderIndex)}
                aria-describedby={errors.orderIndex ? "category-order-index-error" : undefined}
                className="h-10 w-32 rounded-xl bg-background text-xs"
              />
              {errors.orderIndex && (
                <p id="category-order-index-error" className="text-[11px] font-medium text-destructive">
                  {errors.orderIndex.message}
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              className="rounded-full px-4"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="rounded-full px-6 shadow-soft"
            >
              {isSubmitting ? "Đang lưu..." : isEditing ? "Lưu thay đổi" : "Tạo danh mục"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CategoryModal;
