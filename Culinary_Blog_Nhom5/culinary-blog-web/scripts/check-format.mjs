import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import prettier from "prettier";

const root = process.cwd();
const baselinePath = path.join(root, "format-baseline.json");
const initialize = process.argv.includes("--initialize");
if (initialize && process.env.CI)
  throw new Error("Cannot initialize format debt in CI");
const baseline = initialize
  ? {}
  : JSON.parse(fs.readFileSync(baselinePath, "utf8"));
const candidates = new Set(
  execFileSync(
    "git",
    ["ls-files", "-co", "--exclude-standard", "-z", "--", "."],
    { cwd: root },
  )
    .toString()
    .split("\0")
    .filter((file) => /\.(?:tsx?|[cm]?js|json)$/.test(file)),
);
let failures = 0;
for (const file of [...candidates].sort()) {
  if (file === "package-lock.json" || file === "format-baseline.json") continue;
  const source = fs
    .readFileSync(path.join(root, file), "utf8")
    .replace(/\r\n/g, "\n");
  const digest = createHash("sha256").update(source).digest("hex");
  if (baseline[file] === digest) continue;
  const options = await prettier.resolveConfig(path.join(root, file));
  if (!(await prettier.check(source, { ...options, filepath: file }))) {
    if (initialize) baseline[file] = digest;
    else {
      console.error(`Format changed/new file with Prettier: ${file}`);
      failures++;
    }
  }
}
if (initialize)
  fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
if (failures) process.exitCode = 1;
console.log(
  `Formatting gate: ${candidates.size} files checked; ${failures} regressions. Existing unchanged debt is explicitly baselined.`,
);
