/**
 * Pure dashboard financial aggregation. Inputs are rows returned by the
 * tenant/branch-scoped Supabase queries; this module performs no I/O.
 */
export function summarizeDashboardFinancialRows({
  salesToday = [],
  refundsToday = [],
  salesMonth = [],
  refundsMonth = [],
  expensesMonth = [],
  saleCostRows = [],
  refundCostRows = [],
}) {
  const sum = (rows, pick) => rows.reduce((total, row) => total + Number(pick(row) ?? 0), 0);

  const totalToday = sum(salesToday, (row) => row.total) - sum(refundsToday, (row) => row.total);
  const totalMonth = sum(salesMonth, (row) => row.total) - sum(refundsMonth, (row) => row.total);
  const totalExpMonth = sum(expensesMonth, (row) => row.amount);

  const unknownSaleCosts = saleCostRows.filter((row) => row.cost_price_snapshot == null).length;
  const unknownReturnedCosts = refundCostRows.filter(
    (row) => row.restocked && row.cost_price_snapshot == null,
  ).length;
  const unknownCostItems = unknownSaleCosts + unknownReturnedCosts;

  const cogsSales = sum(saleCostRows, (row) => Number(row.cost_price_snapshot ?? 0) * Number(row.quantity));
  const cogsRestockedReturns = sum(
    refundCostRows,
    (row) => row.restocked ? Number(row.cost_price_snapshot ?? 0) * Number(row.quantity) : 0,
  );
  const revenueBeforeTax = sum(
    salesMonth,
    (row) => Number(row.subtotal ?? 0) - Number(row.discount ?? 0),
  ) - sum(
    refundsMonth,
    (row) => Number(row.subtotal ?? 0) - Number(row.discount ?? 0),
  );
  const grossProfit = unknownCostItems > 0 ? null : revenueBeforeTax - cogsSales + cogsRestockedReturns;
  const profit = grossProfit === null ? null : grossProfit - totalExpMonth;

  return { totalToday, totalMonth, totalExpMonth, unknownCostItems, profit };
}
