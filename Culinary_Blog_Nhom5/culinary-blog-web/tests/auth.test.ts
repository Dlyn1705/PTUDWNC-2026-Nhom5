import assert from "node:assert/strict";
import { test } from "node:test";
import axios, { AxiosError, AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { installSessionAuth } from "../lib/api/sessionAuth";

const reply = (config: InternalAxiosRequestConfig, status: number): AxiosResponse => ({
  config, status, statusText: status === 401 ? "Unauthorized" : "OK", data: {}, headers: new AxiosHeaders(),
});

test("two rejected requests share one refresh and retry once with the new bearer", async () => {
  let token = "old-access";
  let refreshes = 0;
  let oldAttempts = 0;
  const client = axios.create();
  installSessionAuth(client, {
    getToken: () => token,
    initialize: async () => {},
    refresh: async () => {
      refreshes++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      token = "new-access";
      return token;
    },
  });
  client.defaults.adapter = async (config) => {
    if (config.headers.get("Authorization") === "Bearer old-access") {
      oldAttempts++;
      throw new AxiosError("Unauthorized", "ERR_BAD_REQUEST", config, undefined, reply(config, 401));
    }
    assert.equal(config.headers.get("Authorization"), "Bearer new-access");
    return reply(config, 200);
  };
  const results = await Promise.all([client.get("/one"), client.get("/two")]);
  assert.deepEqual(results.map((result) => result.status), [200, 200]);
  assert.equal(oldAttempts, 2);
  assert.equal(refreshes, 1);
});

test("a rejected retry stops and an anonymous request never refreshes", async () => {
  let token: string | null = "old-access";
  let refreshes = 0;
  const client = axios.create();
  installSessionAuth(client, {
    getToken: () => token,
    initialize: async () => {},
    refresh: async () => { refreshes++; token = "new-access"; return token; },
  });
  let attempts = 0;
  client.defaults.adapter = async (config) => {
    attempts++;
    throw new AxiosError("Unauthorized", "ERR_BAD_REQUEST", config, undefined, reply(config, 401));
  };
  await assert.rejects(client.get("/protected"));
  assert.equal(attempts, 2);
  assert.equal(refreshes, 1);
  token = null;
  await assert.rejects(client.get("/anonymous"));
  assert.equal(attempts, 3);
  assert.equal(refreshes, 1);
});
