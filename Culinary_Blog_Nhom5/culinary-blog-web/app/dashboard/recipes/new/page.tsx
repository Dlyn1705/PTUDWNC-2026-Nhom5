"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import IngredientManager from "@/components/recipes/editor/IngredientManager";
import StepManager, {
  type StepCollectionValidation,
} from "@/components/recipes/editor/StepManager";
import ImageGalleryManager from "@/components/recipes/editor/ImageGalleryManager";
import RecipeForm from "@/components/recipes/editor/RecipeForm";
import { type IngredientDraft } from "@/lib/ingredient-form";
import { type StepDraft } from "@/lib/step-form";
import { recipeEditorApi } from "@/lib/api/recipeEditorApi";
import { categoryApi } from "@/lib/api/categoryApi";
import { buildCreateRecipePayload } from "@/lib/validations/createRecipe";
import {
  RecipeFormValidationError,
  type RecipeEditorValues,
  type RecipeCollectionValidation,
} from "@/lib/validations/recipeEditor";
import { recipeKeys } from "@/hooks/queries/recipeKeys";
import { useUnsavedRecipe } from "@/hooks/useUnsavedRecipe";
import { DraftPublishDialog } from "@/components/recipes/editor/DraftPublishDialog";
import { saveDraftMedia } from "@/lib/api/saveDraftMedia";
import { imageErrorMessage, validateImageFile } from "@/lib/api/imageErrors";

export default function NewRecipePage() {
  const queryClient = useQueryClient();
  const categories = useQuery({
    queryKey: ["recipe-editor-categories"],
    queryFn: categoryApi.getAll,
  });
  const [created, setCreated] = useState<{ id: string; slug: string } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [basicDirty, setBasicDirty] = useState(false);
  const [ingredientDirty, setIngredientDirty] = useState(false);
  const [stepDirty, setStepDirty] = useState(false);
  const [galleryBusy, setGalleryBusy] = useState(false);
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([]);
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [stepFiles, setStepFiles] = useState<(File | undefined)[]>([]);
  const [cover, setCover] = useState<File | null>(null);
  const [coverError, setCoverError] = useState("");
  const [mediaWarnings, setMediaWarnings] = useState<string[]>([]);
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [published, setPublished] = useState(false);
  const ingredientValidation = useRef<RecipeCollectionValidation>(null);
  const stepValidation = useRef<StepCollectionValidation>(null);
  const dirty =
    (!created &&
      (basicDirty ||
        ingredients.length > 0 ||
        steps.length > 0 ||
        Boolean(cover))) ||
    ingredientDirty ||
    stepDirty;
  useUnsavedRecipe(dirty || galleryBusy || saving);

  const save = async (values: RecipeEditorValues) => {
    if (created)
      throw new RecipeFormValidationError(
        "Bản nháp đã được tạo. Hãy mở trang chỉnh sửa để tiếp tục.",
      );
    if (!(await ingredientValidation.current?.validate()))
      throw new RecipeFormValidationError(
        "Vui lòng kiểm tra các ô nguyên liệu được đánh dấu.",
      );
    if (!(await stepValidation.current?.validate()))
      throw new RecipeFormValidationError(
        "Vui lòng kiểm tra các ô bước thực hiện được đánh dấu.",
      );
    const currentIngredients =
      (ingredientValidation.current?.getItems?.() as
        | IngredientDraft[]
        | undefined) ?? ingredients;
    const currentSteps =
      (stepValidation.current?.getItems?.() as StepDraft[] | undefined) ??
      steps;
    const pendingStepFiles = stepValidation.current?.getStepFiles() ?? [];
    const payload = buildCreateRecipePayload({
      ...values,
      category: values.categoryId,
      ingredients: currentIngredients,
      steps: currentSteps,
      nutrition: {
        calories: values.calories,
        protein: values.protein,
        carbohydrates: values.carbohydrates,
        fat: values.fat,
        fiber: values.fiber,
        sodium: values.sodium,
      },
    });
    setSaving(true);
    try {
      const result = await recipeEditorApi.create(payload);
      const media = await saveDraftMedia(result.id, cover, pendingStepFiles);
      setStepFiles(media.retryFiles);
      setMediaWarnings(media.warnings);
      setCreated({ id: result.id, slug: result.slug });
      setChoiceOpen(!media.warnings.length);
      void queryClient.invalidateQueries({ queryKey: recipeKeys.managed() });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background py-10">
      <div className="page-container space-y-6">
        <header>
          <p className="text-sm font-medium text-primary">
            Dashboard / Recipes / New
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold text-foreground">
            Tạo công thức mới
          </h1>
          <p className="mt-2 text-muted-foreground">
            Chia sẻ công thức món ăn của bạn với mọi người.
          </p>
          {dirty && (
            <p role="status" className="mt-2 text-sm text-warning">
              Có thay đổi chưa lưu.
            </p>
          )}
        </header>
        {created && (
          <div className="space-y-2 rounded-2xl border bg-card p-4">
            <p
              id="draft-result"
              role="status"
              tabIndex={-1}
              className="text-success"
            >
              {published ? "Công thức đã xuất bản. " : "Đã lưu bản nháp. "}
              <Link
                className="underline"
                href={
                  published
                    ? `/recipes/${created.slug}`
                    : `/dashboard/recipes/${created.id}/edit`
                }
              >
                {published ? "Xem công thức" : "Tiếp tục chỉnh sửa"}
              </Link>
            </p>
            {mediaWarnings.length > 0 && (
              <ul
                role="alert"
                className="list-disc ps-5 text-sm text-destructive"
              >
                {mediaWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
            {!published && (
              <button
                type="button"
                disabled={dirty || galleryBusy}
                onClick={() => setChoiceOpen(true)}
                className="rounded-lg border px-4 py-2 disabled:opacity-50"
              >
                Xem trước để xuất bản
              </button>
            )}
            <DraftPublishDialog
              id={created.id}
              open={choiceOpen}
              onClose={() => setChoiceOpen(false)}
              onPublished={() => {
                setPublished(true);
                setChoiceOpen(false);
              }}
            />
          </div>
        )}
        <RecipeForm
          mode="create"
          categories={categories.data ?? []}
          categoriesLoading={categories.isPending}
          categoryError={categories.isError ? categories.error : undefined}
          onRetryCategories={() => {
            void categories.refetch();
          }}
          onSave={save}
          onDirtyChange={setBasicDirty}
          busy={saving}
          disabled={Boolean(created)}
          createdSlug={created?.slug}
          onCollectionErrors={(errors, focus) => {
            const ingredientCount =
              ingredientValidation.current?.setServerErrors(errors, focus) ?? 0;
            stepValidation.current?.setServerErrors(
              errors,
              focus && !ingredientCount,
            );
          }}
        >
          <section
            aria-label="Ảnh món ăn"
            className="rounded-2xl border border-border bg-card p-6 shadow-soft"
          >
            <h2 className="font-display text-xl font-semibold">Ảnh món ăn</h2>
            {!created && (
              <div className="mt-3 space-y-2">
                <label className="block text-sm">
                  Chọn ảnh bìa
                  <input
                    type="file"
                    disabled={saving}
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    className="mt-1 block max-w-full"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      try {
                        validateImageFile(file);
                        setCover(file);
                        setCoverError("");
                      } catch (cause) {
                        setCoverError(imageErrorMessage(cause));
                      }
                      event.target.value = "";
                    }}
                  />
                </label>
                {cover && (
                  <p className="break-all text-sm">
                    {cover.name}{" "}
                    <button
                      type="button"
                      disabled={saving}
                      className="underline"
                      onClick={() => setCover(null)}
                    >
                      Bỏ ảnh bìa
                    </button>
                  </p>
                )}
                {coverError && (
                  <p role="alert" className="text-sm text-destructive">
                    {coverError}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  Ảnh đã chọn sẽ được tải lên khi lưu công thức.
                </p>
              </div>
            )}
            {created && (
              <ImageGalleryManager
                key={created.id}
                recipeId={created.id}
                onBusyChange={setGalleryBusy}
              />
            )}
          </section>
          <fieldset
            disabled={saving}
            aria-label="Nguyên liệu công thức"
            className="min-w-0"
          >
            <IngredientManager
              key={created?.id ?? "new"}
              recipeId={created?.id}
              initialItems={ingredients}
              onChange={setIngredients}
              onDirtyChange={setIngredientDirty}
              validationRef={ingredientValidation}
            />
          </fieldset>
          <StepManager
            key={`steps-${created?.id ?? "new"}`}
            recipeId={created?.id}
            initialStepFiles={stepFiles}
            onChange={setSteps}
            onDirtyChange={setStepDirty}
            validationRef={stepValidation}
            disabled={saving}
          />
        </RecipeForm>
      </div>
    </div>
  );
}
