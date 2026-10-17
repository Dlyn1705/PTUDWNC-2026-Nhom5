import assert from "node:assert/strict";
import test from "node:test";
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from "axios";
import {
  ApiProblemError,
  getApiErrorMessage,
  isApiProblemError,
  toApiProblemError,
} from "../lib/api/problemDetails";

function config(): InternalAxiosRequestConfig {
  return {
    headers: new AxiosHeaders(),
    method: "get",
    url: "/api/v1/recipes",
  } as InternalAxiosRequestConfig;
}

function responseError(data: unknown, status = 422, correlationId?: string): AxiosError<unknown> {
  const requestConfig = config();
  return new AxiosError(
    "Request failed",
    "ERR_BAD_RESPONSE",
    requestConfig,
    undefined,
    {
      data,
      status,
      statusText: "Error",
      headers: new AxiosHeaders(correlationId ? { "x-correlation-id": correlationId } : {}),
      config: requestConfig,
    },
  );
}

test("Problem Details retains every supported RFC 7807 field", () => {
  const normalized = toApiProblemError(responseError({
    type: "https://example.test/problems/validation",
    title: "Invalid recipe",
    status: 422,
    detail: "Title is required.",
    instance: "/api/v1/recipes",
    code: "RCP_INVALID",
    errors: { Title: ["Title is required."] },
    correlationId: "request-123",
  }));

  assert.ok(isApiProblemError(normalized));
  assert.equal(normalized.type, "https://example.test/problems/validation");
  assert.equal(normalized.title, "Invalid recipe");
  assert.equal(normalized.status, 422);
  assert.equal(normalized.detail, "Title is required.");
  assert.equal(normalized.instance, "/api/v1/recipes");
  assert.equal(normalized.code, "RCP_INVALID");
  assert.deepEqual(normalized.errors, { Title: ["Title is required."] });
  assert.equal(normalized.correlationId, "request-123");
  assert.equal(getApiErrorMessage(normalized), "Title is required.");
});

test("empty and non-Problem Details responses remain actionable ApiProblemError instances", () => {
  const empty = toApiProblemError(responseError(null, 503, "server-503"));
  assert.ok(empty instanceof ApiProblemError);
  assert.equal(empty.status, 503);
  assert.equal(empty.code, "UNEXPECTED_API_RESPONSE");
  assert.equal(empty.correlationId, "server-503");
  assert.equal(empty.detail, "Máy chủ không trả về thông tin lỗi.");

  const unexpected = toApiProblemError(responseError({ message: "legacy body" }, 500));
  assert.equal(unexpected.status, 500);
  assert.equal(unexpected.code, "UNEXPECTED_API_RESPONSE");
  assert.equal(unexpected.detail, "Máy chủ trả về phản hồi lỗi không hợp lệ.");
});

test("network errors and ordinary errors normalize without losing a useful message", () => {
  const network = toApiProblemError(new AxiosError("Network Error", "ERR_NETWORK", config()));
  assert.equal(network.code, "ERR_NETWORK");
  assert.equal(network.status, undefined);
  assert.match(getApiErrorMessage(network), /Không thể kết nối/);

  const ordinary = toApiProblemError(new Error("Local failure"));
  assert.ok(isApiProblemError(ordinary));
  assert.equal(ordinary.code, "CLIENT_ERROR");
  assert.equal(getApiErrorMessage(ordinary), "Local failure");
  assert.equal(toApiProblemError(ordinary), ordinary);
});
