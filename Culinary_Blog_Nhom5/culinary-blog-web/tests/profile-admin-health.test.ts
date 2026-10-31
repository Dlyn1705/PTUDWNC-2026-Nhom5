import assert from "node:assert/strict";
import test from "node:test";
import { AxiosHeaders } from "axios";
import axiosClient from "../lib/api/axiosClient";
import { getCurrentUser, updateProfile } from "../lib/api/profileApi";
import { listAdminUsers, setUserRole } from "../lib/api/adminUsersApi";
import { getHealthSnapshot } from "../lib/api/healthApi";

test("profile and Admin API honor methods, payloads, filters, envelopes", async () => {
  const original = axiosClient.defaults.adapter;
  const requests: { method?: string; url?: string; data?: unknown; params?: unknown }[] = [];
  axiosClient.defaults.adapter = async (config) => {
    requests.push({ method: config.method, url: config.url, data: config.data, params: config.params });
    const data = config.url?.includes("admin/users") && config.method === "get"
      ? { data: [{ id: "u1", email: "a@test.invalid", displayName: "A", roles: ["Author"], isActive: true,
        createdAt: "2026-10-29T00:00:00Z" }],
        meta: { page: 2, pageSize: 20, totalCount: 21, totalPages: 2, hasNextPage: false, hasPreviousPage: true } }
      : { data: { id: "u1", email: "a@test.invalid", displayName: "A", bio: "Bio", avatarUrl: null,
        roles: ["Author"], isActive: true, createdAt: "2026-10-29T00:00:00Z" } };
    return { config, status: 200, statusText: "OK", headers: new AxiosHeaders(), data };
  };
  try {
    assert.equal((await getCurrentUser()).bio, "Bio");
    await updateProfile({ displayName: "A", bio: "", avatarUrl: "" });
    assert.equal((await listAdminUsers(2, "Author")).meta.totalCount, 21);
    await setUserRole("u1", "Admin");
    assert.deepEqual(requests.map((request) => [request.method, request.url]), [
      ["get", "/api/v1/auth/me"], ["patch", "/api/v1/auth/me"],
      ["get", "/api/v1/admin/users"], ["post", "/api/v1/admin/users/u1/roles"],
    ]);
    assert.deepEqual(JSON.parse(String(requests[1].data)), { displayName: "A", bio: "", avatarUrl: "" });
    assert.deepEqual(requests[2].params, { page: 2, pageSize: 20, role: "Author" });
    assert.deepEqual(JSON.parse(String(requests[3].data)), { role: "Admin" });
  } finally { axiosClient.defaults.adapter = original; }
});

test("health states use only whitelisted dependency statuses", async () => {
  const original = globalThis.fetch;
  let live = true;
  let dependency = "Ready";
  globalThis.fetch = async (input) => new Response(JSON.stringify(
    String(input).endsWith("/health/live") ? { status: live ? "Healthy" : "Unhealthy", secret: "hidden" } :
      { status: dependency === "Ready" ? "Healthy" : "Unhealthy",
        dependencies: { database: "Ready", cache: dependency, storage: "Ready", host: "private" } }),
    { status: String(input).endsWith("/health/live") ? (live ? 200 : 503) : (dependency === "Ready" ? 200 : 503) });
  try {
    assert.equal((await getHealthSnapshot()).level, "Healthy");
    dependency = "Unavailable";
    const degraded = await getHealthSnapshot();
    assert.equal(degraded.level, "Degraded");
    assert.deepEqual(degraded.dependencies, { database: true, cache: false, storage: true });
    live = false;
    assert.deepEqual(await getHealthSnapshot(), { level: "Unavailable",
      dependencies: { database: null, cache: null, storage: null } });
  } finally { globalThis.fetch = original; }
});
