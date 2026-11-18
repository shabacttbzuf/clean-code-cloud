import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261119000005_index_platform_branding_updated_by.sql", import.meta.url),
  "utf8",
);

test("platform branding updated_by foreign key has a partial covering index", () => {
  assert.match(migration, /create index if not exists platform_branding_updated_by_idx/i);
  assert.match(migration, /on public\.platform_branding\s*\(updated_by\)/i);
  assert.match(migration, /where updated_by is not null/i);
  assert.doesNotMatch(migration, /drop|delete|truncate|alter table/i);
});
