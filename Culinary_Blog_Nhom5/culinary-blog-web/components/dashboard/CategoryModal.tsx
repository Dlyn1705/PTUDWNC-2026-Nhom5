"use client";

import React, { useState } from "react";
import { AlertTriangle } from "lucide-react";
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
import { CategoryDto } from "@/types/category.types";

interface CategoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingCategory: CategoryDto | null;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

function slugifyVietnamese(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function CategoryModal({
  open,
  onOpenChange,
  editingCategory,
  onSuccess,
  onError,
}: CategoryModalProps) {
  const isEditing = !!editingCategory;

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [orderIndex, setOrderIndex] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [prevCategory, setPrevCategory] = useState<CategoryDto | null>(editingCategory);
  const [prevOpen, setPrevOpen] = useState(open);

  if (editingCategory !== prevCategory || open !== prevOpen) {
    setPrevCategory(editingCategory);
    setPrevOpen(open);
    if (editingCategory) {
      setName(editingCategory.name);
      setSlug(editingCategory.slug);
      setDescription(editingCategory.description || "");
      setImageUrl(editingCategory.imageUrl || "");
      setOrderIndex(editingCategory.orderIndex || 1);
    } else {
      setName("");
      setSlug("");
      setDescription("");
      setImageUrl("");
      setOrderIndex(1);
    }
    setErrors({});
  }

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    if (!isEditing) {
      setSlug(slugifyVietnamese(val));
    }
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim() || name.trim().length < 2) {
      errs.name = "Tên danh mục phải có ít nhất 2 ký tự.";
    } else if (name.trim().length > 50) {
      errs.name = "Tên danh mục không được vượt quá 50 ký tự.";
    }

    if (!slug.trim()) {
      errs.slug = "Đường dẫn slug là bắt buộc.";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      if (isEditing) {
        await categoryApi.update(editingCategory.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          imageUrl: imageUrl.trim() || undefined,
          orderIndex: Number(orderIndex) || 0,
        });
        onSuccess(`Đã cập nhật danh mục "${name}" thành công.`);
      } else {
        await categoryApi.create({
          name: name.trim(),
          description: description.trim() || undefined,
          imageUrl: imageUrl.trim() || undefined,
          orderIndex: Number(orderIndex) || 0,
        });
        onSuccess(`Đã tạo danh mục mới "${name}" thành công.`);
      }
      onOpenChange(false);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Thao tác thất bại.";
      onError(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-2xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">
              {isEditing ? "Chỉnh sửa danh mục" : "Tạo danh mục món ăn mới"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {isEditing
                ? "Cập nhật thông tin danh mục món ăn. Hãy cẩn trọng khi thay đổi slug."
                : "Nhập thông tin để tạo danh mục phân loại món ăn trên blog ẩm thực."}
            </DialogDescription>
          </DialogHeader>

          {/* SEO warning banner when editing */}
          {isEditing && (
            <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-600" />
              <span>
                <strong>Lưu ý SEO:</strong> Hệ thống giữ nguyên slug ban đầu để bảo toàn thứ hạng tìm kiếm và tránh gãy liên kết người đọc đã lưu.
              </span>
            </div>
          )}

          <div className="space-y-3.5 pt-2">
            {/* Name */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">
                Tên danh mục <span className="text-destructive">*</span>
              </label>
              <Input
                value={name}
                onChange={handleNameChange}
                placeholder="VD: Món Tráng Miệng, Món Chay..."
                className="rounded-xl h-10 bg-background"
              />
              {errors.name && (
                <p className="text-[11px] text-destructive font-medium">{errors.name}</p>
              )}
            </div>

            {/* Slug */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">
                Slug (Đường dẫn tĩnh) <span className="text-destructive">*</span>
              </label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                disabled={isEditing}
                placeholder="VD: mon-trang-mieng"
                className="rounded-xl h-10 font-mono text-xs bg-background disabled:opacity-60"
              />
              {errors.slug && (
                <p className="text-[11px] text-destructive font-medium">{errors.slug}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Mô tả ngắn</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Giới thiệu tóm tắt phong cách và nét đặc sắc của danh mục này..."
                rows={3}
                className="rounded-xl bg-background resize-none text-xs"
              />
            </div>

            {/* Image URL & Preview */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">
                URL ảnh đại diện danh mục
              </label>
              <div className="flex gap-2 items-center">
                <Input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  className="rounded-xl h-10 bg-background text-xs"
                />
              </div>

              {imageUrl && (
                <div className="mt-2 relative aspect-[16/9] max-w-xs overflow-hidden rounded-xl border border-border bg-muted">
                  <img
                    src={imageUrl}
                    alt="Preview"
                    className="size-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
              )}
            </div>

            {/* Order Index */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Thứ tự hiển thị</label>
              <Input
                type="number"
                min={0}
                value={orderIndex}
                onChange={(e) => setOrderIndex(Number(e.target.value))}
                className="rounded-xl h-10 bg-background w-32 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-border gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full px-4"
              onClick={() => onOpenChange(false)}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="rounded-full px-6 shadow-soft"
            >
              {submitting ? "Đang lưu..." : isEditing ? "Lưu thay đổi" : "Tạo danh mục"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CategoryModal;
