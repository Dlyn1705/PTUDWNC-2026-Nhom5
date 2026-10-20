import assert from "node:assert/strict";
import test from "node:test";
import { useAuthStore } from "../store/useAuthStore";

test("auth store is a minimal projection and never stores raw session secrets", () => {
  useAuthStore.getState().clear();
  useAuthStore.getState().syncFromSession({
    user: { id: "user-1", name: "Chef", roles: ["Author"] },
    error: undefined,
  }, "authenticated");
  const state = useAuthStore.getState();
  assert.deepEqual({ status: state.status, userId: state.userId, displayName: state.displayName, roles: state.roles, isAuthenticated: state.isAuthenticated }, {
    status: "authenticated", userId: "user-1", displayName: "Chef", roles: ["Author"], isAuthenticated: true,
  });
  assert.equal(JSON.stringify(state).includes("accessToken"), false);
  assert.equal(JSON.stringify(state).includes("refreshToken"), false);
  assert.equal(JSON.stringify(state).includes("session"), false);
});

test("logout and refresh failure clear the projection", () => {
  useAuthStore.getState().syncFromSession({ user: { id: "user-1", name: "Chef", roles: ["Admin"] } }, "authenticated");
  useAuthStore.getState().syncFromSession({ user: { id: "user-1", name: "Chef", roles: ["Admin"] }, error: "RefreshTokenError" }, "authenticated");
  assert.equal(useAuthStore.getState().isAuthenticated, false);
  assert.deepEqual(useAuthStore.getState().roles, []);
  useAuthStore.getState().clear();
  assert.equal(useAuthStore.getState().status, "unauthenticated");
});

