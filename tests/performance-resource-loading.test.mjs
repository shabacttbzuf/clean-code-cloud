import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pdf = await readFile(new URL("../src/lib/invoice-pdf.ts", import.meta.url), "utf8");
const fonts = await readFile(new URL("../src/lib/fonts.ts", import.meta.url), "utf8");

test("jsPDF is loaded only when invoice PDF generation is requested", () => {
  assert.doesNotMatch(pdf, /^import\s+\{\s*jsPDF\s*\}\s+from\s+["']jspdf["']/m);
  assert.match(pdf, /await import\(["']jspdf["']\)/);
  assert.match(pdf, /export async function generateInvoicePDF/);
  assert.match(pdf, /export async function printInvoicePDF/);
  assert.match(pdf, /export async function downloadInvoicePDF/);
});

test("font bundles include only Arabic Cairo and Latin Inter subsets", () => {
  assert.match(fonts, /@fontsource\/cairo\/arabic-400\.css/);
  assert.match(fonts, /@fontsource\/inter\/latin-400\.css/);
  assert.doesNotMatch(fonts, /@fontsource\/(cairo|inter)\/(400|500|600|700)\.css/);
  assert.equal((fonts.match(/@fontsource\//g) || []).length, 7);
});
