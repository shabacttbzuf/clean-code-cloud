import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261112002129_supplier_payment_ledger.sql", import.meta.url), "utf8");
const suppliers = readFileSync(new URL("../src/routes/_authenticated/suppliers.tsx", import.meta.url), "utf8");
const types = readFileSync(new URL("../src/integrations/supabase/types.ts", import.meta.url), "utf8");

test("supplier payments enforce tenant-consistent supplier and branch references", () => {
  assert.match(migration, /foreign key \(branch_id, tenant_id\) references public\.branches\(id, tenant_id\)/i);
  assert.match(migration, /foreign key \(supplier_id, tenant_id\) references public\.suppliers\(id, tenant_id\)/i);
  assert.match(migration, /amount numeric\(14,2\) not null check \(amount > 0\)/i);
});

test("supplier payment ledger is RLS protected and append-only", () => {
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /create policy supplier_payments_select/i);
  assert.match(migration, /create policy supplier_payments_insert/i);
  assert.match(migration, /private\.can_access_branch/i);
  assert.doesNotMatch(migration, /create policy[\s\S]*?for update/i);
  assert.doesNotMatch(migration, /create policy[\s\S]*?for delete/i);
});

test("supplier balance includes received purchases, returns, and recorded payments", () => {
  assert.match(suppliers, /in\("status", \["received", "returned"\]\)/);
  assert.match(suppliers, /purchase_returns/);
  assert.match(suppliers, /supplier_payments/);
  assert.match(suppliers, /purchases - totals\.returns - totals\.paid/);
});

test("supplier payment form warns that it does not alter cash-session balances", () => {
  assert.match(suppliers, /لا يغيّر رصيد درج النقد أو وردية الصندوق تلقائياً/);
  assert.match(migration, /Does not mutate cash sessions/i);
});

test("generated Supabase types include supplier_payments", () => {
  assert.match(types, /supplier_payments: \{/);
  assert.match(types, /supplier_payments_branch_tenant_fkey/);
  assert.match(types, /supplier_payments_supplier_tenant_fkey/);
});

const performanceMigration = readFileSync(new URL("../supabase/migrations/20261112002432_supplier_ledger_fk_indexes_and_marketing_rls.sql", import.meta.url), "utf8");

test("supplier payment foreign keys are indexed and marketing RLS uses initplan-safe auth calls", () => {
  assert.match(performanceMigration, /supplier_payments_branch_tenant_fk_idx/);
  assert.match(performanceMigration, /supplier_payments_supplier_tenant_fk_idx/);
  assert.match(performanceMigration, /supplier_payments_created_by_fk_idx/);
  assert.match(performanceMigration, /marketing_campaigns_created_by_fk_idx/);
  assert.match(performanceMigration, /\(select auth\.uid\(\)\)/);
});

const purchasesPage = readFileSync(new URL("../src/routes/_authenticated/purchases.tsx", import.meta.url), "utf8");
test("purchase page directs users to the supplier ledger for settlements", () => {
  assert.match(purchasesPage, /سجّل دفعات المورد من تبويب الموردين/);
  assert.match(purchasesPage, /لا تعدّل درج النقد أو وردية الصندوق تلقائياً/);
});

const privilegesMigration = readFileSync(new URL("../supabase/migrations/20261112002832_restrict_supplier_payment_mutations.sql", import.meta.url), "utf8");
test("supplier payment ledger grants only select and insert to authenticated clients", () => {
  assert.match(privilegesMigration, /revoke all on table public\.supplier_payments from anon, authenticated/i);
  assert.match(privilegesMigration, /grant select, insert on table public\.supplier_payments to authenticated/i);
});
