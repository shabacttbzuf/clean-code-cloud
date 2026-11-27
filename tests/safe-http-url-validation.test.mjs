import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("shared URL validator accepts only HTTP and HTTPS and rejects embedded credentials", () => {
  const source = read("../src/lib/safe-url.ts");
  assert.match(source, /url\.protocol === "https:" \|\| url\.protocol === "http:"/);
  assert.match(source, /!url\.username && !url\.password/);
  assert.match(source, /\.max\(2048\)/);
});

test("all user-editable external URL schemas use the shared safe validator", () => {
  for (const path of [
    "../src/routes/_authenticated/categories.tsx",
    "../src/routes/_authenticated/branches.tsx",
    "../src/routes/_authenticated/products.tsx",
    "../src/routes/_authenticated/customers.tsx",
    "../src/routes/_authenticated/suppliers.tsx",
    "../src/routes/_authenticated/settings.tsx",
    "../src/routes/_authenticated/hr.employees.tsx",
    "../src/lib/enterprise.functions.ts",
  ]) {
    const source = read(path);
    assert.match(source, /safeHttpUrlSchema/ , `Missing safe URL schema in ${path}`);
    assert.doesNotMatch(source, /z\.string\(\)\.url\(\)/, `Unsafe URL schema remains in ${path}`);
  }
});

test("server-side avatar validation preserves private storage references but rejects unsafe external schemes", () => {
  const source = read("../src/lib/users.functions.ts");
  assert.match(source, /value\.startsWith\("private:\/\/"\) \|\| isSafeHttpUrl\(value\)/);
  assert.match(source, /import \{ isSafeHttpUrl \} from "@\/lib\/safe-url"/);
});
