import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import axios, { AxiosError } from "axios";
import { createRecipeEditorApi } from "../lib/api/recipeEditorApi";
import { createRecipeLifecycleApi } from "../lib/api/recipeLifecycleApi";
import { collectPublishedRecipes, createRecipePublicApi } from "../lib/api/recipePublicApi";
import { isApiProblemError } from "../lib/api/problemDetails";
import { createBaseApiClient, resolveApiUrl } from "../lib/api/axiosClient";
import { RecipeStatus, type PagedResult, type RecipeStatusValue, type RecipeSummaryDto } from "../types/recipe.types";
import { recipeKeys } from "../hooks/queries/recipeKeys";

function summary(id: string, status: RecipeStatusValue = RecipeStatus.Published): RecipeSummaryDto {
  return {
    id,
    title: `Recipe ${id}`,
    slug: `recipe-${id}`,
    createdAt: "2026-10-19T00:00:00Z",
    description: "Description",
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    servings: 4,
    difficulty: 1,
    status,
    categoryId: "category",
    author: { id: "author", displayName: "Author" },
    images: [],
  };
}

function page(data: RecipeSummaryDto[], current = 1, totalPages = 1): PagedResult<RecipeSummaryDto> {
  return {
    data,
    meta: {
      page: current,
      pageSize: 50,
      totalCount: data.length,
      totalPages,
      hasNextPage: current < totalPages,
      hasPreviousPage: current > 1,
    },
  };
}

test("public list uses documented params and exact data/meta transport", async () => {
  let observed: { url?: string; params?: unknown; withCredentials?: boolean } = {};
  const client = axios.create({ adapter: async (config) => {
    observed = { url: config.url, params: config.params, withCredentials: config.withCredentials };
    return { config, status: 200, statusText: "OK", headers: {}, data: page([summary("1")]) };
  } });
  const api = createRecipePublicApi(client);
  const result = await api.getPaged({ page: 0, pageSize: 500, categoryId: "cat", difficulty: 2 });

  assert.equal(observed.url, "/api/v1/recipes");
  assert.deepEqual(observed.params, {
    page: 1,
    pageSize: 50,
    categoryId: "cat",
    difficulty: 2,
    sortBy: "createdAt",
    sortOrder: "desc",
  });
  assert.deepEqual(result.data.map((recipe) => recipe.id), ["1"]);
  assert.equal(result.meta.page, 1);
});

test("browser credentials and server/browser base URLs stay separated", () => {
  const environment = {
    API_INTERNAL_URL: "http://api:8080",
    NEXT_PUBLIC_API_URL: "https://public.example.test",
  };
  assert.equal(resolveApiUrl(true, environment), "http://api:8080");
  assert.equal(resolveApiUrl(false, environment), "https://public.example.test");
  const client = createBaseApiClient("https://public.example.test");
  assert.equal(client.defaults.withCredentials, true);
  assert.equal(client.defaults.timeout, 10_000);
});

test("search trims q, keeps pagination wrapper and rejects a one-character query", async () => {
  let params: Record<string, unknown> | undefined;
  const client = axios.create({ adapter: async (config) => {
    params = config.params;
    return { config, status: 200, statusText: "OK", headers: {}, data: {
      data: [],
      meta: { page: 1, pageSize: 12, totalCount: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    } };
  } });
  const api = createRecipePublicApi(client);
  const result = await api.search({ q: "  phở  ", page: 1 });
  assert.equal(params?.q, "phở");
  assert.deepEqual(result.data, []);
  await assert.rejects(api.search({ q: "x" }), (error) => {
    assert.ok(isApiProblemError(error));
    assert.equal(error.status, 422);
    return true;
  });
});

test("public slug uses an encoded slug and maps only 404 to null", async () => {
  let url = "";
  const okClient = axios.create({ adapter: async (config) => {
    url = config.url ?? "";
    return { config, status: 200, statusText: "OK", headers: {}, data: { data: { ...summary("1"), nutrition: {}, steps: [], ingredients: [] } } };
  } });
  assert.equal((await createRecipePublicApi(okClient).getBySlug("bún bò"))?.id, "1");
  assert.equal(url, "/api/v1/recipes/b%C3%BAn%20b%C3%B2");

  const missingClient = axios.create({ adapter: async (config) => {
    throw new AxiosError("missing", "ERR_BAD_RESPONSE", config, undefined, {
      config, status: 404, statusText: "Not Found", headers: {}, data: { status: 404, title: "Not found" },
    });
  } });
  assert.equal(await createRecipePublicApi(missingClient).getBySlug("missing"), null);
});

test("sitemap collector follows every page and rejects draft or archived rows defensively", async () => {
  const requested: number[] = [];
  const recipes = await collectPublishedRecipes({ getPaged: async (params = {}) => {
    requested.push(params.page ?? 1);
    return params.page === 1
      ? page([summary("published-1"), summary("draft", RecipeStatus.Draft)], 1, 2)
      : page([summary("published-2"), summary("archived", RecipeStatus.Archived)], 2, 2);
  } });
  assert.deepEqual(requested, [1, 2]);
  assert.deepEqual(recipes.map((recipe) => recipe.id), ["published-1", "published-2"]);
});

test("editor API uses explicit management routes, wrappers and request bodies", async () => {
  const calls: Array<{ method?: string; url?: string; data?: unknown; params?: unknown }> = [];
  const client = axios.create({ adapter: async (config) => {
    calls.push({ method: config.method, url: config.url, data: config.data && JSON.parse(config.data), params: config.params });
    if (config.method === "delete") return { config, status: 204, statusText: "No Content", headers: {}, data: undefined };
    if (config.url?.includes("nutrition")) return { config, status: 200, statusText: "OK", headers: {}, data: { data: { calories: 1 } } };
    if (config.method === "get") return { config, status: 200, statusText: "OK", headers: {}, data: { data: { ...summary("1"), nutrition: {}, steps: [], ingredients: [] } } };
    return { config, status: config.method === "post" ? 201 : 200, statusText: "OK", headers: {}, data: {
      data: { id: "1", slug: "recipe-1", rowVersion: "v1", message: "ok" },
    } };
  } });
  const api = createRecipeEditorApi(client);
  const payload = { title: "Recipe", prepTime: 1, cookTime: 2, servings: 3, difficulty: 1 as const, categoryId: "cat" };

  await api.getById("id/unsafe");
  await api.create(payload);
  await api.update("id", payload);
  await api.updateNutrition("id", { calories: 1, protein: 2, carbohydrates: 3, fat: 4, fiber: 5, sodium: 6 });
  await api.delete("id");

  assert.equal(calls[0].url, "/api/v1/recipes/by-id/id%2Funsafe");
  assert.deepEqual(calls.slice(1).map((call) => [call.method, call.url]), [
    ["post", "/api/v1/recipes"],
    ["put", "/api/v1/recipes/id"],
    ["put", "/api/v1/recipes/id/nutrition"],
    ["delete", "/api/v1/recipes/id"],
  ]);
  assert.deepEqual(calls[1].data, payload);
});

test("lifecycle API uses PATCH for the four canonical actions and never /restore", async () => {
  const calls: Array<{ method?: string; url?: string }> = [];
  const client = axios.create({ adapter: async (config) => {
    calls.push({ method: config.method, url: config.url });
    return { config, status: 200, statusText: "OK", headers: {}, data: { data: { id: "1", status: 1, publishedAt: null } } };
  } });
  const api = createRecipeLifecycleApi(client);
  await api.publish("1");
  await api.unpublish("1");
  await api.archive("1");
  await api.unarchive("1");

  assert.deepEqual(calls, ["publish", "unpublish", "archive", "unarchive"].map((action) => ({
    method: "patch",
    url: `/api/v1/recipes/1/${action}`,
  })));
  assert.ok(calls.every((call) => !call.url?.endsWith("/restore")));
});

test("compatibility facade contains no request implementation", () => {
  const source = readFileSync(resolve("lib/api/recipeApi.ts"), "utf8");
  assert.doesNotMatch(source, /axiosClient|\.get\(|\.post\(|\.put\(|\.patch\(|\.delete\(/);
  assert.match(source, /@deprecated/);
  assert.match(source, /restore:\s*recipeLifecycleApi\.unarchive/);
});

test("query keys isolate public and managed data and include pagination filters", () => {
  const publicPageOne = recipeKeys.publicList({ page: 1, categoryId: "cat" });
  const publicPageTwo = recipeKeys.publicList({ page: 2, categoryId: "cat" });
  const managed = recipeKeys.managed({ page: 1, status: RecipeStatus.Draft });
  assert.notDeepEqual(publicPageOne, publicPageTwo);
  assert.notDeepEqual(publicPageOne, managed);
});
