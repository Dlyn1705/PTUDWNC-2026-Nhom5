"use client";

import React, { useState, useMemo } from "react";
import {
  FolderPlus,
  CheckCircle2,
  AlertCircle,
  Layers,
  UtensilsCrossed,
  Search,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CategoryDto } from "@/types/category.types";
import { AdminCategoryTable } from "@/components/dashboard/categories/AdminCategoryTable";
import { AdminCategoryFormModal } from "@/components/dashboard/categories/AdminCategoryFormModal";
import { AdminDeleteCategoryModal } from "@/components/dashboard/categories/AdminDeleteCategoryModal";
import { RouteLoading } from "@/components/common/RouteLoading";
import { ErrorState } from "@/components/common/ErrorState";
import { errorPresentation } from "@/lib/errorPresentation";
import { useCategories } from "@/hooks/queries/useCategories";

export default function AdminCategoriesPage() {
  const { data: categories = [], isPending: loading, isError, error, isFetching, refetch } = useCategories();
  const [search, setSearch] = useState("");

  // Create / Edit modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryDto | null>(null);

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState<CategoryDto | null>(null);

  // Feedback Notification banner
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const showNotification = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  };

  const handleCreateNew = () => {
    setEditingCategory(null);
    setModalOpen(true);
  };

  const handleEdit = (category: CategoryDto) => {
    setEditingCategory(category);
    setModalOpen(true);
  };

  const handleDelete = (category: CategoryDto) => {
    setDeletingCategory(category);
    setDeleteModalOpen(true);
  };

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return categories;
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.slug.toLowerCase().includes(search.toLowerCase())
    );
  }, [categories, search]);

  const totalRecipes = categories.reduce((sum, c) => sum + (c.recipeCount || 0), 0);

  if (loading) return <RouteLoading variant="table" label="Đang tải danh mục quản lý…" />;
  if (isError) {
    const presentation = errorPresentation(error);
    return <div className="p-6"><ErrorState title="Không thể tải danh mục quản lý" headingLevel="h1"
      description={presentation.description} correlationId={presentation.correlationId}
      onRetry={presentation.canRetry ? async () => { await refetch(); } : undefined} isRetrying={isFetching} /></div>;
  }

  return (
    <div className="page-container space-y-8 py-8">
      {/* Toast Feedback Notification Banner */}
      {notification && (
        <div
          className={`flex items-center gap-2.5 rounded-2xl border p-4 text-xs font-medium shadow-soft animate-in slide-in-from-top-2 duration-200 ${
            notification.type === "success"
              ? "border-success/30 bg-success/10 text-success"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="size-4 shrink-0 text-success" />
          ) : (
            <AlertCircle className="size-4 shrink-0 text-destructive" />
          )}
          <span className="flex-1">{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="text-xs opacity-70 hover:opacity-100 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header Banner & Action Button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="size-3" />
            <span>Phân hệ Quản trị Admin</span>
          </div>

          <h1 className="mt-2 font-display text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Quản Lý Danh Mục Món Ăn
          </h1>

          <p className="mt-1 text-xs sm:text-sm text-muted-foreground max-w-xl">
            Tạo, cập nhật và sắp xếp các danh mục ẩm thực cho hệ thống. Danh mục đang chứa công thức sẽ được bảo vệ chống xóa nhầm.
          </p>
        </div>

        <Button
          onClick={handleCreateNew}
          className="rounded-full px-5 h-10 shadow-soft gap-2 font-semibold"
        >
          <FolderPlus className="size-4" />
          <span>Tạo danh mục mới</span>
        </Button>
      </div>

      {/* Quick Statistics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
            <Layers className="size-4 text-primary" />
            <span>Tổng số danh mục</span>
          </div>
          <p className="font-display text-2xl font-bold tabular-nums text-foreground">
            {categories.length}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
            <UtensilsCrossed className="size-4 text-success" />
            <span>Tổng công thức liên kết</span>
          </div>
          <p className="font-display text-2xl font-bold tabular-nums text-foreground">
            {totalRecipes}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
            <Sparkles className="size-4 text-warning" />
            <span>Trung bình / Danh mục</span>
          </div>
          <p className="font-display text-2xl font-bold tabular-nums text-foreground">
            {categories.length > 0 ? (totalRecipes / categories.length).toFixed(1) : 0} món
          </p>
        </div>
      </div>

      {/* Search and Table Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm nhanh danh mục theo tên hoặc slug..."
              className="pl-9.5 pr-4 h-10 rounded-xl bg-card border-border text-xs"
            />
          </div>

          <span className="text-xs text-muted-foreground tabular-nums">
            Hiển thị <strong>{filteredCategories.length}</strong> danh mục
          </span>
        </div>

        {/* Modularized Category Table */}
        <AdminCategoryTable
          categories={filteredCategories}
          isLoading={loading}
          filtered={Boolean(search.trim())}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </div>

      {/* Modal Tạo mới / Cập nhật Danh mục */}
      <AdminCategoryFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        editingCategory={editingCategory}
        onSuccess={(msg) => {
          showNotification("success", msg);
        }}
        onError={(msg) => showNotification("error", msg)}
      />

      {/* Modal Xác nhận Xóa Danh mục an toàn */}
      <AdminDeleteCategoryModal
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        category={deletingCategory}
        onSuccess={(msg) => {
          showNotification("success", msg);
        }}
        onError={(msg) => showNotification("error", msg)}
      />
    </div>
  );
}
