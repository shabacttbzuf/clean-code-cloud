import test from "node:test";
import assert from "node:assert/strict";
import { calculatePercentChange, calculateProfitMetrics, fetchAllRows } from "../src/lib/report-analytics.ts";

test("profit metrics account for refunded goods only when restocked", () => {
  const result = calculateProfitMetrics({
    sales: [{ subtotal: 100, discount: 10 }],
    refunds: [{ subtotal: 20, discount: 0 }],
    saleItems: [{ quantity: 2, cost_price_snapshot: 15 }],
    refundItems: [
      { quantity: 1, cost_price_snapshot: 15, restocked: true },
      { quantity: 1, cost_price_snapshot: 15, restocked: false },
    ],
    expenses: [{ amount: 5 }],
  });
  assert.equal(result.revenueBeforeTax, 70);
  assert.equal(result.soldCost, 30);
  assert.equal(result.restockedReturnCost, 15);
  assert.equal(result.costOfGoods, 15);
  assert.equal(result.grossProfit, 55);
  assert.equal(result.netProfit, 50);
});

test("profit is not fabricated when a sold or restocked item lacks a cost snapshot", () => {
  const result = calculateProfitMetrics({
    sales: [{ subtotal: 30, discount: 0 }],
    refunds: [],
    saleItems: [{ quantity: 1, cost_price_snapshot: null }],
    refundItems: [{ quantity: 1, cost_price_snapshot: null, restocked: false }],
    expenses: [],
  });
  assert.equal(result.unknownCostItems, 1);
  assert.equal(result.grossProfit, null);
  assert.equal(result.netProfit, null);
});

test("unrestocked refund without a cost snapshot does not make COGS unknown", () => {
  const result = calculateProfitMetrics({
    sales: [{ subtotal: 30, discount: 0 }],
    refunds: [{ subtotal: 5, discount: 0 }],
    saleItems: [{ quantity: 1, cost_price_snapshot: 8 }],
    refundItems: [{ quantity: 1, cost_price_snapshot: null, restocked: false }],
    expenses: [],
  });
  assert.equal(result.costOfGoods, 8);
  assert.equal(result.grossProfit, 17);
});

test("percentage change handles zero baselines without infinity", () => {
  assert.equal(calculatePercentChange(110, 100), 10);
  assert.equal(calculatePercentChange(10, 0), null);
});

test("fetchAllRows paginates until the final short page", async () => {
  const pages = [[1, 2], [3, 4], [5]];
  const ranges = [];
  const rows = await fetchAllRows(async (from, to) => {
    ranges.push([from, to]);
    return { data: pages[from / 2] ?? [], error: null };
  }, 2);
  assert.deepEqual(rows, [1, 2, 3, 4, 5]);
  assert.deepEqual(ranges, [[0, 1], [2, 3], [4, 5]]);
});

test("fetchAllRows propagates database errors and validates page size", async () => {
  await assert.rejects(() => fetchAllRows(async () => ({
    data: null, error: { message: "permission denied" },
  })), /permission denied/);
  await assert.rejects(() => fetchAllRows(async () => ({ data: [], error: null }), 0), /pageSize/);
});

test("buildCsv escapes cells and neutralizes formula-like untrusted text", async () => {
  const { buildCsv } = await import("../src/lib/report-analytics.ts");
  const csv = buildCsv([
    { المنتج: '=HYPERLINK("https://example.invalid","افتح")', الكمية: 2, ملاحظة: '  @SUM(1,2)' },
    { المنتج: 'عصير "طازج"', الكمية: -1, ملاحظة: null },
  ]);
  assert.equal(
    csv,
    '"المنتج","الكمية","ملاحظة"\r\n"\'=HYPERLINK(""https://example.invalid"",""افتح"")","2","'  @SUM(1,2)"\r\n"عصير ""طازج""","-1",""',
  );
  assert.equal(buildCsv([]), "");
});
