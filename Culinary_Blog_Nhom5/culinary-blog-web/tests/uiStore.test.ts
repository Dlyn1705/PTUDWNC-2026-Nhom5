import assert from "node:assert/strict";
import test from "node:test";
import type { StateStorage } from "zustand/middleware";
import { createUIStore } from "../store/useUIStore";

function memoryStorage(initial: Record<string, string> = {}): StateStorage & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => { values.set(name, value); },
    removeItem: (name) => { values.delete(name); },
  };
}

test("UI store restores persisted client state only after explicit hydration", async () => {
  const storage = memoryStorage({
    "culinary-ui": JSON.stringify({
      state: { dashboardNavigationCollapsed: true, hasHydrated: true },
      version: 1,
    }),
  });
  const store = createUIStore(storage);

  assert.equal(store.getState().dashboardNavigationCollapsed, false);
  assert.equal(store.getState().hasHydrated, false);

  await store.persist.rehydrate();

  assert.equal(store.getState().dashboardNavigationCollapsed, true);
  assert.equal(store.getState().hasHydrated, true);

  store.getState().setDashboardNavigationCollapsed(false);
  const persisted = JSON.parse(storage.values.get("culinary-ui") ?? "{}");
  assert.deepEqual(persisted.state, { dashboardNavigationCollapsed: false });
});
