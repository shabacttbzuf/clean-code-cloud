import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const reports = readFileSync(new URL("../src/routes/_authenticated/reports.tsx", import.meta.url), "utf8");
const sale = readFileSync(new URL("../src/routes/_authenticated/sales.$id.tsx", import.meta.url), "utf8");

test("report exports and printing require reports.export", () => {
  assert.match(reports, /permissionsQuery\.data\?\.has\("reports\.export"\)/);
  assert.match(reports, /canExportReports && <Button/);
});

test("report date, branch and grouping filters require reports.filter", () => {
  assert.match(reports, /permissionsQuery\.data\?\.has\("reports\.filter"\)/);
  assert.match(reports, /disabled=\{!canFilterReports\}/);
});

test("invoice PDF export, printing and refund controls use their dedicated permissions", () => {
  assert.match(sale, /permissionsQuery\.data\?\.has\("sales\.export"\)/);
  assert.match(sale, /permissionsQuery\.data\?\.has\("sales\.print"\)/);
  assert.match(sale, /permissionsQuery\.data\?\.has\("sales\.refund"\)/);
});
