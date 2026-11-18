import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const matrixPath = path.join(root, "quality/traceability.json");
const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));

const mappings = {
  "FR-JOB-003": {
    code: ["Culinary_Blog_Nhom5/culinary-blog-web/app/sitemap.ts"],
    tests: ["Culinary_Blog_Nhom5/culinary-blog-web/tests/sitemap-robots.unit.cjs::multi-page pagination (>50 items) collects all Published recipes across all pages"],
  },
  "FR-RCP-002": {
    code: [
      "Culinary_Blog_Nhom5/src/CulinaryBlog.Application/Features/Recipes/Queries/GetRecipeById/GetRecipeByIdQuery.cs",
      "Culinary_Blog_Nhom5/src/CulinaryBlog.Application/Features/Recipes/Queries/GetRecipeBySlug/GetRecipeBySlugQuery.cs",
    ],
    tests: [
      "Culinary_Blog_Nhom5/tests/CulinaryBlog.Application.Tests/PublicQueryTests.cs::Detail_by_id_is_restricted_to_owner_or_admin",
      "Culinary_Blog_Nhom5/tests/CulinaryBlog.Application.Tests/PublicQueryTests.cs::Detail_by_id_does_not_relax_ownership_for_any_status",
      "Culinary_Blog_Nhom5/tests/CulinaryBlog.Application.Tests/PublicQueryTests.cs::Detail_by_id_hides_missing_and_deleted_records",
    ],
  },
  "FR-RCP-004": {
    code: [
      "Culinary_Blog_Nhom5/src/CulinaryBlog.Application/Features/Recipes/Commands/UpdateRecipeNutrition/UpdateRecipeNutritionCommand.cs",
      "Culinary_Blog_Nhom5/src/CulinaryBlog.Application/DTOs/RecipeDetailDto.cs",
      "Culinary_Blog_Nhom5/culinary-blog-web/types/recipe.types.ts",
    ],
    tests: [
      "Culinary_Blog_Nhom5/tests/CulinaryBlog.RecipeUpdate.Tests/RecipeUpdateTests.cs::Nutrition_update_validates_ownership_and_uses_recipe_version",
      "Culinary_Blog_Nhom5/tests/CulinaryBlog.Application.Tests/PublicQueryTests.cs::Detail_preserves_missing_nutrition_and_real_zero_values",
    ],
  },
  "NFR-MAINT-001": {
    code: [".github/workflows/ci.yml", ".editorconfig"],
    tests: ["scripts/quality/test_traceability.py::test_normalized_spec_change_requires_catalog_review"],
  },
  "NFR-MAINT-003": {
    code: ["README.md", "CHANGELOG.md", "Culinary_Blog_Nhom5/src/CulinaryBlog.API/Program.cs"],
    tests: [
      "Culinary_Blog_Nhom5/tests/CulinaryBlog.Observability.Tests/ProgramSecurityTests.cs::Named_application_operations_have_openapi_summaries",
      "Culinary_Blog_Nhom5/tests/CulinaryBlog.Observability.Tests/ProgramSecurityTests.cs::Api_contract_xml_comments_appear_in_openapi",
    ],
  },
  "NFR-MAINT-004": {
    code: [
      "Culinary_Blog_Nhom5/src/CulinaryBlog.Domain/CulinaryBlog.Domain.csproj",
      "Culinary_Blog_Nhom5/tests/CulinaryBlog.Architecture.Tests/ArchitectureTests.cs",
      "docs/adr/ADR-0001-domain-persistence-exceptions.md",
    ],
    tests: [
      "Culinary_Blog_Nhom5/tests/CulinaryBlog.Architecture.Tests/ArchitectureTests.cs::Project_graph_and_compiled_core_assemblies_obey_layer_direction",
      "Culinary_Blog_Nhom5/tests/CulinaryBlog.Architecture.Tests/ArchitectureTests.cs::Domain_persistence_exceptions_cannot_spread_beyond_adr_scope",
    ],
  },
  "NFR-PERF-001": {
    code: ["Culinary_Blog_Nhom5/src/CulinaryBlog.Infrastructure/Services/PerformanceMetrics.cs"],
    tests: ["Culinary_Blog_Nhom5/tests/performance/scenarios.js::thresholds.api_latency"],
  },
  "NFR-PERF-002": {
    code: ["Culinary_Blog_Nhom5/src/CulinaryBlog.API/Program.cs", "compose.performance.yml"],
    tests: ["Culinary_Blog_Nhom5/tests/performance/scenarios.js::ramping-vus"],
  },
  "NFR-PERF-003": {
    code: [
      "Culinary_Blog_Nhom5/src/CulinaryBlog.Infrastructure/Services/PublicContentCache.cs",
      "Culinary_Blog_Nhom5/src/CulinaryBlog.Infrastructure/Services/PerformanceMetrics.cs",
    ],
    tests: [
      "Culinary_Blog_Nhom5/tests/performance/summarize.test.mjs::uses window deltas, not lifetime Redis version hits",
      "Culinary_Blog_Nhom5/tests/CulinaryBlog.Security.Tests/PublicContentCacheTests.cs::Recipe_mutation_invalidates_both_recipe_and_category_versions",
    ],
  },
  "NFR-PERF-004": {
    code: ["Culinary_Blog_Nhom5/src/CulinaryBlog.Infrastructure/Repositories/RecipeRepository.cs"],
    tests: ["Culinary_Blog_Nhom5/tests/performance/tool/Program.cs::EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)"],
  },
  "NFR-PERF-005": {
    code: ["Culinary_Blog_Nhom5/culinary-blog-web/next.config.ts"],
    tests: ["Culinary_Blog_Nhom5/tests/performance/browser.mjs::Seed recipe detail was not rendered"],
  },
  "NFR-REL-001": {
    code: ["Culinary_Blog_Nhom5/src/CulinaryBlog.API/Endpoints/HealthDependencyProbe.cs"],
    tests: [
      "Culinary_Blog_Nhom5/tests/CulinaryBlog.Security.Tests/HealthEndpointTests.cs::Readiness_depends_on_postgres_and_redis_but_liveness_only_on_process",
      "Culinary_Blog_Nhom5/tests/performance/failover.mjs::Recovery must serve correct responses through both API instances",
    ],
  },
  "NFR-REL-003": {
    code: ["Culinary_Blog_Nhom5/src/CulinaryBlog.Infrastructure/Services/PurgeDeletedRecipesJob.cs", "docker-compose.yml"],
    tests: ["Culinary_Blog_Nhom5/tests/CulinaryBlog.RecipeDeletion.Tests/DeletionTests.cs::Real_minio_objects_survive_soft_delete_and_are_removed_only_after_retention"],
  },
  "NFR-SCALE-001": {
    code: ["compose.performance.yml", "infra/performance/nginx.conf"],
    tests: ["Culinary_Blog_Nhom5/tests/performance/scale.mjs::Cross-instance auth, refresh replay/revoke, cache visibility and gateway distribution passed."],
  },
  "NFR-SCALE-002": {
    code: [
      "Culinary_Blog_Nhom5/src/CulinaryBlog.Infrastructure/DependencyInjection.cs",
      "Culinary_Blog_Nhom5/src/CulinaryBlog.Infrastructure/Repositories/RecipeRepository.cs",
    ],
    tests: ["Culinary_Blog_Nhom5/tests/performance/tool/Program.cs::EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)"],
  },
  "NFR-SCALE-003": {
    code: ["compose.performance.yml", "infra/performance/nginx.conf"],
    tests: ["Culinary_Blog_Nhom5/tests/performance/failover.mjs::Recovery must serve correct responses through both API instances"],
  },
  "NFR-SEC-005": {
    code: [
      "Culinary_Blog_Nhom5/src/CulinaryBlog.API/Program.cs",
      "Culinary_Blog_Nhom5/src/CulinaryBlog.API/Security/RefreshCookieOriginGuard.cs",
      "Culinary_Blog_Nhom5/culinary-blog-web/lib/security/headers.ts",
    ],
    tests: [
      "Culinary_Blog_Nhom5/tests/CulinaryBlog.Security.Tests/ApiSecurityTests.cs::Security_headers_cover_success_and_errors",
      "Culinary_Blog_Nhom5/tests/CulinaryBlog.Security.Tests/CredentialSecurityTests.cs::Refresh_cookie_rejects_untrusted_origin_and_cross_site_fetch",
    ],
  },
  "NFR-SEC-006": {
    code: [
      "Culinary_Blog_Nhom5/src/CulinaryBlog.Application/Features/Recipes/Queries/GetRecipeById/GetRecipeByIdQuery.cs",
      "Culinary_Blog_Nhom5/src/CulinaryBlog.Application/Features/Auth/Admin/AdminUserRequests.cs",
    ],
    tests: [
      "Culinary_Blog_Nhom5/tests/CulinaryBlog.Application.Tests/WorkflowAuthorizationTests.cs::Admin_workflows_enforce_admin_role_outside_http",
      "Culinary_Blog_Nhom5/tests/CulinaryBlog.Application.Tests/PublicQueryTests.cs::Detail_by_id_is_restricted_to_owner_or_admin",
    ],
  },
  "NFR-SEC-007": {
    code: [".github/workflows/ci.yml", "Culinary_Blog_Nhom5/src/CulinaryBlog.API/Program.cs"],
    tests: [".github/workflows/ci.yml::gitleaks/v8@v8.24.3"],
  },
  "NFR-SEO-001": {
    code: ["Culinary_Blog_Nhom5/culinary-blog-web/lib/seo/recipeJsonLd.ts"],
    tests: ["Culinary_Blog_Nhom5/culinary-blog-web/tests/seo.unit.ts::Recipe JSON-LD maps nullable ingredient fields and ordered steps"],
  },
  "NFR-SEO-003": {
    code: ["Culinary_Blog_Nhom5/culinary-blog-web/app/sitemap.ts", "Culinary_Blog_Nhom5/culinary-blog-web/app/robots.ts"],
    tests: ["Culinary_Blog_Nhom5/culinary-blog-web/tests/sitemap-robots.unit.cjs::draft (0) and archived (2) recipes are strictly excluded from sitemap"],
  },
  "NFR-USE-001": {
    code: ["Culinary_Blog_Nhom5/culinary-blog-web/components/layout/Navbar.tsx"],
    tests: [
      "Culinary_Blog_Nhom5/culinary-blog-web/tests/accessibility.e2e.cjs::shared shell overflows",
      "Culinary_Blog_Nhom5/culinary-blog-web/tests/route-states.e2e.cjs::search debounce, Enter cancellation, filter preservation, history and 320px layout",
    ],
  },
  "NFR-USE-002": {
    code: ["Culinary_Blog_Nhom5/culinary-blog-web/components/layout/Navbar.tsx", "Culinary_Blog_Nhom5/culinary-blog-web/components/common/ErrorState.tsx"],
    tests: [
      "Culinary_Blog_Nhom5/culinary-blog-web/tests/accessibility.e2e.cjs::PASS axe WCAG 2.1 A/AA",
      "Culinary_Blog_Nhom5/culinary-blog-web/tests/accessibility.e2e.cjs::PASS real Radix/modal focus trap",
    ],
  },
  "NFR-USE-003": {
    code: ["Culinary_Blog_Nhom5/culinary-blog-web/components/common/ErrorState.tsx"],
    tests: [
      "Culinary_Blog_Nhom5/culinary-blog-web/tests/route-states.e2e.cjs::safe error text",
      "Culinary_Blog_Nhom5/culinary-blog-web/tests/route-states.e2e.cjs::query failure is not empty/zero statistics",
    ],
  },
  "NFR-USE-004": {
    code: [
      "Culinary_Blog_Nhom5/culinary-blog-web/components/common/LoadingState.tsx",
      "Culinary_Blog_Nhom5/culinary-blog-web/components/common/ErrorState.tsx",
      "Culinary_Blog_Nhom5/culinary-blog-web/components/common/EmptyState.tsx",
    ],
    tests: [
      "Culinary_Blog_Nhom5/culinary-blog-web/tests/route-states.e2e.cjs::rejected retry, 404/noindex and streamed route loading",
      "Culinary_Blog_Nhom5/culinary-blog-web/tests/accessibility.e2e.cjs::busy recovery",
    ],
  },
};

const updatedGaps = {
  "FR-RCP-002": "HT-03/HT-04 code and focused tests now align ID access and nullable nutrition contracts in the working tree. Verification remains pending a fresh full run and review on the final acceptance commit.",
  "FR-RCP-004": "Nullable nutrition update/read mappings and focused tests are present in the working tree. Verification remains pending a fresh full run and review on the final acceptance commit.",
  "NFR-MAINT-003": "README/OpenAPI assertions and ADR-0001 are present, but a fresh clean-setup timing and OpenAPI inventory report on the final acceptance commit is still required.",
  "NFR-SEC-006": "HT-05 moved the reviewed recipe/admin authorization workflows behind Application handlers and focused tests pass in the working tree. Verification remains pending the final acceptance commit and complete workflow review.",
  "NFR-SEO-001": "Recipe JSON-LD tests and nullable nutrition propagation are present in the working tree; Google Rich Results validation and final-commit evidence are still required.",
};

for (const row of matrix.requirements) {
  const mapping = mappings[row.id];
  if (!mapping) continue;
  for (const reference of [...mapping.code, ...mapping.tests]) {
    const [file, symbol] = reference.split("::", 2);
    const absolute = path.join(root, file);
    if (!fs.statSync(absolute).isFile()) throw new Error(`Mapping is not a file: ${reference}`);
    if (symbol && !fs.readFileSync(absolute, "utf8").includes(symbol))
      throw new Error(`Mapping symbol not found: ${reference}`);
  }
  row.code = mapping.code;
  row.tests = mapping.tests;
  if (updatedGaps[row.id]) row.gap = updatedGaps[row.id];
}

const missing = matrix.requirements.filter((row) =>
  row.code.some((reference) => !fs.statSync(path.join(root, reference)).isFile())
  || row.tests.some((reference) => !reference.includes("::")));
if (missing.length) throw new Error(`Non-concrete mappings remain: ${missing.map((row) => row.id).join(", ")}`);

fs.writeFileSync(matrixPath, `${JSON.stringify(matrix, null, 2)}\n`);
console.log(`Concrete code and test mappings verified for ${matrix.requirements.length} requirements.`);
