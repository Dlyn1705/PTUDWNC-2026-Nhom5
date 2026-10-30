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

const requiredSharedUi = [
  "components/common/UnauthorizedState.tsx",
  "components/common/ErrorBoundary.tsx",
  "components/common/PaginationControl.tsx",
  "components/layout/UserNav.tsx",
].map(file => path.join(root, file));
for (const file of requiredSharedUi) assert.ok(fs.existsSync(file), `Missing shared UI contract: ${path.relative(root, file)}`);

const categoryCard = fs.readFileSync(path.join(root, "components/categories/CategoryCard.tsx"), "utf8");
const recipeCard = fs.readFileSync(path.join(root, "components/recipes/RecipeCard.tsx"), "utf8");
const navbar = fs.readFileSync(path.join(root, "components/layout/Navbar.tsx"), "utf8");
const footer = fs.readFileSync(path.join(root, "components/layout/Footer.tsx"), "utf8");
const errorBoundary = fs.readFileSync(path.join(root, "components/common/ErrorBoundary.tsx"), "utf8");

assert.doesNotMatch(categoryCard, /images\.unsplash\.com/, "CategoryCard must not infer production images from mock slugs");
assert.doesNotMatch(recipeCard, /images\.unsplash\.com/, "RecipeCard must not inject a remote mock image");
assert.doesNotMatch(navbar, /categories\/(?:pasta|mains|baking|salads)/, "Navbar must not contain mock category links");
assert.doesNotMatch(footer, /[\"']use client[\"']|newsletter|subscribed/i, "Footer should remain static until a real subscription contract exists");
assert.doesNotMatch(errorBoundary, /\.stack\b/, "ErrorBoundary fallback must never render an exception stack");
assert.match(categoryCard, /export interface CategoryCardProps/, "CategoryCard props must be public");
assert.match(recipeCard, /export interface RecipeCardProps/, "RecipeCard props must be public");
process.stdout.write(`PASS semantic token/API boundary audit (${files.length} source files)\n`);
