import axios from "axios";
import axiosClient from "./axiosClient";
import type { ApiResponse, PaginationMeta } from "@/types/api.types";
import {
  CategoryDetailResult,
  CategoryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from "@/types/category.types";
import type { RecipeCardDto } from "@/types/recipe.types";
import { mockCategories, mockRecipes } from "../mock-data";

let localCategories: CategoryDto[] = [...mockCategories];
const mockModeEnabled =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_ENABLE_MOCKS === "true";

interface CategoryDetailApiResponse {
  data: {
    category: CategoryDto;
    recipes: RecipeCardDto[];
  };
  meta: PaginationMeta;
}

export const categoryApi = {
  async getAll(): Promise<CategoryDto[]> {
    try {
      const response = await axiosClient.get<ApiResponse<CategoryDto[]>>(
        "/api/v1/categories",
      );
      return response.data.data;
    } catch (error) {
      if (mockModeEnabled) return localCategories;
      throw error;
    }
  },

  async getBySlug(
    slug: string,
    page = 1,
    pageSize = 12,
  ): Promise<CategoryDetailResult | null> {
    try {
      const response = await axiosClient.get<CategoryDetailApiResponse>(
        `/api/v1/categories/${encodeURIComponent(slug)}`,
        { params: { page, pageSize } },
      );
      return {
        category: response.data.data.category,
        recipes: response.data.data.recipes,
        meta: response.data.meta,
      };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) return null;
      if (!mockModeEnabled) throw error;

      const category = localCategories.find(
        (item) => item.slug.toLowerCase() === slug.toLowerCase(),
      );
      if (!category) return null;

      const recipes = mockRecipes.filter(
        (recipe) =>
          recipe.status === 1 &&
          (recipe.categoryId === category.id ||
            recipe.categoryName?.toLowerCase() === category.name.toLowerCase()),
      );
      const start = (page - 1) * pageSize;
      const totalPages = Math.ceil(recipes.length / pageSize);

      return {
        category: { ...category, recipeCount: recipes.length },
        recipes: recipes.slice(start, start + pageSize),
        meta: {
          page,
          pageSize,
          totalCount: recipes.length,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      };
    }
  },

  async create(dto: CreateCategoryDto): Promise<CategoryDto> {
    const slug = dto.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    try {
      const response = await axiosClient.post<ApiResponse<CategoryDto>>(
        "/api/v1/categories",
        dto,
      );
      return response.data.data;
    } catch (error) {
      if (!mockModeEnabled) throw error;
    }

    const newCategory: CategoryDto = {
      id: `c-${Date.now()}`,
      name: dto.name,
      slug,
      description: dto.description || null,
      imageUrl: dto.imageUrl || null,
      orderIndex: dto.orderIndex || localCategories.length + 1,
      recipeCount: 0,
    };
    localCategories = [newCategory, ...localCategories];
    return newCategory;
  },

  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryDto> {
    try {
      const response = await axiosClient.put<ApiResponse<CategoryDto>>(
        `/api/v1/categories/${id}`,
        dto,
      );
      return response.data.data;
    } catch (error) {
      if (!mockModeEnabled) throw error;
    }

    const index = localCategories.findIndex((c) => c.id === id);
    if (index !== -1) {
      localCategories[index] = {
        ...localCategories[index],
        name: dto.name,
        description: dto.description ?? localCategories[index].description,
        imageUrl: dto.imageUrl ?? localCategories[index].imageUrl,
        orderIndex: dto.orderIndex ?? localCategories[index].orderIndex,
      };
      return localCategories[index];
    }
    throw new Error("Category not found");
  },

  async delete(id: string): Promise<void> {
    try {
      await axiosClient.delete(`/api/v1/categories/${id}`);
      return;
    } catch (error) {
      if (!mockModeEnabled) throw error;
    }

    const cat = localCategories.find((c) => c.id === id);
    if (cat && cat.recipeCount > 0) {
      throw new Error("Cannot delete category with associated recipes.");
    }
    localCategories = localCategories.filter((c) => c.id !== id);
  },
};
