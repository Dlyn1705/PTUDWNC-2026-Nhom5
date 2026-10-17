import assert from "node:assert/strict";
import test from "node:test";
import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";
import { installApiAuthInterceptors, type ApiAuthBridge } from "../lib/api/axiosAuth";
import { isApiProblemError } from "../lib/api/problemDetails";

function unauthorized(config: InternalAxiosRequestConfig): AxiosError {
  return new AxiosError("Unauthorized", "ERR_BAD_RESPONSE", config, undefined, {
    data: {
      type: "https://example.test/problems/unauthorized",
      title: "Unauthorized",
      status: 401,
      detail: "Access token expired.",
    },
    status: 401,
    statusText: "Unauthorized",
    headers: new AxiosHeaders({ "x-correlation-id": "auth-test" }),
    config,
  });
}

function authorization(config: AxiosRequestConfig): string | undefined {
  const headers = config.headers as AxiosHeaders | undefined;
  return headers?.get("Authorization")?.toString();
}

function bridge(overrides: Partial<ApiAuthBridge> = {}): ApiAuthBridge {
  return {
    getAccessToken: () => "stale-token",
    refreshAccessToken: async () => "fresh-token",
    invalidateSession: async () => undefined,
    isBrowser: () => true,
    getCallbackUrl: () => "/dashboard/recipes?page=2",
    ...overrides,
  };
}

test("a 401 retries once with the token returned by the refresh request", async () => {
  const seenTokens: string[] = [];
  const client = axios.create({
    adapter: async (config) => {
      const token = authorization(config) ?? "";
      seenTokens.push(token);
      if (token !== "Bearer fresh-token") throw unauthorized(config as InternalAxiosRequestConfig);
      return {
        data: { ok: true },
        status: 200,
        statusText: "OK",
        headers: new AxiosHeaders(),
        config,
      };
    },
  });
  const cleanup = installApiAuthInterceptors(client, bridge());

  try {
    const response = await client.get("/api/v1/recipes/private");
    assert.deepEqual(response.data, { ok: true });
    assert.deepEqual(seenTokens, ["Bearer stale-token", "Bearer fresh-token"]);
  } finally {
    cleanup();
  }
});

test("concurrent 401 responses share exactly one refresh request", async () => {
  let refreshCalls = 0;
  let releaseRefresh: ((token: string) => void) | undefined;
  let refreshStarted: (() => void) | undefined;
  const freshToken = new Promise<string>((resolve) => { releaseRefresh = resolve; });
  const started = new Promise<void>((resolve) => { refreshStarted = resolve; });
  const client = axios.create({
    adapter: async (config) => {
      if (authorization(config) !== "Bearer fresh-token") {
        throw unauthorized(config as InternalAxiosRequestConfig);
      }
      return {
        data: { path: config.url },
        status: 200,
        statusText: "OK",
        headers: new AxiosHeaders(),
        config,
      };
    },
  });
  const cleanup = installApiAuthInterceptors(client, bridge({
    refreshAccessToken: async () => {
      refreshCalls += 1;
      refreshStarted?.();
      return freshToken;
    },
  }));

  try {
    const requests = Promise.all([
      client.get("/api/v1/recipes/one"),
      client.get("/api/v1/recipes/two"),
    ]);
    await started;
    assert.equal(refreshCalls, 1);
    releaseRefresh?.("fresh-token");
    const responses = await requests;
    assert.equal(responses.length, 2);
    assert.equal(refreshCalls, 1);
  } finally {
    cleanup();
  }
});

test("a second 401 does not loop and expires the client session once", async () => {
  let refreshCalls = 0;
  let invalidations = 0;
  let dispatched = 0;
  const client = axios.create({
    adapter: async (config) => {
      dispatched += 1;
      throw unauthorized(config as InternalAxiosRequestConfig);
    },
  });
  const cleanup = installApiAuthInterceptors(client, bridge({
    refreshAccessToken: async () => {
      refreshCalls += 1;
      return "fresh-token";
    },
    invalidateSession: async () => { invalidations += 1; },
  }));

  try {
    await assert.rejects(
      client.get("/api/v1/recipes/private"),
      (error: unknown) => isApiProblemError(error) && error.status === 401,
    );
    assert.equal(dispatched, 2);
    assert.equal(refreshCalls, 1);
    assert.equal(invalidations, 1);
  } finally {
    cleanup();
  }
});

test("a failed shared refresh rejects callers and invalidates session once", async () => {
  let refreshCalls = 0;
  let invalidations = 0;
  const client = axios.create({
    adapter: async (config) => { throw unauthorized(config as InternalAxiosRequestConfig); },
  });
  const cleanup = installApiAuthInterceptors(client, bridge({
    refreshAccessToken: async () => {
      refreshCalls += 1;
      throw new Error("Refresh failed");
    },
    invalidateSession: async () => { invalidations += 1; },
  }));

  try {
    const results = await Promise.allSettled([
      client.get("/api/v1/recipes/one"),
      client.get("/api/v1/recipes/two"),
    ]);
    assert.equal(refreshCalls, 1);
    assert.equal(invalidations, 1);
    for (const result of results) {
      assert.equal(result.status, "rejected");
      if (result.status === "rejected") {
        assert.ok(isApiProblemError(result.reason));
        assert.equal(result.reason.code, "SESSION_EXPIRED");
      }
    }
  } finally {
    cleanup();
  }
});
