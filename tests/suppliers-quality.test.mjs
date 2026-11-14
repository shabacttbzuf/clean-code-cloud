import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const suppliers = readFileSync(new URL("../src/routes/_authenticated/suppliers.tsx", import.meta.url), "utf8");

test("supplier list paginates beyond the REST row cap with stable ordering", () => {
  assert.match(suppliers, /const pageSize = 500/);
  assert.match(suppliers, /\.range\(from, from \+ pageSize - 1\)/);
  assert.match(suppliers, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(suppliers, /\.order\("id", \{ ascending: false \}\)/);
});

test("supplier loading failures are distinct from an empty supplier list", () => {
  assert.match(suppliers, /q\.isError/);
  assert.match(suppliers, /q\.refetch\(\)/);
  assert.match(suppliers, /تعذر تحميل قائمة الموردين/);
});

test("supplier records are archived instead of deleted to preserve purchase history", () => {
  assert.match(suppliers, /update\(\{ is_active: isActive \}\)/);
  assert.match(suppliers, /الاحتفاظ بسجلاته/);
  assert.doesNotMatch(suppliers, /\.from\("suppliers"\)\.delete\(\)/);
  assert.match(suppliers, /مورد موقوف/);
});
