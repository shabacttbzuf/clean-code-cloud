import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schedule = readFileSync(new URL("../supabase/migrations/20261127030005_overdue_kitchen_cron_schedule.sql", import.meta.url), "utf8");
const hardening = readFileSync(new URL("../supabase/migrations/20261127030001_notification_scope_archive_and_missing_sources.sql", import.meta.url), "utf8");
const snapshot = readFileSync(new URL("../supabase/COMPLETE_DATABASE.sql", import.meta.url), "utf8");

test("delayed kitchen alerts use the approved 30-minute SLA and actual kitchen workflow states", () => {
  assert.match(hardening, /ko\.created_at <= now\(\) - interval '30 minutes'/);
  assert.match(hardening, /kitchen_order_events e/);
  assert.match(hardening, /e\.new_status IN \('ready', 'cancelled'\)/);
  assert.match(hardening, /e\.created_at <= ko\.created_at \+ interval '30 minutes'/);
  assert.match(hardening, /'kitchen_order_delayed'/);
  assert.match(hardening, /'delay_minutes', 30/);
  assert.match(hardening, /'\/kitchen'/);
});

test("delayed kitchen alerts are deduplicated and branch/company scoped", () => {
  assert.match(hardening, /NOT EXISTS \([\s\S]*n\.kind = 'kitchen_order_delayed'[\s\S]*kitchen_order_id/);
  assert.match(hardening, /n\.tenant_id = ko\.tenant_id/);
  assert.match(hardening, /b\.company_id/);
  assert.match(hardening, /'branch',[\s\S]*v_order\.branch_id/);
  assert.match(hardening, /private\.emit_overdue_kitchen_order_notifications/);
});

test("the scheduler is idempotent and only schedules the existing hardened scanner", () => {
  assert.match(schedule, /CREATE EXTENSION IF NOT EXISTS pg_cron/);
  assert.match(schedule, /cron\.schedule/);
  assert.match(schedule, /cron\.unschedule/);
  assert.match(schedule, /\* \* \* \* \*/);
  assert.match(schedule, /SELECT private\.emit_overdue_kitchen_order_notifications\(\)/);
  assert.doesNotMatch(schedule, /CREATE OR REPLACE FUNCTION private\.emit_overdue/);
});

test("concurrent delayed-order scans are serialized and failures remain retryable", () => {
  assert.match(hardening, /pg_advisory_xact_lock/);
  assert.match(hardening, /FOR UPDATE OF ko SKIP LOCKED/);
  assert.match(hardening, /IF EXISTS \([\s\S]*kitchen_order_delayed/);
  assert.match(hardening, /RAISE WARNING 'Delayed kitchen notification skipped/);
});

test("complete database snapshot contains the hardened scanner and its cron scheduler", () => {
  assert.ok(snapshot.includes("-- SOURCE MIGRATION: 20261127030001_notification_scope_archive_and_missing_sources.sql"));
  assert.ok(snapshot.includes("-- END MIGRATION: 20261127030001_notification_scope_archive_and_missing_sources.sql"));
  assert.ok(snapshot.includes("-- SOURCE MIGRATION: 20261127030005_overdue_kitchen_cron_schedule.sql"));
  assert.ok(snapshot.includes("-- END MIGRATION: 20261127030005_overdue_kitchen_cron_schedule.sql"));
});
