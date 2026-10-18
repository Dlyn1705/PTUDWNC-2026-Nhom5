"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ApiProblemError, toApiProblemError } from "@/lib/api/problemDetails";
import { recipeApi } from "@/lib/api/recipeApi";
import ImageGalleryManager from "@/components/recipes/editor/ImageGalleryManager";
import { DeleteRecipeModal } from "@/components/recipes/editor/DeleteRecipeModal";
import type { DifficultyValue, RecipeDto, RecipeWritePayload } from "@/types/recipe.types";
import IngredientManager from "@/components/recipes/editor/IngredientManager";
import { useSession } from "next-auth/react";
import { categoryApi } from "@/lib/api/categoryApi";
import { validateRecipeUpdate } from "@/lib/validations/updateRecipe";
import type { CategoryDto } from "@/types/category.types";
import { useUnsavedRecipe } from "@/hooks/useUnsavedRecipe";
import { useRecipeValidation } from "@/hooks/useRecipeValidation";

type RouteProps = { params: Promise<{ id: string }> };
const snapshot = (value: RecipeWritePayload | null) => value ? JSON.stringify({ ...value, rowVersion: undefined }) : "";

export default function EditRecipePage({ params }: RouteProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const mutationInFlight = useRef(false);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const { data: session, status: sessionStatus } = useSession();
  const savingRef = useRef(false);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [categoryError, setCategoryError] = useState("");
  const [success, setSuccess] = useState("");
  const [conflict, setConflict] = useState(false);
  const [reload, setReload] = useState(0);
  const [recipeId, setRecipeId] = useState("");
  const activeRecipeId = useRef("");
  const [recipe, setRecipe] = useState<RecipeDto | null>(null);
  const [form, setForm] = useState<RecipeWritePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [error, setError] = useState("");
  const [baseline, setBaseline] = useState("");
  const [ingredientDirty, setIngredientDirty] = useState(false);
  const validation = useRecipeValidation();
  // RowVersion changes when images/ingredients are saved; it is not an editable field.
  const { confirmDiscard, allowNavigation } = useUnsavedRecipe(Boolean(form && baseline && snapshot(form) !== baseline) || ingredientDirty);

  useEffect(() => {
    let active = true;
    void params.then(({ id }) => {
      if (!active) return null;
      activeRecipeId.current = id;
      setLoading(true);
      setError("");
      setSuccess("");
      setConflict(false);
      setCategoryError("");
      setRecipe(null);
      setForm(null);
      categoryApi.getAll().then(items => { if (active) setCategories(items); })
        .catch(() => { if (active) setCategoryError("Không tải được danh mục. Hãy tải lại trước khi lưu."); });
      setRecipeId(id);
      return recipeApi.getById(id);
    }).then((loaded) => {
      if (!active || !loaded) return;
      setRecipe(loaded);
      const initial = {
        title: loaded.title,
        description: loaded.description,
        instructions: loaded.instructions ?? "",
        prepTime: loaded.prepTimeMinutes,
        cookTime: loaded.cookTimeMinutes,
        servings: loaded.servings,
        difficulty: loaded.difficulty,
        categoryId: loaded.categoryId,
        rowVersion: loaded.rowVersion,
      };
      setForm(initial);
      setBaseline(snapshot(initial));
    }).catch(() => {
      if (active) setError("Không thể tải công thức hoặc bạn không có quyền truy cập.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; activeRecipeId.current = ""; };
  }, [params, reload]);

  const update = <K extends keyof RecipeWritePayload>(key: K, value: RecipeWritePayload[K]) => {
    setSuccess("");
    setForm((current) => current ? { ...current, [key]: value } : current);
  };

  const save = async () => {
    if (!form || !recipeId || savingRef.current || deleting || conflict || categoryError) return;
    let payload: RecipeWritePayload;
    try { payload = validateRecipeUpdate(form); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Dữ liệu không hợp lệ."); return; }
    savingRef.current = true;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const result = await recipeApi.update(recipeId, payload);
      if (activeRecipeId.current !== recipeId) return;
      setForm({ ...payload, rowVersion: result.rowVersion });
      setBaseline(snapshot(payload));
      setRecipe((current) => current ? { ...current, title: payload.title,
        description: payload.description ?? "", instructions: payload.instructions ?? "",
        prepTimeMinutes: payload.prepTime, cookTimeMinutes: payload.cookTime, servings: payload.servings,
        difficulty: payload.difficulty, categoryId: payload.categoryId, rowVersion: result.rowVersion } : current);
      setSuccess("Đã lưu thay đổi thành công.");
    } catch (reason) {
      if (activeRecipeId.current !== recipeId) return;
      const response = (reason as { response?: { status?: number; data?: { detail?: string; errors?: Record<string, string[]> } } })?.response;
      const status = response?.status;
      setConflict(status === 409);
      setError(status === 409
        ? "Công thức đã được người khác thay đổi. Hãy tải lại trước khi lưu."
        : status === 403 ? "Bạn không có quyền cập nhật công thức này."
        : status === 401 ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
        : status === 404 ? "Công thức hoặc danh mục không còn tồn tại. Hãy tải lại."
        : Object.values(response?.data?.errors ?? {}).flat().join(" ") || response?.data?.detail || "Không thể lưu công thức. Vui lòng kiểm tra dữ liệu và thử lại.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!recipeId || savingRef.current || deleting || mutationInFlight.current) return;
    mutationInFlight.current = true;
    setDeleting(true);
    setError("");
    try {
      await recipeApi.delete(recipeId);
      await queryClient.invalidateQueries({ queryKey: ["managed-recipes"] });
      allowNavigation();
      router.replace("/dashboard/recipes?deleted=1");
      router.refresh();
    } catch (reason) {
      const problem = toApiProblemError(reason);
      const status = problem instanceof ApiProblemError ? problem.status : undefined;
      setError(status === 409
        ? "Công thức vừa được thay đổi. Hãy tải lại trang và kiểm tra trước khi xóa."
        : status === 401 ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
        : status === 403 ? "Bạn không có quyền xóa công thức này."
        : status === 404 ? "Công thức không còn tồn tại hoặc đã bị xóa."
        : "Không thể xóa công thức. Vui lòng thử lại.");
      setShowDelete(false);
      mutationInFlight.current = false;
      setDeleting(false);
    }
  };

  if (loading || sessionStatus === "loading") return <div className="p-8">Đang tải công thức...</div>;
  if (!recipe || !form) return <div className="p-8"><p role="alert" className="text-red-600">{error || "Không tìm thấy công thức."}</p>
    <button type="button" onClick={() => setReload(n => n + 1)} className="mt-4 underline">Thử tải lại</button></div>;
  const isAdmin = session?.user.roles?.includes("Admin") || session?.user.role === "Admin";
  if (!session?.user || (!isAdmin && (!session.user.roles?.includes("Author") || recipe.author.id !== session.user.id)))
    return <div role="alert" className="p-8 text-red-600">Bạn không có quyền cập nhật công thức này.</div>;

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="mx-auto max-w-3xl space-y-6 px-4">
        <div>
          <p className="text-sm font-medium text-primary">Dashboard / Recipes / Edit</p>
          <h1 className="mt-2 text-3xl font-bold text-gray-900">Chỉnh sửa công thức</h1>
          <p className="mt-2 text-sm text-gray-500">Chỉnh sửa nội dung; đường dẫn và trạng thái công thức được giữ nguyên.</p>
        </div>

        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {categoryError && <p role="alert">{categoryError}</p>}
        {success && <p role="status" className="text-green-700">{success}</p>}
        <button type="button" disabled={saving || deleting} onClick={() => { if (confirmDiscard()) setReload(n => n + 1); }} className="text-sm underline">
          Tải bản mới (bỏ thay đổi đang nhập)
        </button>

        <IngredientManager key={`ingredients-${recipeId}-${reload}`} recipeId={recipeId} onDirtyChange={setIngredientDirty} parentVersion={recipe.rowVersion} onMutation={async () => {
          try {
            const fresh = await recipeApi.getById(recipeId);
            if (activeRecipeId.current !== fresh.id) return;
            const keys = ["title", "description", "instructions", "prepTimeMinutes", "cookTimeMinutes", "servings", "difficulty", "categoryId", "status"] as const;
            if (keys.some(key => fresh[key] !== recipe[key])) {
              setError("Nội dung công thức đã đổi ở nơi khác. Hãy tải lại trang trước khi lưu nội dung.");
              return;
            }
            setForm(current => current ? { ...current, rowVersion: fresh.rowVersion } : current);
            setRecipe(current => current ? { ...current, rowVersion: fresh.rowVersion } : current);
          } catch { setError("Nguyên liệu đã lưu; hãy tải lại công thức trước khi lưu nội dung."); }
        }} />

        <form noValidate onChangeCapture={event => validation.clear(event.target)} onSubmit={event => { event.preventDefault(); if (validation.validate(event.currentTarget)) void save(); }}>
        <fieldset disabled={saving || deleting} className="space-y-5 rounded-2xl bg-white p-6 shadow-sm">
          <label className="block text-sm font-medium text-gray-700">
            Tên món ăn
            <input {...validation.field("edit-title", "edit-title-hint")} required minLength={3} maxLength={200} value={form.title} onChange={(event) => update("title", event.target.value)} className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3" />
            <span id="edit-title-hint" className="text-xs text-gray-500">Từ 3 đến 200 ký tự.</span>
            {validation.fieldError("edit-title")}
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Mô tả
            <textarea {...validation.field("edit-description")} maxLength={2000} value={form.description ?? ""} onChange={(event) => update("description", event.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3" />
            {validation.fieldError("edit-description")}
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Hướng dẫn
            <textarea {...validation.field("edit-instructions")} maxLength={10000} value={form.instructions ?? ""} onChange={(event) => update("instructions", event.target.value)} rows={6} className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3" />
            {validation.fieldError("edit-instructions")}
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            {([["prepTime", "Chuẩn bị"], ["cookTime", "Nấu"], ["servings", "Khẩu phần"]] as const).map(([key, label]) => (
              <label key={key} className="text-sm font-medium text-gray-700">
                {label}
                <input {...validation.field(`edit-${key}`)} required type="number" step={1} max={2147483647} min={key === "servings" ? 1 : 0} value={Number.isNaN(form[key]) ? "" : form[key]} onChange={(event) => update(key, event.target.value === "" ? NaN : Number(event.target.value))} className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3" />
                {validation.fieldError(`edit-${key}`)}
              </label>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">
              Độ khó
              <select {...validation.field("edit-difficulty")} required value={form.difficulty} onChange={(event) => update("difficulty", Number(event.target.value) as DifficultyValue)} className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3">
                <option value={1}>Dễ</option><option value={2}>Trung bình</option><option value={3}>Khó</option><option value={4}>Chuyên gia</option>
              </select>
            </label>
            <label className="text-sm font-medium text-gray-700">
              Danh mục
              <select {...validation.field("edit-category")} required value={form.categoryId} onChange={(event) => update("categoryId", event.target.value)} className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3">
                {!categories.some(item => item.id === form.categoryId) && <option value={form.categoryId} disabled>Danh mục hiện tại không khả dụng — hãy chọn lại</option>}
                {categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          </div>
        </fieldset>

        <ImageGalleryManager key={`images-${recipeId}`} recipeId={recipeId} archived={recipe.status === 2} onMutation={() => {
          // Gallery mutations rotate the aggregate version; preserve unsaved form fields.
          void recipeApi.getById(recipeId).then(fresh => {
            if (activeRecipeId.current !== fresh.id) return;
            const keys = ["title", "description", "instructions", "prepTimeMinutes", "cookTimeMinutes", "servings", "difficulty", "categoryId", "status"] as const;
            if (keys.some(key => fresh[key] !== recipe[key])) {
              setError("Nội dung công thức đã được thay đổi ở nơi khác. Hãy tải lại trang trước khi lưu.");
              return;
            }
            setForm(current => current ? { ...current, rowVersion: fresh.rowVersion } : current);
            setRecipe(current => current ? { ...current, rowVersion: fresh.rowVersion } : current);
          }).catch(() => setError("Ảnh đã thay đổi. Hãy tải lại công thức trước khi lưu."));
        }} />

        <div className="flex flex-wrap justify-between gap-3">
          <button ref={deleteButton} type="button" disabled={saving || deleting} onClick={() => setShowDelete(true)} className="rounded-xl border border-red-200 px-5 py-3 font-medium text-red-600">Xóa công thức</button>
          <button type="submit" disabled={saving || deleting || conflict || Boolean(categoryError) || !categories.some(item => item.id === form.categoryId)} className="rounded-xl bg-primary px-6 py-3 font-medium text-primary-foreground disabled:opacity-60">{saving ? "Đang lưu..." : "Lưu thay đổi"}</button>
        </div>
        </form>
      </div>
      <DeleteRecipeModal open={showDelete} busy={deleting} returnFocusRef={deleteButton} onCancel={() => setShowDelete(false)} onConfirm={() => void remove()} />
    </div>
  );
}
