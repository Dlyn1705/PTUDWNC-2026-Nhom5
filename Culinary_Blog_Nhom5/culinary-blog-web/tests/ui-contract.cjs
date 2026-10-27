/* eslint-disable @typescript-eslint/no-require-imports -- Node contract audit script. */
/* Static guardrails for issue #68: feature UI uses semantic tokens and API boundaries. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourceRoots = [path.join(root, "app"), path.join(root, "components"), path.join(root, "hooks")];
const extensions = new Set([".ts", ".tsx", ".css"]);
const excludedFiles = new Set([path.join(root, "app", "globals.css"), path.join(root, "components", "forms", "LoginMascot.tsx")]);
const palettePattern = /(?:bg|text|border|ring|from|to|via)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}/g;
const rawHttpPattern = /\bfetch\s*\(|\baxios(?:Client)?\s*\.(?:get|post|put|patch|delete)\s*\(/g;

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(file) : extensions.has(path.extname(file)) ? [file] : [];
  });
}

const files = sourceRoots.flatMap(filesUnder).filter(file => !excludedFiles.has(file));
const paletteViolations = [];
const httpViolations = [];
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(palettePattern)) paletteViolations.push(`${path.relative(root, file)}:${match[0]}`);
  for (const match of text.matchAll(rawHttpPattern)) httpViolations.push(`${path.relative(root, file)}:${match[0]}`);
}

assert.deepEqual(paletteViolations, [], `Feature UI must use semantic tokens: ${paletteViolations.join(", ")}`);
assert.deepEqual(httpViolations, [], `UI must call API modules/hooks instead of raw HTTP: ${httpViolations.join(", ")}`);
process.stdout.write(`PASS semantic token/API boundary audit (${files.length} source files)\n`);
