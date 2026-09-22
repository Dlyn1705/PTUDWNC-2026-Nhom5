import axiosClient from "./axiosClient";
import { CategoryDto } from "@/types/category.types";

export const FALLBACK_CATEGORIES: CategoryDto[] = [
  {
    id: "c1-pasta",
    name: "Pasta",
    slug: "pasta",
    description: "Hand-rolled, baked and skillet pastas for every night of the week.",
    imageUrl: "https://images.unsplash.com/photo-1621996346565-e3d5d6281292?q=80&w=800&auto=format&fit=crop",
    orderIndex: 1,
    recipeCount: 1,
    avgCookTimeMinutes: 40,
  },
  {
    id: "c2-mains",
    name: "Mains",
    slug: "mains",
    description: "Centerpiece dishes worth gathering around.",
    imageUrl: "https://images.unsplash.com/photo-1598103442097-8b74394b95c6?q=80&w=800&auto=format&fit=crop",
    orderIndex: 2,
    recipeCount: 2,
    avgCookTimeMinutes: 123,
  },
  {
    id: "c3-baking",
    name: "Baking",
    slug: "baking",
    description: "Cakes, breads and slow afternoons with the oven on.",
    imageUrl: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?q=80&w=800&auto=format&fit=crop",
    orderIndex: 3,
    recipeCount: 1,
    avgCookTimeMinutes: 57,
  },
  {
    id: "c4-salads",
    name: "Salads",
    slug: "salads",
    description: "Crisp greens, robust grains, and vibrant dressings for all seasons.",
    imageUrl: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=800&auto=format&fit=crop",
    orderIndex: 4,
    recipeCount: 0,
    avgCookTimeMinutes: null,
  },
];

export const categoryApi = {
  async getAll(): Promise<CategoryDto[]> {
    try {
      const response = await axiosClient.get<CategoryDto[]>("/api/v1/categories");
      if (response.data && response.data.length > 0) {
        return response.data;
      }
      return FALLBACK_CATEGORIES;
    } catch {
      // Return high-fidelity fallback when API is not yet available or offline
      return FALLBACK_CATEGORIES;
    }
  },

  async getBySlug(slug: string): Promise<CategoryDto | null> {
    try {
      const categories = await this.getAll();
      return categories.find((c) => c.slug.toLowerCase() === slug.toLowerCase()) || null;
    } catch {
      return FALLBACK_CATEGORIES.find((c) => c.slug.toLowerCase() === slug.toLowerCase()) || null;
    }
  },
};
