"use client";

import { useFormContext } from "react-hook-form";
import type { CategoryDto } from "@/types/category.types";
import type { RecipeFormValues } from "@/lib/validations/recipe";

export function BasicInfoFields({ categories }: { categories: CategoryDto[] }) {
  const { register, formState: { errors } } = useFormContext<RecipeFormValues>();

  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-soft">
      <h2 className="font-display text-xl font-semibold">Thông tin cơ bản</h2>
      <label className="block text-sm font-medium">Tên món ăn *
        <input {...register("title")} className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3" />
        {errors.title && <span className="mt-1 block text-xs text-destructive">{errors.title.message}</span>}
      </label>
      <label className="block text-sm font-medium">Mô tả
        <textarea {...register("description")} rows={4} className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3" />
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium">Danh mục *
          <select {...register("categoryId")} className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3">
            <option value="">Chọn danh mục</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          {errors.categoryId && <span className="mt-1 block text-xs text-destructive">{errors.categoryId.message}</span>}
        </label>
        <label className="text-sm font-medium">Độ khó
          <select {...register("difficulty", { valueAsNumber: true })} className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3">
            <option value={1}>Dễ</option><option value={2}>Trung bình</option><option value={3}>Khó</option><option value={4}>Chuyên gia</option>
          </select>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {([ ["prepTime", "Chuẩn bị (phút)"], ["cookTime", "Nấu (phút)"], ["servings", "Khẩu phần"] ] as const).map(([name, label]) => (
          <label key={name} className="text-sm font-medium">{label}
            <input type="number" min={name === "servings" ? 1 : 0} {...register(name, { valueAsNumber: true })} className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3" />
            {errors[name] && <span className="mt-1 block text-xs text-destructive">{errors[name]?.message}</span>}
          </label>
        ))}
      </div>
    </section>
  );
}
