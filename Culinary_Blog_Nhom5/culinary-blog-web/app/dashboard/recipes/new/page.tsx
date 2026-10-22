"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import IngredientManager from "@/components/recipes/editor/IngredientManager";
import StepManager from "@/components/recipes/editor/StepManager";
import ImageGalleryManager from "@/components/recipes/editor/ImageGalleryManager";
import RecipeForm from "@/components/recipes/editor/RecipeForm";
import { type IngredientDraft } from "@/lib/ingredient-form";
import { type StepDraft } from "@/lib/step-form";
import { recipeEditorApi } from "@/lib/api/recipeEditorApi";
import { categoryApi } from "@/lib/api/categoryApi";
import { buildCreateRecipePayload } from "@/lib/validations/createRecipe";
import { RecipeFormValidationError, type RecipeEditorValues, type RecipeCollectionValidation } from "@/lib/validations/recipeEditor";
import { recipeKeys } from "@/hooks/queries/recipeKeys";
import { useUnsavedRecipe } from "@/hooks/useUnsavedRecipe";

export default function NewRecipePage() {
  const queryClient = useQueryClient();
  const categories = useQuery({ queryKey: ["recipe-editor-categories"], queryFn: categoryApi.getAll });
  const [created, setCreated] = useState<{ id: string; slug: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [basicDirty, setBasicDirty] = useState(false);
  const [ingredientDirty, setIngredientDirty] = useState(false);
  const [stepDirty, setStepDirty] = useState(false);
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([]);
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const ingredientValidation = useRef<RecipeCollectionValidation>(null);
  const stepValidation = useRef<RecipeCollectionValidation>(null);
  const dirty = (!created && (basicDirty || ingredients.length > 0 || steps.length > 0)) || ingredientDirty || stepDirty;
  useUnsavedRecipe(dirty);

  const save = async (values: RecipeEditorValues) => {
    if (created) throw new RecipeFormValidationError("Bản nháp đã được tạo. Hãy mở trang chỉnh sửa để tiếp tục.");
    if (!await ingredientValidation.current?.validate()) throw new RecipeFormValidationError("Vui lòng kiểm tra các ô nguyên liệu được đánh dấu.");
    if (!await stepValidation.current?.validate()) throw new RecipeFormValidationError("Vui lòng kiểm tra các ô bước thực hiện được đánh dấu.");
    const payload = buildCreateRecipePayload({ ...values, category: values.categoryId, ingredients, steps,
      nutrition: { calories: values.calories, protein: values.protein, carbohydrates: values.carbohydrates,
        fat: values.fat, fiber: values.fiber, sodium: values.sodium } });
    setSaving(true);
    try {
      const result = await recipeEditorApi.create(payload);
      setCreated({ id: result.id, slug: result.slug });
      void queryClient.invalidateQueries({ queryKey: recipeKeys.managed() });
    } finally { setSaving(false); }
  };

  return <div className="min-h-screen bg-gray-50 py-10"><div className="mx-auto max-w-5xl space-y-6 px-4">
    <header><p className="text-sm font-medium text-primary">Dashboard / Recipes / New</p>
      <h1 className="mt-2 text-3xl font-bold text-gray-900">Tạo công thức mới</h1>
      <p className="mt-2 text-gray-500">Chia sẻ công thức món ăn của bạn với mọi người.</p>
      {dirty && <p role="status" className="mt-2 text-sm text-amber-700">Có thay đổi chưa lưu.</p>}</header>
    {created && <p role="status" className="text-green-700">Đã lưu bản nháp. <Link className="underline" href={`/dashboard/recipes/${created.id}/edit`}>Tiếp tục chỉnh sửa</Link></p>}
    <RecipeForm mode="create" categories={categories.data ?? []} categoriesLoading={categories.isPending}
      categoryError={categories.isError ? categories.error : undefined} onRetryCategories={() => { void categories.refetch(); }}
      onSave={save} onDirtyChange={setBasicDirty} busy={saving} disabled={Boolean(created)} createdSlug={created?.slug}
      onCollectionErrors={(errors, focus) => {
        const ingredientCount = ingredientValidation.current?.setServerErrors(errors, focus) ?? 0;
        stepValidation.current?.setServerErrors(errors, focus && !ingredientCount);
      }}>
      <section aria-label="Ảnh món ăn" className="rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-xl font-semibold">Ảnh món ăn</h2>
        <p className="mt-2 text-sm text-gray-500">Lưu công thức trước, sau đó tải ảnh lên MinIO.</p>
        {created && <ImageGalleryManager key={created.id} recipeId={created.id} />}</section>
      <fieldset disabled={saving} aria-label="Nguyên liệu công thức" className="min-w-0">
        <IngredientManager key={created?.id ?? "new"} recipeId={created?.id} initialItems={ingredients} onChange={setIngredients}
          onDirtyChange={setIngredientDirty} validationRef={ingredientValidation} />
      </fieldset>
      <StepManager key={`steps-${created?.id ?? "new"}`} recipeId={created?.id} onChange={setSteps}
        onDirtyChange={setStepDirty} validationRef={stepValidation} disabled={saving} />
    </RecipeForm>
  </div></div>;
}
