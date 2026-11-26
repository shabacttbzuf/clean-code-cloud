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

function normalizeExecutableSql(source) {
  const withoutLineComments = source
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("--"))
    .filter((line) => !/^\s*(BEGIN|COMMIT)\s*;\s*$/i.test(line))
    .join("\n");
  let output = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let pendingSpace = false;

  for (let i = 0; i < withoutLineComments.length; i += 1) {
    const char = withoutLineComments[i];
    const next = withoutLineComments[i + 1];

    if (inSingleQuote) {
      output += char;
      if (char === "\\" && next) {
        output += next;
        i += 1;
      } else if (char === "'" && next === "'") {
        output += next;
        i += 1;
      } else if (char === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      output += char;
      if (char === '"' && next === '"') {
        output += next;
        i += 1;
      } else if (char === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (char === "'") {
      if (pendingSpace && output && !output.endsWith("(") && !output.endsWith(",")) output += " ";
      pendingSpace = false;
      output += char;
      inSingleQuote = true;
      continue;
    }
    if (char === '"') {
      if (pendingSpace && output && !output.endsWith("(") && !output.endsWith(",")) output += " ";
      pendingSpace = false;
      output += char;
      inDoubleQuote = true;
      continue;
    }
    if (/\s/.test(char)) {
      pendingSpace = true;
      continue;
    }
    if (char === "(" || char === ")" || char === ",") {
      output = output.replace(/\s+$/, "");
      output += char;
      pendingSpace = false;
      continue;
    }
    if (pendingSpace && output && !output.endsWith("(") && !output.endsWith(",")) output += " ";
    output += char;
    pendingSpace = false;
  }

  return output.trim();
}

test("complete database snapshot contains the executable SQL from every migration", () => {
  const normalizedSnapshot = normalizeExecutableSql(snapshot);
  for (const filename of migrationFiles) {
    const source = readFileSync(new URL(`../supabase/migrations/${filename}`, import.meta.url), "utf8");
    const normalizedSource = normalizeExecutableSql(source);
    assert.ok(
      normalizedSnapshot.includes(normalizedSource),
      `complete database snapshot is missing executable SQL from ${filename}`,
    );
  }
});
