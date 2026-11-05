import test from "node:test";
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import { createStore } from "zustand/vanilla";
import type { ResolverOptions } from "react-hook-form";
import type { LoginFormData } from "../lib/validations/auth";
import { createLoginResolver, loginResolver } from "../lib/validations/loginResolver";
import { watchQuerySession } from "../lib/query-session";

const options: ResolverOptions<LoginFormData> = { fields: {}, shouldUseNativeValidation: false };

test("deferred login validation retains schema errors and trimmed values", async () => {
  const invalid = await loginResolver({ email: "invalid", password: "" }, undefined, options);
  assert.ok(invalid.errors.email?.message); assert.ok(invalid.errors.password?.message);
  const valid = await loginResolver({ email: "  author@example.invalid  ", password: "secret" }, undefined, options);
  assert.deepEqual(valid.errors, {});
  assert.deepEqual(valid.values, { email: "author@example.invalid", password: "secret" });
});

test("validation loading failure preserves inputs and a later submission can recover", async () => {
  let loads = 0;
  const resolver = createLoginResolver(async () => {
    if (++loads === 1) throw new Error("chunk temporarily unavailable");
    return async values => ({ values, errors: {} });
  });
  const values = { email: "author@example.invalid", password: "secret" };
  const failed = await resolver(values, undefined, options);
  assert.equal(failed.errors.root?.type, "validation-unavailable");
  assert.deepEqual(values, { email: "author@example.invalid", password: "secret" });
  const recovered = await resolver(values, undefined, options);
  assert.deepEqual(recovered.errors, {}); assert.deepEqual(recovered.values, values);
});

test("query session clears on account switch/logout and unsubscribes on unmount", () => {
  const store = createStore<{ user: { id: string } | null }>(() => ({ user: { id: "author-a" } }));
  const client = new QueryClient(); const dispose = watchQuerySession(client, store);
  client.setQueryData(["private"], "a");
  store.setState({ user: { id: "author-a" } });
  assert.equal(client.getQueryData(["private"]), "a");
  store.setState({ user: { id: "author-b" } });
  assert.equal(client.getQueryData(["private"]), undefined);
  client.setQueryData(["private"], "b"); store.setState({ user: null });
  assert.equal(client.getQueryData(["private"]), undefined);
  client.setQueryData(["private"], "discarded"); dispose();
  assert.equal(client.getQueryData(["private"]), "discarded");
  client.setQueryData(["public"], "retained after unsubscribe"); store.setState({ user: { id: "author-c" } });
  assert.equal(client.getQueryData(["public"]), "retained after unsubscribe"); client.clear();
});
