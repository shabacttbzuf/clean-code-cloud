import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261125040000_overdue_kitchen_order_notifications.sql", import.meta.url), "utf8");
const snapshot = readFileSync(new URL("../supabase/COMPLETE_DATABASE.sql", import.meta.url), "utf8");

test("delayed kitchen alerts use the approved 30-minute SLA and actual kitchen workflow states", () => {
  assert.match(migration, /ko\.created_at <= now\(\) - interval '30 minutes'/);
  assert.match(migration, /ko\.status IN \('new', 'preparing'\)/);
  assert.match(migration, /'kitchen_order_delayed'/);
  assert.match(migration, /'delay_minutes', 30/);
  assert.match(migration, /'\/kitchen'/);
});

test("delayed kitchen alerts are deduplicated and branch/company scoped", () => {
  assert.match(migration, /NOT EXISTS \([\s\S]*n\.kind = 'kitchen_order_delayed'[\s\S]*kitchen_order_id/);
  assert.match(migration, /n\.tenant_id = ko\.tenant_id/);
  assert.match(migration, /b\.company_id/);
  assert.match(migration, /'branch',[\s\S]*v_order\.branch_id/);
  assert.match(migration, /private\.emit_overdue_kitchen_order_notifications/);
});

test("the scheduler is idempotent and the alert scanner never changes kitchen or financial records", () => {
  assert.match(migration, /cron\.schedule/);
  assert.match(migration, /cron\.unschedule/);
  assert.match(migration, /\* \* \* \* \*/);
  assert.match(migration, /REVOKE ALL ON FUNCTION private\.emit_overdue_kitchen_order_notifications\(\)/);
  assert.doesNotMatch(migration, /UPDATE public\.(kitchen_orders|sales|payments|cash_sessions)|DELETE FROM public\.(kitchen_orders|sales|payments|cash_sessions)/i);
});

test("complete database snapshot contains the delayed-order notification migration", () => {
  assert.ok(snapshot.includes("-- SOURCE MIGRATION: 20261125040000_overdue_kitchen_order_notifications.sql"));
  assert.ok(snapshot.includes("-- END MIGRATION: 20261125040000_overdue_kitchen_order_notifications.sql"));
});
