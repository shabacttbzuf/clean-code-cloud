import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261127040300_customer_invoice_event_notifications.sql", import.meta.url), "utf8");
const snapshot = readFileSync(new URL("../supabase/COMPLETE_DATABASE.sql", import.meta.url), "utf8");

test("customer credit and mixed invoices create management alerts from real sales rows", () => {
  assert.match(migration, /AFTER INSERT ON public\.sales/);
  assert.match(migration, /NEW\.payment_method NOT IN \('credit', 'mixed'\)/);
  assert.match(migration, /NEW\.customer_id IS NULL/);
  assert.match(migration, /customer_credit_invoice_issued/);
  assert.match(migration, /'/);
  assert.match(migration, /'\/sales\/' \|\| NEW\.id::text/);
});

test("customer collections notify management with the calculated remaining invoice balance", () => {
  assert.match(migration, /AFTER INSERT ON public\.customer_payments/);
  assert.match(migration, /sum\(p\.amount\)/);
  assert.match(migration, /sum\(cp\.amount\)/);
  assert.match(migration, /sum\(r\.total\)/);
  assert.match(migration, /customer_invoice_payment_received/);
  assert.match(migration, /customer_invoice_balance_cleared/);
  assert.match(migration, /remaining_balance/);
});

test("invoice notifications remain company-scoped and use protected definer triggers", () => {
  assert.equal((migration.match(/SECURITY DEFINER/g) ?? []).length, 2);
  assert.equal((migration.match(/SET search_path = pg_catalog, public, private, pg_temp/g) ?? []).length, 2);
  assert.equal((migration.match(/REVOKE ALL ON FUNCTION private\.notify_on_customer_/g) ?? []).length, 2);
  assert.match(migration, /ur\.company_id = v_company_id/);
  assert.match(migration, /audience_type, kind, urgency/);
  assert.doesNotMatch(migration, /UPDATE public\.(sales|payments|customer_payments)|DELETE FROM public\.(sales|payments|customer_payments)/i);
});

test("complete database snapshot contains the invoice event notification migration", () => {
  assert.ok(snapshot.includes("-- SOURCE MIGRATION: 20261127040300_customer_invoice_event_notifications.sql"));
  assert.ok(snapshot.includes("-- END MIGRATION: 20261127040300_customer_invoice_event_notifications.sql"));
});
