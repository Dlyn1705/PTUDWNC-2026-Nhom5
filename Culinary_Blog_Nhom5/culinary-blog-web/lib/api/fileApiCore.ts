import type { AxiosInstance, AxiosResponse } from "axios";
import { ApiProblemError, responseProblem, toApiProblemError, type ApiErrorContext } from "./problemDetails";
import { responseCorrelationId } from "./responseMetadata";
import { validateImageFile } from "./imageErrors";
import type { StoredRecipeImage as RecipeImageDto } from "../../types/recipe-management.types";

const path = (recipeId: string) => `/api/v1/recipes/${recipeId}/images`;
const cancelled = () => new ApiProblemError({}, undefined, { kind: "cancelled", clientCode: "REQUEST_CANCELLED" });
function checkAbort(signal?: AbortSignal) { if (signal?.aborted) throw cancelled(); }
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(cancelled()); return; }
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); };
    const abort = () => { cleanup(); reject(cancelled()); };
    const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

export function isRecipeImage(value: unknown): value is RecipeImageDto {
  if (!value || typeof value !== "object") return false;
  const image = value as Record<string, unknown>;
  return typeof image.id === "string" && image.id.length > 0
    && typeof image.recipeId === "string" && image.recipeId.length > 0
    && typeof image.originalUrl === "string" && image.originalUrl.length > 0
    && ["mediumUrl", "thumbnailUrl", "altText"].every(key => image[key] === null || typeof image[key] === "string")
    && typeof image.isPrimary === "boolean" && Number.isInteger(image.orderIndex) && Number(image.orderIndex) >= 0
    && typeof image.processingStatus === "string" && ["Pending", "Processing", "Completed", "Failed"].includes(image.processingStatus);
}

function invalidResponse(response: AxiosResponse, context: ApiErrorContext): ApiProblemError {
  return responseProblem(response, { ...context, kind: "invalid_response", clientCode: "INVALID_API_RESPONSE" });
}
function imageResponse(response: AxiosResponse, context: ApiErrorContext): RecipeImageDto {
  const body: unknown = response.data;
  if (!body || typeof body !== "object" || !("success" in body) || body.success !== true
    || !("data" in body) || !isRecipeImage(body.data)
    || body.data.recipeId.toLowerCase() !== context.recipeId?.toLowerCase()
    || (context.imageId && body.data.id.toLowerCase() !== context.imageId.toLowerCase())) {
    throw invalidResponse(response, context);
  }
  return body.data;
}

export interface ImagePollingOptions {
  timeoutMs?: number;
  intervalMs?: number;
  onImage?: (image: RecipeImageDto) => void;
}
interface InitialImage { image: RecipeImageDto; response: AxiosResponse }

/** Inject the HTTP client so transport, deadlines and contracts can be tested without auth or a server. */
export function createFileApi(client: Pick<AxiosInstance, "post" | "get" | "delete" | "patch">) {
  async function pollImage(recipeId: string, imageId: string, signal?: AbortSignal,
    options: ImagePollingOptions = {}, initial?: InitialImage): Promise<RecipeImageDto> {
    const context: ApiErrorContext = { operation: "poll", recipeId, imageId, image: initial?.image };
    const controller = new AbortController();
    let abortKind: "cancelled" | "processing_timeout" | undefined;
    const abort = (kind: typeof abortKind) => {
      if (!controller.signal.aborted) { abortKind = kind; controller.abort(); }
    };
    const onAbort = () => abort("cancelled");
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    const budget = Math.max(0, options.timeoutMs ?? 30_000);
    const deadline = performance.now() + budget;
    const timer = setTimeout(() => abort("processing_timeout"), budget);
    let response = initial?.response;
    let image = initial?.image;
    try {
      while (true) {
        checkAbort(controller.signal);
        if (response) context.lastResponse = { status: response.status, correlationId: responseCorrelationId(response) };
        if (image) {
          context.image = image;
          options.onImage?.(image);
          checkAbort(controller.signal);
          if (image.processingStatus === "Completed") return image;
          if (image.processingStatus === "Failed") {
            throw responseProblem(response!, { ...context, kind: "image_processing", clientCode: "IMAGE_PROCESSING_FAILED" });
          }
          await delay(Math.min(options.intervalMs ?? 1000, Math.max(0, deadline - performance.now())), controller.signal);
        }
        checkAbort(controller.signal);
        const remaining = deadline - performance.now();
        // Leave a small scheduling margin so a poll cannot start on the deadline
        // and race the processing-timeout timer on slower CI runners.
        if (remaining <= 1) { abort("processing_timeout"); checkAbort(controller.signal); }
        const nextResponse: AxiosResponse = await client.get(`${path(recipeId)}/${imageId}`, {
          signal: controller.signal, timeout: Math.max(1, Math.min(10_000, Math.ceil(remaining))),
        });
        checkAbort(controller.signal);
        response = nextResponse;
        image = imageResponse(nextResponse, context);
      }
    } catch (cause) {
      const error = toApiProblemError(cause, context);
      if (error.kind === "cancelled" && abortKind === "processing_timeout") {
        throw new ApiProblemError({}, undefined, {
          ...context, kind: "processing_timeout", clientCode: "IMAGE_PROCESSING_TIMEOUT", cause,
        });
      }
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  return {
    async getRecipeImageStatus(recipeId: string, imageId: string, signal?: AbortSignal): Promise<RecipeImageDto> {
      const context: ApiErrorContext = { operation: "poll", recipeId, imageId };
      try {
        checkAbort(signal);
        const response = await client.get(`${path(recipeId)}/${imageId}`, { signal });
        checkAbort(signal);
        return imageResponse(response, context);
      } catch (cause) { throw toApiProblemError(cause, context); }
    },
    async uploadRecipeImage(recipeId: string, file: File, onProgress?: (percent: number) => void,
      signal?: AbortSignal, altText?: string, options: ImagePollingOptions = {}): Promise<RecipeImageDto> {
      const context: ApiErrorContext = { operation: "upload", recipeId };
      try {
        checkAbort(signal);
        validateImageFile(file);
        if (altText && altText.trim().length > 200) throw new ApiProblemError({
          errors: { altText: ["Văn bản thay thế tối đa 200 ký tự."] },
        }, undefined, { kind: "validation" });
        const form = new FormData();
        form.append("file", file);
        if (altText?.trim()) form.append("altText", altText.trim());
        const response = await client.post(path(recipeId), form, {
          signal, timeout: 120_000, headers: { "Content-Type": undefined },
          onUploadProgress: event => {
            if (!signal?.aborted && event.total) onProgress?.(Math.min(100, Math.round(event.loaded / event.total * 100)));
          },
        });
        const image = imageResponse(response, context);
        context.image = image;
        context.imageId = image.id;
        checkAbort(signal);
        return await pollImage(recipeId, image.id, signal, options, { image, response });
      } catch (cause) { throw toApiProblemError(cause, context); }
    },
    waitForRecipeImage(recipeId: string, imageId: string, signal?: AbortSignal, options?: ImagePollingOptions) {
      return pollImage(recipeId, imageId, signal, options);
    },
    async getRecipeImages(recipeId: string, signal?: AbortSignal): Promise<RecipeImageDto[]> {
      const context: ApiErrorContext = { operation: "list", recipeId };
      try {
        checkAbort(signal);
        const response = await client.get(path(recipeId), { signal });
        checkAbort(signal);
        const body = response.data;
        if (!body || body.success !== true || !Array.isArray(body.data)
          || !body.data.every((item: unknown) => isRecipeImage(item) && item.recipeId.toLowerCase() === recipeId.toLowerCase())) {
          throw invalidResponse(response, context);
        }
        return body.data;
      } catch (cause) { throw toApiProblemError(cause, context); }
    },
    async deleteRecipeImage(recipeId: string, imageId: string, signal?: AbortSignal): Promise<void> {
      const context: ApiErrorContext = { operation: "delete", recipeId, imageId };
      try {
        checkAbort(signal);
        const response = await client.delete(`${path(recipeId)}/${imageId}`, { signal });
        if (response.status !== 204) throw invalidResponse(response, context);
      } catch (cause) { throw toApiProblemError(cause, context); }
    },
    async setRecipeImagePrimary(recipeId: string, imageId: string, signal?: AbortSignal): Promise<RecipeImageDto> {
      const context: ApiErrorContext = { operation: "set_primary", recipeId, imageId };
      try {
        checkAbort(signal);
        const response = await client.patch(`${path(recipeId)}/${imageId}/primary`, undefined, { signal });
        const image = imageResponse(response, context);
        if (!image.isPrimary) throw invalidResponse(response, context);
        return image;
      } catch (cause) { throw toApiProblemError(cause, context); }
    },
  };
}
