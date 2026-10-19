import test from "node:test";
import assert from "node:assert/strict";
import axios, { AxiosError, AxiosHeaders, CanceledError } from "axios";
import { installHttpLogging } from "../lib/api/httpLogging";
import { errorCorrelationId, reportRuntimeError, safePath, validCorrelationId, writeLog } from "../lib/logger";
import { createFileApi } from "../lib/api/fileApiCore";
import { ApiProblemError } from "../lib/api/problemDetails";
import type { StoredRecipeImage } from "../types/recipe-management.types";

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
// ─── Integration: logging + File API pipeline ────────────────────────────────

// Helper tạo AxiosResponse giả cho test liên thông
function fakeResponse(
  config: import("axios").InternalAxiosRequestConfig,
  data: unknown,
  status = 200,
  correlationId = "response-id",
): import("axios").AxiosResponse {
  return { config, data, status, statusText: "test", headers: new AxiosHeaders({ "X-Correlation-ID": correlationId }) };
}
function fakeImage(processingStatus: StoredRecipeImage["processingStatus"] = "Completed"): StoredRecipeImage {
  return { id: "img-1", recipeId: "recipe-1", originalUrl: "https://img.test/orig.jpg",
    mediumUrl: null, thumbnailUrl: null, altText: null, isPrimary: true, orderIndex: 0, processingStatus };
}
const envelope = (v: unknown) => ({ success: true, data: v });
const fakeFile = () => new File(["img"], "photo.jpg", { type: "image/jpeg" });

test("file validation error does not dispatch HTTP and emits no log", async () => {
  const errorLines: string[] = []; const warnLines: string[] = []; const debugLines: string[] = [];
  const origError = console.error; const origWarn = console.warn; const origDebug = console.debug;
  console.error = (l: string) => { errorLines.push(l); };
  console.warn = (l: string) => { warnLines.push(l); };
  console.debug = (l: string) => { debugLines.push(l); };
  const client = axios.create({ adapter: async () => { throw new Error("Should not dispatch"); } });
  const cleanup = installHttpLogging(client);
  try {
    const api = createFileApi(client);
    // File rỗng → file_validation, không dispatch HTTP
    await assert.rejects(
      api.uploadRecipeImage("recipe-1", new File([], "bad.jpg", { type: "image/jpeg" })),
      (e: unknown) => e instanceof ApiProblemError && e.kind === "file_validation",
    );
    assert.equal(errorLines.length, 0, "Không được có error log khi lỗi validation cục bộ");
    assert.equal(warnLines.length, 0, "Không được có warn log khi lỗi validation cục bộ");
    assert.equal(debugLines.length, 0, "Không được có debug log khi lỗi validation cục bộ");
  } finally {
    cleanup();
    console.error = origError; console.warn = origWarn; console.debug = origDebug;
  }
});


test("upload 422 emits exactly one ClientHttpError log preserving status, correlation, errors; reportRuntimeError adds no duplicate", async () => {
  const warnLines: string[] = [];
  const origWarn = console.warn; const origError = console.error; const origDebug = console.debug;
  console.warn = (l: string) => { warnLines.push(l); };
  console.error = () => {};
  console.debug = () => {};
  const client = axios.create({ adapter: async cfg => {
    const wire = fakeResponse(cfg, { status: 422, code: "FILE_CONTENT",
      correlationId: "body-id", errors: { file: ["Ảnh không hợp lệ"] } }, 422, "header-id");
    throw new AxiosError("bad", "ERR_BAD_REQUEST", cfg, {}, wire);
  } });
  const cleanup = installHttpLogging(client);
  try {
    const api = createFileApi(client);
    let caught: unknown;
    try { await api.uploadRecipeImage("recipe-1", fakeFile()); } catch (e) { caught = e; }
    assert.ok(caught instanceof ApiProblemError, "Phải ném ApiProblemError");
    assert.equal(caught.kind, "file_validation");
    assert.equal(caught.status, 422);
    assert.equal(caught.correlationId, "header-id", "Header ID được ưu tiên hơn body ID");
    assert.deepEqual(caught.errors, { file: ["Ảnh không hợp lệ"] }, "Phải giữ nguyên field errors");
    assert.equal(warnLines.length, 1, "Đúng một warn log từ interceptor HTTP");
    const entry = JSON.parse(warnLines[0]);
    assert.equal(entry.eventType, "ClientHttpError");
    assert.equal(entry.status, 422);
    assert.equal(entry.correlationId, "header-id");
    assert.ok(!warnLines[0].includes("Ảnh không hợp lệ"), "Response body không được vào log");
    // reportRuntimeError không thêm log thứ hai vì lỗi đã được HTTP interceptor remember
    reportRuntimeError(caught, "/api/v1/recipes/recipe-1/images");
    assert.equal(warnLines.length, 1, "reportRuntimeError không được tạo thêm log cho HTTP error đã nhớ");
  } finally {
    cleanup();
    console.warn = origWarn; console.error = origError; console.debug = origDebug;
  }
});

test("upload network error emits ClientHttpError with kind=network, no HTTP status", async () => {
  const errorLines: string[] = [];
  const origError = console.error; const origWarn = console.warn; const origDebug = console.debug;
  console.error = (l: string) => { errorLines.push(l); };
  console.warn = () => {};
  console.debug = () => {};
  const client = axios.create({ adapter: async cfg => {
    throw new AxiosError("offline", "ERR_NETWORK", cfg, {});
  } });
  const cleanup = installHttpLogging(client);
  try {
    const api = createFileApi(client);
    let caught: unknown;
    try { await api.uploadRecipeImage("recipe-1", fakeFile()); } catch (e) { caught = e; }
    assert.ok(caught instanceof ApiProblemError);
    assert.equal(caught.kind, "network");
    assert.equal(caught.status, undefined, "Lỗi mạng không có HTTP status");
    assert.equal(errorLines.length, 1, "Đúng một error log");
    const entry = JSON.parse(errorLines[0]);
    assert.equal(entry.eventType, "ClientHttpError");
    assert.equal(entry.outcome, "NetworkError");
    assert.equal(entry.status, null, "Status null trong log khi không có response");
  } finally {
    cleanup();
    console.error = origError; console.warn = origWarn; console.debug = origDebug;
  }
});

test("POST Pending → GET Completed: two independent logs, no second POST, no log dedup across requests", async () => {
  const debugLines: string[] = [];
  const origDebug = console.debug; const origError = console.error; const origWarn = console.warn;
  console.debug = (l: string) => { debugLines.push(l); };
  console.error = () => {}; console.warn = () => {};
  const methods: string[] = [];
  const client = axios.create({ adapter: async cfg => {
    methods.push(cfg.method!);
    const status = cfg.method === "post" ? 201 : 200;
    const id = cfg.method === "post" ? "upload-id" : "poll-id";
    const processingStatus: StoredRecipeImage["processingStatus"] = cfg.method === "post" ? "Pending" : "Completed";
    return fakeResponse(cfg, envelope(fakeImage(processingStatus)), status, id);
  } });
  const cleanup = installHttpLogging(client);
  try {
    const api = createFileApi(client);
    const result = await api.uploadRecipeImage("recipe-1", fakeFile(), undefined, undefined, undefined, { intervalMs: 1 });
    assert.equal(result.processingStatus, "Completed");
    assert.deepEqual(methods, ["post", "get"], "Đúng một POST và một GET");
    assert.equal(debugLines.length, 2, "Hai log riêng biệt cho POST và GET");
    const postEntry = JSON.parse(debugLines[0]);
    const getEntry = JSON.parse(debugLines[1]);
    assert.equal(postEntry.correlationId, "upload-id");
    assert.equal(getEntry.correlationId, "poll-id");
    assert.notEqual(postEntry.correlationId, getEntry.correlationId,
      "Hai request độc lập phải có log riêng kể cả khi server trả cùng correlation");
    assert.equal(postEntry.outcome, "Succeeded");
    assert.equal(getEntry.outcome, "Succeeded");
  } finally {
    cleanup();
    console.debug = origDebug; console.error = origError; console.warn = origWarn;
  }
});

test("GET 200 with Failed status does not emit extra ClientHttpError from HTTP interceptor", async () => {
  const debugLines: string[] = []; const errorLines: string[] = []; const warnLines: string[] = [];
  const origDebug = console.debug; const origError = console.error; const origWarn = console.warn;
  console.debug = (l: string) => { debugLines.push(l); };
  console.error = (l: string) => { errorLines.push(l); };
  console.warn = (l: string) => { warnLines.push(l); };
  const client = axios.create({ adapter: async cfg => {
    const status = cfg.method === "post" ? 201 : 200;
    const id = cfg.method === "post" ? "upload-id" : "poll-id";
    const processingStatus: StoredRecipeImage["processingStatus"] = cfg.method === "post" ? "Pending" : "Failed";
    return fakeResponse(cfg, envelope(fakeImage(processingStatus)), status, id);
  } });
  const cleanup = installHttpLogging(client);
  try {
    const api = createFileApi(client);
    let caught: unknown;
    try { await api.uploadRecipeImage("recipe-1", fakeFile(), undefined, undefined, undefined, { intervalMs: 1 }); }
    catch (e) { caught = e; }
    assert.ok(caught instanceof ApiProblemError);
    assert.equal(caught.kind, "image_processing", "GET 200 Failed phải cho image_processing");
    assert.equal(caught.status, 200, "Giữ nguyên HTTP status 200, không fake thành 500");
    assert.equal(caught.correlationId, "poll-id");
    // GET 200 thành công về HTTP → interceptor log Succeeded, không log ClientHttpError
    assert.equal(debugLines.length, 2, "Hai Succeeded log (POST và GET)");
    assert.equal(errorLines.length, 0, "Không có error log vì HTTP 200 không phải lỗi transport");
    assert.equal(warnLines.length, 0, "Không có warn log vì HTTP 200 không phải lỗi transport");
  } finally {
    cleanup();
    console.debug = origDebug; console.error = origError; console.warn = origWarn;
  }
});

test("cancel before dispatch emits no HTTP log", async () => {
  const allLines: string[] = [];
  const origDebug = console.debug; const origError = console.error; const origWarn = console.warn;
  console.debug = (l: string) => { allLines.push(l); };
  console.error = (l: string) => { allLines.push(l); };
  console.warn = (l: string) => { allLines.push(l); };
  const client = axios.create({ adapter: async () => { throw new Error("Should not dispatch"); } });
  const cleanup = installHttpLogging(client);
  try {
    const controller = new AbortController();
    controller.abort();
    const api = createFileApi(client);
    let caught: unknown;
    try { await api.uploadRecipeImage("recipe-1", fakeFile(), undefined, controller.signal); }
    catch (e) { caught = e; }
    assert.ok(caught instanceof ApiProblemError);
    assert.equal(caught.kind, "cancelled");
    assert.equal(allLines.length, 0, "Hủy trước dispatch không được sinh bất kỳ HTTP log nào");
  } finally {
    cleanup();
    console.debug = origDebug; console.error = origError; console.warn = origWarn;
  }
});

test("security sentinel: token/cookie/body/alt text/exception stack never appear in any log across upload pipeline", async () => {
  const SECRET = "SENTINEL_SECRET_DO_NOT_LOG";
  const allLines: string[] = [];
  const origDebug = console.debug; const origError = console.error; const origWarn = console.warn;
  console.debug = (l: string) => { allLines.push(l); };
  console.error = (l: string) => { allLines.push(l); };
  console.warn = (l: string) => { allLines.push(l); };
  const client = axios.create({ adapter: async cfg => {
    // Kiểm tra request header không chứa secret đã gửi
    const wire = fakeResponse(cfg,
      { status: 422, detail: SECRET, errors: { file: [`${SECRET} in error`] } }, 422);
    throw new AxiosError(SECRET, "ERR_BAD_REQUEST", cfg, {}, wire);
  } });
  const cleanup = installHttpLogging(client);
  try {
    const api = createFileApi(client);
    let caught: unknown;
    try {
      await api.uploadRecipeImage(
        "recipe-1", fakeFile(), undefined, undefined,
        `alt text with ${SECRET}`,
      );
    } catch (e) { caught = e; }
    assert.ok(caught instanceof ApiProblemError);
    const combined = allLines.join("\n");
    assert.ok(!combined.includes(SECRET),
      `Sentinel "${SECRET}" không được xuất hiện trong bất kỳ dòng log nào:\n${combined}`);
  } finally {
    cleanup();
    console.debug = origDebug; console.error = origError; console.warn = origWarn;
  }
});
