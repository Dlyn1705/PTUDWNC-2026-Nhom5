import assert from "node:assert/strict";
import { test } from "node:test";
import axios, { AxiosError, AxiosHeaders, CanceledError, type InternalAxiosRequestConfig } from "axios";
import { installProblemDetails } from "../lib/api/installProblemDetails";
import {
  ApiProblemError,
  getApiErrorMessage,
  isApiProblemError,
  toApiProblemError,
} from "../lib/api/problemDetails";
import { installSessionAuth } from "../lib/api/sessionAuth";

function config(url = "/api/v1/recipes"): InternalAxiosRequestConfig {
  return { headers: new AxiosHeaders(), method: "get", url } as InternalAxiosRequestConfig;
}

function responseError(
  status: number,
  data: unknown,
  headers: Record<string, string> = {},
): AxiosError {
  const requestConfig = config();
  return new AxiosError("unsafe transport message", "ERR_BAD_RESPONSE", requestConfig, undefined, {
    config: requestConfig,
    status,
    statusText: "",
    headers,
    data,
  });
}

test("keeps the complete Problem Details contract and sanitizes field errors", () => {
  const converted = toApiProblemError(responseError(422, {
    type: "https://errors.example/validation",
    title: "Validation failed",
    status: 422,
    detail: "Please correct the highlighted fields.",
    instance: "/api/v1/recipes/request-1",
    code: "validation_failed",
    correlationId: "corr.body-1",
    errors: { title: ["Required", 7, "  Too short  "], invalid: "ignored" },
  }, { "content-type": "application/problem+json; charset=utf-8" }));

  assert.ok(converted instanceof ApiProblemError);
  assert.equal(converted.type, "https://errors.example/validation");
  assert.equal(converted.title, "Validation failed");
  assert.equal(converted.status, 422);
  assert.equal(converted.detail, "Please correct the highlighted fields.");
  assert.equal(converted.instance, "/api/v1/recipes/request-1");
  assert.equal(converted.code, "validation_failed");
  assert.equal(converted.correlationId, "corr.body-1");
  assert.deepEqual(converted.errors, { title: ["Required", "Too short"] });
  assert.equal(converted.message, converted.detail);
});

test("body correlation wins and a valid response header is the fallback", () => {
  assert.equal(toApiProblemError(responseError(500, {
    title: "Failure", correlationId: "body-id",
  }, { "x-correlation-id": "header-id" })).correlationId, "body-id");
  assert.equal(toApiProblemError(responseError(500, {
    title: "Failure", correlationId: "invalid correlation with spaces",
  }, { "x-correlation-id": "header-id" })).correlationId, "header-id");
});

for (const status of [400, 401, 403, 404, 409, 422, 429, 500, 503]) {
  test(`preserves HTTP ${status}`, () => {
    const converted = toApiProblemError(responseError(status, {
      status,
      title: `HTTP ${status}`,
      code: `status_${status}`,
      errors: { field: ["invalid"] },
    }));
    assert.equal(converted.status, status);
    assert.equal(converted.code, `status_${status}`);
    assert.deepEqual(converted.errors, { field: ["invalid"] });
  });
}

test("normalizes empty, non-JSON, network, timeout, cancellation and unknown throws safely", () => {
  const empty = toApiProblemError(responseError(500, undefined));
  const html = toApiProblemError(responseError(502, "<html>secret upstream page</html>", {
    "content-type": "text/html",
  }));
  const network = toApiProblemError(new AxiosError("token=secret", "ERR_NETWORK", config()));
  const timeout = toApiProblemError(new AxiosError("timeout secret", "ETIMEDOUT", config()));
  const canceled = toApiProblemError(new CanceledError("cancel secret", config()));
  const unknown = toApiProblemError({ token: "secret" });

  assert.equal(empty.message, "Yêu cầu không thể hoàn tất.");
  assert.equal(html.status, 502);
  assert.doesNotMatch(html.message, /html|secret/i);
  assert.equal(network.message, "Không thể kết nối đến máy chủ.");
  assert.equal(timeout.message, "Yêu cầu đã hết thời gian chờ.");
  assert.equal(canceled.message, "Yêu cầu đã bị hủy.");
  assert.equal(unknown.message, "Yêu cầu không thể hoàn tất.");
});

test("type guard and message helper accept only ApiProblemError", () => {
  const detail = new ApiProblemError({ title: "Title", detail: "Detail" });
  const title = new ApiProblemError({ title: "Title" });
  assert.equal(isApiProblemError(detail), true);
  assert.equal(isApiProblemError(new Error("ordinary")), false);
  assert.equal(isApiProblemError({ name: "ApiProblemError" }), false);
  assert.equal(getApiErrorMessage(detail, "Fallback"), "Detail");
  assert.equal(getApiErrorMessage(title, "Fallback"), "Title");
  assert.equal(getApiErrorMessage(new Error("ordinary"), "Fallback"), "Fallback");
});

test("problem interceptor preserves success wrappers and normalizes final failures", async () => {
  const successClient = axios.create({ adapter: async (requestConfig) => ({
    config: requestConfig,
    data: { data: [{ id: "recipe" }], meta: { page: 1 } },
    headers: {},
    status: 200,
    statusText: "OK",
  }) });
  installProblemDetails(successClient);
  assert.deepEqual((await successClient.get("/api/v1/recipes")).data, {
    data: [{ id: "recipe" }], meta: { page: 1 },
  });

  const failureClient = axios.create({ adapter: async () => {
    throw responseError(422, { title: "Invalid", status: 422, errors: { title: ["Required"] } });
  } });
  installProblemDetails(failureClient);
  await assert.rejects(failureClient.get("/api/v1/recipes"), (error) => {
    assert.ok(isApiProblemError(error));
    assert.equal(error.status, 422);
    assert.deepEqual(error.errors, { title: ["Required"] });
    return true;
  });
});

test("session interceptor retries a raw 401 before final normalization", async () => {
  let sends = 0;
  let reads = 0;
  const client = axios.create({ adapter: async (requestConfig) => {
    sends++;
    if (sends === 1) {
      throw new AxiosError("unauthorized", "ERR_BAD_RESPONSE", requestConfig, undefined, {
        config: requestConfig, data: null, headers: {}, status: 401, statusText: "Unauthorized",
      });
    }
    assert.equal(requestConfig.headers.Authorization, "Bearer new");
    return { config: requestConfig, data: { data: "ok" }, headers: {}, status: 200, statusText: "OK" };
  } });
  installSessionAuth(client, async () => ({
    user: {
      accessToken: reads++ === 0 ? "old" : "new",
      accessTokenExpiry: new Date(Date.now() + 60_000).toISOString(),
    },
  }));
  installProblemDetails(client);

  assert.deepEqual((await client.get("/api/v1/recipes")).data, { data: "ok" });
  assert.equal(sends, 2);
});
