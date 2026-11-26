import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const settings = await readFile(new URL("../src/routes/_authenticated/settings.tsx", import.meta.url), "utf8");

test("settings keeps company tax and invoice configuration separate from print preferences", () => {
  assert.match(settings, /tax_rate: z\.coerce\.number\(\)\.min\(0\)\.max\(100\)/);
  assert.match(settings, /لا تغير هذه الخيارات الضرائب أو تسلسل أرقام الفواتير أو آلية إصدارها/);
  assert.match(settings, /supabase\.from\("tenants"\)[\s\S]*?\.update\(v\)/);
});

test("branch and user administration remain configurable as dedicated navigation modules", () => {
  for (const path of ["/branches", "/profile", "/users-admin", "/team-permissions"]) {
    assert.match(settings, new RegExp(`url: "\\${path}"`));
  }
  assert.match(settings, /MANAGEABLE_NAV_ITEMS\.map/);
});

test("personal preferences are namespaced per authenticated user and persisted locally", () => {
  assert.match(settings, /ras-settings-preferences-v1:\$\{userId \?\? "guest"\}/);
  assert.match(settings, /getUserSettingsPreferences\(userId\)/);
  assert.match(settings, /localStorage\.setItem\(preferencesKey, JSON\.stringify\(preferences\)\)/);
  assert.match(settings, /notifyLowStock/);
  assert.match(settings, /notifyDelayedOrders/);
  assert.match(settings, /paperSize/);
  assert.match(settings, /dateFormat/);
  assert.match(settings, /timeFormat/);
  assert.match(settings, /timeZone/);
});

test("advertising and promotions are explicitly kept separate from settings", () => {
  assert.match(settings, /إدارة الحملات الإعلانية والعروض الترويجية تتم في أقسامها المنفصلة/);
  assert.match(settings, /\/ads/);
  assert.match(settings, /\/promotions/);
});

test("POS applies saved print defaults, automatic print, and copy count without changing checkout totals", async () => {
  const pos = await readFile(new URL("../src/routes/_authenticated/pos.tsx", import.meta.url), "utf8");
  const preferences = await readFile(new URL("../src/lib/settings-preferences.ts", import.meta.url), "utf8");
  const invoice = await readFile(new URL("../src/lib/invoice-pdf.ts", import.meta.url), "utf8");
  assert.match(pos, /restoredWorkspace\.paperSize \?\? userSettings\.paperSize/);
  assert.match(pos, /if \(userSettings\.autoPrint\)/);
  assert.match(pos, /Number\(userSettings\.copies\)/);
  assert.match(pos, /formatUserDateTime\(inv\.created_at, userSettings\)/);
  assert.match(preferences, /autoPrint: true/);
  assert.match(invoice, /safeCopies = Math\.max\(1, Math\.min\(3/);
});

test("notification preferences filter the user's list while critical alerts remain visible", async () => {
  const notifications = await readFile(new URL("../src/routes/_authenticated/notifications.tsx", import.meta.url), "utf8");
  const preferences = await readFile(new URL("../src/lib/settings-preferences.ts", import.meta.url), "utf8");
  assert.match(notifications, /isNotificationEnabled\(n, preferences\)/);
  assert.match(notifications, /formatUserDateTime\(n\.created_at, preferences\)/);
  assert.match(preferences, /if \(notification\.urgency === "critical"\) return true/);
  assert.match(preferences, /notifyLowStock/);
  assert.match(preferences, /notifyInvoices/);
  assert.match(preferences, /notifyDelayedOrders/);
  assert.match(preferences, /notifyHr/);
});

test("date and time preferences are validated and applied using the selected time zone", async () => {
  const preferences = await readFile(new URL("../src/lib/settings-preferences.ts", import.meta.url), "utf8");
  assert.match(preferences, /timeZone: \["Asia\/Aden", "Asia\/Riyadh", "UTC", "local"\]/);
  assert.match(preferences, /preferences\.timeFormat === "12"/);
  assert.match(preferences, /preferences\.dateFormat === "DD\/MM\/YYYY"/);
  assert.match(preferences, /timeZone: preferences\.timeZone/);
});
