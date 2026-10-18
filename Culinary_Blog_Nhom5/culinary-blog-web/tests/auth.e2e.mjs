// Runs two production Next.js processes against real Redis and a controllable token server.
// Backend rotation/security is independently covered by the PostgreSQL integration tests.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { createClient } from "redis";
import { decode } from "next-auth/jwt";

const secret = randomBytes(48).toString("base64url");
const processes = [];
const ownedKeys = [];
const redis = createClient({ url: process.env.AUTH_REDIS_URL ?? "redis://localhost:6379" });
const backendTokens = new Set();
let refreshCalls = 0;
let googleCalls = 0;
let revokedToken;

function authBody(refreshToken) {
  return {
    accessToken: `test-access-${refreshToken}`,
    accessTokenExpiry: new Date(Date.now() + 900_000).toISOString(),
    user: { id: "e2e-chef", email: "e2e@example.test", displayName: "E2E Chef" }, roles: ["Author"],
  };
}

const backend = createServer(async (request, response) => {
  let text = "";
  for await (const chunk of request) text += chunk;
  const body = text ? JSON.parse(text) : {};
  response.setHeader("Content-Type", "application/json");
  if (["/api/v1/auth/login", "/api/v1/auth/google", "/api/v1/auth/refresh"].includes(request.url)) {
    if (request.url.endsWith("google")) {
      googleCalls++;
      if (body.idToken !== "test-google-id-token") {
        response.writeHead(401).end("{}");
        return;
      }
    }
    if (request.url.endsWith("refresh")) {
      refreshCalls++;
      if (!backendTokens.delete(body.refreshToken)) {
        response.writeHead(401).end("{}");
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const refreshToken = randomBytes(32).toString("base64url");
    backendTokens.add(refreshToken);
    response.setHeader("Set-Cookie", `culinary_refresh_token=${refreshToken}; expires=${new Date(Date.now() + 604_800_000).toUTCString()}; path=/api/v1/auth; httponly; secure; samesite=lax`);
    response.end(JSON.stringify({ data: authBody(refreshToken), success: true }));
  } else if (request.url === "/api/v1/auth/logout") {
    revokedToken = body.refreshToken;
    backendTokens.delete(body.refreshToken);
    response.writeHead(204).end();
  } else response.end("[]");
});

function rememberCookies(jar, response) {
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";", 1)[0];
    const separator = pair.indexOf("=");
    jar.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
}
const cookieHeader = (jar) => [...jar].map(([name, value]) => `${name}=${value}`).join("; ");

async function startNext(apiUrl, port) {
  let output = "";
  const process = spawn(globalThis.process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    env: { ...globalThis.process.env, AUTH_SECRET: secret, AUTH_URL: `http://127.0.0.1:${port}`,
      API_INTERNAL_URL: apiUrl, NEXT_TELEMETRY_DISABLED: "1" }, windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  processes.push(process);
  process.stdout.on("data", (chunk) => { output += chunk; });
  process.stderr.on("data", (chunk) => { output += chunk; });
  const url = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (process.exitCode !== null) throw new Error(`Next.js exited: ${output.slice(-1500)}`);
    try { if ((await fetch(`${url}/api/auth/providers`)).ok) return url; } catch { /* still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Next.js did not start.");
}

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function mutateStoredExpiry(id, value) {
  const key = createHash("sha256").update(`culinary-server-session-v1:${secret}`).digest();
  const bytes = Buffer.from(value, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from(id));
  decipher.setAuthTag(bytes.subarray(12, 28));
  const stored = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString());
  stored.session.accessTokenExpiry = new Date(Date.now() - 1).toISOString();
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(id));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(stored)), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString("base64url");
}

try {
  await redis.connect();
  backend.listen(0, "127.0.0.1");
  await once(backend, "listening");
  const apiUrl = `http://127.0.0.1:${backend.address().port}`;
  const ports = [await freePort(), await freePort()];
  const urls = await Promise.all(ports.map((port) => startNext(apiUrl, port)));
  const jar = new Map();
  const csrfResponse = await fetch(`${urls[0]}/api/auth/csrf`);
  rememberCookies(jar, csrfResponse);
  const { csrfToken } = await csrfResponse.json();
  const login = await fetch(`${urls[0]}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1", Cookie: cookieHeader(jar) },
    body: new URLSearchParams({ email: "e2e@example.test", password: "test-password", csrfToken, callbackUrl: `${urls[0]}/dashboard/recipes/new` }),
  });
  rememberCookies(jar, login);
  const result = await login.json();
  assert.ok(!result.url.includes("error"), "Credentials login failed");
  const jwt = await decode({ token: jar.get("authjs.session-token"), secret, salt: "authjs.session-token" });
  assert.equal(typeof jwt.backendSessionId, "string");
  assert.equal(jwt.backendRefreshToken, undefined);
  assert.equal(jwt.accessToken, undefined);
  assert.equal(jwt.accessTokenExpiry, undefined);
  const id = jwt.backendSessionId;
  const key = `culinary:auth:v1:{${id}}`;
  ownedKeys.push(key, `${key}:lock`);
  const oldCookies = cookieHeader(jar);
  const initial = await (await fetch(`${urls[0]}/api/auth/session`, { headers: { Cookie: oldCookies } })).json();
  assert.equal(initial.user.id, "e2e-chef");
  assert.equal(initial.error, undefined);
  assert.equal(initial.backendSessionId, undefined);
  assert.equal(initial.user.backendRefreshToken, undefined);
  await redis.set(key, mutateStoredExpiry(id, await redis.get(key)), { expiration: "KEEPTTL" });

  const sessions = await Promise.all(Array.from({ length: 12 }, async (_, index) => {
    const response = await fetch(`${urls[index % 2]}/api/auth/session`, { headers: { Cookie: oldCookies } });
    assert.equal(response.status, 200);
    return response.json();
  }));
  assert.equal(refreshCalls, 1, "Two Next processes must perform exactly one backend refresh");
  assert.ok(sessions.every((session) => !session.error && session.user.accessToken === sessions[0].user.accessToken));
  assert.notEqual(sessions[0].user.accessToken, initial.user.accessToken);
  const late = await (await fetch(`${urls[1]}/api/auth/session`, { headers: { Cookie: oldCookies } })).json();
  assert.equal(late.user.accessToken, sessions[0].user.accessToken);
  assert.equal(refreshCalls, 1, "Late stale JWT must not replay the old token");

  const page = await fetch(`${urls[1]}/dashboard/recipes/new`, { headers: { Cookie: oldCookies }, redirect: "manual" });
  assert.equal(page.status, 200, "SSR and proxy must resolve the rotated session");
  const logout = await fetch(`${urls[0]}/api/auth/signout`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1", Cookie: oldCookies },
    body: new URLSearchParams({ csrfToken, callbackUrl: urls[0] }),
  });
  assert.equal(logout.status, 200);
  assert.ok(revokedToken);
  assert.equal(backendTokens.size, 0);
  const afterLogout = await (await fetch(`${urls[1]}/api/auth/session`, { headers: { Cookie: oldCookies } })).json();
  assert.equal(afterLogout.error, "RefreshTokenError");
  assert.equal(afterLogout.user.accessToken, undefined);
  const guard = await fetch(`${urls[1]}/dashboard/recipes/new`, { headers: { Cookie: oldCookies }, redirect: "manual" });
  assert.equal(guard.status, 307);
  assert.ok(guard.headers.get("location").includes("/login"));
  const googleJar = new Map();
  const googleCsrfResponse = await fetch(`${urls[0]}/api/auth/csrf`);
  rememberCookies(googleJar, googleCsrfResponse);
  const { csrfToken: googleCsrfToken } = await googleCsrfResponse.json();
  const googleLogin = await fetch(`${urls[0]}/api/auth/callback/google-id-token`, {
    method: "POST", redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1", Cookie: cookieHeader(googleJar) },
    body: new URLSearchParams({ idToken: "test-google-id-token", csrfToken: googleCsrfToken, callbackUrl: urls[0] }),
  });
  rememberCookies(googleJar, googleLogin);
  assert.ok(!(await googleLogin.json()).url.includes("error"), "Google ID token provider login failed");
  assert.equal(googleCalls, 1, "Google credentials must be forwarded to the backend ID token endpoint");
  const googleJwt = await decode({ token: googleJar.get("authjs.session-token"), secret, salt: "authjs.session-token" });
  assert.equal(googleJwt.backendRefreshToken, undefined);
  assert.equal(googleJwt.accessToken, undefined);
  assert.equal(googleJwt.accessTokenExpiry, undefined);
  const googleId = googleJwt.backendSessionId;
  assert.equal(typeof googleId, "string");
  const googleKey = `culinary:auth:v1:{${googleId}}`;
  ownedKeys.push(googleKey, `${googleKey}:lock`);
  await redis.set(googleKey, mutateStoredExpiry(googleId, await redis.get(googleKey)), { expiration: "KEEPTTL" });
  const googleCookies = cookieHeader(googleJar);
  const googleSession = await (await fetch(`${urls[1]}/api/auth/session`, { headers: { Cookie: googleCookies } })).json();
  assert.equal(googleSession.error, undefined);
  assert.equal(googleSession.user.id, "e2e-chef");
  assert.equal(refreshCalls, 2, "Google sessions must use the same server-side rotation flow");
  const googleLogout = await fetch(`${urls[0]}/api/auth/signout`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1", Cookie: googleCookies },
    body: new URLSearchParams({ csrfToken: googleCsrfToken, callbackUrl: urls[0] }),
  });
  assert.equal(googleLogout.status, 200);
  assert.equal(backendTokens.size, 0);
  console.log("PASS: credentials and Google ID token login, two Next processes, concurrent refresh, stale cookie, SSR/proxy, token privacy, logout and guard.");
} finally {
  for (const process of processes) process.kill();
  if (redis.isReady) {
    if (ownedKeys.length) await redis.del(ownedKeys);
    await redis.close();
  }
  backend.closeAllConnections();
  await new Promise((resolve) => backend.close(resolve));
}
