import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const tokens = readFileSync(new URL("../src/lib/design-tokens.ts", import.meta.url), "utf8");
const primitives = readFileSync(new URL("../src/components/ui/design-primitives.tsx", import.meta.url), "utf8");
const table = readFileSync(new URL("../src/components/ui/table.tsx", import.meta.url), "utf8");
const root = readFileSync(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");
const fonts = readFileSync(new URL("../src/lib/fonts.ts", import.meta.url), "utf8");

test("brand identity and semantic design tokens stay centralized", () => {
  assert.match(styles, /--brand-navy:\s*#102b4e/i);
  assert.match(styles, /--brand-gold:\s*#d6ad55/i);
  assert.match(styles, /--brand-white:\s*#ffffff/i);
  for (const token of ["--radius-control", "--radius-card", "--radius-dialog", "--shadow-soft", "--shadow-card", "--shadow-elevated"]) {
    assert.ok(styles.includes(token), `missing CSS token: ${token}`);
  }
  for (const token of ["brandNavy", "brandGold", "brandWhite", "radius", "shadow", "typography"]) {
    assert.ok(tokens.includes(token), `missing TypeScript token group/reference: ${token}`);
  }
});

test("Arabic typography and RTL are provided locally at the application root", () => {
  assert.match(fonts, /@fontsource\/cairo/);
  assert.match(fonts, /@fontsource\/inter/);
  assert.match(styles, /--font-arabic:\s*"Cairo"/);
  assert.match(root, /<html lang="ar" dir="rtl">/);
});

test("reusable design primitives cover layout, surfaces, tables and accessible icons", () => {
  for (const name of ["AppIcon", "PageSection", "SectionHeading", "Surface", "ResponsiveTableContainer"]) {
    assert.match(primitives, new RegExp(`export function ${name}\\b`));
  }
  assert.match(primitives, /aria-hidden=\{decorative \? true : undefined\}/);
  assert.match(table, /data-design-table-container/);
});

test("responsive and accessibility safeguards remain in the shared stylesheet", () => {
  assert.match(styles, /@media \(max-width:\s*640px\)/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /:focus-visible/);
  assert.match(table, /overflow-auto/);
});
