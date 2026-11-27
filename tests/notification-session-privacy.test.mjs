import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rootRoute = readFileSync(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");
const notificationPage = readFileSync(new URL("../src/routes/_authenticated/notifications.tsx", import.meta.url), "utf8");
const notificationHook = readFileSync(new URL("../src/hooks/use-notification-sync.ts", import.meta.url), "utf8");

test("notification data is not persisted and in-memory query cache is cleared on sign out", () => {
  assert.match(rootRoute, /event === "SIGNED_OUT"[\s\S]*queryClient\.clear\(\)/);
  assert.doesNotMatch(rootRoute, /persistQueryClient|createSyncStoragePersister|createAsyncStoragePersister/);
  assert.doesNotMatch(notificationPage, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(notificationHook, /localStorage|sessionStorage|indexedDB/);
});

test("notification query cache keys remain scoped to both tenant and authenticated user", () => {
  assert.match(notificationPage, /\["notifications-list", tenantId, user\?\.id\]/);
  assert.match(notificationHook, /notification-sync:\$\{tenantId\}:\$\{userId\}/);
});
