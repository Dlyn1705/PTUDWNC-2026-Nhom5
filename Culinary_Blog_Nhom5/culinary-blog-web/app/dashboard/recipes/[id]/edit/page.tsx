"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { recipeApi } from "@/lib/api/recipeApi";
import { categoryApi } from "@/lib/api/categoryApi";
import type { CategoryDto } from "@/types/category.types";
import type { CreateRecipeIngredientRequest, CreateRecipeStepRequest, ManagedRecipeDetailsDto, RecipeImageUploadDto, RecipeIngredientDto, RecipeStepDto, UpdateRecipeRequest } from "@/types/recipe.types";

export default function EditRecipePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [recipe, setRecipe] = useState<ManagedRecipeDetailsDto | null>(null);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [ingredients, setIngredients] = useState<RecipeIngredientDto[]>([]);
  const [steps, setSteps] = useState<RecipeStepDto[]>([]);
  const [images, setImages] = useState<RecipeImageUploadDto[]>([]);
  const [managerError, setManagerError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { recipeApi.getManagedById(params.id).then(setRecipe).catch(() => setError("Không tải được công thức. Bạn cần là tác giả sở hữu công thức hoặc Admin.")); }, [params.id]);

  useEffect(() => { categoryApi.getAll().then(setCategories).catch(() => setManagerError("Could not load categories.")); }, []);
  useEffect(() => { if (recipe) { setIngredients(recipe.ingredients); setSteps(recipe.steps); setImages(recipe.images); } }, [recipe]);

  async function addIngredient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!recipe) return;
    const form = event.currentTarget; const data = new FormData(form);
    const payload: CreateRecipeIngredientRequest = { name: String(data.get("name")), quantity: data.get("quantity") ? Number(data.get("quantity")) : null, unit: String(data.get("unit") || "") || null };
    try { const item = await recipeApi.addIngredient(recipe.id, payload) as RecipeIngredientDto; setIngredients(current => [...current, item]); form.reset(); setManagerError(""); } catch { setManagerError("Could not add ingredient."); }
  }

  async function addStep(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!recipe) return;
    const form = event.currentTarget; const data = new FormData(form);
    const payload: CreateRecipeStepRequest = { title: String(data.get("title") || ""), description: String(data.get("description")) };
    try { const item = await recipeApi.addStep(recipe.id, payload) as RecipeStepDto; setSteps(current => [...current, item]); form.reset(); setManagerError(""); } catch { setManagerError("Could not add step."); }
  }

  async function saveIngredient(event: FormEvent<HTMLFormElement>, item: RecipeIngredientDto) {
    event.preventDefault(); if (!recipe) return; const data = new FormData(event.currentTarget);
    const payload: CreateRecipeIngredientRequest = { name: String(data.get("name")), quantity: data.get("quantity") ? Number(data.get("quantity")) : null, unit: String(data.get("unit") || "") || null };
    try { const saved = await recipeApi.updateIngredient(recipe.id, item.id, payload) as RecipeIngredientDto; setIngredients(current => current.map(x => x.id === saved.id ? saved : x)); setManagerError(""); } catch { setManagerError("Could not update ingredient."); }
  }

  async function saveStep(event: FormEvent<HTMLFormElement>, item: RecipeStepDto) {
    event.preventDefault(); if (!recipe) return; const data = new FormData(event.currentTarget);
    const payload: CreateRecipeStepRequest = { title: String(data.get("title") || ""), description: String(data.get("description")) };
    try { const saved = await recipeApi.updateStep(recipe.id, item.id, payload) as RecipeStepDto; setSteps(current => current.map(x => x.id === saved.id ? saved : x)); setManagerError(""); } catch { setManagerError("Could not update step."); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!recipe) return;
    const data = new FormData(event.currentTarget);
    const payload: UpdateRecipeRequest = {
      title: String(data.get("title")), description: String(data.get("description")), instructions: String(data.get("instructions")),
      prepTime: Number(data.get("prepTime")), cookTime: Number(data.get("cookTime")), servings: Number(data.get("servings")),
      difficulty: Number(data.get("difficulty")) as UpdateRecipeRequest["difficulty"], categoryId: String(data.get("categoryId")),
      rowVersion: recipe.rowVersion,
      nutrition: { calories: data.get("calories") ? Number(data.get("calories")) : null, protein: data.get("protein") ? Number(data.get("protein")) : null, carbohydrates: data.get("carbohydrates") ? Number(data.get("carbohydrates")) : null, fat: data.get("fat") ? Number(data.get("fat")) : null, fiber: data.get("fiber") ? Number(data.get("fiber")) : null, sodium: data.get("sodium") ? Number(data.get("sodium")) : null },
    };
    setSaving(true); setError("");
    try { await recipeApi.update(recipe.id, payload); router.push("/dashboard/recipes"); }
    catch { setError("Lưu thất bại. Kiểm tra dữ liệu và quyền chỉnh sửa."); }
    finally { setSaving(false); }
  }

  if (error && !recipe) return <main className="mx-auto max-w-3xl p-6"><p role="alert" className="text-red-700">{error}</p><Link className="underline" href="/dashboard/recipes">Quay lại danh sách</Link></main>;
  if (!recipe) return <main className="p-6">Đang tải…</main>;
  return <main className="mx-auto max-w-3xl p-6"><h1 className="mb-6 text-3xl font-bold">Chỉnh sửa công thức</h1>
    <form className="grid gap-4" onSubmit={submit}>
      <label>Tên công thức<input required minLength={3} maxLength={200} name="title" defaultValue={recipe.title} className="mt-1 w-full rounded border p-2" /></label>
      <label>Mô tả<textarea name="description" defaultValue={recipe.description ?? ""} className="mt-1 w-full rounded border p-2" /></label>
      <label>Hướng dẫn<textarea name="instructions" defaultValue={recipe.instructions ?? ""} className="mt-1 min-h-32 w-full rounded border p-2" /></label>
      <div className="grid gap-3 sm:grid-cols-3"><label>Chuẩn bị (phút)<input required min="0" type="number" name="prepTime" defaultValue={recipe.prepTime} className="mt-1 w-full rounded border p-2" /></label><label>Nấu (phút)<input required min="0" type="number" name="cookTime" defaultValue={recipe.cookTime} className="mt-1 w-full rounded border p-2" /></label><label>Khẩu phần<input required min="1" type="number" name="servings" defaultValue={recipe.servings} className="mt-1 w-full rounded border p-2" /></label></div>
      <label>Category<select required name="categoryId" defaultValue={recipe.categoryId} className="mt-1 w-full rounded border p-2">{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label>Độ khó<select name="difficulty" defaultValue={recipe.difficulty} className="mt-1 w-full rounded border p-2"><option value={1}>Dễ</option><option value={2}>Trung bình</option><option value={3}>Khó</option><option value={4}>Chuyên gia</option></select></label>
      <fieldset className="grid gap-3 rounded border p-4 sm:grid-cols-3"><legend className="px-2 font-semibold">Nutrition per serving</legend>{([["calories","Calories"],["protein","Protein (g)"],["carbohydrates","Carbohydrates (g)"],["fat","Fat (g)"],["fiber","Fiber (g)"],["sodium","Sodium (mg)"]] as const).map(([name,label]) => <label key={name}>{label}<input min="0" step="0.01" type="number" name={name} defaultValue={recipe.nutrition?.[name] ?? ""} className="mt-1 w-full rounded border p-2" /></label>)}</fieldset>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <div className="flex gap-3"><button disabled={saving} className="rounded bg-orange-600 px-4 py-2 text-white">{saving ? "Đang lưu…" : "Lưu thay đổi"}</button><Link className="rounded border px-4 py-2" href="/dashboard/recipes">Hủy</Link></div>
    </form>
    <div className="mt-8 grid gap-8">
      <section className="rounded-xl border p-5"><h2 className="mb-4 text-xl font-semibold">Ingredients</h2><div className="grid gap-3">{ingredients.map(item => <form key={item.id} className="grid gap-2 sm:grid-cols-[1fr_8rem_8rem_auto_auto]" onSubmit={event => saveIngredient(event,item)}><input required name="name" defaultValue={item.name} aria-label="Ingredient name" className="rounded border p-2"/><input name="quantity" type="number" min="0.001" step="0.001" defaultValue={item.quantity ?? ""} aria-label="Quantity" className="rounded border p-2"/><input name="unit" defaultValue={item.unit ?? ""} aria-label="Unit" className="rounded border p-2"/><button className="rounded border px-3">Save</button><button type="button" className="text-red-700" onClick={async()=>{try{await recipeApi.deleteIngredient(recipe.id,item.id);setIngredients(current=>current.filter(x=>x.id!==item.id));}catch{setManagerError("Could not delete ingredient.");}}}>Delete</button></form>)}</div><form className="mt-4 grid gap-2 sm:grid-cols-[1fr_8rem_8rem_auto]" onSubmit={addIngredient}><input required name="name" placeholder="Ingredient" className="rounded border p-2"/><input name="quantity" type="number" min="0.001" step="0.001" placeholder="Quantity" className="rounded border p-2"/><input name="unit" placeholder="Unit" className="rounded border p-2"/><button className="rounded bg-gray-900 px-3 py-2 text-white">Add</button></form></section>
      <section className="rounded-xl border p-5"><h2 className="mb-4 text-xl font-semibold">Preparation steps</h2><div className="grid gap-3">{steps.map((item,index)=><form key={item.id} className="grid gap-2 rounded border p-3" onSubmit={event=>saveStep(event,item)}><div className="flex items-center justify-between"><strong>Step {index+1}</strong><div className="flex gap-3"><button type="button" disabled={index===0} onClick={async()=>{const ids=steps.map(x=>x.id);[ids[index-1],ids[index]]=[ids[index],ids[index-1]];try{await recipeApi.reorderSteps(recipe.id,ids);setSteps(current=>{const next=[...current];[next[index-1],next[index]]=[next[index],next[index-1]];return next;});}catch{setManagerError("Could not reorder steps.");}}}>Up</button><button type="button" disabled={index===steps.length-1} onClick={async()=>{const ids=steps.map(x=>x.id);[ids[index+1],ids[index]]=[ids[index],ids[index+1]];try{await recipeApi.reorderSteps(recipe.id,ids);setSteps(current=>{const next=[...current];[next[index+1],next[index]]=[next[index],next[index+1]];return next;});}catch{setManagerError("Could not reorder steps.");}}}>Down</button><button type="button" className="text-red-700" onClick={async()=>{try{await recipeApi.deleteStep(recipe.id,item.id);setSteps(current=>current.filter(x=>x.id!==item.id));}catch{setManagerError("Could not delete step.");}}}>Delete</button></div></div><input name="title" defaultValue={item.title} placeholder="Step title" className="rounded border p-2"/><textarea required name="description" defaultValue={item.description ?? item.text} className="rounded border p-2"/><button className="justify-self-start rounded border px-3 py-1">Save step</button></form>)}</div><form className="mt-4 grid gap-2" onSubmit={addStep}><input name="title" placeholder="Step title" className="rounded border p-2"/><textarea required name="description" placeholder="Describe this step" className="rounded border p-2"/><button className="justify-self-start rounded bg-gray-900 px-3 py-2 text-white">Add step</button></form></section>
      <section className="rounded-xl border p-5"><h2 className="mb-4 text-xl font-semibold">Recipe images</h2><div className="grid gap-3">{images.map(image=><div key={image.id} className="flex flex-wrap items-center justify-between gap-3 rounded border p-3"><a href={image.originalUrl} target="_blank" rel="noreferrer" className="underline">Image {image.orderIndex+1} · {image.processingStatus}</a><div className="flex gap-3"><button type="button" disabled={image.isPrimary} onClick={async()=>{try{await recipeApi.setPrimaryImage(recipe.id,image.id);setImages(current=>current.map(x=>({...x,isPrimary:x.id===image.id})));}catch{setManagerError("Could not set primary image.");}}}>{image.isPrimary?"Primary":"Set primary"}</button><button type="button" className="text-red-700" onClick={async()=>{try{await recipeApi.deleteImage(recipe.id,image.id);setImages(current=>current.filter(x=>x.id!==image.id));}catch{setManagerError("Could not delete image.");}}}>Delete</button></div></div>)}</div><label className="mt-4 block">Upload an image<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="mt-2 block" onChange={async event=>{const file=event.target.files?.[0];if(!file)return;try{const uploaded=await recipeApi.uploadImage(recipe.id,file,file.name);setImages(current=>[...current,uploaded]);setManagerError("");}catch{setManagerError("Image upload failed.");}finally{event.target.value="";}}}/></label></section>
      {managerError && <p role="alert" className="rounded bg-red-50 p-3 text-red-700">{managerError}</p>}
    </div>
  </main>;
}
