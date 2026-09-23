import axiosClient from "./axiosClient";
import { CategoryDto, CreateCategoryDto, UpdateCategoryDto } from "@/types/category.types";
import { mockCategories } from "../mock-data";

let localCategories: CategoryDto[] = [...mockCategories];

export const categoryApi = {
  async getAll(): Promise<CategoryDto[]> {
    try {
      const response = await axiosClient.get<CategoryDto[]>("/api/v1/categories");
      if (response.data && response.data.length > 0) {
        return response.data;
      }
      return localCategories;
    } catch {
      return localCategories;
    }
  },

  async getBySlug(slug: string): Promise<CategoryDto | null> {
    try {
      const categories = await this.getAll();
      return categories.find((c) => c.slug.toLowerCase() === slug.toLowerCase()) || null;
    } catch {
      return localCategories.find((c) => c.slug.toLowerCase() === slug.toLowerCase()) || null;
    }
  },

  async create(dto: CreateCategoryDto): Promise<CategoryDto> {
    const slug = dto.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    try {
      const response = await axiosClient.post<CategoryDto>("/api/v1/categories", dto);
      if (response.data) {
        return response.data;
      }
    } catch {
      // Offline fallback handling
    }

    const newCategory: CategoryDto = {
      id: `c-${Date.now()}`,
      name: dto.name,
      slug,
      description: dto.description || null,
      imageUrl: dto.imageUrl || null,
      orderIndex: dto.orderIndex || localCategories.length + 1,
      recipeCount: 0,
      avgCookTimeMinutes: null,
    };
    localCategories = [newCategory, ...localCategories];
    return newCategory;
  },

  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryDto> {
    try {
      const response = await axiosClient.put<CategoryDto>(`/api/v1/categories/${id}`, dto);
      if (response.data) {
        return response.data;
      }
    } catch {
      // Offline fallback handling
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
    // Check if category has recipes
    const cat = localCategories.find((c) => c.id === id);
    if (cat && cat.recipeCount > 0) {
      throw new Error("Cannot delete category with associated recipes.");
    }

    try {
      await axiosClient.delete(`/api/v1/categories/${id}`);
    } catch {
      // Offline fallback
    }
    localCategories = localCategories.filter((c) => c.id !== id);
  },
};
