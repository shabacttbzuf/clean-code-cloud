import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261126010000_notification_scope_archive_and_missing_sources.sql", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/routes/_authenticated/notifications.tsx", import.meta.url), "utf8");
const topbar = readFileSync(new URL("../src/routes/_authenticated/route.tsx", import.meta.url), "utf8");
const sync = readFileSync(new URL("../src/hooks/use-notification-sync.ts", import.meta.url), "utf8");

test("database visibility checks tenant, company, audience, permission and source-specific access", () => {
  assert.match(migration, /private\.has_permission\(auth\.uid\(\), n\.tenant_id, 'notifications\.view'\)/);
  assert.match(migration, /WHEN 'branch' THEN private\.can_access_branch/);
  assert.match(migration, /WHEN 'department' THEN EXISTS/);
  assert.match(migration, /WHEN 'owner' THEN EXISTS/);
  assert.match(migration, /WHEN 'manager' THEN EXISTS/);
  assert.match(migration, /WHEN 'customer_credit_invoice_issued' THEN private\.has_permission/);
});

test("receipt RLS requires both own-user identity and parent notification visibility", () => {
  assert.equal((migration.match(/private\.can_read_notification\(notification_id\)/g) ?? []).length, 4);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS archived_at timestamptz/);
});

test("all implemented event sources are database triggers with idempotency keys", () => {
  for (const trigger of [
    "trg_notify_sale_operational_events", "trg_notify_campaign_activation",
    "trg_notify_promotion_activation", "trg_notify_admin_account_status_events",
  ]) assert.ok(migration.includes(trigger), trigger);
  for (const index of [
    "notifications_sale_event_dedupe_idx", "notifications_campaign_event_dedupe_idx",
    "notifications_offer_event_dedupe_idx", "notifications_profile_event_dedupe_idx",
  ]) assert.ok(migration.includes(index), index);
});

test("archive UI separates inbox and archive and allows restore", () => {
  assert.match(page, /showArchived/);
  assert.match(page, /archived_at/);
  assert.match(page, /أرشفة/);
  assert.match(page, /استعادة/);
});

test("load failures expose retry and realtime errors trigger a refetch", () => {
  assert.match(page, /q\.isError/);
  assert.match(page, /q\.refetch\(\)/);
  assert.match(topbar, /notificationsQuery\.isError/);
  assert.match(topbar, /notificationsQuery\.refetch\(\)/);
  assert.match(sync, /CHANNEL_ERROR/);
  assert.match(sync, /TIMED_OUT/);
});
