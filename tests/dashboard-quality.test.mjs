import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboard = readFileSync(new URL("../src/routes/_authenticated/dashboard.tsx", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const layout = readFileSync(new URL("../src/routes/_authenticated/route.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("dashboard rejects partial query failures instead of presenting misleading totals", () => {
  assert.match(dashboard, /for \(const result of \[salesToday, salesMonth, salesTrend, refundsToday, refundsMonth, refundsTrend, expensesMonth, expByCat, lowStock, sessions\]\)/);
  assert.match(dashboard, /if \(result\.error\) throw result\.error/);
  assert.match(dashboard, /if \(catsRes\.error\) throw catsRes\.error/);
  assert.match(dashboard, /لم يتم عرض أرقام جزئية أو مضللة/);
});

test("CI runs on the active feature branch and supports a manual verification run", () => {
  assert.match(workflow, /branches: \["main", "feature\/\*\*"\]/);
  assert.match(workflow, /workflow_dispatch:/);
});

test("authenticated workspace prevents horizontal overflow and motion respects accessibility preferences", () => {
  assert.match(layout, /<main className="min-w-0 flex-1/);
  assert.match(styles, /prefers-reduced-motion: no-preference/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(styles, /focus-visible/);
});

const inventory = readFileSync(new URL("../src/routes/_authenticated/inventory.index.tsx", import.meta.url), "utf8");

test("inventory reads every page instead of silently stopping at the Supabase row cap", () => {
  assert.match(inventory, /async function fetchAllRows<T>/);
  assert.match(inventory, /pageSize = 500/);
  assert.match(inventory, /query\.range\(from, from \+ pageSize - 1\)/);
  assert.match(inventory, /if \(page\.length < pageSize\) return rows/);
  assert.match(inventory, /\.order\("id"\)/);
});

test("inventory distinguishes query failures from a genuinely empty stock list", () => {
  assert.match(inventory, /branches\.isError/);
  assert.match(inventory, /inventory\.isError/);
  assert.match(inventory, /لم نعرض أرقاماً جزئية/);
  assert.match(inventory, /inventory\.refetch\(\)/);
});

const sales = readFileSync(new URL("../src/routes/_authenticated/sales.index.tsx", import.meta.url), "utf8");

test("sales history is fully paginated and refund totals are fetched in bounded batches", () => {
  assert.match(sales, /async function fetchAllRows<T>/);
  assert.match(sales, /\.range\(from, from \+ pageSize - 1\)/);
  assert.match(sales, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(sales, /i \+= 200/);
  assert.match(sales, /لم نعرض نتائج جزئية/);
});

const pos = readFileSync(new URL("../src/routes/_authenticated/pos.tsx", import.meta.url), "utf8");
const purchases = readFileSync(new URL("../src/routes/_authenticated/purchases.tsx", import.meta.url), "utf8");

test("POS loads the full product catalogue and branch stock in deterministic pages", () => {
  assert.match(pos, /async function fetchAllRows<T>/);
  assert.match(pos, /\.range\(from, from \+ pageSize - 1\)/);
  assert.match(pos, /\.order\("name"\)/);
  assert.match(pos, /\.order\("product_id"\)/);
});

test("purchasing rejects incomplete supplier, branch, and product data", () => {
  assert.match(purchases, /for \(const result of \[supRes, brRes, returnRes\]\)/);
  assert.match(purchases, /if \(error\) throw error/);
  assert.match(purchases, /branches\.isError \|\| suppliers\.isError \|\| products\.isError/);
  assert.match(purchases, /useEffect\(\(\) =>/);
});

const authLayout = readFileSync(new URL("../src/routes/_authenticated/route.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../src/components/ui/sidebar.tsx", import.meta.url), "utf8");
const sonner = readFileSync(new URL("../src/components/ui/sonner.tsx", import.meta.url), "utf8");
const userAdmin = readFileSync(new URL("../src/routes/_authenticated/users-admin.tsx", import.meta.url), "utf8");

test("dashboard and account menu show profile names, including the platform owner's requested name", () => {
  assert.match(dashboard, /مرحبا \$\{displayName\}/);
  assert.match(dashboard, /shafiqalwatiry@gmail\.com/);
  assert.match(authLayout, /topbar-profile-name/);
  assert.match(authLayout, /شفيق الوتيري/);
  assert.doesNotMatch(userAdmin, /u\.email \?\? u\.username/);
});

test("mobile sidebar supports RTL edge swipes and closes after route navigation", () => {
  assert.match(sidebar, /Edge-swipe navigation for RTL mobile layouts/);
  assert.match(sidebar, /setOpenMobile\(true\)/);
  assert.match(sidebar, /setOpenMobile\(false\)/);
  assert.match(authLayout, /SidebarRouteSync/);
  assert.match(authLayout, /setOpenMobile\(false\)/);
});

test("action toasts are centered at the top in RTL layout", () => {
  assert.match(sonner, /dir="rtl"/);
  assert.match(styles, /data-x-position="center"/);
  assert.match(styles, /data-y-position="top"/);
});
