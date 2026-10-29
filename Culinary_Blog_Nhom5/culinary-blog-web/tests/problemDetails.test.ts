import assert from "node:assert/strict";
import test from "node:test";
import { AxiosError, AxiosHeaders, CanceledError } from "axios";
import {
  ApiProblemError,
  getApiErrorMessage,
  isApiProblemError,
  toApiProblemError,
} from "../lib/api/problemDetails";

const problemBody = {
  type: "https://example.test/problems/validation",
  title: "Validation failed",
  status: 422,
  detail: "The recipe is invalid.",
  instance: "/api/v1/recipes/1",
  code: "RECIPE_INVALID",
  errors: { title: ["Title is required"] },
  correlationId: "body-correlation",
};

test("preserves the full RFC 7807 contract and safe extensions", () => {
  const config = { headers: new AxiosHeaders() } as never;
  const response = {
    config,
    data: problemBody,
    status: 422,
    statusText: "Unprocessable Entity",
    headers: new AxiosHeaders({ "x-correlation-id": "header-correlation", "content-type": "application/problem+json; charset=utf-8" }),
  };
  const error = toApiProblemError(new AxiosError("bad", "ERR_BAD_REQUEST", config, undefined, response));
  assert.ok(isApiProblemError(error));
  assert.equal(error.type, problemBody.type);
  assert.equal(error.title, problemBody.title);
  assert.equal(error.status, 422);
  assert.equal(error.detail, problemBody.detail);
  assert.equal(error.instance, problemBody.instance);
  assert.equal(error.code, problemBody.code);
  assert.deepEqual(error.errors, problemBody.errors);
  assert.equal(error.correlationId, "body-correlation");
});

test("uses header correlation when the body has no valid correlation id", () => {
  const config = { headers: new AxiosHeaders() } as never;
  const response = {
    config,
    data: { title: "Failed", status: 500 },
    status: 500,
    statusText: "Internal Server Error",
    headers: new AxiosHeaders({ "x-correlation-id": "header-only" }),
  };
  const error = toApiProblemError(new AxiosError("bad", "ERR_BAD_RESPONSE", config, undefined, response));
  assert.equal(error.correlationId, "header-only");
});

test("normalizes network, timeout, cancel, empty and non-JSON responses", () => {
  const config = { headers: new AxiosHeaders() } as never;
  const cases = [
    [new AxiosError("offline", "ERR_NETWORK", config), "network"],
    [new AxiosError("slow", "ETIMEDOUT", config), "request_timeout"],
    [new CanceledError("cancelled", config), "cancelled"],
    [new AxiosError("empty", "ERR_BAD_RESPONSE", config, undefined, {
      config, data: "", status: 503, statusText: "", headers: new AxiosHeaders(),
    }), "invalid_response"],
    [new AxiosError("html", "ERR_BAD_RESPONSE", config, undefined, {
      config, data: "<html>secret proxy page</html>", status: 500, statusText: "", headers: new AxiosHeaders(),
    }), "invalid_response"],
  ] as const;
  for (const [input, kind] of cases) {
    const error = toApiProblemError(input);
    assert.ok(isApiProblemError(error));
    assert.equal(error.kind, kind);
    assert.ok(!error.message.includes("secret proxy"));
  }
});

test("keeps important backend status and field errors", () => {
  for (const status of [400, 401, 403, 404, 409, 422, 429, 500, 503]) {
    const error = toApiProblemError(new AxiosError("bad", "ERR_BAD_REQUEST", undefined, undefined, {
      config: { headers: new AxiosHeaders() } as never,
      data: { status, code: "DOMAIN_ERROR", errors: { field: ["bad"] }, correlationId: `c-${status}` },
      status,
      statusText: "",
      headers: new AxiosHeaders(),
    }));
    assert.equal(error.status, status);
    assert.equal(error.code, "DOMAIN_ERROR");
    assert.deepEqual(error.errors, { field: ["bad"] });
    assert.equal(error.correlationId, `c-${status}`);
  }
});

test("preserves retry guidance for rate-limited requests", () => {
  const config = { headers: new AxiosHeaders() } as never;
  const error = toApiProblemError(new AxiosError("limited", "ERR_BAD_REQUEST", config, undefined, {
    config,
    data: { status: 429, title: "Too many requests", correlationId: "rate-limit-id" },
    status: 429,
    statusText: "Too Many Requests",
    headers: new AxiosHeaders({ "Retry-After": "4", "X-Correlation-ID": "header-id" }),
  }));
  assert.equal(error.status, 429);
  assert.equal(error.retryAfterMs, 4_000);
  assert.equal(error.correlationId, "rate-limit-id");
});

test("message helpers use detail, title, then fallback", () => {
  assert.equal(getApiErrorMessage(new ApiProblemError({ detail: "detail", title: "title" })), "detail");
  assert.equal(getApiErrorMessage(new ApiProblemError({ title: "title" })), "title");
  assert.equal(getApiErrorMessage(new ApiProblemError({}), "fallback"), "Yêu cầu không thể hoàn tất.");
  assert.equal(getApiErrorMessage({ nope: true }, "fallback"), "fallback");
  assert.equal(isApiProblemError(new Error("no")), false);
});

