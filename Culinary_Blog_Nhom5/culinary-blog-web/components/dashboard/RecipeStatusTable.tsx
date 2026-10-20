"use client";

import Link from "next/link";
import { useState } from "react";
import { Archive, Edit3, Globe2, RotateCcw, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Skeleton } from "@/components/common/Skeleton";
import { LoadingState } from "@/components/common/LoadingState";
import { ErrorState } from "@/components/common/ErrorState";
import { EmptyState } from "@/components/common/EmptyState";
import { Pagination } from "@/components/common/Pagination";
import { useManagedRecipes } from "@/hooks/queries/useRecipes";
import { useRecipeMutations } from "@/hooks/mutations/useRecipeMutations";
import { errorPresentation } from "@/lib/errorPresentation";

export function RecipeStatusTable() {
  const [page, setPage] = useState(1);
  const { data, isPending, isError, error, refetch, isRefetching } = useManagedRecipes(undefined, page);
  const { publish, archive, restore } = useRecipeMutations();
  const busy = publish.isPending || archive.isPending || restore.isPending;

  if (isPending) {
    return (
      <LoadingState label="Đang tải danh sách công thức quản lý…">
        <div className="overflow-x-auto rounded-2xl border border-border bg-card p-6 shadow-soft space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </LoadingState>
    );
  }

  if (isError) {
    const presentation = errorPresentation(error);
    return (
      <ErrorState
        title="Không thể tải danh sách công thức"
        description={presentation.description}
        correlationId={presentation.correlationId}
        onRetry={presentation.canRetry ? async () => { await refetch(); } : undefined}
        isRetrying={isRefetching}
        retryLabel="Thử lại"
      />
    );
  }

  return (
    <div className="space-y-4" aria-busy={isRefetching}>
      <p role="status" className="text-sm text-muted-foreground">
        {isRefetching ? "Đang tải trang công thức…" : `Trang ${data?.meta.page ?? page} — ${data?.meta.totalCount ?? 0} công thức`}
      </p>
    <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Danh sách công thức quản lý</caption>
        <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-5 py-4">Công thức</th>
            <th className="px-5 py-4">Tác giả</th>
            <th className="px-5 py-4">Trạng thái</th>
            <th className="px-5 py-4">Danh mục</th>
            <th className="px-5 py-4 text-right">Thao tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data?.data.map((recipe) => (
            <tr key={recipe.id}>
              <td className="px-5 py-4 font-semibold">{recipe.title}</td>
              <td className="px-5 py-4 text-muted-foreground">{recipe.author?.displayName ?? "—"}</td>
              <td className="px-5 py-4"><StatusBadge status={recipe.status} /></td>
              <td className="px-5 py-4 text-muted-foreground">{recipe.category?.name ?? "—"}</td>
              <td className="px-5 py-4">
                <div className="flex justify-end gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/dashboard/recipes/${recipe.id}/edit`}><Edit3 className="size-4" /> Sửa</Link>
                  </Button>
                  {recipe.status === 0 && (
                    <Button size="sm" disabled={busy || isRefetching} onClick={() => publish.mutate(recipe.id)}>
                      <Globe2 className="size-4" /> Xuất bản
                    </Button>
                  )}
                  {recipe.status === 1 && (
                    <Button size="sm" variant="outline" disabled={busy || isRefetching} onClick={() => archive.mutate(recipe.id)}>
                      <Archive className="size-4" /> Lưu trữ
                    </Button>
                  )}
                  {recipe.status === 2 && (
                    <Button size="sm" variant="outline" disabled={busy || isRefetching} onClick={() => restore.mutate(recipe.id)}>
                      <RotateCcw className="size-4" /> Khôi phục
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {data?.data.length === 0 && (
            <tr>
              <td colSpan={5} className="p-8">
                <EmptyState
                  title={page > 1 ? "Trang này không còn công thức" : "Chưa có công thức nào"}
                  description={page > 1 ? "Danh sách có thể đã thay đổi. Quay về trang đầu để tải dữ liệu hiện tại." : "Bạn chưa tạo công thức nào trong danh sách. Hãy tạo công thức đầu tiên ngay bây giờ."}
                  action={
                    page > 1 ? <Button size="sm" onClick={() => setPage(1)}>Về trang đầu</Button> : <Button asChild size="sm">
                      <Link href="/dashboard/recipes/new">
                        <Plus className="mr-1.5 size-4" />
                        Tạo công thức mới
                      </Link>
                    </Button>
                  }
                />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
    <Pagination mode="button" page={data?.meta.page ?? page} totalPages={data?.meta.totalPages ?? 0}
      onPageChange={setPage} disabled={busy || isRefetching} ariaLabel="Phân trang công thức quản lý" />
    </div>
  );
}
