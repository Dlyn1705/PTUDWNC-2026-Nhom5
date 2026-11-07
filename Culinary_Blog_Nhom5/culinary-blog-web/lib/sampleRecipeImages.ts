import type { RecipeImageDto } from "@/types/recipe.types";

const sampleImages = new Map([
  ["che-dau-do", ["che-dau-do.svg", "Ảnh minh họa chè đậu đỏ"]],
  [
    "ga-nuong-mat-ong",
    ["ga-nuong-mat-ong.svg", "Ảnh minh họa gà nướng mật ong"],
  ],
  [
    "banh-xeo-tom-thit",
    ["banh-xeo-tom-thit.svg", "Ảnh minh họa bánh xèo tôm thịt"],
  ],
]);

export function recipeDisplayImages(recipe: {
  slug: string;
  images?: RecipeImageDto[] | null;
}): RecipeImageDto[] {
  const uploaded = recipe.images?.filter((image) => image.url?.trim()) ?? [];
  if (uploaded.length) return uploaded;
  const sample = sampleImages.get(recipe.slug);
  return sample
    ? [
        {
          id: `sample-${recipe.slug}`,
          url: `/samples/recipes/${sample[0]}`,
          alt: sample[1],
          isPrimary: true,
        },
      ]
    : [];
}
