import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const paths = [
  "../supabase/migrations/20261121030000_notification_deep_links.sql",
  "../supabase/migrations/20261127030002_low_stock_event_notifications.sql",
  "../supabase/migrations/20261127030003_hr_leave_event_notifications.sql",
  "../supabase/migrations/20261127030004_customer_invoice_event_notifications.sql",
];
const migrations = paths.map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

test("all event-triggered notification writers use an authorized company owner or manager actor", () => {
  for (const sql of migrations) {
    assert.match(sql, /ur\.role IN \('owner', ?'manager'\)/);
    assert.match(sql, /set_config\('request\.jwt\.claim\.sub', v_actor_id::text, true\)/);
    assert.match(sql, /COALESCE\(v_previous_sub, ''\)/);
  }
});

test("notification delivery failures never roll back core kitchen, inventory, HR, or invoice events", () => {
  for (const sql of migrations) {
    assert.match(sql, /RAISE WARNING/);
  }
  assert.match(migrations[0], /Kitchen-ready notification was skipped/);
  assert.match(migrations[1], /Low-stock notification was skipped/);
  assert.match(migrations[2], /Leave-request notification was skipped/);
  assert.match(migrations[3], /Customer invoice notification was skipped/);
});

test("HR decision notifications are only sent to users belonging to the same company", () => {
  assert.match(migrations[2], /ur\.company_id = v_company_id/);
});

test("all notification event trigger functions retain pinned search paths and restricted execution", () => {
  for (const sql of migrations) {
    assert.match(sql, /SECURITY DEFINER/);
    assert.match(sql, /SET search_path = pg_catalog, public, private, pg_temp/);
    assert.match(sql, /REVOKE ALL ON FUNCTION private\./);
  }
});
