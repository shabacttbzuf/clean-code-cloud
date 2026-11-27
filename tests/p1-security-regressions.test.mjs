import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("POS campaign analytics awaits the RPC and never chains catch on the builder", () => {
  const source = read("../src/routes/_authenticated/pos.tsx");
  assert.match(source, /async function recordCampaignEvent[\s\S]*?await rpc\(/);
  assert.match(source, /recordCampaignEvent\(promo\.id, "impression"\)/);
  assert.match(source, /recordCampaignEvent\(promo\.id, "click"\)/);
  assert.doesNotMatch(source, /record_marketing_campaign_event[\s\S]{0,240}\.catch\(/);
});

test("dashboard uses non-blocking toasts for validation and storage errors", () => {
  const source = read("../src/routes/_authenticated/dashboard.tsx");
  assert.match(source, /toast\.error\(/);
  assert.doesNotMatch(source, /window\.alert\(/);
  assert.match(source, /await rpc\(/);
});

test("attendance print escapes all user-controlled HTML values", () => {
  const source = read("../src/routes/_authenticated/hr.attendance.tsx");
  assert.match(source, /function escapeHtml\(/);
  for (const expression of [
    "empName(r.employee_id)",
    "statusLabels[r.status] ?? r.status",
    "r.check_in",
    "r.check_out",
    "r.notes ??",
    "tenant?.name",
    "date",
  ]) {
    assert.ok(source.includes("escapeHtml(" + expression), `Expected escaped print value: ${expression}`);
  }
});

test("sign-up without a session does not enter onboarding before email confirmation", () => {
  const source = read("../src/routes/auth.tsx");
  assert.match(source, /if \(!data\.session\) \{[\s\S]*?return;[\s\S]*?\}\s*toast\.success/);
  assert.match(source, /navigate\(\{ to: "\/onboarding" \}\)/);
});

test("Super Owner user lookup paginates instead of stopping at the first 200 users", () => {
  const source = read("../src/lib/super-owner.functions.ts");
  assert.match(source, /for \(let page = 1; !target; page \+= 1\)/);
  assert.match(source, /perPage: 200/);
  assert.match(source, /usersPage\.users\.length < 200/);
});
