import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const kitchen = readFileSync(new URL("../src/routes/_authenticated/kitchen.tsx", import.meta.url), "utf8");

test("kitchen daily metrics are counted from the active tenant and branch only", () => {
  assert.match(kitchen, /queryKey: \["kitchen-daily-metrics", tenantId, userId, branchId\]/);
  assert.match(kitchen, /select\("id", \{ count: "exact", head: true \}\)/);
  assert.match(kitchen, /\.eq\("tenant_id", tenantId\)/);
  assert.match(kitchen, /\.eq\("branch_id", branchId\)/);
  assert.match(kitchen, /\.in\("status", \["new", "preparing", "ready", "delivered"\]\)/);
  assert.match(kitchen, /\.gte\("created_at", startOfDay\.toISOString\(\)\)/);
});

test("kitchen completion rate uses delivered orders against all orders created today", () => {
  assert.match(kitchen, /const dailyTotal = daily\.new \+ daily\.preparing \+ daily\.ready \+ daily\.delivered/);
  assert.match(kitchen, /daily\.delivered \/ dailyTotal/);
  assert.match(kitchen, /نسبة الإنجاز اليوم/);
  assert.match(kitchen, /\{kitchenMetrics\.deliveredToday\} من \{kitchenMetrics\.dailyTotal\} طلب/);
});

test("kitchen shows overdue active orders without changing invoice or inventory state", () => {
  assert.match(kitchen, /Date\.now\(\) - new Date\(order\.created_at\)\.getTime\(\) >= 20 \* 60 \* 1000/);
  assert.match(kitchen, /تنبيه تأخير/);
  assert.match(kitchen, /set_kitchen_order_status_idempotent/);
  assert.doesNotMatch(kitchen, /\.update\(\{[^}]*\b(?:total|payment_status|inventory_quantity)\b/);
});

test("realtime and offline-sync events refresh kitchen queue and daily metrics", () => {
  assert.match(kitchen, /invalidateQueries\(\{ queryKey: \["kitchen-daily-metrics", tenantId\] \}\)/);
  assert.match(kitchen, /invalidateQueries\(\{ queryKey: \["kitchen-daily-metrics", tenantId, userId, branchId\] \}\)/);
});
