import axiosClient from "./axiosClient";
import type { ApiResponse } from "@/types/api.types";
import type { stepPayload } from "@/lib/step-form";

export type StepPayload = ReturnType<typeof stepPayload>;
export type StepDto = Omit<StepPayload, "title"> & { id: string; recipeId: string; stepNumber: number; title: string };
const path = (id: string) => `/api/v1/recipes/${id}/steps`;
function etag(headers: Record<string, unknown>): string {
  if (typeof headers.etag !== "string" || !headers.etag) throw new Error("Không nhận được version. Hãy tải lại các bước.");
  return headers.etag;
}
export const stepApi = {
  async list(recipeId: string, signal?: AbortSignal) {
    const result = await axiosClient.get<ApiResponse<StepDto[]>>(path(recipeId), { signal });
    return { items: result.data.data, etag: etag(result.headers) };
  },
  async save(recipeId: string, id: string | undefined, input: StepPayload, version: string) {
    const config = { headers: { "If-Match": version } };
    const result = id ? await axiosClient.put<ApiResponse<StepDto>>(`${path(recipeId)}/${id}`, input, config)
      : await axiosClient.post<ApiResponse<StepDto>>(path(recipeId), input, config);
    return { item: result.data.data, etag: etag(result.headers) };
  },
  async remove(recipeId: string, id: string, version: string) {
    const result = await axiosClient.delete(`${path(recipeId)}/${id}`, { headers: { "If-Match": version } });
    return etag(result.headers);
  },
  async reorder(recipeId: string, stepIds: string[], version: string) {
    const result = await axiosClient.put<ApiResponse<StepDto[]>>(`${path(recipeId)}/reorder`, { stepIds }, { headers: { "If-Match": version } });
    return { items: result.data.data, etag: etag(result.headers) };
  },
};
