/* eslint-disable @typescript-eslint/no-require-imports -- Execute the pure TypeScript notice validator. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const Module = require("node:module");
const moduleUnderTest = new Module("maintenance-test");
moduleUnderTest._compile(ts.transpileModule(fs.readFileSync(require.resolve("../lib/maintenance.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, "maintenance-test.js");
const { maintenanceNotice } = moduleUnderTest.exports;
const notice = { announcedAt: "2026-11-01T03:00:00Z", startsAt: "2026-11-03T03:00:00Z", endsAt: "2026-11-03T04:00:00Z", message: "Bảo trì định kỳ" };
const clock = Date.parse("2026-11-02T03:00:00Z");
assert.ok(maintenanceNotice(JSON.stringify(notice), clock));
assert.equal(maintenanceNotice(JSON.stringify({ ...notice, announcedAt: "2026-11-01T03:00:01Z" }), clock), null);
assert.equal(maintenanceNotice(JSON.stringify(notice), Date.parse(notice.endsAt)), null);
assert.equal(maintenanceNotice(JSON.stringify(notice), Date.parse(notice.announcedAt) - 1), null);
assert.equal(maintenanceNotice("{broken", clock), null);
assert.equal(maintenanceNotice(JSON.stringify({ ...notice, endsAt: notice.startsAt }), clock), null);
assert.equal(maintenanceNotice(JSON.stringify({ ...notice, message: " " }), clock), null);
assert.equal(maintenanceNotice(JSON.stringify({ ...notice, startsAt: "invalid" }), clock), null);
console.log("PASS maintenance notice: 48-hour boundary, expired/future, malformed input, empty message, invalid interval/date.");
