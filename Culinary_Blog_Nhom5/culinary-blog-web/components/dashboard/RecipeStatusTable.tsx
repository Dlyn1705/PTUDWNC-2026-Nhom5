"use client";

import Link from "next/link";
import { Archive, Edit3, Globe2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useManagedRecipes } from "@/hooks/queries/useRecipes";
import { useRecipeMutations } from "@/hooks/mutations/useRecipeMutations";

export function RecipeStatusTable() {
  const { data, isPending, isError, refetch } = useManagedRecipes();
  const { publish, archive, unarchive } = useRecipeMutations();
  const busy = publish.isPending || archive.isPending || unarchive.isPending;

  if (isPending) {
    return <div className="h-64 animate-pulse rounded-2xl bg-muted" />;
  }

  if (isError) {
    return (
      <div role="alert" className="rounded-2xl border border-destructive/30 p-6">
        <p>Không thể tải danh sách công thức.</p>
        <Button className="mt-4" variant="outline" onClick={() => void refetch()}>
          Thử lại
        </Button>
      </div>
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
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => unarchive.mutate(recipe.id)}>
                      <RotateCcw className="size-4" /> Khôi phục
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {data?.data.length === 0 && (
            <tr><td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">Chưa có công thức nào.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
