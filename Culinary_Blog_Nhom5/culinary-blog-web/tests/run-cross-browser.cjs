/* eslint-disable @typescript-eslint/no-require-imports -- small process runner for the existing integration suite. */
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const test = path.join(__dirname, "accessibility.e2e.cjs");
for (const browser of ["chromium", "firefox", "webkit"]) {
  process.stdout.write(`\n===== accessibility: ${browser} =====\n`);
  const result = spawnSync(process.execPath, [test], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, E2E_BROWSER: browser, BROWSER_CHANNEL: "" },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
