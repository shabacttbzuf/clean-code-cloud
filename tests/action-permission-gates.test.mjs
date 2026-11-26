import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const reports = readFileSync(new URL("../src/routes/_authenticated/reports.tsx", import.meta.url), "utf8");
const sale = readFileSync(new URL("../src/routes/_authenticated/sales.$id.tsx", import.meta.url), "utf8");

test("report export and printing use separate permissions", () => {
  assert.ok(reports.includes('permissionsQuery.data?.has("reports.export")'));
  assert.ok(reports.includes('permissionsQuery.data?.has("reports.print")'));
  assert.ok(reports.includes("action={canPrintReports ?"));
  assert.ok(reports.includes("{canExportReports && <Button"));
});

test("report date, branch and grouping filters require reports.filter", () => {
  assert.ok(reports.includes('permissionsQuery.data?.has("reports.filter")'));
  assert.ok(reports.includes("disabled={!canFilterReports}"));
});

test("invoice PDF export, printing and refund controls use their dedicated permissions", () => {
  assert.ok(sale.includes('permissionsQuery.data?.has("sales.export")'));
  assert.ok(sale.includes('permissionsQuery.data?.has("sales.print")'));
  assert.ok(sale.includes('permissionsQuery.data?.has("sales.refund")'));
});
