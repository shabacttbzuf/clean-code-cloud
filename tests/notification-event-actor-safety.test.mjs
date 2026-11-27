import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const paths = [
  "../supabase/migrations/20261127030000_low_stock_event_notifications.sql",
  "../supabase/migrations/20261127030100_hr_leave_event_notifications.sql",
  "../supabase/migrations/20261127030200_overdue_kitchen_order_notifications.sql",
  "../supabase/migrations/20261127030300_customer_invoice_event_notifications.sql",
  "../supabase/migrations/20261127030600_notification_kitchen_ready_actor_safety.sql",
];
const migrations = paths.map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

test("event-triggered notification writers use an authorized company owner or manager actor", () => {
  for (const sql of migrations) {
    assert.match(sql, /ur\.role IN \('owner', ?'manager'\)/);
    assert.match(sql, /set_config\('request\.jwt\.claim\.sub', v_actor_id::text, true\)/);
    assert.match(sql, /COALESCE\(v_previous_sub, ''\)/);
  }
});

test("best-effort event notifications never roll back inventory, HR or invoice writes", () => {
  for (const sql of [migrations[0], migrations[1], migrations[3], migrations[4]]) {
    assert.match(sql, /RAISE WARNING/);
  }
  assert.match(migrations[0], /Low-stock notification was skipped/);
  assert.match(migrations[1], /Leave-request notification was skipped/);
  assert.match(migrations[3], /Customer invoice notification was skipped/);
  assert.match(migrations[4], /Kitchen-ready notification was skipped/);
  assert.doesNotMatch(migrations[2], /UPDATE public\.(kitchen_orders|sales|payments|cash_sessions)|DELETE FROM public\.(kitchen_orders|sales|payments|cash_sessions)/i);
});

test("HR decision notifications are only sent to users belonging to the same company", () => {
  assert.match(migrations[1], /ur\.company_id = v_company_id/);
});

test("all notification event trigger functions retain pinned search paths and restricted execution", () => {
  for (const sql of migrations) {
    assert.match(sql, /SECURITY DEFINER/);
    assert.match(sql, /SET search_path = pg_catalog, public, private, pg_temp/);
    assert.match(sql, /REVOKE ALL ON FUNCTION private\./);
  }
});
