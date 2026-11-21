import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261121020000_promotional_offers_and_pos_redemptions.sql", import.meta.url), "utf8");
const snapshot = readFileSync(new URL("../supabase/COMPLETE_DATABASE.sql", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/routes/_authenticated/promotions.tsx", import.meta.url), "utf8");
const pos = readFileSync(new URL("../src/routes/_authenticated/pos.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../src/components/app-sidebar.tsx", import.meta.url), "utf8");
const tabs = readFileSync(new URL("../src/components/workspace-tabs.tsx", import.meta.url), "utf8");
const guard = readFileSync(new URL("../src/routes/_authenticated/route.tsx", import.meta.url), "utf8");
const routeTree = readFileSync(new URL("../src/routeTree.gen.ts", import.meta.url), "utf8");

test("promotional offers have a dedicated schema and independent permission", () => {
  assert.match(migration, /'promotions\.manage'/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.promotional_offers/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.promotion_redemptions/);
  assert.match(migration, /ALTER TABLE public\.promotional_offers ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /private\.can_access_branch/);
  assert.match(migration, /private\.is_company_member/);
  assert.match(migration, /validate_promotional_offer_scope/);
});

test("POS promotion redemption is validated server-side and recorded atomically", () => {
  assert.match(migration, /_promotion_id uuid/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /usage_limit/);
  assert.match(migration, /INSERT INTO public\.promotion_redemptions/);
  assert.match(migration, /private\.create_pos_order_with_promotion/);
  assert.match(migration, /LANGUAGE sql\s+SECURITY INVOKER/);
  assert.match(pos, /pos-active-promotions/);
  assert.match(pos, /_promotion_id: selectedPromotionId/);
  assert.match(pos, /خصم العرض الترويجي/);
});

test("promotions are separate from advertising and have their own navigation and guard", () => {
  assert.match(page, /createFileRoute\("\/_authenticated\/promotions"\)/);
  assert.match(page, /promotions\.manage/);
  assert.match(page, /buy_x_get_y/);
  assert.match(page, /promotion-redemptions/);
  assert.match(sidebar, /title: "العروض الترويجية", url: "\/promotions".*promotions\.manage/);
  assert.match(tabs, /\["\/promotions", "العروض الترويجية"\]/);
  assert.match(guard, /prefix: "\/promotions", permission: "promotions\.manage"/);
  assert.match(routeTree, /AuthenticatedPromotionsRouteImport/);
  assert.ok(routeTree.includes("fullPath: '/promotions'"));
});

test("complete database snapshot contains the exact promotions migration", () => {
  const marker = "-- SOURCE MIGRATION: 20261121020000_promotional_offers_and_pos_redemptions.sql";
  assert.ok(snapshot.includes(marker));
  assert.ok(snapshot.includes("-- END MIGRATION: 20261121020000_promotional_offers_and_pos_redemptions.sql"));
  assert.ok(snapshot.includes("CREATE TABLE IF NOT EXISTS public.promotional_offers"));
});
