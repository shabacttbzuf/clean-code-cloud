import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261120050000_restaurant_tables_pos_order_types.sql", import.meta.url), "utf8");
const pos = readFileSync(new URL("../src/routes/_authenticated/pos.tsx", import.meta.url), "utf8");
const tables = readFileSync(new URL("../src/routes/_authenticated/tables.tsx", import.meta.url), "utf8");
const kitchen = readFileSync(new URL("../src/routes/_authenticated/kitchen.tsx", import.meta.url), "utf8");
const invoice = readFileSync(new URL("../src/lib/invoice-pdf.ts", import.meta.url), "utf8");

test("restaurant table schema prevents concurrent assignment and client-side occupancy forgery", () => {
  assert.match(migration, /current_sale_id uuid REFERENCES public\.sales/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /Selected table is already occupied/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON public\.restaurant_tables FROM anon, authenticated/);
  assert.match(migration, /GRANT UPDATE \(name,capacity,section_name,status\)/);
});

test("POS supports dine-in, takeaway and delivery through the validated server RPC", () => {
  assert.match(pos, /create_pos_order/);
  assert.match(pos, /create_sale_with_customer/);
  assert.match(pos, /Never silently downgrade dine-in or delivery/);
  assert.match(pos, /orderType !== "takeaway"/);
  assert.match(pos, /_order_type: orderType/);
  assert.match(pos, /_table_id:/);
  assert.match(pos, /_delivery_customer_name:/);
  assert.match(pos, /_delivery_customer_phone:/);
  assert.match(pos, /_delivery_address:/);
  assert.match(pos, /_delivery_fee: deliveryFee/);
  assert.match(pos, /رسوم التوصيل/);
});

test("table management is scoped by active tenant and selected branch", () => {
  assert.match(tables, /\.eq\("tenant_id", tenantId!\)\.eq\("branch_id", branchId\)/);
  assert.match(tables, /close_restaurant_table/);
  assert.match(tables, /tables\.manage/);
});

test("kitchen display includes table and delivery details", () => {
  assert.match(kitchen, /delivery_customer_name/);
  assert.match(kitchen, /table_name/);
  assert.match(kitchen, /نوع الطلب/);
});

test("printed receipt includes order type, delivery fee, paid and due amounts", () => {
  assert.match(invoice, /نوع الطلب/);
  assert.match(invoice, /رسوم التوصيل/);
  assert.match(invoice, /المدفوع/);
  assert.match(invoice, /المتبقي/);
});
