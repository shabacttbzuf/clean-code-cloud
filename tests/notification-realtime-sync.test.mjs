import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync(new URL("../src/hooks/use-notification-sync.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261125010000_notification_realtime_publication.sql", import.meta.url), "utf8");
const topbar = readFileSync(new URL("../src/routes/_authenticated/route.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/routes/_authenticated/notifications.tsx", import.meta.url), "utf8");

test("notification realtime refreshes existing RLS-backed queries and never renders event payloads", () => {
  assert.match(hook, /postgres_changes/);
  assert.match(hook, /table: "notifications"/);
  assert.match(hook, /table: "notification_reads"/);
  assert.match(hook, /invalidateQueries/);
  assert.match(hook, /removeChannel/);
  assert.match(hook, /addEventListener\("online"/);
  assert.match(hook, /visibilitychange/);
  assert.match(topbar, /useNotificationSync\(tenantId, user\?\.id\)/);
  assert.match(page, /useNotificationSync\(tenantId, user\?\.id\)/);
});

test("realtime publication adds only the existing notification tables idempotently", () => {
  assert.match(migration, /pg_publication WHERE pubname = 'supabase_realtime'/);
  assert.match(migration, /pg_publication_tables/);
  assert.match(migration, /ADD TABLE public\.notifications/);
  assert.match(migration, /ADD TABLE public\.notification_reads/);
  assert.doesNotMatch(migration, /DROP PUBLICATION|CREATE PUBLICATION|DISABLE ROW LEVEL SECURITY/i);
});
