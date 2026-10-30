import assert from "node:assert/strict";
import { test } from "node:test";
import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";
import { authClient } from "../lib/api/authClient";
import { refreshSession, selectIsAdmin, selectIsAuthor, useAuthStore } from "../store/authStore";
import type { AuthSessionResponse } from "../types/auth";

const session = (roles: string[] = ["Author"], accessToken = "access-1"): AuthSessionResponse => ({
  accessToken,
  accessTokenExpiry: new Date(Date.now() + 900_000).toISOString(),
  user: { id: "user-1", email: "chef@example.test", displayName: "Chef" },
  roles,
});
const reply = (config: AxiosResponse["config"], data: unknown, status = 200): AxiosResponse => ({
  config, data, status, statusText: "OK", headers: new AxiosHeaders(),
});

test("setSession and clearSession update token, user and Author/Admin roles", () => {
  const store = useAuthStore.getState();
  store.clearSession();
  store.setSession(session());
  assert.equal(useAuthStore.getState().accessToken, "access-1");
  assert.equal(useAuthStore.getState().user?.displayName, "Chef");
  assert.equal(useAuthStore.getState().isAuthenticated, true);
  assert.equal(selectIsAuthor(useAuthStore.getState()), true);
  assert.equal(selectIsAdmin(useAuthStore.getState()), false);

  store.setSession(session(["Admin", "Unknown"]));
  assert.deepEqual(useAuthStore.getState().user?.roles, ["Admin"]);
  assert.equal(selectIsAuthor(useAuthStore.getState()), true);
  assert.equal(selectIsAdmin(useAuthStore.getState()), true);
  store.clearSession();
  assert.equal(useAuthStore.getState().accessToken, null);
  assert.equal(useAuthStore.getState().user, null);
  assert.equal(useAuthStore.getState().isAuthenticated, false);
});

test("login and logout call backend with a cookie-capable client and update state", async () => {
  const calls: string[] = [];
  authClient.defaults.adapter = async (config) => {
    calls.push(config.url ?? "");
    if (config.url?.endsWith("/login")) return reply(config, { data: session() });
    return reply(config, undefined, 204);
  };
  useAuthStore.getState().clearSession();
  await useAuthStore.getState().login({ email: "chef@example.test", password: "secret" });
  assert.equal(useAuthStore.getState().isAuthenticated, true);
  await useAuthStore.getState().logout();
  assert.equal(useAuthStore.getState().isAuthenticated, false);
  assert.deepEqual(calls, ["/api/v1/auth/login", "/api/v1/auth/logout"]);
  assert.equal(authClient.defaults.withCredentials, true);
});

test("login waits for the initial cookie refresh before replacing the session", async () => {
  const calls: string[] = [];
  authClient.defaults.adapter = async (config) => {
    calls.push(config.url ?? "");
    if (config.url?.endsWith("/refresh")) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return reply(config, { data: session(["Admin"], "old-cookie-access") });
    }
    return reply(config, { data: session(["Author"], "new-login-access") });
  };
  useAuthStore.getState().clearSession();
  useAuthStore.setState({ isInitializing: true });

  await useAuthStore.getState().login({ email: "chef@example.test", password: "secret" });

  assert.deepEqual(calls, ["/api/v1/auth/refresh", "/api/v1/auth/login"]);
  assert.equal(useAuthStore.getState().accessToken, "new-login-access");
  assert.equal(selectIsAdmin(useAuthStore.getState()), false);
  assert.equal(useAuthStore.getState().isInitializing, false);
});

test("reload initialization shares one refresh and restores user from its response", async () => {
  let refreshes = 0;
  authClient.defaults.adapter = async (config) => {
    refreshes++;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return reply(config, { data: session(["Admin"], "restored-access") });
  };
  useAuthStore.getState().clearSession();
  useAuthStore.setState({ isInitializing: true });
  await Promise.all([useAuthStore.getState().initialize(), useAuthStore.getState().initialize()]);
  assert.equal(refreshes, 1);
  assert.equal(useAuthStore.getState().accessToken, "restored-access");
  assert.equal(useAuthStore.getState().isInitializing, false);
  assert.equal(selectIsAdmin(useAuthStore.getState()), true);
});

test("rejected refresh clears the session", async () => {
  useAuthStore.getState().setSession(session());
  authClient.defaults.adapter = async (config) => {
    const response = reply(config, {}, 401);
    throw new AxiosError("Unauthorized", "ERR_BAD_REQUEST", config, undefined, response);
  };
  await assert.rejects(refreshSession());
  assert.equal(useAuthStore.getState().isAuthenticated, false);
  assert.equal(useAuthStore.getState().accessToken, null);
});
