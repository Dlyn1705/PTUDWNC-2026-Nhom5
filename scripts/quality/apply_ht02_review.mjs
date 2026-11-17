import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const matrixPath = path.join(root, "quality/traceability.json");
const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
const evidence = "quality/evidence/verification-20261115-2ee1915.json";
const reviewedCommit = "2ee1915";
const reviewedBy = "Codex";

const verified = new Set([
  "FR-AUTH-001", "FR-AUTH-002", "FR-AUTH-003", "FR-AUTH-004", "FR-AUTH-005", "FR-AUTH-006", "FR-AUTH-007",
  "FR-CAT-001", "FR-CAT-002", "FR-CAT-003", "FR-CAT-004", "FR-CAT-005",
  "FR-FILE-001", "FR-FILE-002",
  "FR-JOB-001", "FR-JOB-002", "FR-JOB-004",
  "FR-OBS-001", "FR-OBS-002", "FR-OBS-003",
  "FR-RCP-001", "FR-RCP-003", "FR-RCP-005", "FR-RCP-006", "FR-RCP-007", "FR-RCP-008", "FR-RCP-009", "FR-RCP-010",
  "FR-SRCH-001", "FR-SRCH-002", "FR-SRCH-003", "FR-SRCH-004",
  "NFR-MAINT-002", "NFR-REL-002",
  "NFR-SEC-001", "NFR-SEC-002", "NFR-SEC-003", "NFR-SEC-004",
  "NFR-SEO-002", "NFR-SEO-004"
]);

const ignoredDirectories = new Set(["bin", "obj", "node_modules", ".next", "build", "TestResults"]);
const codeExtensions = new Set([".cs", ".csproj", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const testExtensions = new Set([".cs", ".ts", ".tsx", ".js", ".mjs", ".cjs"]);

function filesUnder(relativePath, extensions) {
  const absolute = path.join(root, relativePath);
  if (fs.statSync(absolute).isFile()) return [relativePath.replaceAll("\\", "/")];
  const found = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(child, extensions));
    else if (extensions.has(path.extname(entry.name))) found.push(child.replaceAll("\\", "/"));
  }
  return found.sort();
}

function symbolsIn(relativePath) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  const symbols = [];
  if (relativePath.endsWith(".cs")) {
    const pattern = /\[(?:Fact|Theory)(?:\([^\]]*\))?\][\s\S]{0,800}?public\s+(?:async\s+)?(?:Task(?:<[^>]+>)?|ValueTask(?:<[^>]+>)?|void)\s+([A-Za-z0-9_]+)\s*\(/g;
    for (const match of source.matchAll(pattern)) symbols.push(match[1]);
  } else {
    const pattern = /(?:test|it)\s*\(\s*(["'`])([^\n]*?)\1\s*,/g;
    for (const match of source.matchAll(pattern)) symbols.push(match[2]);
  }
  return [...new Set(symbols)].map(symbol => `${relativePath}::${symbol}`);
}

function concreteTests(references) {
  const result = [];
  for (const reference of references) {
    if (reference.includes("::")) {
      result.push(reference);
      continue;
    }
    for (const file of filesUnder(reference, testExtensions)) result.push(...symbolsIn(file));
  }
  return [...new Set(result)];
}

const testOverrides = {
  "FR-FILE-001": [
    "Culinary_Blog_Nhom5/tests/CulinaryBlog.Application.Tests/PipelineAndImageTests.cs::Image_magic_bytes_must_match_extension_and_mime_and_leave_stream_rewound",
    "Culinary_Blog_Nhom5/tests/CulinaryBlog.Security.Tests/UploadInputSecurityTests.cs::Declared_mime_must_match_magic_bytes_before_storage",
    "Culinary_Blog_Nhom5/tests/CulinaryBlog.RecipeImages.Tests/GalleryTests.cs::PostgreSql_gallery_serializes_mutations_and_preserves_primary"
  ],
  "FR-FILE-002": [
    "Culinary_Blog_Nhom5/tests/CulinaryBlog.RecipeDeletion.Tests/DeletionTests.cs::Real_minio_objects_survive_soft_delete_and_are_removed_only_after_retention",
    "Culinary_Blog_Nhom5/tests/CulinaryBlog.RecipeDeletion.Tests/DeletionTests.cs::Purge_failure_does_not_block_other_records_or_batches_and_can_retry"
  ],
  "FR-RCP-006": [
    "Culinary_Blog_Nhom5/tests/CulinaryBlog.Steps.Tests/RecipeLifecycleTests.cs::Lifecycle_endpoints_authorize_owner_or_admin",
    "Culinary_Blog_Nhom5/tests/CulinaryBlog.Steps.Tests/RecipeLifecycleTests.cs::Lifecycle_transition_table_and_soft_deleted_visibility_are_enforced",
    "Culinary_Blog_Nhom5/tests/CulinaryBlog.Steps.Tests/RecipeLifecycleTests.cs::Unarchive_retries_a_lost_commit_ACK_without_returning_a_false_conflict"
  ]
};

const pendingReasons = {
  "FR-JOB-003": "SRS requires a 02:00 UTC Hangfire recurring job that generates and stores sitemap.xml; current reviewed implementation is a dynamic Next.js sitemap route. Contract decision and matching job evidence are required.",
  "FR-RCP-002": "Pending HT-03 access-contract decision for GET /recipes/{id} and HT-04 nullable nutrition propagation; current code, normalized spec and SRS are not yet fully aligned.",
  "FR-RCP-004": "Pending HT-04: nullable nutrition values are currently mapped to zero in the detail contract, so the full update/read round trip cannot be verified yet.",
  "NFR-MAINT-001": "Build, lint and format gates passed, but the SRS also requires the configured static-analysis toolchain, warning-free CI and an approving PR review; repository-administrator evidence is not present.",
  "NFR-MAINT-003": "README/OpenAPI checks exist, but the required architecture-decision record set is incomplete after documentation removal and the current commit lacks a fresh clean-setup timing/OpenAPI inventory report.",
  "NFR-MAINT-004": "Strict Clean Architecture cannot be verified: Domain still depends on Identity and Npgsql types. Resolution belongs to HT-06.",
  "NFR-PERF-001": "Requires production-like k6/OpenTelemetry measurements for p50/p95/p99; no valid current-commit load report. Pending HT-08.",
  "NFR-PERF-002": "Requires at least 100 concurrent users on 2 vCPU/4 GB and scaling measurements; no valid current-commit load report. Pending HT-08.",
  "NFR-PERF-003": "Requires measured Redis hit rate >=80% in steady state plus TTL/invalidation verification; unit behavior alone is insufficient. Pending HT-08.",
  "NFR-PERF-004": "Requires SQL capture, query counts, index/query-plan and EXPLAIN ANALYZE review; no current-commit database performance report. Pending HT-08.",
  "NFR-PERF-005": "Requires Lighthouse/Core Web Vitals and gzipped first-load bundle measurements; production build success alone is insufficient. Pending HT-08/HT-09.",
  "NFR-REL-001": "Requires an uptime observation proving >=99.5%, alerting and maintenance notice procedure; a short test run cannot establish the SLA. Pending HT-10.",
  "NFR-REL-003": "Transactional/soft-delete tests passed, but daily PostgreSQL backup retention, persistent MinIO storage and a restore drill were not verified. Pending HT-10.",
  "NFR-SCALE-001": "Stateless JWT/Redis/Hangfire components exist, but multi-instance behavior and the required distributed singleton lock were not demonstrated.",
  "NFR-SCALE-002": "Connection/index code exists, but pool limits, query routing/read replica and large-data scaling behavior were not measured or reviewed against the SRS.",
  "NFR-SCALE-003": "Repository overlays do not prove the production multi-instance Nginx/MinIO/CDN topology or horizontal-scaling behavior. Pending HT-10.",
  "NFR-SEC-005": "TLS/HSTS/CORS production behavior is not verified and the SRS SameSite=Strict wording conflicts with the normalized/current SameSite=Lax refresh-cookie decision.",
  "NFR-SEC-006": "Ownership tests pass for reviewed recipe workflows, but HT-05 identifies business authorization and transactions still located in API endpoints; the full Application-layer requirement is not met.",
  "NFR-SEC-007": "No current evidence of the production secret store, 90-day signing-key rotation or a clean full-history gitleaks/truffleHog gate.",
  "NFR-SEO-001": "JSON-LD unit tests pass, but Google Rich Results validation is not recorded and HT-04 can still publish unknown nutrition as zero.",
  "NFR-SEO-003": "Sitemap/robots unit tests pass, but the SRS requires FR-JOB-003 Hangfire generation and storage; current implementation is a dynamic Next.js route.",
  "NFR-USE-001": "Critical browser flows passed, but 320/tablet/desktop coverage and the required BrowserStack iOS/Android review were not run. Pending HT-09.",
  "NFR-USE-002": "Automated checks do not prove full WCAG 2.1 AA, keyboard/focus, contrast, NVDA and VoiceOver behavior. Pending HT-09.",
  "NFR-USE-003": "Problem Details and safe-error tests pass, but complete route/form review and the SRS i18n-ready error-code requirement are not established. Pending HT-09.",
  "NFR-USE-004": "Critical flows exercise loading/upload behavior, but all async routes, rollback/toast states and realtime progress were not exhaustively reviewed. Pending HT-09."
};

for (const row of matrix.requirements) {
  if (!verified.has(row.id)) continue;
  row.code = [...new Set(row.code.flatMap(reference => filesUnder(reference, codeExtensions)))];
  row.tests = testOverrides[row.id] ?? concreteTests(row.tests);
  if (!row.code.length || !row.tests.length) throw new Error(`Review mapping is not concrete: ${row.id}`);
  row.evidence = [...new Set([...row.evidence.filter(reference => fs.existsSync(path.join(root, reference))), evidence])];
  row.status = "Verified";
  row.reviewedBy = reviewedBy;
  row.reviewedCommit = reviewedCommit;
  row.gap = `Reviewed by ${reviewedBy} against the SRS and normalized spec on commit ${reviewedCommit}; mapped assertions passed in ${evidence}.`;
}

for (const row of matrix.requirements) {
  if (!pendingReasons[row.id]) continue;
  row.status = "MissingEvidence";
  row.reviewedBy = reviewedBy;
  row.reviewedCommit = reviewedCommit;
  row.gap = `Reviewed by ${reviewedBy} on commit ${reviewedCommit}. ${pendingReasons[row.id]}`;
}

fs.writeFileSync(matrixPath, `${JSON.stringify(matrix, null, 2)}\n`);
console.log(`Applied HT-02 review to ${verified.size} requirements.`);
