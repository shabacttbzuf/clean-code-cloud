import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261121030000_notification_deep_links.sql", import.meta.url), "utf8");
const snapshot = readFileSync(new URL("../supabase/COMPLETE_DATABASE.sql", import.meta.url), "utf8");
const links = readFileSync(new URL("../src/lib/notification-links.ts", import.meta.url), "utf8");
const topbar = readFileSync(new URL("../src/routes/_authenticated/route.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/routes/_authenticated/notifications.tsx", import.meta.url), "utf8");

test("notification action destinations are constrained to internal application paths", () => {
  assert.match(migration, /notifications_action_path_internal_check/);
  assert.match(migration, /action_path NOT LIKE '\/\/%'/);
  assert.match(links, /safeInternalNotificationPath/);
  assert.match(links, /target\.origin !== base/);
  assert.match(links, /decodedPath\.startsWith\("\/\/"\)/);
});

test("topbar deep links require the destination route permission and mark receipts read", () => {
  assert.match(topbar, /action_path,action_label/);
  assert.match(topbar, /safeInternalNotificationPath/);
  assert.match(topbar, /permissionForPath\(targetPath\)/);
  assert.match(topbar, /openNotification\(n\)/);
  assert.match(topbar, /unreadCount/);
  assert.match(topbar, /count: "exact"/);
  assert.match(topbar, /markAllNotificationsRead/);
});

test("notifications page supports per-user read state and permission-aware actions", () => {
  assert.match(page, /action_path/);
  assert.match(page, /action_label/);
  assert.match(page, /notificationPathPermission/);
  assert.match(page, /markRead\.mutateAsync/);
  assert.match(page, /قراءة الكل/);
});

test("kitchen-ready notifications are created with a kitchen deep link", () => {
  assert.match(migration, /'\/kitchen','فتح شاشة المطبخ'/);
  assert.match(migration, /UPDATE public\.notifications/);
});

test("complete database snapshot contains the notification deep-link migration", () => {
  assert.ok(snapshot.includes("-- SOURCE MIGRATION: 20261121030000_notification_deep_links.sql"));
  assert.ok(snapshot.includes("-- END MIGRATION: 20261121030000_notification_deep_links.sql"));
});
