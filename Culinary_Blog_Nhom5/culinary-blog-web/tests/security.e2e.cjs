/* eslint-disable @typescript-eslint/no-require-imports -- Standalone E2E command wrapper. */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const result = spawnSync(process.execPath, [path.join(__dirname, "auth.e2e.mjs")], {
  cwd: path.resolve(__dirname, ".."),
  env: process.env,
  stdio: "inherit",
  windowsHide: true,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
