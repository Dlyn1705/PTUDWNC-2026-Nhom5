import assert from "node:assert/strict";
import test from "node:test";
import { AxiosHeaders } from "axios";
import axiosClient from "../lib/api/axiosClient";
import { recipePublicApi } from "../lib/api/recipePublicApi";
import { recipeEditorApi } from "../lib/api/recipeEditorApi";
import { recipeLifecycleApi } from "../lib/api/recipeLifecycleApi";
import { recipeApi } from "../lib/api/recipeApi";

type Request = { method?: string; url?: string; data?: unknown; params?: unknown };
const requests: Request[] = [];
const originalAdapter = axiosClient.defaults.adapter;

test.beforeEach(() => {
  requests.length = 0;
  axiosClient.defaults.adapter = async (config) => {
    requests.push({ method: config.method, url: config.url, data: config.data, params: config.params });
    const body = config.method === "get" && config.url?.endsWith("/r1")
      ? { data: { id: "r1", title: "Pho", slug: "pho", status: 0 } }
      : config.url?.endsWith("/publish") || config.url?.endsWith("/unpublish") || config.url?.endsWith("/archive") || config.url?.endsWith("/unarchive")
      ? { data: { id: "r1", status: 1, publishedAt: null } }
      : config.url?.endsWith("/nutrition") || config.method === "put" || config.method === "post"
        ? { data: { id: "r1", slug: "pho", rowVersion: "v2", message: "ok" } }
        : { data: [{ id: "r1", slug: "pho", status: 1 }], meta: { page: 1, pageSize: 12, totalCount: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false } };
    return { config, status: config.method === "delete" ? 204 : 200, statusText: "OK", headers: new AxiosHeaders(), data: body };
  };
});

test.after(() => { axiosClient.defaults.adapter = originalAdapter; });

test("public API sends canonical pagination/filter/sort and wrappers", async () => {
  const result = await recipePublicApi.getPaged({ page: 0, pageSize: 99, categoryId: "cat", difficulty: 2, sortBy: "title", sortOrder: "asc" });
  assert.equal(requests[0].method, "get");
  assert.equal(requests[0].url, "/api/v1/recipes");
  assert.deepEqual(requests[0].params, { page: 1, pageSize: 50, categoryId: "cat", difficulty: 2, sortBy: "title", sortOrder: "asc" });
  assert.equal(result.data.length, 1);
});

test("editor and lifecycle APIs use documented methods and paths", async () => {
  await recipeEditorApi.create({ title: "Pho", prepTime: 10, cookTime: 20, servings: 2, difficulty: 1, categoryId: "cat" });
  await recipeEditorApi.update("r1", { title: "Pho", prepTime: 10, cookTime: 20, servings: 2, difficulty: 1, categoryId: "cat" });
  await recipeEditorApi.updateNutrition("r1", { calories: 1, protein: 2, carbohydrates: 3, fat: 4, fiber: 5, sodium: 6 });
  await recipeEditorApi.delete("r1");
  await recipeLifecycleApi.publish("r1");
  await recipeLifecycleApi.unpublish("r1");
  await recipeLifecycleApi.archive("r1");
  await recipeLifecycleApi.unarchive("r1");
  assert.deepEqual(requests.map((request) => [request.method, request.url]), [
    ["post", "/api/v1/recipes"], ["put", "/api/v1/recipes/r1"], ["put", "/api/v1/recipes/r1/nutrition"],
    ["delete", "/api/v1/recipes/r1"], ["patch", "/api/v1/recipes/r1/publish"], ["patch", "/api/v1/recipes/r1/unpublish"],
    ["patch", "/api/v1/recipes/r1/archive"], ["patch", "/api/v1/recipes/r1/unarchive"],
  ]);
  assert.equal(requests.some((request) => request.url?.includes("restore")), false);
  assert.equal(recipeApi.restore, recipeLifecycleApi.restore);
});

test("management reads unwrap the standard data envelope", async () => {
  const managed = await recipeEditorApi.getMine({ page: 1, pageSize: 12 });
  const detail = await recipeEditorApi.getById("r1");
  assert.equal(managed.data.length, 1);
  assert.equal(detail.id, "r1");
  assert.deepEqual(requests.map(request => [request.method, request.url]), [
    ["get", "/api/v1/recipes/mine"], ["get", "/api/v1/recipes/r1"],
  ]);
});

