"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import axios from "axios";
import { categoryApi } from "@/lib/api/categoryApi";
import type { CategoryDto } from "@/types/category.types";
import axiosClient from "@/lib/api/axiosClient";
import { uploadRecipeImage } from "@/lib/api/fileApi";

type Ingredient = {
  name: string;
  quantity: string;
  unit: string;
};

type Step = {
  description: string;
};

type CreatedRecipeResponse = {
  id: string;
  slug: string;
};

export default function NewRecipePage() {
  const router = useRouter();
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [createdRecipeId, setCreatedRecipeId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [difficulty, setDifficulty] = useState("Easy");

  const [prepTime, setPrepTime] = useState("");
  const [cookTime, setCookTime] = useState("");
  const [servings, setServings] = useState("");

  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [fiber, setFiber] = useState("");
  const [sodium, setSodium] = useState("");

  const [image, setImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);

  useEffect(() => {
    let active = true;
    categoryApi.getAll()
      .then((items) => { if (active) setCategories(items); })
      .catch(() => { if (active) setFormError("Không tải được danh mục. Vui lòng tải lại trang."); })
      .finally(() => { if (active) setCategoriesLoading(false); });
    return () => { active = false; };
  }, []);

  const [ingredients, setIngredients] = useState<Ingredient[]>([
    { name: "", quantity: "", unit: "" },
  ]);

  const [steps, setSteps] = useState<Step[]>([
    { description: "" },
  ]);

  const slug = useMemo(() => {
    return title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
  }, [title]);

  const addIngredient = () => {
    setIngredients([
      ...ingredients,
      { name: "", quantity: "", unit: "" },
    ]);
  };

  const removeIngredient = (index: number) => {
    if (ingredients.length === 1) return;

    setIngredients(
      ingredients.filter((_, i) => i !== index)
    );
  };

  const updateIngredient = (
    index: number,
    field: keyof Ingredient,
    value: string
  ) => {
    const updated = [...ingredients];
    updated[index][field] = value;
    setIngredients(updated);
  };

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

  const handleImageChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"];
    if (!allowedTypes.includes(file.type)) {
      setFormError("Ảnh phải có định dạng JPEG, PNG, WebP hoặc AVIF.");
      event.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFormError("Kích thước ảnh không được vượt quá 5 MB.");
      event.target.value = "";
      return;
    }

    setFormError("");
    const url = URL.createObjectURL(file);
    if (image?.startsWith("blob:")) URL.revokeObjectURL(image);
    setImage(url);
    setImageFile(file);
  };

  const handleSubmit = async (status: "draft" | "continue") => {
    // Kiểm tra tên món ăn
    if (title.trim().length < 3 || title.trim().length > 200) {
      alert("Tên món ăn phải có từ 3 đến 200 ký tự.");
      return;
    }

    // Kiểm tra danh mục
    if (!category) {
      alert("Vui lòng chọn danh mục.");
      return;
    }

    // Kiểm tra thời gian
    if ((prepTime && (!Number.isInteger(Number(prepTime)) || Number(prepTime) < 0)) ||
        (cookTime && (!Number.isInteger(Number(cookTime)) || Number(cookTime) < 0))) {
      alert("Thời gian chuẩn bị không hợp lệ.");
      return;
    }

    if (!Number.isInteger(Number(servings)) || Number(servings) <= 0) {
      alert("Số khẩu phần phải là số nguyên lớn hơn 0.");
      return;
    }

    const activeIngredients = ingredients.filter((item) => item.name.trim());
    if (activeIngredients.some((item) => item.quantity.trim() && (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0))) {
      alert("Số lượng nguyên liệu phải lớn hơn 0.");
      return;
    }

    const activeSteps = steps.filter((step) => step.description.trim());

    const nutritionValues = [calories, protein, carbs, fat, fiber, sodium];
    if (nutritionValues.some((value) => value.trim() && (!Number.isFinite(Number(value)) || Number(value) < 0))) {
      alert("Giá trị dinh dưỡng phải là số không âm.");
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      if (createdRecipeId) {
        if (imageFile) await uploadRecipeImage(createdRecipeId, imageFile, undefined, undefined, title.trim());
        router.push(`/dashboard/recipes/${createdRecipeId}/edit`);
        return;
      }
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        instructions: null,
        prepTime: Number(prepTime) || 0,
        cookTime: Number(cookTime) || 0,
        servings: Number(servings),
        difficulty: ({ Easy: 1, Medium: 2, Hard: 3, Expert: 4 } as const)[difficulty as "Easy" | "Medium" | "Hard" | "Expert"],
        categoryId: category,
        ingredients: activeIngredients.map((item, index) => ({
          name: item.name.trim(),
          quantity: item.quantity.trim() ? Number(item.quantity) : null,
          unit: item.unit.trim() || null,
          notes: null,
          orderIndex: index,
        })),
        steps: activeSteps.map((step, index) => ({
          title: `Bước ${index + 1}`,
          description: step.description.trim(),
          timerMinutes: null,
          imageUrl: null,
        })),
        nutrition: nutritionValues.some((value) => value.trim()) ? {
          calories: calories.trim() ? Number(calories) : null,
          protein: protein.trim() ? Number(protein) : null,
          carbohydrates: carbs.trim() ? Number(carbs) : null,
          fat: fat.trim() ? Number(fat) : null,
          fiber: fiber.trim() ? Number(fiber) : null,
          sodium: sodium.trim() ? Number(sodium) : null,
        } : null,
      };

      const response = await axiosClient.post<CreatedRecipeResponse | { data: CreatedRecipeResponse }>("/api/v1/recipes", payload);
      const created = "data" in response.data ? response.data.data : response.data;
      setCreatedRecipeId(created.id);
      if (imageFile) await uploadRecipeImage(created.id, imageFile, undefined, undefined, title.trim());
      if (status === "continue") {
        router.push(`/dashboard/recipes/${created.id}/edit`);
      }
      else router.push("/dashboard/recipes");
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.detail || error.response?.data?.message || "Không thể lưu công thức. Vui lòng kiểm tra dữ liệu và thử lại."
        : error instanceof Error ? error.message : "Không thể lưu công thức.";
      setFormError(message);
    } finally {
      setSaving(false);
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

        <div className="space-y-6">
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
                  Slug SEO
                </label>

                <input
                  type="text"
                  value={slug}
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
                    disabled={categoriesLoading || categories.length === 0}
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                  >
                    <option value="">{categoriesLoading ? "Đang tải danh mục..." : "Chọn danh mục"}</option>
                    {categories.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                  {!categoriesLoading && categories.length === 0 && (
                    <p className="mt-2 text-sm text-red-600">Chưa có danh mục khả dụng.</p>
                  )}
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
                    <option value="Easy">Dễ</option>
                    <option value="Medium">Trung bình</option>
                    <option value="Hard">Khó</option>
                    <option value="Expert">Chuyên gia</option>
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
                    min="1"
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
                    min="1"
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

            <p className="mt-1 text-sm text-gray-500">
              Thêm ảnh đại diện cho công thức.
            </p>

            <div className="mt-5">
              {image ? (
                <div className="relative overflow-hidden rounded-2xl">
                  <Image
                    src={image}
                    alt="Ảnh món ăn"
                    width={1024}
                    height={576}
                    unoptimized
                    className="h-64 w-full object-cover"
                  />

                  <button
                    type="button"
                    onClick={() => {
                      if (image?.startsWith("blob:")) URL.revokeObjectURL(image);
                      setImage(null);
                      setImageFile(null);
                    }}
                    className="absolute right-3 top-3 rounded-lg bg-white px-3 py-2 text-sm font-medium text-red-600 shadow"
                  >
                    Xóa ảnh
                  </button>
                </div>
              ) : (
                <label className="flex h-64 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 transition hover:border-primary hover:bg-primary/5">
                  <span className="mb-3 text-4xl">📷</span>

                  <span className="font-medium text-gray-700">
                    Tải ảnh món ăn
                  </span>

                  <span className="mt-1 text-sm text-gray-400">
                    JPEG, PNG, WEBP hoặc AVIF (tối đa 5 MB)
                  </span>

                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/avif"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </label>
              )}
            </div>
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

          {/* INGREDIENTS */}
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Nguyên liệu
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Thêm các nguyên liệu cần thiết.
                </p>
              </div>

              <button
                type="button"
                onClick={addIngredient}
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                + Thêm nguyên liệu
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {ingredients.map((ingredient, index) => (
                <div
                  key={index}
                  className="grid gap-3 md:grid-cols-[1fr_150px_120px_auto]"
                >
                  <input
                    value={ingredient.name}
                    onChange={(e) =>
                      updateIngredient(
                        index,
                        "name",
                        e.target.value
                      )
                    }
                    placeholder="Tên nguyên liệu"
                    className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-primary"
                  />

                  <input
                    value={ingredient.quantity}
                    onChange={(e) =>
                      updateIngredient(
                        index,
                        "quantity",
                        e.target.value
                      )
                    }
                    placeholder="Số lượng"
                    className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-primary"
                  />

                  <input
                    value={ingredient.unit}
                    onChange={(e) =>
                      updateIngredient(
                        index,
                        "unit",
                        e.target.value
                      )
                    }
                    placeholder="Đơn vị"
                    className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-primary"
                  />

                  <button
                    type="button"
                    onClick={() => removeIngredient(index)}
                    className="rounded-xl border border-red-200 px-4 py-3 text-red-500 hover:bg-red-50"
                  >
                    Xóa
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* STEPS */}
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Các bước thực hiện
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Mô tả từng bước thực hiện món ăn.
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
          {formError && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </p>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => handleSubmit("draft")}
              disabled={saving || categoriesLoading || categories.length === 0}
              className="rounded-xl border border-gray-300 bg-white px-6 py-3 font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Đang lưu..." : "Lưu bản nháp"}
            </button>

            <button
              type="button"
              onClick={() => handleSubmit("continue")}
              disabled={saving || categoriesLoading || categories.length === 0}
              className="rounded-xl bg-primary px-6 py-3 font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Lưu và tiếp tục chỉnh sửa
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
