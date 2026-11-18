import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const migration = readFileSync(new URL("../supabase/migrations/20261118000006_platform_branding_and_notification_reads.sql", import.meta.url), "utf8");
const layout = readFileSync(new URL("../src/routes/_authenticated/route.tsx", import.meta.url), "utf8");
const notifications = readFileSync(new URL("../src/routes/_authenticated/notifications.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../src/routes/_authenticated/settings.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../src/components/app-sidebar.tsx", import.meta.url), "utf8");

test("platform branding is owner-managed and separate from tenant branding", () => {
  assert.ok(migration.includes("create table if not exists public.platform_branding"));
  assert.ok(migration.includes("public.is_super_owner"));
  assert.ok(settings.includes("هوية النظام والتسويق"));
  assert.ok(settings.includes("...platformBrand"));
});

test("notification receipts are isolated per authenticated user", () => {
  assert.ok(migration.includes("create table if not exists public.notification_reads"));
  assert.ok(migration.includes("user_id = (select auth.uid())"));
  assert.ok(layout.includes("topbar-notifications"));
  assert.ok(layout.includes("bg-red-500"));
  assert.ok(layout.includes("markAllNotificationsRead"));
  assert.ok(notifications.includes("notification_reads"));
  assert.ok(notifications.includes("تمت القراءة"));
});

test("global shell uses business-neutral identity", () => {
  assert.ok(layout.includes("نظام إدارة الأعمال"));
  assert.ok(sidebar.includes("منصة الشركات والفروع"));
  assert.ok(!sidebar.includes("محاسبة المطاعم"));
});
