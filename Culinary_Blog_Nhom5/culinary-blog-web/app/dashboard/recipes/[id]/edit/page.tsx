"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import RecipeForm from "@/components/recipes/editor/RecipeForm";
import IngredientManager from "@/components/recipes/editor/IngredientManager";
import StepManager from "@/components/recipes/editor/StepManager";
import ImageGalleryManager from "@/components/recipes/editor/ImageGalleryManager";
import { DeleteRecipeModal } from "@/components/recipes/editor/DeleteRecipeModal";
import { RouteLoading } from "@/components/common/RouteLoading";
import { ErrorState } from "@/components/common/ErrorState";
import { UnauthorizedState } from "@/components/common/UnauthorizedState";
import { recipeEditorApi } from "@/lib/api/recipeEditorApi";
import { categoryApi } from "@/lib/api/categoryApi";
import { toApiProblemError } from "@/lib/api/problemDetails";
import { errorPresentation } from "@/lib/errorPresentation";
import { validateRecipeUpdate } from "@/lib/validations/updateRecipe";
import { nutritionFields, RecipeFormValidationError, type RecipeEditorValues } from "@/lib/validations/recipeEditor";
import { recipeKeys } from "@/hooks/queries/recipeKeys";
import { useUnsavedRecipe } from "@/hooks/useUnsavedRecipe";
import type { DifficultyValue, RecipeDto } from "@/types/recipe.types";

type RouteProps = { params: Promise<{ id: string }> };
type Presentation = { status?: number; correlationId?: string; description: string; canRetry: boolean };
const basicKeys = ["title", "description", "instructions", "prepTimeMinutes", "cookTimeMinutes", "servings", "difficulty", "categoryId", "status"] as const;
const editorValues = (recipe: RecipeDto): Partial<RecipeEditorValues> => ({ title: recipe.title,
  description: recipe.description ?? "", instructions: recipe.instructions ?? "", prepTime: String(recipe.prepTimeMinutes),
  cookTime: String(recipe.cookTimeMinutes), servings: String(recipe.servings),
  difficulty: String(recipe.difficulty) as RecipeEditorValues["difficulty"], categoryId: recipe.categoryId,
  calories: recipe.nutrition?.calories == null ? "" : String(recipe.nutrition.calories),
  protein: recipe.nutrition?.protein == null ? "" : String(recipe.nutrition.protein),
  carbohydrates: (recipe.nutrition?.carbohydrates ?? recipe.nutrition?.carbs) == null ? "" : String(recipe.nutrition.carbohydrates ?? recipe.nutrition?.carbs),
  fat: recipe.nutrition?.fat == null ? "" : String(recipe.nutrition.fat),
  fiber: recipe.nutrition?.fiber == null ? "" : String(recipe.nutrition.fiber),
  sodium: recipe.nutrition?.sodium == null ? "" : String(recipe.nutrition.sodium) });

const nutritionPayload = (values: RecipeEditorValues) => Object.fromEntries(
  nutritionFields.map(field => [field, values[field].trim() ? Number(values[field]) : null]),
) as { calories: number | null; protein: number | null; carbohydrates: number | null; fat: number | null; fiber: number | null; sodium: number | null };

const nutritionFromRecipe = (recipe: RecipeDto) => ({
  calories: recipe.nutrition?.calories ?? null,
  protein: recipe.nutrition?.protein ?? null,
  carbohydrates: recipe.nutrition?.carbohydrates ?? recipe.nutrition?.carbs ?? null,
  fat: recipe.nutrition?.fat ?? null,
  fiber: recipe.nutrition?.fiber ?? null,
  sodium: recipe.nutrition?.sodium ?? null,
});

export default function EditRecipePage({ params }: RouteProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isInitializing, isAdmin, isAuthor } = useAuth();
  const categories = useQuery({ queryKey: ["recipe-editor-categories"], queryFn: categoryApi.getAll });
  const [recipe, setRecipe] = useState<RecipeDto | null>(null);
  const [initial, setInitial] = useState<Partial<RecipeEditorValues>>({});
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Presentation | null>(null);
  const [mutationError, setMutationError] = useState<Presentation | null>(null);
  const [outOfDate, setOutOfDate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [success, setSuccess] = useState("");
  const [basicDirty, setBasicDirty] = useState(false);
  const [ingredientDirty, setIngredientDirty] = useState(false);
  const [stepDirty, setStepDirty] = useState(false);
  const activeId = useRef("");
  const mutating = useRef(false);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const { confirmDiscard, allowNavigation } = useUnsavedRecipe(basicDirty || ingredientDirty || stepDirty);

  useEffect(() => {
    let active = true;
    void params.then(async ({ id }) => {
      if (!active) return;
      activeId.current = id;
      setLoading(true); setRecipe(null); setLoadError(null); setMutationError(null); setOutOfDate(false); setSuccess("");
      const loaded = await recipeEditorApi.getById(id);
      if (active) { setRecipe(loaded); setInitial(editorValues(loaded)); }
    }).catch(reason => { if (active) setLoadError(errorPresentation(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; activeId.current = ""; };
  }, [params, reload]);

  const reloadRecipe = () => { if (!saving && !deleting && confirmDiscard()) setReload(value => value + 1); };
  const save = async (values: RecipeEditorValues) => {
    if (!recipe || mutating.current || outOfDate) throw new RecipeFormValidationError("Hãy tải lại công thức trước khi lưu nội dung.");
    const payload = validateRecipeUpdate({ title: values.title, description: values.description, instructions: values.instructions,
      prepTime: Number(values.prepTime), cookTime: Number(values.cookTime), servings: Number(values.servings),
      difficulty: Number(values.difficulty) as DifficultyValue, categoryId: values.categoryId, rowVersion: recipe.rowVersion });
    mutating.current = true; setSaving(true); setSuccess("");
    try {
      const result = await recipeEditorApi.update(recipe.id, payload);
      if (activeId.current !== recipe.id) return;
      const nutrition = nutritionPayload(values);
      setRecipe(current => current ? { ...current, title: payload.title, description: payload.description ?? "",
        instructions: payload.instructions ?? "", prepTimeMinutes: payload.prepTime, cookTimeMinutes: payload.cookTime,
        servings: payload.servings, difficulty: payload.difficulty, categoryId: payload.categoryId,
        rowVersion: result.rowVersion } : current);
      const currentNutrition = nutritionFromRecipe(recipe);
      const nutritionChanged = nutritionFields.some(field => nutrition[field] !== currentNutrition[field]);
      if (nutritionChanged) {
        const nutritionResult = await recipeEditorApi.updateNutrition(recipe.id, {
          ...nutrition,
          rowVersion: result.rowVersion,
        });
        if (activeId.current !== recipe.id) return;
        setRecipe(current => current ? {
          ...current,
          nutrition: {
            calories: nutrition.calories ?? 0,
            protein: nutrition.protein ?? 0,
            carbohydrates: nutrition.carbohydrates ?? 0,
            fat: nutrition.fat ?? 0,
            fiber: nutrition.fiber ?? 0,
            sodium: nutrition.sodium ?? 0,
          },
          rowVersion: nutritionResult.rowVersion,
        } : current);
      }
      setSuccess("Đã lưu thay đổi thành công.");
      void queryClient.invalidateQueries({ queryKey: recipeKeys.managed() });
    } finally { mutating.current = false; setSaving(false); }
  };

  const refreshVersion = async () => {
    if (!recipe) return;
    try {
      const fresh = await recipeEditorApi.getById(recipe.id);
      if (activeId.current !== fresh.id) return;
      const nutritionChanged = nutritionFields.some(field => {
        const current = nutritionFromRecipe(recipe)[field];
        const next = nutritionFromRecipe(fresh)[field];
        return current !== next;
      });
      if (basicKeys.some(key => fresh[key] !== recipe[key]) || nutritionChanged) {
        setOutOfDate(true);
        setMutationError({ description: "Nội dung công thức đã đổi ở nơi khác. Bản đang nhập được giữ; hãy tải bản mới trước khi lưu.", canRetry: true });
      } else setRecipe(current => current ? { ...current, rowVersion: fresh.rowVersion } : current);
    } catch {
      setOutOfDate(true);
      setMutationError({ description: "Thao tác đã hoàn tất nhưng chưa tải được phiên bản mới. Hãy tải lại công thức trước khi lưu nội dung.", canRetry: true });
    }
  };
  const remove = async () => {
    if (!recipe || mutating.current) return;
    mutating.current = true; setDeleting(true); setMutationError(null);
    try {
      await recipeEditorApi.delete(recipe.id);
      queryClient.removeQueries({ queryKey: recipeKeys.managed() });
      allowNavigation(); router.replace("/dashboard/recipes?deleted=1"); router.refresh();
    } catch (reason) {
      const problem = toApiProblemError(reason);
      const presentation = errorPresentation(problem);
      setMutationError({ ...presentation, description: problem.status === 403 ? "Bạn không có quyền xóa công thức này."
        : problem.status === 404 ? "Công thức không còn tồn tại hoặc đã bị xóa."
        : problem.status === 409 ? "Công thức vừa được thay đổi. Hãy tải lại trang và kiểm tra trước khi xóa."
        : presentation.description });
      setShowDelete(false); setDeleting(false); mutating.current = false;
    }
  };

  if (loading || isInitializing) return <RouteLoading variant="form" label="Đang tải công thức…" />;
  if (!recipe && (loadError?.status === 401 || loadError?.status === 403)) return <div className="p-8">
    <UnauthorizedState mode={loadError.status === 401 ? "unauthenticated" : "forbidden"}
      loginHref={`/auth/login?callbackUrl=${encodeURIComponent("/dashboard/recipes")}`}
      description={loadError.description} focusOnMount />
  </div>;
  if (!recipe) return <div className="p-8"><ErrorState headingLevel="h1" title="Không thể tải công thức"
    description={loadError?.description ?? "Không tìm thấy công thức."} correlationId={loadError?.correlationId}
    onRetry={loadError?.canRetry ? reloadRecipe : undefined} /></div>;
  if (!user || (!isAdmin && (!isAuthor || recipe.author.id !== user.id)))
    return <div className="p-8"><UnauthorizedState mode={user ? "forbidden" : "unauthenticated"}
      loginHref={`/auth/login?callbackUrl=${encodeURIComponent(`/dashboard/recipes/${recipe.id}/edit`)}`}
      title="Bạn không có quyền cập nhật công thức này."
      description="Chỉ tác giả sở hữu công thức hoặc quản trị viên được chỉnh sửa." focusOnMount /></div>;

  return <div className="min-h-screen bg-background py-10"><div className="page-container max-w-3xl space-y-6">
    <header><p className="text-sm font-medium text-primary">Dashboard / Recipes / Edit</p>
      <h1 className="mt-2 font-display text-3xl font-bold text-foreground">Chỉnh sửa công thức</h1>
      <p className="mt-2 text-sm text-muted-foreground">Chỉnh sửa nội dung; đường dẫn và trạng thái công thức được giữ nguyên.</p></header>
    {success && <p role="status" className="text-success">{success}</p>}
    {mutationError && <ErrorState title={outOfDate ? "Cần tải lại phiên bản công thức" : "Không thể xóa công thức"}
      description={mutationError.description} correlationId={mutationError.correlationId}
      onRetry={outOfDate ? reloadRecipe : undefined} retryLabel="Tải bản mới"
      action={mutationError.status === 401 ? <Link className="underline" href={`/auth/login?callbackUrl=${encodeURIComponent(`/dashboard/recipes/${recipe.id}/edit`)}`}>Đăng nhập lại</Link> : undefined} />}
    <button type="button" disabled={saving || deleting} onClick={reloadRecipe} className="text-sm underline">Tải bản mới (bỏ thay đổi đang nhập)</button>
    <RecipeForm key={`form-${recipe.id}-${reload}`} mode="edit" defaultValues={initial} categories={categories.data ?? []}
      categoriesLoading={categories.isPending} categoryError={categories.isError ? categories.error : undefined}
      onRetryCategories={() => { void categories.refetch(); }} onSave={save} onDirtyChange={setBasicDirty}
      onReload={reloadRecipe} onEdited={() => setSuccess("")} busy={saving || deleting} blockSubmit={outOfDate}
      actions={<button ref={deleteButton} type="button" disabled={saving || deleting} onClick={() => setShowDelete(true)}
        className="rounded-xl border border-destructive/30 px-5 py-3 text-destructive">Xóa công thức</button>}>
      <fieldset disabled={saving || deleting} aria-label="Nguyên liệu công thức" className="min-w-0">
        <IngredientManager key={`ingredients-${recipe.id}-${reload}`} recipeId={recipe.id} onDirtyChange={setIngredientDirty}
          parentVersion={recipe.rowVersion} onMutation={refreshVersion} />
      </fieldset>
      <StepManager key={`steps-${recipe.id}-${reload}`} recipeId={recipe.id} onDirtyChange={setStepDirty}
        published={recipe.status === 1} parentVersion={recipe.rowVersion} disabled={saving || deleting} onMutation={refreshVersion} />
      <ImageGalleryManager key={`images-${recipe.id}-${reload}`} recipeId={recipe.id} archived={recipe.status === 2} onMutation={() => { void refreshVersion(); }} />
    </RecipeForm>
  </div><DeleteRecipeModal open={showDelete} busy={deleting} returnFocusRef={deleteButton} onCancel={() => setShowDelete(false)} onConfirm={() => { void remove(); }} /></div>;
}
