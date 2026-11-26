import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const migrationsDirectory = new URL("../supabase/migrations/", import.meta.url);
const migrationFiles = readdirSync(migrationsDirectory)
  .filter((name) => name.endsWith(".sql"))
  .sort();
const manifest = readFileSync(new URL("../supabase/MIGRATION_MANIFEST.md", import.meta.url), "utf8");
const snapshot = readFileSync(new URL("../supabase/COMPLETE_DATABASE.sql", import.meta.url), "utf8");
const manifestFiles = [...manifest.matchAll(/supabase\/migrations\/([A-Za-z0-9_.-]+\.sql)/g)].map((match) => match[1]);
const snapshotFiles = [...snapshot.matchAll(/^-- SOURCE MIGRATION: ([^\r\n]+)$/gm)].map((match) => match[1].trim());

test("migration manifest and complete database snapshot list every migration exactly once", () => {
  assert.equal(new Set(manifestFiles).size, migrationFiles.length, "manifest contains duplicate or missing migration entries");
  assert.equal(new Set(snapshotFiles).size, migrationFiles.length, "snapshot contains duplicate or missing migration markers");
  assert.deepEqual([...manifestFiles].sort(), migrationFiles, "manifest must match supabase/migrations filenames");
  assert.deepEqual([...snapshotFiles].sort(), migrationFiles, "snapshot markers must match supabase/migrations filenames");
});

test("complete database snapshot contains the exact source text of every migration", () => {
  for (const filename of migrationFiles) {
    const source = readFileSync(new URL(`../supabase/migrations/${filename}`, import.meta.url), "utf8").trim();
    const marker = `-- SOURCE MIGRATION: ${filename}`;
    const start = snapshot.indexOf(marker);
    const nextMarker = snapshot.indexOf("\n-- SOURCE MIGRATION:", start + marker.length);
    const block = snapshot.slice(start + marker.length, nextMarker < 0 ? snapshot.length : nextMarker);
    assert.ok(start >= 0, `snapshot is missing marker for ${filename}`);
    assert.ok(block.includes(source), `snapshot content differs from source migration ${filename}`);
  }
});
