"use client";

import { FormEvent, useState } from "react";
import FileUploadDropzone from "@/components/common/FileUploadDropzone";

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function RecipeImageUploadPanel() {
  const [input, setInput] = useState("");
  const [recipeId, setRecipeId] = useState("");
  const [error, setError] = useState("");

  const selectRecipe = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const candidate = input.trim();
    if (!GUID_PATTERN.test(candidate)) {
      setError("Nhập ID công thức hợp lệ (UUID) trước khi tải ảnh.");
      setRecipeId("");
      return;
    }
    setError("");
    setRecipeId(candidate);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <header>
        <p className="text-sm font-medium text-primary">Dashboard / Recipes / Images</p>
        <h1 className="mt-2 text-3xl font-bold">Tải ảnh công thức</h1>
        <p className="mt-2 text-muted-foreground">
          Chọn công thức đã lưu. API sẽ xác nhận bạn là chủ sở hữu hoặc Admin trước khi nhận ảnh.
        </p>
      </header>

      <form onSubmit={selectRecipe} className="space-y-3 rounded-2xl border bg-card p-5">
        <label htmlFor="recipe-id" className="block text-sm font-medium">ID công thức</label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="recipe-id"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2"
          />
          <button type="submit" className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground">
            Chọn công thức
          </button>
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </form>

      {recipeId && (
        <section className="space-y-3 rounded-2xl border bg-card p-5" aria-live="polite">
          <h2 className="font-semibold">Ảnh cho công thức {recipeId}</h2>
          <FileUploadDropzone
            key={recipeId}
            recipeId={recipeId}
          />
        </section>
      )}
    </div>
  );
}
