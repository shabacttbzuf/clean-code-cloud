import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync(new URL("../src/hooks/use-notification-sync.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261127030500_notification_realtime_publication.sql", import.meta.url), "utf8");
const topbar = readFileSync(new URL("../src/routes/_authenticated/route.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/routes/_authenticated/notifications.tsx", import.meta.url), "utf8");
const lowStockMigration = readFileSync(new URL("../supabase/migrations/20261127040000_low_stock_event_notifications.sql", import.meta.url), "utf8");
const hrMigration = readFileSync(new URL("../supabase/migrations/20261127040100_hr_leave_event_notifications.sql", import.meta.url), "utf8");

test("notification realtime refreshes existing RLS-backed queries and never renders event payloads", () => {
  assert.match(hook, /postgres_changes/);
  assert.match(hook, /table: "notifications"/);
  assert.match(hook, /table: "notification_reads"/);
  assert.match(hook, /invalidateQueries/);
  assert.match(hook, /removeChannel/);
  assert.match(hook, /addEventListener\("online"/);
  assert.match(hook, /visibilitychange/);
  assert.match(topbar, /useNotificationSync\(tenantId, user\?\.id\)/);
  assert.doesNotMatch(page, /useNotificationSync/); // TopBar owns one shared subscription.
});

test("realtime publication adds only the existing notification tables idempotently", () => {
  assert.match(migration, /pg_publication WHERE pubname = 'supabase_realtime'/);
  assert.match(migration, /pg_publication_tables/);
  assert.match(migration, /ADD TABLE public\.notifications/);
  assert.match(migration, /ADD TABLE public\.notification_reads/);
  assert.doesNotMatch(migration, /DROP PUBLICATION|CREATE PUBLICATION|DISABLE ROW LEVEL SECURITY/i);
});

test("low-stock alerts are emitted only when real inventory crosses its configured threshold", () => {
  assert.match(lowStockMigration, /AFTER INSERT OR UPDATE OF quantity ON public\.inventory/);
  assert.match(lowStockMigration, /NEW\.quantity <= v_product\.min_stock/);
  assert.match(lowStockMigration, /OLD\.quantity > v_product\.min_stock/);
  assert.match(lowStockMigration, /v_product\.min_stock <= 0/);
  assert.match(lowStockMigration, /'low_stock'/);
  assert.match(lowStockMigration, /'branch'/);
  assert.match(lowStockMigration, /NEW\.branch_id/);
  assert.match(lowStockMigration, /'urgent'/);
  assert.match(lowStockMigration, /'/);
  assert.doesNotMatch(lowStockMigration, /UPDATE public\.(sales|payments|cash_sessions)|DELETE FROM public\.(sales|payments|cash_sessions)/i);
});

test("HR notifications follow actual leave-request creation and decision transitions", () => {
  assert.match(hrMigration, /AFTER INSERT OR UPDATE OF status ON public\.leave_requests/);
  assert.match(hrMigration, /NEW\.status = 'pending'/);
  assert.match(hrMigration, /OLD\.status = 'pending'/);
  assert.match(hrMigration, /NEW\.status IN \('approved', 'rejected'\)/);
  assert.match(hrMigration, /v_employee_user_id/);
  assert.match(hrMigration, /'hr_leave_requested'/);
  assert.match(hrMigration, /'hr_leave_approved'/);
  assert.match(hrMigration, /'hr_leave_rejected'/);
  assert.match(hrMigration, /ur\.user_id = v_employee_user_id/);
  assert.doesNotMatch(hrMigration, /UPDATE public\.leave_requests|DELETE FROM public\.leave_requests/i);
});
