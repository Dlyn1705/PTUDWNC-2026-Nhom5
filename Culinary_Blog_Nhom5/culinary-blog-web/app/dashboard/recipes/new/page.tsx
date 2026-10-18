"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import IngredientManager from "@/components/recipes/editor/IngredientManager";
import { ingredientFormSchema, type IngredientDraft } from "@/lib/ingredient-form";
import { recipeApi } from "@/lib/api/recipeApi";
import { buildCreateRecipePayload } from "@/lib/validations/createRecipe";
import { categoryApi } from "@/lib/api/categoryApi";
import type { CategoryDto } from "@/types/category.types";
import ImageGalleryManager from "@/components/recipes/editor/ImageGalleryManager";

type Step = {
  description: string;
};

export default function NewRecipePage() {
  const saving = useRef(false);
  const [createdSlug, setCreatedSlug] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [difficulty, setDifficulty] = useState("1");

  const [prepTime, setPrepTime] = useState("");
  const [cookTime, setCookTime] = useState("");
  const [servings, setServings] = useState("");

  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [fiber, setFiber] = useState("");
  const [sodium, setSodium] = useState("");

  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [categoryError, setCategoryError] = useState("");
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [createdRecipeId, setCreatedRecipeId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    categoryApi.getAll()
      .then((items) => { if (active) setCategories(items); })
      .catch(() => { if (active) setCategoryError("Không thể tải danh mục. Vui lòng tải lại trang."); });
    return () => { active = false; };
  }, []);

  const [ingredients, setIngredients] = useState<IngredientDraft[]>([]);

  const [steps, setSteps] = useState<Step[]>([
    { description: "" },
  ]);

  const slug = useMemo(() => {
    return title
      .toLowerCase().replace(/đ/g, "d")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
  }, [title]);

  const addStep = () => {
    setSteps([...steps, { description: "" }]);
  };

  const removeStep = (index: number) => {
    if (steps.length === 1) return;

    setSteps(steps.filter((_, i) => i !== index));
  };

  const updateStep = (index: number, value: string) => {
    const updated = [...steps];
    updated[index].description = value;
    setSteps(updated);
  };

  const handleSubmit = async () => {
    if (saving.current || createdRecipeId) return;
    setFormError("");

    if (!category) {
      alert("Vui lòng chọn danh mục.");
      return;
    }

    if (prepTime && (!Number.isFinite(Number(prepTime)) || Number(prepTime) < 0)) {
      alert("Thời gian chuẩn bị không hợp lệ.");
      return;
    }

    if (cookTime && (!Number.isFinite(Number(cookTime)) || Number(cookTime) < 0)) {
      alert("Thời gian nấu không hợp lệ.");
      return;
    }

    const checkedIngredients = ingredientFormSchema.safeParse({ items: ingredients });
    if (!checkedIngredients.success) {
      setFormError(checkedIngredients.error.issues.map(issue => issue.message).join(" "));
      return;
    }

    // Kiểm tra các bước
    const invalidStep = steps.some(
      (step) => !step.description.trim()
    );

    if (invalidStep) {
      alert("Vui lòng nhập đầy đủ nội dung các bước thực hiện.");
      return;
    }

    if (Number(servings) <= 0 || !Number.isFinite(Number(servings))) {
      alert("Số khẩu phần phải lớn hơn 0.");
      return;
    }

    let recipeData: ReturnType<typeof buildCreateRecipePayload>;
    try {
      recipeData = buildCreateRecipePayload({
        title,
        description,
        category,
        difficulty,
        prepTime,
        cookTime,
        servings,
        ingredients: checkedIngredients.data.items,
        steps,
        nutrition: { calories, protein, carbohydrates: carbs, fat, fiber, sodium },
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Dữ liệu không hợp lệ.");
      return;
    }

    saving.current = true;
    setIsSaving(true);
    try {
      const response = await recipeApi.create(recipeData);
      setCreatedRecipeId(response.id);
      setCreatedSlug(response.slug);
    } catch (error) {
      const data = (error as { response?: { data?: { detail?: string; errors?: Record<string, string[]> } } })?.response?.data;
      setFormError(Object.values(data?.errors ?? {}).flat().join(" ") || data?.detail || "Không thể lưu công thức. Vui lòng kiểm tra dữ liệu và thử lại.");
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 py-10">
      <div className="mx-auto max-w-5xl px-4">
        <div className="mb-8">
          <p className="mb-2 text-sm font-medium text-primary">
            Dashboard / Recipes / New
          </p>

          <h1 className="text-3xl font-bold text-gray-900">
            Tạo công thức mới
          </h1>

          <p className="mt-2 text-gray-500">
            Chia sẻ công thức món ăn của bạn với mọi người.
          </p>
        </div>

        <form noValidate className="space-y-6" onSubmit={(event) => { event.preventDefault(); void handleSubmit(); }}>
          {/* BASIC INFORMATION */}
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Thông tin cơ bản
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Nhập những thông tin chính của công thức.
              </p>
            </div>

            <div className="space-y-5">
              {/* Title */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Tên món ăn *
                </label>

                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  placeholder="Ví dụ: Phở bò truyền thống"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
                />

                <div className="mt-2 flex justify-between text-xs text-gray-400">
                  <span>Từ 3 - 200 ký tự</span>
                  <span>{title.length}/200</span>
                </div>
              </div>

              {/* Slug */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Slug SEO (xem trước; hệ thống tự cấp slug duy nhất)
                </label>

                <input
                  type="text"
                  value={createdSlug || slug}
                  readOnly
                  placeholder="ten-mon-an"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-500"
                />
              </div>

              {/* Category + Difficulty */}
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Danh mục *
                  </label>

                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                  >
                    <option value="">Chọn danh mục</option>
                    {categories.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                  {categoryError && <p role="alert" className="mt-2 text-sm text-red-600">{categoryError}</p>}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Độ khó
                  </label>

                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                  >
                    <option value="1">Dễ</option>
                    <option value="2">Trung bình</option>
                    <option value="3">Khó</option>
                    <option value="4">Chuyên gia</option>
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Mô tả ngắn
                </label>

                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={2000}
                  rows={4}
                  placeholder="Mô tả hương vị và điểm đặc sắc của món ăn..."
                  className="w-full resize-none rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                />

                <p className="mt-2 text-right text-xs text-gray-400">
                  {description.length}/2000
                </p>
              </div>

              {/* Time */}
              <div className="grid gap-5 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Chuẩn bị (phút)
                  </label>

                  <input
                    type="number"
                    min="0"
                    value={prepTime}
                    onChange={(e) => setPrepTime(e.target.value)}
                    placeholder="15"
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Nấu (phút)
                  </label>

                  <input
                    type="number"
                    min="0"
                    value={cookTime}
                    onChange={(e) => setCookTime(e.target.value)}
                    placeholder="30"
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Khẩu phần
                  </label>

                  <input
                    type="number"
                    min="1"
                    value={servings}
                    onChange={(e) => setServings(e.target.value)}
                    placeholder="4"
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* IMAGE */}
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900">
              Ảnh món ăn
            </h2>

            <p className="mt-1 text-sm text-gray-500">Lưu công thức trước, sau đó tải ảnh lên MinIO.</p>
            {createdRecipeId && <div className="mt-5"><ImageGalleryManager key={createdRecipeId} recipeId={createdRecipeId} /></div>}
          </section>

          {/* NUTRITION */}
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900">
              Thông tin dinh dưỡng
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Các chỉ số dinh dưỡng của món ăn.
            </p>

            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Calories", calories, setCalories, "kcal"],
                ["Protein", protein, setProtein, "g"],
                ["Carbohydrates", carbs, setCarbs, "g"],
                ["Chất béo", fat, setFat, "g"],
                ["Chất xơ", fiber, setFiber, "g"],
                ["Natri", sodium, setSodium, "mg"],
              ].map(([label, value, setter, unit]) => (
                <div key={label as string}>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    {label as string}
                  </label>

                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      aria-label={label as string}
                      value={value as string}
                      onChange={(e) =>
                        (setter as React.Dispatch<
                          React.SetStateAction<string>
                        >)(e.target.value)
                      }
                      placeholder="0"
                      className="w-full rounded-xl border border-gray-300 px-4 py-3 pr-14 outline-none focus:border-primary"
                    />

                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                      {unit as string}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <IngredientManager key={createdRecipeId ?? "new-ingredients"} recipeId={createdRecipeId ?? undefined}
            initialItems={ingredients} onChange={setIngredients} />

          {/* STEPS */}
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Các bước thực hiện
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Bản nháp có thể chưa có bước; cần ít nhất một bước để xuất bản.
                </p>
              </div>

              <button
                type="button"
                onClick={addStep}
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                + Thêm bước
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {steps.map((step, index) => (
                <div
                  key={index}
                  className="flex gap-4 rounded-xl border border-gray-200 p-4"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                    {index + 1}
                  </div>

                  <textarea
                    value={step.description}
                    onChange={(e) =>
                      updateStep(index, e.target.value)
                    }
                    rows={3}
                    placeholder={`Mô tả bước ${index + 1}...`}
                    className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-primary"
                  />

                  <button
                    type="button"
                    onClick={() => removeStep(index)}
                    className="h-fit rounded-lg px-3 py-2 text-sm text-red-500 hover:bg-red-50"
                  >
                    Xóa
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* ACTIONS */}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            {formError && <p role="alert" className="mr-auto self-center text-sm text-red-600">{formError}</p>}
            {createdRecipeId && <p role="status" className="mr-auto self-center text-sm text-green-700">Đã lưu bản nháp. <a className="underline" href={`/dashboard/recipes/${createdRecipeId}/edit`}>Tiếp tục chỉnh sửa</a></p>}
            <button
              type="submit"
              disabled={isSaving || Boolean(createdRecipeId) || categories.length === 0}
              className="rounded-xl border border-gray-300 bg-white px-6 py-3 font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? "Đang lưu…" : createdRecipeId ? "Đã lưu" : "Lưu bản nháp"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
