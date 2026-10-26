"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
  const [failure, setFailure] = useState("");
  const isEditing = Boolean(editingCategory);
  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: emptyForm,
  });
  const {
    handleSubmit,
    reset,
    setError,
    control,
    formState: { isSubmitting },
  } = form;

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

  const reportError = (message: string) => {
    setFailure(message);
    onError(message);
    toast.error(message);
  };

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
      setError(field, { type: "server", message: messages[0] }, { shouldFocus: !mappedFieldError });
      mappedFieldError = true;
    }

    if (error.status === 401) {
      reportError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
      return;
    }

    if (error.status === 403) {
      reportError("Bạn không có quyền Admin để thực hiện thao tác này.");
      return;
    }

    if (!mappedFieldError || error.status === 409) {
      reportError(error.message);
    }
  };

  const submitForm = async (values: CategoryFormValues) => {
    setFailure("");
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
          const message = `Đã cập nhật danh mục "${values.name}" thành công.`;
          onSuccess(message);
          toast.success(message);
      } else {
        await categoryApi.create(payload);
        const message = `Đã tạo danh mục mới "${values.name}" thành công.`;
        onSuccess(message);
        toast.success(message);
      }

      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiProblemError) {
        applyApiErrors(error);
      } else {
        reportError(error instanceof Error ? error.message : "Thao tác thất bại.");
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onOpenAutoFocus={() => setFailure("")} className="rounded-2xl sm:max-w-lg">
          <p role="status" className="sr-only">{isSubmitting ? "Đang lưu danh mục…" : ""}</p>
        <Form {...form}>
        <form aria-busy={isSubmitting} onSubmit={handleSubmit(submitForm)} className="space-y-4" noValidate>
          {failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}
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
            <div className="flex items-start gap-2 rounded-xl border border-archived bg-archived/50 p-3 text-xs text-archived-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-archived-foreground" />
              <span>
                <strong>Lưu ý SEO:</strong> Hệ thống giữ nguyên slug để tránh làm hỏng
                các liên kết đã được chia sẻ.
              </span>
            </div>
          )}

          <div className="space-y-3.5 pt-2">
            <FormField
              control={control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold">Tên danh mục <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="VD: Món Tráng Miệng, Món Chay..." className="h-10 rounded-xl bg-background" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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

            <FormField
              control={control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold">Mô tả ngắn</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Giới thiệu tóm tắt về danh mục này..." rows={3} className="resize-none rounded-xl bg-background text-xs" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="imageUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold">URL ảnh đại diện danh mục</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="https://images.example.com/category.jpg" className="h-10 rounded-xl bg-background text-xs" />
                  </FormControl>
                  <FormMessage />
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
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="orderIndex"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold">Thứ tự hiển thị</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      min={0}
                      value={field.value ?? 0}
                      onChange={(event) => field.onChange(event.target.valueAsNumber)}
                      className="h-10 w-32 rounded-xl bg-background text-xs"
                    />
                  </FormControl>
                  <FormDescription className="text-[11px]">Số nhỏ hơn sẽ được hiển thị trước.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
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
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default CategoryModal;
