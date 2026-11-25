import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";

type TrendPoint = { day: string; total: number };
type ExpenseCategory = { name: string; value: number; color: string | null };

export function DashboardCharts({
  trend,
  byCategory,
}: {
  trend: TrendPoint[];
  byCategory: ExpenseCategory[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardContent className="p-4">
          <div className="mb-3 text-sm font-semibold">مبيعات آخر 30 يوم</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 text-sm font-semibold">توزيع المصروفات</div>
          {byCategory.length === 0 ? (
            <div className="grid h-64 place-items-center text-sm text-muted-foreground">لا توجد مصروفات</div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byCategory} dataKey="value" nameKey="name" outerRadius={80} label>
                    {byCategory.map((entry, index) => (
                      <Cell key={entry.name + index} fill={entry.color ?? "hsl(var(--primary))"} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
