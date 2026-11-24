import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const settings = await readFile(new URL("../src/routes/_authenticated/settings.tsx", import.meta.url), "utf8");

test("settings keeps company tax and invoice configuration separate from print preferences", () => {
  assert.match(settings, /tax_rate: z\.coerce\.number\(\)\.min\(0\)\.max\(100\)/);
  assert.match(settings, /لا تغير هذه الخيارات الضرائب أو تسلسل أرقام الفواتير أو آلية إصدارها/);
  assert.match(settings, /supabase\.from\("tenants"\)[\s\S]*?\.update\(v\)/);
});

test("branch and user administration remain in their dedicated modules", () => {
  assert.match(settings, /to="\/branches"/);
  assert.match(settings, /to="\/profile"/);
  assert.match(settings, /to="\/users-admin"/);
  assert.match(settings, /to="\/team-permissions"/);
});

test("personal preferences are namespaced per authenticated user and persisted locally", () => {
  assert.match(settings, /ras-settings-preferences-v1:\$\{userId \?\? "guest"\}/);
  assert.match(settings, /localStorage\.getItem\(preferencesKey\)/);
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
