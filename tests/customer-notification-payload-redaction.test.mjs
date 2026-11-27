import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261127050000_redact_customer_notification_payloads.sql", import.meta.url), "utf8");
const snapshot = readFileSync(new URL("../supabase/COMPLETE_DATABASE.sql", import.meta.url), "utf8");

function functionBody(name) {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION private.${name}()`);
  assert.notEqual(start, -1);
  const end = migration.indexOf("$function$;", start);
  assert.notEqual(end, -1);
  return migration.slice(start, end + "$function$;".length);
}

test("customer invoice notification payloads omit customer identifiers and financial amounts", () => {
  const invoice = functionBody("notify_on_customer_credit_invoice");
  const collection = functionBody("notify_on_customer_invoice_collection");
  for (const body of [invoice, collection]) {
    assert.doesNotMatch(body, /'customer_id'\s*,|'total'\s*,|'payment_method'\s*,|'payment_amount'\s*,|'remaining_balance'\s*,|'customer_payment_id'\s*,/);
  }
  assert.doesNotMatch(collection, /تم استلام دفعة بقيمة/);
  assert.doesNotMatch(collection, /المتبقي/);
  assert.match(collection, /راجع شاشة الفاتورة المصرح بها للتفاصيل/);
});

test("redaction migration is included in the canonical database rebuild snapshot", () => {
  assert.ok(snapshot.includes("-- SOURCE MIGRATION: 20261127050000_redact_customer_notification_payloads.sql"));
  assert.ok(snapshot.includes("-- END MIGRATION: 20261127050000_redact_customer_notification_payloads.sql"));
});
