import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/routes/_authenticated/pos.tsx", import.meta.url), "utf8");

test("cashier categories use a horizontal scroll rail", () => {
  assert.match(source, /flex items-center gap-2 overflow-x-auto pb-1/);
  assert.match(source, /min-w-\[92px\] shrink-0/);
  assert.doesNotMatch(source, /grid grid-cols-5 gap-1 sm:grid-cols-6 xl:grid-cols-9/);
});

test("product tiles are readable horizontal cards in a responsive grid", () => {
  assert.match(source, /grid-cols-2 gap-2 overflow-y-auto/);
  assert.match(source, /flex min-h-\[76px\] flex-row items-center gap-2/);
  assert.match(source, /line-clamp-2 w-full text-\[11px\] font-bold/);
});
