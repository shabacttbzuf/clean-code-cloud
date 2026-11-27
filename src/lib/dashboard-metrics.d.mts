export interface DashboardMetricRow {
  total?: number | null;
  amount?: number | null;
  subtotal?: number | null;
  discount?: number | null;
  quantity?: number | null;
  cost_price_snapshot?: number | null;
  restocked?: boolean | null;
}

export interface DashboardFinancialRows {
  salesToday: DashboardMetricRow[];
  refundsToday: DashboardMetricRow[];
  salesMonth: DashboardMetricRow[];
  refundsMonth: DashboardMetricRow[];
  expensesMonth: DashboardMetricRow[];
  saleCostRows: DashboardMetricRow[];
  refundCostRows: DashboardMetricRow[];
}

export interface DashboardFinancialSummary {
  totalToday: number;
  totalMonth: number;
  totalExpMonth: number;
  unknownCostItems: number;
  profit: number | null;
}

export function summarizeDashboardFinancialRows(
  input: DashboardFinancialRows,
): DashboardFinancialSummary;
