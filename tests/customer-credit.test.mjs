import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schema = readFileSync(new URL("../supabase/migrations/20261115000001_customer_credit_accounts_and_collections.sql", import.meta.url), "utf8");
const checkout = readFileSync(new URL("../supabase/migrations/20261115000002_customer_credit_sale_rpc.sql", import.meta.url), "utf8");
const cash = readFileSync(new URL("../supabase/migrations/20261115000003_customer_cash_collection_reconciliation.sql", import.meta.url), "utf8");
const balanceFix = readFileSync(new URL("../supabase/migrations/20261115000004_fix_customer_balance_aggregation.sql", import.meta.url), "utf8");
const customers = readFileSync(new URL("../src/routes/_authenticated/customers.tsx", import.meta.url), "utf8");
const pos = readFileSync(new URL("../src/routes/_authenticated/pos.tsx", import.meta.url), "utf8");
const posOrder = readFileSync(new URL("../supabase/migrations/20261120050000_restaurant_tables_pos_order_types.sql", import.meta.url), "utf8");

test("customer credit ceiling and invoice links are tenant-safe", () => {
  assert.match(schema, /credit_limit numeric\(14,2\) not null default 0/i);
  assert.match(schema, /sales_customer_tenant_fkey[\s\S]*foreign key \(customer_id, tenant_id\)/i);
  assert.match(schema, /customer_payments_sale_customer_fkey[\s\S]*foreign key \(sale_id, customer_id, tenant_id\)/i);
});

test("customer collections are append-only, idempotent, and branch scoped", () => {
  assert.match(schema, /create table public\.customer_payments/i);
  assert.match(schema, /unique \(tenant_id, idempotency_key\)/i);
  assert.match(schema, /enable row level security/i);
  assert.match(schema, /grant select on table public\.customer_payments to authenticated/i);
  assert.match(schema, /record_customer_payment/i);
  assert.match(schema, /Payment exceeds outstanding invoice balance/i);
  assert.match(schema, /private\.can_access_branch/i);
});

test("credit checkout enforces the customer ceiling atomically and snapshots prices from database", () => {
  assert.match(checkout, /create or replace function public\.create_sale_with_customer/i);
  assert.match(checkout, /for update/i);
  assert.match(checkout, /v_existing_debt\+v_new_debt>v_customer\.credit_limit/i);
  assert.match(checkout, /select \* into v_product from public\.products/i);
  assert.match(checkout, /create_sale_with_customer/i);
});

test("cash collections are included in cashier session close reconciliation", () => {
  assert.match(cash, /sum\(cp\.amount\)/i);
  assert.match(cash, /cp\.cash_session_id = v_session\.id/i);
});

test("customer form exposes credit limit and account view supports collections", () => {
  assert.match(customers, /credit_limit/);
  assert.match(customers, /الحساب والفواتير/);
  assert.match(customers, /record_customer_payment/);
});

test("POS checkout selects a customer and calls the credit-aware RPC", () => {
  assert.match(pos, /pos-customers/);
  assert.match(pos, /create_pos_order/);
  assert.match(posOrder, /private\.create_sale_with_customer/);
  assert.match(pos, /_customer_id:/);
  assert.match(pos, /_paid_amount:/);
});

test("customer balance aggregation clamps each invoice before summing", () => {
  assert.match(balanceFix, /sum\(greatest\(s\.total/i);
});
