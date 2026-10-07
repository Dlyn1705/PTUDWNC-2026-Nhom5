import test from "node:test";
import assert from "node:assert/strict";
import axios, { AxiosError, AxiosHeaders, CanceledError } from "axios";
import { installHttpLogging } from "../lib/api/httpLogging";
import { errorCorrelationId, reportRuntimeError, safePath, validCorrelationId, writeLog } from "../lib/logger";

test("logger emits allowlisted JSON and strips sensitive URL/query/extra properties", () => {
  const original = console.error;
  const lines: string[] = [];
  console.error = (line: string) => { lines.push(line); };
  try {
    const fields = { path: "https://user:SECRET@example.org/api/recipes?token=SECRET#SECRET",
      password: "SECRET", method: "GET", status: 500, elapsedMs: 12 };
    writeLog("error", "ClientHttpError", fields);
    const entry = JSON.parse(lines[0]);
    assert.equal(entry.path, "/api/recipes");
    assert.equal(entry.status, 500);
    assert.equal(typeof entry.elapsedMs, "number");
    assert.ok(!lines[0].includes("SECRET"));
    assert.equal(validCorrelationId("bad value"), undefined);
    assert.equal(validCorrelationId("x".repeat(129)), undefined);
    assert.equal(safePath("data:SECRET"), undefined);
  } finally { console.error = original; }
});

test("runtime errors are logged once without exception message/stack", () => {
  const original = console.error;
  const lines: string[] = [];
  console.error = (line: string) => { lines.push(line); };
  try {
    const error = new Error("SECRET");
    reportRuntimeError(error, "/search?q=SECRET");
    reportRuntimeError(error, "/search");
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]).eventType, "ClientRuntimeError");
    assert.ok(!lines[0].includes("SECRET"));
  } finally { console.error = original; }
});

test("HTTP success preserves response and uses server correlation; each dispatch gets a fresh ID", async () => {
  const original = console.debug;
  const lines: string[] = [];
  console.debug = (line: string) => { lines.push(line); };
  const ids: string[] = [];
  const client = axios.create({ adapter: async config => {
    ids.push(String(config.headers.get("X-Correlation-ID")));
    return { data: { ok: true }, status: 200, statusText: "OK",
      headers: new AxiosHeaders({ "x-correlation-id": "server-id" }), config };
  } });
  const cleanup = installHttpLogging(client);
  try {
    const response = await client.get("/api/recipes?password=SECRET");
    await client.get("/api/recipes");
    assert.equal(response.data.ok, true);
    assert.notEqual(ids[0], ids[1]);
    assert.ok(validCorrelationId(ids[0]));
    assert.equal(JSON.parse(lines[0]).correlationId, "server-id");
    assert.equal(JSON.parse(lines[0]).outcome, "Succeeded");
    assert.ok(!lines.join("").includes("SECRET"));
  } finally { cleanup(); console.debug = original; }
});

test("HTTP request still dispatches when crypto.randomUUID is unavailable", async () => {
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  const originalDebug = console.debug;
  console.debug = () => {};
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: {
      getRandomValues(bytes: Uint8Array) {
        for (let index = 0; index < bytes.length; index++) bytes[index] = index;
        return bytes;
      },
    },
  });
  let dispatched = false;
  const client = axios.create({ adapter: async config => {
    dispatched = true;
    return { data: { ok: true }, status: 200, statusText: "OK", headers: new AxiosHeaders(), config };
  } });
  const cleanup = installHttpLogging(client);
  try {
    const response = await client.get("/api/recipes");
    assert.equal(response.status, 200);
    assert.equal(dispatched, true);
    assert.ok(validCorrelationId(String(response.config.headers.get("X-Correlation-ID"))));
  } finally {
    cleanup();
    console.debug = originalDebug;
    if (originalCrypto) Object.defineProperty(globalThis, "crypto", originalCrypto);
    else delete (globalThis as { crypto?: Crypto }).crypto;
  }
});

for (const scenario of ["http", "problem", "timeout", "network", "cancel"] as const) {
  test(`HTTP ${scenario} keeps rejection identity and safe correlation fallback`, async () => {
    const errorOutput = console.error;
    const warnOutput = console.warn;
    const lines: string[] = [];
    console.error = console.warn = (line: string) => { lines.push(line); };
    let thrown: AxiosError | undefined;
    const client = axios.create({ adapter: async config => {
      const response = scenario === "http" || scenario === "problem" ? {
        data: { correlationId: "problem-id", detail: "SECRET" }, status: 422, statusText: "Invalid",
        headers: scenario === "http" ? new AxiosHeaders({ "x-correlation-id": "server-id" }) : new AxiosHeaders(),
        config,
      } : undefined;
      thrown = scenario === "cancel" ? new CanceledError("SECRET", config)
        : new AxiosError("SECRET", scenario === "timeout" ? "ECONNABORTED" : "ERR_NETWORK", config, undefined, response);
      throw thrown;
    } });
    const cleanup = installHttpLogging(client);
    try {
      await assert.rejects(client.get("/api/auth/login?token=SECRET", { headers: { Authorization: "Bearer SECRET" } }),
        error => error === thrown);
      const entry = JSON.parse(lines[0]);
      assert.equal(lines.length, 1);
      assert.equal(entry.correlationId, scenario === "http" ? "server-id"
        : scenario === "problem" ? "problem-id" : errorCorrelationId(thrown!));
      assert.equal(entry.status, scenario === "http" || scenario === "problem" ? 422 : null);
      assert.equal(entry.outcome, scenario === "http" || scenario === "problem" ? "Failed"
        : scenario === "timeout" ? "Timeout" : scenario === "cancel" ? "Canceled" : "NetworkError");
      reportRuntimeError(thrown!, "/login");
      assert.equal(lines.length, 1);
      assert.ok(!lines[0].includes("SECRET"));
    } finally { cleanup(); console.error = errorOutput; console.warn = warnOutput; }
  });
}
