import Link from "next/link";
import type { SearchRecipeSummaryDto } from "@/types/recipe.types";

export function SearchResults({ recipes }: { recipes: SearchRecipeSummaryDto[] }) {
  if (recipes.length === 0) return <p className="rounded-2xl border border-border p-8 text-center text-muted-foreground">Chưa tìm thấy công thức phù hợp.</p>;
  return <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{recipes.map((recipe) => <Link key={recipe.id} href={`/recipes/${recipe.slug}`} className="rounded-2xl border border-border bg-card p-5 shadow-soft"><p className="text-xs font-semibold text-primary">{recipe.category.name}</p><h3 className="mt-2 font-display text-xl font-bold">{recipe.title}</h3><p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{recipe.description}</p></Link>)}</div>;
}
