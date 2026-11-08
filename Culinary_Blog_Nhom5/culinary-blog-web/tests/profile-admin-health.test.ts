import assert from "node:assert/strict";
import test from "node:test";
import { AxiosHeaders } from "axios";
import axiosClient from "../lib/api/axiosClient";
import { getCurrentUser, getProfileRecipeStats, updateProfile, uploadProfileAvatar } from "../lib/api/profileApi";
import { listAdminUsers, setUserRole } from "../lib/api/adminUsersApi";
import { getHealthSnapshot } from "../lib/api/healthApi";

test("profile APIs use the current user and upload avatar as multipart", async () => {
  const original = axiosClient.defaults.adapter;
  const requests: { method?: string; url?: string; data?: unknown; params?: unknown }[] = [];
  let failUpload = false;
  axiosClient.defaults.adapter = async config => {
    requests.push({ method: config.method, url: config.url, data: config.data, params: config.params });
    if (failUpload && config.url?.endsWith("/avatar")) throw new Error("upload failed");
    const data = config.url?.endsWith("recipe-stats") ? { data: { created: 8, published: 3 } }
      : config.url?.includes("admin/users") && config.method === "get"
        ? { data: [], meta: { page: 2, pageSize: 20, totalCount: 21, totalPages: 2 } }
        : { data: { id: "u1", email: "a@test.invalid", displayName: "A", bio: "Bio",
          avatarUrl: "https://example.test/avatar.png", roles: ["Author"], isActive: true,
          createdAt: "2026-10-29T00:00:00Z" } };
    return { config, status: 200, statusText: "OK", headers: new AxiosHeaders(), data };
  };
  try {
    const profile = await getCurrentUser();
    assert.equal(profile.avatarUrl, "https://example.test/avatar.png");
    assert.deepEqual(profile.roles, ["Author"]);
    assert.equal(profile.createdAt, "2026-10-29T00:00:00Z");
    await updateProfile({ displayName: "A", bio: "", avatarUrl: profile.avatarUrl ?? "" });
    assert.deepEqual(await getProfileRecipeStats(), { created: 8, published: 3 });
    const file = new File([new Uint8Array([137, 80, 78, 71])], "avatar.png", { type: "image/png" });
    assert.equal((await uploadProfileAvatar(file)).avatarUrl, profile.avatarUrl);
    assert.equal((requests[3].data as FormData).get("file") instanceof File, true);
    failUpload = true;
    await assert.rejects(() => uploadProfileAvatar(file));
    await assert.rejects(() => uploadProfileAvatar(new File(["x"], "bad.txt", { type: "text/plain" })));
    assert.equal((await listAdminUsers(2, "Author")).meta.totalCount, 21);
    await setUserRole("u1", "Admin");
    assert.deepEqual(requests.map(request => [request.method, request.url]), [
      ["get", "/api/v1/auth/me"], ["patch", "/api/v1/auth/me"],
      ["get", "/api/v1/auth/me/recipe-stats"], ["post", "/api/v1/auth/me/avatar"],
      ["post", "/api/v1/auth/me/avatar"], ["get", "/api/v1/admin/users"],
      ["post", "/api/v1/admin/users/u1/roles"],
    ]);
    assert.deepEqual(requests[5].params, { page: 2, pageSize: 20, role: "Author" });
  } finally { axiosClient.defaults.adapter = original; }
});

test("health probes readiness, records latency and exposes only safe status fields", async () => {
  const original = globalThis.fetch;
  const paths: string[] = [];
  let mode: "Healthy" | "Degraded" | "Unhealthy" | "StorageDown" = "Healthy";
  globalThis.fetch = async input => {
    const path = new URL(String(input)).pathname;
    paths.push(path);
    const live = path === "/health/live";
    const ready = path === "/health/ready";
    if (mode === "Degraded" && !live && !ready) await new Promise(resolve => setTimeout(resolve, 1600));
    const ok = mode !== "Unhealthy" && !(mode === "StorageDown" && !live && !ready);
    return new Response(JSON.stringify({ status: ok ? "Healthy" : "Unhealthy",
      dependencies: { database: "Ready", cache: mode === "Unhealthy" ? "Unavailable" : "Ready",
        storage: mode === "StorageDown" ? "Unavailable" : "Ready", host: "private-host" },
      connectionString: "secret", exception: "secret" }), { status: ok ? 200 : 503 });
  };
  try {
    const healthy = await getHealthSnapshot();
    assert.equal(healthy.level, "Healthy");
    assert.equal(healthy.readiness, true);
    assert.ok(Number.isFinite(healthy.latencyMs) && healthy.latencyMs >= 0);
    assert.ok(!Number.isNaN(Date.parse(healthy.checkedAt)));
    assert.deepEqual(paths, ["/health/live", "/health/ready", "/health"]);
    mode = "Degraded";
    const degraded = await getHealthSnapshot();
    assert.equal(degraded.level, "Degraded");
    assert.ok(degraded.latencyMs >= 1500);
    assert.deepEqual(degraded.dependencies, { database: true, cache: true, storage: true });
    mode = "StorageDown";
    assert.equal((await getHealthSnapshot()).level, "Unhealthy");
    mode = "Unhealthy";
    const unhealthy = await getHealthSnapshot();
    assert.equal(unhealthy.level, "Unhealthy");
    assert.equal(unhealthy.readiness, false);
    assert.doesNotMatch(JSON.stringify(unhealthy), /private-host|connectionString|exception|secret/);
  } finally { globalThis.fetch = original; }
});
