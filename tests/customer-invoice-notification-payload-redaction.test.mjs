import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261127050000_redact_customer_notification_payloads.sql", import.meta.url), "utf8");
const snapshot = readFileSync(new URL("../supabase/COMPLETE_DATABASE.sql", import.meta.url), "utf8");

function body(name) {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION private.${name}()`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const end = migration.indexOf("$function$;", start);
  assert.notEqual(end, -1, `missing function terminator for ${name}`);
  return migration.slice(start, end);
}

test("credit invoice notifications omit customer identifiers and financial details", () => {
  const sql = body("notify_on_customer_credit_invoice");
  assert.doesNotMatch(sql, /'customer_id'\s*,|'total'\s*,|'payment_method'\s*,/);
  assert.match(sql, /'invoice_no', NEW\.invoice_no/);
  assert.match(sql, /'branch_id', NEW\.branch_id/);
});

test("collection notifications omit payment identifiers, amounts, and remaining balance", () => {
  const sql = body("notify_on_customer_invoice_collection");
  assert.doesNotMatch(sql, /'customer_payment_id'\s*,|'payment_amount'\s*,|'remaining_balance'\s*,/);
  assert.doesNotMatch(sql, /تم استلام دفعة بقيمة|المتبقي/);
  assert.match(sql, /راجع شاشة الفاتورة المصرح بها للتفاصيل/);
});

test("notification functions retain hardened definer settings and direct-execution revokes", () => {
  assert.equal((migration.match(/SECURITY DEFINER/g) ?? []).length, 2);
  assert.equal((migration.match(/SET search_path = pg_catalog, public, private, pg_temp/g) ?? []).length, 2);
  assert.equal((migration.match(/REVOKE ALL ON FUNCTION private\.notify_on_customer_/g) ?? []).length, 2);
});

test("canonical database snapshot includes the redaction migration", () => {
  assert.ok(snapshot.includes("-- SOURCE MIGRATION: 20261127050000_redact_customer_notification_payloads.sql"));
  assert.ok(snapshot.includes("-- END MIGRATION: 20261127050000_redact_customer_notification_payloads.sql"));
});
