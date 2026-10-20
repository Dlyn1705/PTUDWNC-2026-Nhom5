"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { useCategories } from "@/hooks/queries/useCategories";
import { useRecipeMutations } from "@/hooks/mutations/useRecipeMutations";
import { recipeFormSchema, type RecipeFormValues } from "@/lib/validations/recipe";
import type { CreateRecipeRequest, RecipeDetailDto, RecipeWritePayload } from "@/types/recipe.types";
import { BasicInfoFields } from "./BasicInfoFields";
import { NutritionFields } from "./NutritionFields";
import IngredientManager from "./IngredientManager";
import StepManager from "./StepManager";
import ImageGalleryManager from "./ImageGalleryManager";
import { DeleteRecipeModal } from "./DeleteRecipeModal";

const emptyValues: RecipeFormValues = {
  title: "",
  description: "",
  categoryId: "",
  difficulty: 1,
  prepTime: 0,
  cookTime: 0,
  servings: 1,
  nutrition: { calories: null, protein: null, carbohydrates: null, fat: null, fiber: null, sodium: null },
  ingredients: [{ name: "", quantity: null, unit: "", notes: "" }],
  steps: [{ title: "", description: "", timerMinutes: null }],
};

function valuesFromRecipe(recipe: RecipeDetailDto): RecipeFormValues {
  return {
    title: recipe.title,
    description: recipe.description ?? "",
    categoryId: recipe.categoryId,
    difficulty: recipe.difficulty,
    prepTime: recipe.prepTimeMinutes,
    cookTime: recipe.cookTimeMinutes,
    servings: recipe.servings,
    nutrition: {
      calories: recipe.nutrition?.calories ?? null,
      protein: recipe.nutrition?.protein ?? null,
      carbohydrates: recipe.nutrition?.carbohydrates ?? recipe.nutrition?.carbs ?? null,
      fat: recipe.nutrition?.fat ?? null,
      fiber: recipe.nutrition?.fiber ?? null,
      sodium: recipe.nutrition?.sodium ?? null,
    },
    ingredients: recipe.ingredients?.length ? recipe.ingredients.map((item) => ({
      name: item.name,
      quantity: item.quantity ?? null,
      unit: item.unit ?? "",
      notes: item.notes ?? "",
    })) : emptyValues.ingredients,
    steps: recipe.steps?.length ? recipe.steps.map((step) => ({
      title: step.title ?? "",
      description: step.description ?? step.text,
      timerMinutes: step.timerMinutes ?? null,
    })) : emptyValues.steps,
  };
}

export function RecipeForm({ initialRecipe }: { initialRecipe?: RecipeDetailDto }) {
  const router = useRouter();
  const categories = useCategories();
  const mutations = useRecipeMutations();
  const [recipeId, setRecipeId] = useState(initialRecipe?.id);
  const [rowVersion, setRowVersion] = useState(initialRecipe?.rowVersion);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string }>();
  const [showDelete, setShowDelete] = useState(false);
  const methods = useForm<RecipeFormValues>({
    resolver: zodResolver(recipeFormSchema),
    defaultValues: initialRecipe ? valuesFromRecipe(initialRecipe) : emptyValues,
  });

  const submit = methods.handleSubmit(async (values) => {
    setMessage(undefined);
    const payload: RecipeWritePayload = {
      title: values.title,
      description: values.description || undefined,
      categoryId: values.categoryId,
      difficulty: values.difficulty,
      prepTime: values.prepTime,
      cookTime: values.cookTime,
      servings: values.servings,
      instructions: values.steps.map((step, index) => `Bước ${index + 1}: ${step.description}`).join("\n\n"),
      rowVersion,
    };

    try {
      if (initialRecipe) {
        const result = await mutations.update.mutateAsync({ id: initialRecipe.id, payload });
        setRowVersion(result.rowVersion);
        setMessage({ type: "success", text: "Đã cập nhật công thức." });
      } else {
        const createPayload: CreateRecipeRequest = {
          title: payload.title,
          description: payload.description,
          instructions: payload.instructions,
          categoryId: payload.categoryId,
          difficulty: payload.difficulty,
          prepTime: payload.prepTime,
          cookTime: payload.cookTime,
          servings: payload.servings,
          ingredients: values.ingredients.map((item) => ({ ...item, unit: item.unit || undefined, notes: item.notes || undefined })),
          steps: values.steps.map((step, index) => ({ ...step, title: step.title || `Bước ${index + 1}` })),
          nutrition: values.nutrition,
        };
        const result = await mutations.create.mutateAsync(createPayload);
        setRecipeId(result.id);
        setRowVersion(result.rowVersion);
        setMessage({ type: "success", text: "Đã tạo công thức. Bạn có thể tải ảnh lên ngay bây giờ." });
      }
    } catch (error) {
      const status = (error as { response?: { status?: number; data?: { detail?: string } } }).response?.status;
      setMessage({
        type: "error",
        text: status === 409
          ? "Dữ liệu đã được thay đổi ở nơi khác. Hãy tải lại trang trước khi lưu lại."
          : (error as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? "Không thể lưu công thức.",
      });
    }
  });

  const deleting = mutations.remove.isPending;
  const removeRecipe = async () => {
    if (!initialRecipe) return;
    await mutations.remove.mutateAsync(initialRecipe.id);
    router.replace("/dashboard/recipes");
  };

  return (
    <FormProvider {...methods}>
      <form onSubmit={submit} className="space-y-6" noValidate>
        {message && <div role="status" className={`rounded-xl border p-4 text-sm ${message.type === "error" ? "border-destructive/30 text-destructive" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}>{message.text}</div>}
        {categories.isError && <div role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive">Không thể tải danh mục.</div>}
        <BasicInfoFields categories={categories.data ?? []} />
        {recipeId && (
          <ImageGalleryManager
            recipeId={recipeId}
          />
        )}
        <NutritionFields />
        <IngredientManager />
        <StepManager />
        <div className="flex flex-wrap justify-between gap-3">
          {initialRecipe ? <Button type="button" variant="outline" className="text-destructive" onClick={() => setShowDelete(true)}>Xóa công thức</Button> : <span />}
          <Button type="submit" disabled={methods.formState.isSubmitting || categories.isPending}>{methods.formState.isSubmitting ? "Đang lưu..." : initialRecipe ? "Lưu thay đổi" : "Tạo công thức"}</Button>
        </div>
      </form>
      {initialRecipe && <DeleteRecipeModal open={showDelete} busy={deleting} onCancel={() => setShowDelete(false)} onConfirm={() => void removeRecipe()} />}
    </FormProvider>
  );
}
