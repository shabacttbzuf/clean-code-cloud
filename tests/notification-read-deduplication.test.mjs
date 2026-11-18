import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261119000004_deduplicate_notification_read_policies_and_index.sql", import.meta.url),
  "utf8",
);

test("notification receipt cleanup removes only the duplicate lowercase policies", () => {
  assert.match(migration, /drop policy if exists "users read own notification receipts"/i);
  assert.match(migration, /drop policy if exists "users create own notification receipts"/i);
  assert.match(migration, /drop policy if exists "users update own notification receipts"/i);
  assert.doesNotMatch(migration, /drop policy if exists "Users (read|create|update) own notification receipts"/);
  assert.match(migration, /begin;[\s\S]*commit;/i);
});

test("notification receipt cleanup drops only the duplicate index", () => {
  assert.match(migration, /drop index if exists public\.notification_reads_user_read_at_idx/i);
  assert.doesNotMatch(migration, /drop index if exists public\.idx_notification_reads_user/i);
  assert.doesNotMatch(migration, /drop table|truncate|delete from/i);
});
