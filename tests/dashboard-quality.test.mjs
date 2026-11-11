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
