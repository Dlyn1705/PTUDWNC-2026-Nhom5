"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { recipeApi } from "@/lib/api/recipeApi";
import type { ManagedRecipeDto, PagedResult } from "@/types/recipe.types";

export default function DashboardRecipesPage() {
  const [result, setResult] = useState<PagedResult<ManagedRecipeDto> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    recipeApi.getMine().then(setResult).catch(() => setError("Không tải được danh sách. Hãy đăng nhập bằng tài khoản Author/Admin rồi thử lại."))
      .finally(() => setLoading(false));
  }, []);

  return <main className="mx-auto max-w-6xl p-6">
    <div className="mb-6 flex items-center justify-between gap-4">
      <div><h1 className="text-3xl font-bold">Công thức của tôi</h1><p className="mt-1 text-gray-600">Quản lý công thức bạn đã tạo.</p></div>
      <Link className="rounded-lg bg-orange-600 px-4 py-2 font-medium text-white" href="/dashboard/recipes/new">Tạo công thức</Link>
    </div>
    {loading && <p>Đang tải…</p>}
    {error && <p role="alert" className="rounded bg-red-50 p-4 text-red-700">{error}</p>}
    {!loading && !error && result?.items.length === 0 && <p>Bạn chưa có công thức nào.</p>}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{result?.items.map(recipe => <article key={recipe.id} className="rounded-xl border p-4">
      <h2 className="text-lg font-semibold">{recipe.title}</h2><p className="text-sm text-gray-600">{recipe.category?.name ?? "Chưa phân loại"} · {recipe.status === 1 ? "Đã xuất bản" : recipe.status === 2 ? "Đã lưu trữ" : "Bản nháp"}</p>
      <p className="my-3 line-clamp-2 text-sm">{recipe.description}</p><div className="flex gap-3 text-sm"><Link className="text-blue-700 underline" href={`/dashboard/recipes/${recipe.id}/edit`}>Chỉnh sửa</Link><button className="text-red-700 underline" onClick={async () => { if (!window.confirm("Xóa công thức này?")) return; try { await recipeApi.delete(recipe.id); setResult(current => current ? { ...current, items: current.items.filter(item => item.id !== recipe.id), totalCount: current.totalCount - 1 } : current); } catch { setError("Không thể xóa công thức."); } }}>Xóa</button></div>
    </article>)}</div>
  </main>;
}
