import test from "node:test";
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import axios, { AxiosError, AxiosHeaders, CanceledError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { createFileApi } from "../lib/api/fileApiCore";
import { ApiProblemError, readProblem, toApiProblemError } from "../lib/api/problemDetails";
import { imageErrorMessage, MAX_IMAGE_BYTES, needsImageReconciliation, validateImageFile } from "../lib/api/imageErrors";
import { errorCorrelationId } from "../lib/logger";
import type { StoredRecipeImage } from "../types/recipe-management.types";

const image = (processingStatus: StoredRecipeImage["processingStatus"] = "Completed"): StoredRecipeImage => ({
  id: "image-1", recipeId: "recipe-1", originalUrl: "https://images.test/original.jpg", mediumUrl: null,
  thumbnailUrl: null, altText: null, isPrimary: true, orderIndex: 0, processingStatus,
});
const file = () => new File(["test-image"], "dish.jpg", { type: "image/jpeg" });
const response = (config: InternalAxiosRequestConfig, data: unknown, status = 200, id = "response-id"): AxiosResponse => ({
  config, status, statusText: "test", headers: new AxiosHeaders({ "X-Correlation-ID": id }), data,
});
const envelope = (value: unknown) => ({ success: true, data: value });
const config = () => ({ headers: new AxiosHeaders(), observability: { correlationId: "request-id" } });
async function rejectsKind(promise: Promise<unknown>, kind: string): Promise<ApiProblemError> {
  try { await promise; assert.fail("Expected rejection"); }
  catch (error) { assert.ok(error instanceof ApiProblemError); assert.equal(error.kind, kind); return error; }
}

test("normalization preserves HTTP status, field errors, code, cause and correlation precedence", () => {
  const cfg = config();
  const wire = response(cfg, { status: 400, code: "FILE_CONTENT", correlationId: "body-id", errors: { file: ["Ảnh không hợp lệ"] } }, 422);
  const cause = new AxiosError("raw transport", "ERR_BAD_REQUEST", cfg, {}, wire);
  const error = toApiProblemError(cause, { operation: "upload" });
  assert.equal(error.status, 422); assert.equal(error.correlationId, "response-id");
  assert.equal(error.code, "FILE_CONTENT"); assert.equal(error.cause, cause);
  assert.deepEqual(error.errors, { file: ["Ảnh không hợp lệ"] }); assert.equal(error.kind, "file_validation");
  assert.equal(toApiProblemError(error, { imageId: "saved" }), error); assert.equal(error.imageId, "saved");
  assert.equal(errorCorrelationId(error), "response-id");
  wire.headers = {}; assert.equal(toApiProblemError(cause).correlationId, "body-id");
  wire.data.correlationId = "invalid id"; assert.equal(toApiProblemError(cause).correlationId, "request-id");
  delete (cfg as Partial<typeof cfg>).observability; assert.equal(toApiProblemError(cause).correlationId, undefined);
});

test("transport categories and unknown values are distinct and do not invent status", () => {
  for (const [cause, kind] of [
    [new CanceledError(), "cancelled"], [new DOMException("stop", "AbortError"), "cancelled"],
    [new AxiosError("timeout", "ECONNABORTED"), "request_timeout"], [new AxiosError("timeout", "ETIMEDOUT"), "request_timeout"],
    [new AxiosError("offline", "ERR_NETWORK"), "network"], [new Error("bug"), "unknown"], [null, "unknown"],
  ] as const) { const error = toApiProblemError(cause); assert.equal(error.kind, kind); assert.equal(error.status, undefined); }
});

test("malformed Problem Details and HTML never surface raw proxy messages", () => {
  assert.deepEqual(readProblem({ errors: { file: "bad", altText: [1] }, status: "500", detail: {} }), { errors: {} });
  for (const body of [null, "<html>SECRET</html>", { detail: "SECRET", status: 500 }]) {
    const error = toApiProblemError(new AxiosError("SECRET", "ERR_BAD_RESPONSE", config(), {}, response(config(), body, 500)));
    assert.equal(error.status, 500); assert.ok(!imageErrorMessage(error).includes("SECRET"));
  }
});

test("validation distinguishes file, alt text and generic 400/422; status-only 413/415 works", () => {
  for (const [status, body, kind] of [
    [422, { errors: { Length: ["too big"] } }, "file_validation"],
    [422, { errors: { altText: ["too long"] } }, "validation"],
    [400, {}, "http"], [422, {}, "http"], [413, "proxy", "file_validation"], [415, null, "file_validation"],
  ] as const) {
    const error = toApiProblemError(new AxiosError("", "", config(), {}, response(config(), body, status)), { operation: "upload" });
    assert.equal(error.kind, kind);
  }
  validateImageFile({ size: MAX_IMAGE_BYTES, type: "image/avif" });
  for (const candidate of [{ size: 0, type: "image/jpeg" }, { size: MAX_IMAGE_BYTES + 1, type: "image/jpeg" }, { size: 10, type: "text/plain" }]) {
    assert.throws(() => validateImageFile(candidate), (cause: unknown) => cause instanceof ApiProblemError && cause.kind === "file_validation");
  }
});

test("upload validates before dispatch and preserves multipart/progress configuration", async () => {
  let calls = 0;
  const client = axios.create({ adapter: async cfg => {
    calls++; assert.equal(cfg.timeout, 120_000); assert.ok(cfg.data instanceof FormData);
    assert.equal(cfg.data.get("altText"), "Món ăn");
    return response(cfg, envelope(image()), 201);
  } });
  const api = createFileApi(client);
  await rejectsKind(api.uploadRecipeImage("recipe-1", new File([], "bad.jpg", { type: "image/jpeg" })), "file_validation");
  assert.equal(calls, 0);
  assert.equal((await api.uploadRecipeImage("recipe-1", file(), undefined, undefined, " Món ăn ")).processingStatus, "Completed");
  assert.equal(calls, 1);
});

test("upload polls sequentially and exposes saved images before completion", async () => {
  const stages = ["Pending", "Processing", "Completed"] as const;
  const seen: string[] = []; const methods: string[] = [];
  const client = axios.create({ adapter: async cfg => { methods.push(cfg.method!); return response(cfg, envelope(image(stages[methods.length - 1])), cfg.method === "post" ? 201 : 200); } });
  const result = await createFileApi(client).uploadRecipeImage("recipe-1", file(), undefined, undefined, undefined, {
    intervalMs: 1, onImage: value => seen.push(value.processingStatus),
  });
  assert.equal(result.processingStatus, "Completed"); assert.deepEqual(methods, ["post", "get", "get"]);
  assert.deepEqual(seen, stages);
});

test("processing failure retains successful GET status, correlation and stored image", async () => {
  const client = axios.create({ adapter: async cfg => response(cfg, envelope(image(cfg.method === "post" ? "Pending" : "Failed")), cfg.method === "post" ? 201 : 200, cfg.method === "post" ? "upload-id" : "poll-id") });
  const error = await rejectsKind(createFileApi(client).uploadRecipeImage("recipe-1", file(), undefined, undefined, undefined, { intervalMs: 1 }), "image_processing");
  assert.equal(error.status, 200); assert.equal(error.correlationId, "poll-id"); assert.equal(error.image?.id, "image-1");
  assert.equal(error.operation, "poll"); assert.equal(error.clientCode, "IMAGE_PROCESSING_FAILED");
});

test("deadline leaves HTTP status unset, stores last response and does not return Pending", async () => {
  let calls = 0;
  const client = axios.create({ adapter: async cfg => { calls++; return response(cfg, envelope(image("Pending")), 201); } });
  const error = await rejectsKind(createFileApi(client).uploadRecipeImage("recipe-1", file(), undefined, undefined, undefined, { timeoutMs: 15, intervalMs: 1000 }), "processing_timeout");
  assert.equal(error.status, undefined); assert.equal(error.image?.processingStatus, "Pending");
  assert.equal(error.lastResponse?.status, 201); assert.equal(calls, 1);
});

test("deadline aborts in-flight GET and retry checking never POSTs", async () => {
  let calls = 0; let aborted = false;
  const client = axios.create({ adapter: cfg => {
    calls++; assert.equal(cfg.method, "get"); assert.ok(cfg.timeout !== undefined && cfg.timeout <= 30);
    return new Promise((_, reject) => cfg.signal?.addEventListener?.("abort", () => { aborted = true; reject(new CanceledError()); }, { once: true }));
  } });
  await rejectsKind(createFileApi(client).waitForRecipeImage("recipe-1", "image-1", undefined, { timeoutMs: 30 }), "processing_timeout");
  assert.equal(aborted, true); assert.equal(calls, 1);
});

test("user cancellation before upload, during delay and during request does not continue polling", async () => {
  let calls = 0;
  const controller = new AbortController(); controller.abort();
  const api = createFileApi(axios.create({ adapter: async cfg => { calls++; return response(cfg, envelope(image("Pending")), 201); } }));
  await rejectsKind(api.uploadRecipeImage("recipe-1", file(), undefined, controller.signal), "cancelled"); assert.equal(calls, 0);
  const duringDelay = new AbortController();
  await rejectsKind(api.uploadRecipeImage("recipe-1", file(), undefined, duringDelay.signal, undefined, {
    onImage: () => duringDelay.abort(),
  }), "cancelled"); assert.equal(calls, 1);
  const duringGet = new AbortController();
  const waiting = createFileApi(axios.create({ adapter: cfg => new Promise((_, reject) => {
    cfg.signal?.addEventListener?.("abort", () => reject(new CanceledError()), { once: true });
    duringGet.abort();
  }) }));
  await rejectsKind(waiting.waitForRecipeImage("recipe-1", "image-1", duringGet.signal), "cancelled");
});

test("poll HTTP/network/timeout errors keep kind and saved image without borrowing upload correlation", async () => {
  for (const code of ["ERR_NETWORK", "ETIMEDOUT", "ERR_BAD_RESPONSE"]) {
    const client = axios.create({ adapter: async cfg => {
      if (cfg.method === "post") return response(cfg, envelope(image("Pending")), 201, "upload-id");
      throw new AxiosError("failure", code, cfg, {}, code === "ERR_BAD_RESPONSE" ? response(cfg, {}, 503, "get-id") : undefined);
    } });
    const error = await rejectsKind(createFileApi(client).uploadRecipeImage("recipe-1", file(), undefined, undefined, undefined, { intervalMs: 1 }),
      code === "ERR_NETWORK" ? "network" : code === "ETIMEDOUT" ? "request_timeout" : "http");
    assert.equal(error.imageId, "image-1"); assert.equal(error.image?.id, "image-1");
    assert.equal(error.correlationId, code === "ERR_BAD_RESPONSE" ? "get-id" : undefined);
  }
});

test("bad envelopes and mismatched DTOs retain response metadata", async () => {
  for (const body of [null, "html", { success: false, data: image() }, envelope(null), envelope({ ...image(), id: undefined }),
    envelope({ ...image(), processingStatus: "Mystery" }), envelope({ ...image(), recipeId: "another" })]) {
    const api = createFileApi(axios.create({ adapter: async cfg => response(cfg, body, 201) }));
    const error = await rejectsKind(api.uploadRecipeImage("recipe-1", file()), "invalid_response");
    assert.equal(error.status, 201); assert.equal(error.correlationId, "response-id");
  }
});

test("delete accepts only 204, primary validates DTO, list validates each item and signal is forwarded", async () => {
  const abort = new AbortController();
  const api = createFileApi(axios.create({ adapter: async cfg => {
    assert.equal(cfg.signal, abort.signal);
    return response(cfg, cfg.method === "delete" ? undefined : envelope(cfg.method === "patch" ? image() : [image()]), cfg.method === "delete" ? 204 : 200);
  } }));
  await api.deleteRecipeImage("recipe-1", "image-1", abort.signal);
  assert.equal((await api.setRecipeImagePrimary("recipe-1", "image-1", abort.signal)).isPrimary, true);
  assert.equal((await api.getRecipeImages("recipe-1", abort.signal)).length, 1);
  const invalid = createFileApi(axios.create({ adapter: async cfg => response(cfg, envelope({ ...image(), isPrimary: false })) }));
  await rejectsKind(invalid.deleteRecipeImage("recipe-1", "image-1"), "invalid_response");
  await rejectsKind(invalid.setRecipeImagePrimary("recipe-1", "image-1"), "invalid_response");
  await rejectsKind(invalid.getRecipeImages("recipe-1"), "invalid_response");
});

test("HTTP errors for every image operation retain status and correlation including rate limits", async () => {
  for (const status of [401, 403, 404, 409, 429, 500]) {
    const client = axios.create({ adapter: async cfg => {
      const wire = response(cfg, { code: "RECIPE_IMAGE_CONFLICT" }, status);
      wire.headers["Retry-After"] = "3";
      throw new AxiosError("error", "ERR_BAD_RESPONSE", cfg, {}, wire);
    } });
    const api = createFileApi(client);
    for (const call of [() => api.deleteRecipeImage("recipe-1", "image-1"), () => api.setRecipeImagePrimary("recipe-1", "image-1"),
      () => api.getRecipeImages("recipe-1"), () => api.waitForRecipeImage("recipe-1", "image-1"), () => api.uploadRecipeImage("recipe-1", file())]) {
      const error = await rejectsKind(call(), "http"); assert.equal(error.status, status); assert.equal(error.correlationId, "response-id");
      if (status === 429) { assert.equal(error.retryAfterMs, 3000); assert.match(imageErrorMessage(error), /3 giây/); }
    }
  }
});

test("formatter communicates cancellation, processing and reconciliation without false success", () => {
  assert.match(imageErrorMessage(new ApiProblemError({}, undefined, { kind: "processing_timeout" })), /chưa xử lý xong/);
  assert.match(imageErrorMessage(new ApiProblemError({}, undefined, { kind: "image_processing" })), /Ảnh gốc vẫn được lưu/);
  assert.equal(needsImageReconciliation(new ApiProblemError({}, undefined, { kind: "network" })), true);
  assert.equal(needsImageReconciliation(new ApiProblemError({}, undefined, { kind: "file_validation" })), false);
});

test("upstream single-status API returns terminal DTOs and normalizes failures", async () => {
  const api = createFileApi(axios.create({ adapter: async cfg => response(cfg, envelope(image("Failed"))) }));
  assert.equal((await api.getRecipeImageStatus("recipe-1", "image-1")).processingStatus, "Failed");
  const denied = createFileApi(axios.create({ adapter: async cfg => {
    throw new AxiosError("denied", "ERR_BAD_REQUEST", cfg, {}, response(cfg, {}, 403));
  } }));
  const error = await rejectsKind(denied.getRecipeImageStatus("recipe-1", "image-1"), "http");
  assert.equal(error.status, 403); assert.equal(error.correlationId, "response-id");
});

test("canonical lowercase server UUIDs accept uppercase IDs from the recipe picker", async () => {
  const recipeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const imageId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const dto = { ...image(), recipeId, id: imageId };
  const api = createFileApi(axios.create({ adapter: async cfg => response(cfg,
    envelope(cfg.url?.endsWith("/images") && cfg.method === "get" ? [dto] : dto)) }));
  assert.equal((await api.getRecipeImages(recipeId.toUpperCase())).length, 1);
  assert.equal((await api.waitForRecipeImage(recipeId.toUpperCase(), imageId.toUpperCase())).id, imageId);
});

test("polling removes the caller's abort listener after success, failure and cancellation", async () => {
  for (const status of ["Completed", "Failed", "Pending"] as const) {
    const controller = new AbortController();
    const api = createFileApi(axios.create({ adapter: async cfg => response(cfg, envelope(image(status))) }));
    const promise = api.waitForRecipeImage("recipe-1", "image-1", controller.signal, {
      onImage: () => { if (status === "Pending") controller.abort(); },
    });
    if (status === "Completed") await promise;
    else await rejectsKind(promise, status === "Failed" ? "image_processing" : "cancelled");
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  }
});
