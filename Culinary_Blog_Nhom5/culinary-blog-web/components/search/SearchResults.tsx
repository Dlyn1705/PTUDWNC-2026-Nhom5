import { RecipeCard } from "@/components/recipes/RecipeCard";
import type { DifficultyValue, SearchRecipeSummaryDto } from "@/types/recipe.types";

const difficulty: Record<string, DifficultyValue> = { Easy: 1, Medium: 2, Hard: 3, Expert: 4 };

export function SearchResults({ recipes }: { recipes: SearchRecipeSummaryDto[] }) {
  return <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{recipes.map(recipe =>
    <RecipeCard key={recipe.id} recipe={{
      id: recipe.id, title: recipe.title, slug: recipe.slug, description: recipe.description,
      createdAt: recipe.createdAt, prepTimeMinutes: recipe.prepTime, cookTimeMinutes: recipe.cookTime,
      servings: recipe.servings, difficulty: difficulty[recipe.difficulty] ?? 1, status: 1,
      categoryId: recipe.category.id, categoryName: recipe.category.name, categorySlug: recipe.category.slug,
      author: recipe.author,
      images: recipe.primaryImageUrl ? [{ id: recipe.id, url: recipe.primaryImageUrl, isPrimary: true, alt: recipe.title }] : [],
    }} />
  )}</div>;
}
