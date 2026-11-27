import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ads = readFileSync(new URL("../src/routes/_authenticated/ads.tsx", import.meta.url), "utf8");
const placement = readFileSync(new URL("../src/components/ads/ad-placement.tsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../src/routes/_authenticated/dashboard.tsx", import.meta.url), "utf8");

test("advertising campaigns support the full approved placement catalog", () => {
  for (const key of ["dashboard_banner", "dashboard_card", "pos_promo", "welcome", "main", "sidebar", "offers", "in_page"]) {
    assert.ok(ads.includes(`${key}:`) || ads.includes(`value="${key}"`), `missing placement key ${key}`);
  }
  assert.match(ads, /PLACEMENT_FORMATS/);
  assert.match(ads, /PLACEMENT_LABELS\[campaign\.placement\]/);
});

test("campaign editor supports multiple branch targets without breaking legacy single-branch targeting", () => {
  assert.match(ads, /const \[targetBranchIds, setTargetBranchIds\] = useState<string\[]>\(\[\]\)/);
  assert.match(ads, /target_branch_ids: \[\.\.\.new Set\(targetBranchIds\)\]/);
  assert.match(ads, /branch_id: targetBranchIds\.length \? null : \(branchId \|\| null\)/);
  assert.match(ads, /اختر فرعاً واحداً من القائمة أو عدة فروع/);
  assert.match(ads, /setTargetBranchIds\(campaign\.target_branch_ids \?\? \[\]\)/);
  assert.match(ads, /لا يمكن استهداف أكثر من 1000 فرع/);
});

test("published ad placements require an active scoped ad space and respect branch targets and schedule", () => {
  assert.match(placement, /from\("marketing_ad_spaces"\)/);
  assert.match(placement, /\.eq\("is_active", true\)/);
  assert.match(placement, /\.eq\("advertising_space_id", space\.id\)/);
  assert.match(placement, /campaign\.target_branch_ids/);
  assert.match(placement, /campaign\.starts_at/);
  assert.match(placement, /campaign\.ends_at/);
  assert.match(placement, /record_marketing_campaign_event/);
});

test("dashboard mounts the welcome, main, sidebar and offers ad placements", () => {
  for (const key of ["welcome", "main", "sidebar", "offers"]) {
    assert.ok(dashboard.includes(`placement="${key}"`), `dashboard does not mount ${key} placement`);
  }
});
