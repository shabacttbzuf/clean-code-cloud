import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261118000006_platform_branding_and_notification_reads.sql", import.meta.url), "utf8");
const layout = readFileSync(new URL("../src/routes/_authenticated/route.tsx", import.meta.url), "utf8");
const notifications = readFileSync(new URL("../src/routes/_authenticated/notifications.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../src/routes/_authenticated/settings.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../src/components/app-sidebar.tsx", import.meta.url), "utf8");

test("platform branding is owner-managed and remains separate from tenant branding", () => {
  assert.match(migration, /create table if not exists public\.platform_branding/);
  assert.match(migration, /public\.is_super_owner\(\(select auth\.uid\(\)\)\)/);
  assert.match(settings, /هوية النظام والتسويق/);
  assert.match(settings, /enabled: platformBrand\.enabled/);
});

test("notification read receipts are isolated per authenticated user", () => {
  assert.match(migration, /create table if not exists public\.notification_reads/);
  assert.match(migration, /user_id = \(select auth\.uid\(\)\)/);
  assert.match(layout, /topbar-notifications/);
  assert.match(layout, /bg-red-500/);
  assert.match(layout, /markAllNotificationsRead/);
  assert.match(notifications, /notification_reads/);
  assert.match(notifications, /تمت القراءة/);
});

test("global shell uses business-neutral identity", () => {
  assert.match(layout, /نظام إدارة الأعمال/);
  assert.match(sidebar, /منصة الشركات والفروع/);
  assert.doesNotMatch(sidebar, /محاسبة المطاعم/);
});
