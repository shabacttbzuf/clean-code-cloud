import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261121020000_promotional_offers_and_pos_redemptions.sql", import.meta.url), "utf8");
const readScopeMigration = readFileSync(new URL("../supabase/migrations/20261121025000_promotions_read_permission_scope.sql", import.meta.url), "utf8");
const snapshot = readFileSync(new URL("../supabase/COMPLETE_DATABASE.sql", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/routes/_authenticated/promotions.tsx", import.meta.url), "utf8");
const pos = readFileSync(new URL("../src/routes/_authenticated/pos.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../src/components/app-sidebar.tsx", import.meta.url), "utf8");
const tabs = readFileSync(new URL("../src/components/workspace-tabs.tsx", import.meta.url), "utf8");
const guard = readFileSync(new URL("../src/routes/_authenticated/route.tsx", import.meta.url), "utf8");
const routeTree = readFileSync(new URL("../src/routeTree.gen.ts", import.meta.url), "utf8");
const granularRls = readFileSync(new URL("../supabase/migrations/20261125020000_granular_marketing_rls_alignment.sql", import.meta.url), "utf8");
const promotionFix = readFileSync(new URL("../supabase/migrations/20261127010000_fix_same_sku_promotion_redemption.sql", import.meta.url), "utf8");

test("promotional offers have a dedicated schema and independent permission", () => {
  assert.ok(migration.includes("'promotions.manage'"));
  assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS public.promotional_offers"));
  assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS public.promotion_redemptions"));
  assert.ok(migration.includes("ALTER TABLE public.promotional_offers ENABLE ROW LEVEL SECURITY"));
  assert.ok(migration.includes("private.can_access_branch"));
  assert.ok(migration.includes("private.is_company_member"));
  assert.ok(migration.includes("validate_promotional_offer_scope"));
});

test("POS promotion redemption is validated server-side and recorded atomically", () => {
  assert.ok(migration.includes("_promotion_id uuid"));
  assert.ok(migration.includes("FOR UPDATE"));
  assert.ok(migration.includes("usage_limit"));
  assert.ok(migration.includes("INSERT INTO public.promotion_redemptions"));
  assert.ok(migration.includes("private.create_pos_order_with_promotion"));
  assert.ok(migration.includes("SECURITY INVOKER"));
  assert.ok(pos.includes("pos-active-promotions"));
  assert.ok(pos.includes("_promotion_id: selectedPromotionId"));
  assert.ok(pos.includes("خصم العرض الترويجي"));
});

test("promotions are separate from advertising and route entry uses the view permission", () => {
  assert.ok(page.includes('createFileRoute("/_authenticated/promotions")'));
  for (const key of ["promotions.view", "promotions.create", "promotions.edit", "promotions.delete", "promotions.approve"]) {
    assert.ok(page.includes('hasPermission("' + key + '")'), "missing " + key);
  }
  assert.ok(page.includes("buy_x_get_y"));
  assert.ok(page.includes("promotion-redemptions"));
  assert.ok(sidebar.includes('url: "/promotions", icon: Gift, permission: "promotions.view"'));
  assert.ok(tabs.includes('["/promotions", "العروض الترويجية"]'));
  assert.ok(guard.includes('{ prefix: "/promotions", permission: "promotions.view" }'));
  assert.ok(routeTree.includes("AuthenticatedPromotionsRouteImport"));
  assert.ok(routeTree.includes("fullPath: '/promotions'"));
});

test("granular promotion writes retain tenant, company and branch row boundaries", () => {
  for (const action of ["promotions.create", "promotions.edit", "promotions.approve", "promotions.delete"]) {
    assert.ok(granularRls.includes("'" + action + "'"), "missing " + action);
  }
  assert.ok(granularRls.includes("promotional_offers_granular_scope_insert"));
  assert.ok(granularRls.includes("promotional_offers_granular_scope_update"));
  assert.ok(granularRls.includes("promotional_offers_granular_scope_delete"));
  assert.ok(granularRls.includes("private.is_company_member"));
  assert.ok(granularRls.includes("private.can_access_branch"));
  assert.ok(granularRls.includes("DROP POLICY IF EXISTS permission_gate_promotional_offers_select"));
});

test("complete database snapshot includes both granular permission migrations exactly once", () => {
  for (const name of ["20261125010000_granular_section_action_permissions.sql", "20261125020000_granular_marketing_rls_alignment.sql"]) {
    assert.equal(snapshot.split("SOURCE MIGRATION: " + name).length - 1, 1);
    assert.ok(snapshot.includes("END MIGRATION: " + name));
  }
});


test("same-SKU Buy X Get Y preview and server redemption use complete bundles", () => {
  assert.match(pos, /rewardId === offer\.product_id[\s\S]{0,240}rewardQty \/ \(Math\.max\(1, Number\(offer\.buy_quantity\)\) \+ Math\.max\(1, Number\(offer\.get_quantity\)\)\)/);
  assert.match(promotionFix, /v_free_qty := \(v_reward_qty \/ \(v_offer\.buy_quantity \+ v_offer.get_quantity\)\) \* v_offer.get_quantity;/);
  assert.match(promotionFix, /v_offer\.buy_quantity,0\) <= 0 OR coalesce\(v_offer\.get_quantity,0\) <= 0/);
  assert.match(snapshot, /v_free_qty := \(v_reward_qty \/ \(v_offer\.buy_quantity \+ v_offer.get_quantity\)\) \* v_offer.get_quantity;/);
});
