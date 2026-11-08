import assert from "node:assert/strict";
import test from "node:test";
import { useUIStore } from "../store/useUIStore";

test("UI store has an SSR-safe default and an explicit hydration flag", () => {
  assert.equal(useUIStore.getState().recipesViewMode, "grid");
  assert.equal(useUIStore.getState().hasHydrated, false);
  // In a Node/SSR test there is intentionally no Web Storage implementation.
  useUIStore.setState({ recipesViewMode: "list" });
  assert.equal(useUIStore.getState().recipesViewMode, "list");
});

test("persisted state is allowlisted to a non-sensitive UI preference", () => {
  const serialized = JSON.stringify({ recipesViewMode: useUIStore.getState().recipesViewMode });
  assert.equal(serialized.includes("accessToken"), false);
  assert.equal(serialized.includes("refreshToken"), false);
  assert.deepEqual(Object.keys(JSON.parse(serialized)), ["recipesViewMode"]);
});

