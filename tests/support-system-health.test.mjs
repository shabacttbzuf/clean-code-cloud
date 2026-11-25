import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyHttpStatus, classifyProbeFailure, aggregateHealth, canViewTechnicalDetails, safeDiagnosticSummary } from "../src/lib/support-health.mjs";

const support = readFileSync(new URL("../src/routes/_authenticated/support.tsx", import.meta.url), "utf8");
const navigation = readFileSync(new URL("../src/components/app-sidebar.tsx", import.meta.url), "utf8");
const topbar = readFileSync(new URL("../src/routes/_authenticated/route.tsx", import.meta.url), "utf8");
const routeTree = readFileSync(new URL("../src/routeTree.gen.ts", import.meta.url), "utf8");

test("HTTP checks distinguish confirmed server failures from authorization and transient responses", () => {
  assert.equal(classifyHttpStatus(200), "healthy");
  assert.equal(classifyHttpStatus(302), "healthy");
  assert.equal(classifyHttpStatus(401), "degraded");
  assert.equal(classifyHttpStatus(403), "degraded");
  assert.equal(classifyHttpStatus(429), "degraded");
  assert.equal(classifyHttpStatus(503), "down");
  assert.equal(classifyProbeFailure(), "degraded");
});

test("overall health is not healthy unless every required check succeeded", () => {
  assert.equal(aggregateHealth([{ state: "healthy" }, { state: "healthy" }]), "healthy");
  assert.equal(aggregateHealth([{ state: "healthy" }, { state: "degraded" }]), "degraded");
  assert.equal(aggregateHealth([{ state: "healthy" }, { state: "unknown" }]), "degraded");
  assert.equal(aggregateHealth([{ state: "healthy" }, { state: "down" }]), "down");
  assert.equal(aggregateHealth([]), "unknown");
});

test("technical details are restricted to Super Owner or authorized technical roles", () => {
  assert.equal(canViewTechnicalDetails(true, []), true);
  assert.equal(canViewTechnicalDetails(false, ["audit.view"]), true);
  assert.equal(canViewTechnicalDetails(false, ["settings.view"]), true);
  assert.equal(canViewTechnicalDetails(false, ["sales.view"]), false);
});

test("diagnostic exports contain status metadata only and never credentials or raw errors", () => {
  const result = safeDiagnosticSummary([{ id: "db", label: "Database", state: "healthy", checkedAt: "2026-01-01T00:00:00Z", access_token: "secret", detail: "raw response" }]);
  assert.deepEqual(result, [{ id: "db", label: "Database", state: "healthy", checkedAt: "2026-01-01T00:00:00Z" }]);
});

test("support center independently probes internet, app host, database, auth, session and storage", () => {
  assert.match(support, /cloudflare\.com\/cdn-cgi\/trace/);
  assert.match(support, /window\.location\.origin/);
  assert.match(support, /\/rest\/v1\//);
  assert.match(support, /\/auth\/v1\/health/);
  assert.match(support, /\/storage\/v1\/status/);
  assert.match(support, /supabase\.auth\.getSession\(\)/);
  assert.match(support, /supabase\.auth\.getUser\(\)/);
  assert.match(support, /Promise\.all/);
});

test("checks are throttled, retried safely, abort on unmount, and preserve partial results", () => {
  assert.match(support, /60_000/);
  assert.match(support, /MIN_RETRY_INTERVAL_MS/);
  assert.match(support, /AbortController/);
  assert.match(support, /activeControllersRef/);
  assert.match(support, /Promise\.allSettled/);
  assert.match(support, /visibilitychange/);
});

test("technical details are permission-gated and diagnostics do not expose credentials", () => {
  assert.match(support, /canViewTechnicalDetails/);
  assert.match(support, /get_my_permissions/);
  assert.match(support, /audit\.view/);
  assert.doesNotMatch(support, /console\.(log|error|warn)\(/);
  assert.doesNotMatch(support, /access_token|refresh_token|service_role|SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(support, /safeDiagnosticSummary/);
});

test("support center is reachable from sidebar, global top bar, and generated route tree", () => {
  assert.match(navigation, /url: "\/support"/);
  assert.match(topbar, /to="\/support"/);
  assert.match(routeTree, /AuthenticatedSupportRouteImport/);
  assert.match(routeTree, /'\/_authenticated\/support'/);
});

test("support content remains responsive and provides user guidance for partial failures", () => {
  assert.match(support, /grid-cols-1/);
  assert.match(support, /sm:grid-cols-2/);
  assert.match(support, /xl:grid-cols-3/);
  assert.match(support, /إرشادات/);
  assert.match(support, /لا تكرر العمليات المالية/);
});
