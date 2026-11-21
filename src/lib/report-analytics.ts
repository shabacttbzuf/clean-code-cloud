export type ProfitSaleRow = { subtotal: number | string; discount: number | string };
export type ProfitRefundRow = { subtotal: number | string; discount: number | string };
export type CostSnapshotRow = { quantity: number | string; cost_price_snapshot: number | string | null };
export type RefundCostSnapshotRow = CostSnapshotRow & { restocked: boolean };

export function calculateProfitMetrics(input: {
  sales: ProfitSaleRow[];
  refunds: ProfitRefundRow[];
  saleItems: CostSnapshotRow[];
  refundItems: RefundCostSnapshotRow[];
  expenses: Array<{ amount: number | string }>;
}) {
  const revenueBeforeTax =
    input.sales.reduce((sum, row) => sum + Number(row.subtotal) - Number(row.discount), 0) -
    input.refunds.reduce((sum, row) => sum + Number(row.subtotal) - Number(row.discount), 0);
  const unknownSaleCosts = input.saleItems.filter((row) => row.cost_price_snapshot == null).length;
  const unknownRestockedReturnCosts = input.refundItems.filter((row) => row.restocked && row.cost_price_snapshot == null).length;
  const unknownCostItems = unknownSaleCosts + unknownRestockedReturnCosts;
  const soldCost = input.saleItems.reduce(
    (sum, row) => sum + Number(row.cost_price_snapshot ?? 0) * Number(row.quantity), 0,
  );
  const restockedReturnCost = input.refundItems.reduce(
    (sum, row) => sum + (row.restocked ? Number(row.cost_price_snapshot ?? 0) * Number(row.quantity) : 0), 0,
  );
  const costOfGoods = soldCost - restockedReturnCost;
  const expensesTotal = input.expenses.reduce((sum, row) => sum + Number(row.amount), 0);
  const grossProfit = unknownCostItems > 0 ? null : revenueBeforeTax - costOfGoods;
  const netProfit = grossProfit === null ? null : grossProfit - expensesTotal;
  return {
    revenueBeforeTax,
    soldCost,
    restockedReturnCost,
    costOfGoods: unknownCostItems > 0 ? null : costOfGoods,
    expensesTotal,
    unknownSaleCosts,
    unknownRestockedReturnCosts,
    unknownCostItems,
    grossProfit,
    netProfit,
  };
}

export function calculatePercentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export async function fetchAllRows<T>(
  loadPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new RangeError("pageSize must be an integer between 1 and 1000");
  }
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await loadPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
