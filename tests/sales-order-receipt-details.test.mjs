import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261120060000_sale_table_name_receipt_snapshot.sql", import.meta.url), "utf8");
const detail = readFileSync(new URL("../src/routes/_authenticated/sales.$id.tsx", import.meta.url), "utf8");
const list = readFileSync(new URL("../src/routes/_authenticated/sales.index.tsx", import.meta.url), "utf8");
const invoice = readFileSync(new URL("../src/lib/invoice-pdf.ts", import.meta.url), "utf8");

test("sale table name is captured as a historical snapshot", () => {
  assert.match(migration, /table_name_snapshot/);
  assert.match(migration, /BEFORE INSERT OR UPDATE OF table_id/);
  assert.match(migration, /NEW\.tenant_id/);
  assert.match(migration, /NEW\.branch_id/);
});

test("sale detail receipts include order, delivery, table and paid/due information", () => {
  for (const key of ["order_type", "table_name_snapshot", "delivery_customer_name", "delivery_customer_phone", "delivery_address", "delivery_fee"]) {
    assert.ok(detail.includes(key), "missing " + key);
  }
  assert.match(detail, /paidAmount/);
  assert.match(detail, /due_amount/);
  assert.match(invoice, /المدفوع/);
  assert.match(invoice, /المتبقي/);
  assert.match(invoice, /data\.paid_amount !== undefined/);
  assert.match(invoice, /data\.due_amount !== undefined/);
  assert.match(invoice, /نوع الطلب/);
});

test("sales history displays the order type and table snapshot", () => {
  assert.match(list, /order_type/);
  assert.match(list, /table_name_snapshot/);
});

test("sales history and invoice detail stay compatible before additive metadata policies are deployed", () => {
  assert.match(list, /missingOrderColumns/);
  assert.match(list, /order_type: "takeaway"/);
  assert.match(detail, /customerPaymentsRes\.error\.code !== "42501"/);
  assert.match(detail, /s\.order_type \?\? "takeaway"/);
});
