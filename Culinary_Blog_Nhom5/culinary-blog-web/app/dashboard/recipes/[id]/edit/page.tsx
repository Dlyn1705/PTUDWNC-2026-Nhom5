"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { recipeApi } from "@/lib/api/recipeApi";
import { DeleteRecipeModal } from "@/components/recipes/editor/DeleteRecipeModal";
import type { DifficultyValue, RecipeDto, RecipeWritePayload } from "@/types/recipe.types";

type RouteProps = { params: Promise<{ id: string }> };

export default function EditRecipePage({ params }: RouteProps) {
  const router = useRouter();
  const [recipeId, setRecipeId] = useState("");
  const [recipe, setRecipe] = useState<RecipeDto | null>(null);
  const [form, setForm] = useState<RecipeWritePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void params.then(({ id }) => {
      setRecipeId(id);
      return recipeApi.getById(id);
    }).then((loaded) => {
      if (!active) return;
      setRecipe(loaded);
      setForm({
        title: loaded.title,
        description: loaded.description,
        instructions: loaded.instructions ?? "",
        prepTime: loaded.prepTimeMinutes,
        cookTime: loaded.cookTimeMinutes,
        servings: loaded.servings,
        difficulty: loaded.difficulty,
        categoryId: loaded.categoryId,
        rowVersion: loaded.rowVersion,
      });
    }).catch(() => {
      if (active) setError("Không thể tải công thức hoặc bạn không có quyền truy cập.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [params]);

  const update = <K extends keyof RecipeWritePayload>(key: K, value: RecipeWritePayload[K]) => {
    setForm((current) => current ? { ...current, [key]: value } : current);
  };

  const save = async () => {
    if (!form || !recipeId) return;
    setSaving(true);
    setError("");
    try {
      const result = await recipeApi.update(recipeId, form);
      setForm({ ...form, rowVersion: result.rowVersion });
      setRecipe((current) => current ? { ...current, rowVersion: result.rowVersion } : current);
    } catch (reason) {
      const status = (reason as { response?: { status?: number } })?.response?.status;
      setError(status === 409
        ? "Công thức đã được người khác thay đổi. Hãy tải lại trước khi lưu."
        : "Không thể lưu công thức. Vui lòng kiểm tra dữ liệu và thử lại.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await recipeApi.delete(recipeId);
      router.replace("/dashboard/recipes");
    } catch {
      setError("Không thể xóa công thức. Vui lòng thử lại.");
      setDeleting(false);
    }
  };

  if (loading) return <main className="p-8">Đang tải công thức...</main>;
  if (!recipe || !form) return <main className="p-8 text-red-600">{error || "Không tìm thấy công thức."}</main>;

  return (
    <main className="min-h-screen bg-gray-50 py-10">
      <div className="mx-auto max-w-3xl space-y-6 px-4">
        <div>
          <p className="text-sm font-medium text-primary">Dashboard / Recipes / Edit</p>
          <h1 className="mt-2 text-3xl font-bold text-gray-900">Chỉnh sửa công thức</h1>
          <p className="mt-2 text-sm text-gray-500">RowVersion được gửi cùng mỗi lần lưu để phát hiện xung đột.</p>
        </div>

        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        <section className="space-y-5 rounded-2xl bg-white p-6 shadow-sm">
          <label className="block text-sm font-medium text-gray-700">
            Tên món ăn
            <input value={form.title} onChange={(event) => update("title", event.target.value)} className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3" />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Mô tả
            <textarea value={form.description ?? ""} onChange={(event) => update("description", event.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3" />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Hướng dẫn
            <textarea value={form.instructions ?? ""} onChange={(event) => update("instructions", event.target.value)} rows={6} className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3" />
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            {([["prepTime", "Chuẩn bị"], ["cookTime", "Nấu"], ["servings", "Khẩu phần"]] as const).map(([key, label]) => (
              <label key={key} className="text-sm font-medium text-gray-700">
                {label}
                <input type="number" min={key === "servings" ? 1 : 0} value={form[key]} onChange={(event) => update(key, Number(event.target.value))} className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3" />
              </label>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">
              Độ khó
              <select value={form.difficulty} onChange={(event) => update("difficulty", Number(event.target.value) as DifficultyValue)} className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3">
                <option value={1}>Dễ</option><option value={2}>Trung bình</option><option value={3}>Khó</option><option value={4}>Chuyên gia</option>
              </select>
            </label>
            <label className="text-sm font-medium text-gray-700">
              Category ID
              <input value={form.categoryId} onChange={(event) => update("categoryId", event.target.value)} className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3" />
            </label>
          </div>
        </section>

        <div className="flex flex-wrap justify-between gap-3">
          <button type="button" onClick={() => setShowDelete(true)} className="rounded-xl border border-red-200 px-5 py-3 font-medium text-red-600">Xóa công thức</button>
          <button type="button" onClick={() => void save()} disabled={saving} className="rounded-xl bg-primary px-6 py-3 font-medium text-primary-foreground disabled:opacity-60">{saving ? "Đang lưu..." : "Lưu thay đổi"}</button>
        </div>
      </div>
      <DeleteRecipeModal open={showDelete} busy={deleting} onCancel={() => setShowDelete(false)} onConfirm={() => void remove()} />
    </main>
  );
}
