"use client";

import Link from "next/link";
import { Archive, Edit3, Globe2, RotateCcw, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Skeleton } from "@/components/common/Skeleton";
import { LoadingState } from "@/components/common/LoadingState";
import { ErrorState } from "@/components/common/ErrorState";
import { EmptyState } from "@/components/common/EmptyState";
import { useManagedRecipes } from "@/hooks/queries/useRecipes";
import { useRecipeMutations } from "@/hooks/mutations/useRecipeMutations";
import { errorPresentation } from "@/lib/errorPresentation";

export function RecipeStatusTable() {
  const { data, isPending, isError, error, refetch, isRefetching } = useManagedRecipes();
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
    <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
      <table className="w-full text-left text-sm">
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
                    <Button size="sm" disabled={busy} onClick={() => publish.mutate(recipe.id)}>
                      <Globe2 className="size-4" /> Xuất bản
                    </Button>
                  )}
                  {recipe.status === 1 && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => archive.mutate(recipe.id)}>
                      <Archive className="size-4" /> Lưu trữ
                    </Button>
                  )}
                  {recipe.status === 2 && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => restore.mutate(recipe.id)}>
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
                  title="Chưa có công thức nào"
                  description="Bạn chưa tạo công thức nào trong danh sách. Hãy tạo công thức đầu tiên ngay bây giờ."
                  action={
                    <Button asChild size="sm">
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
  );
}
