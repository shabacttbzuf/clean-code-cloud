import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertHRAccess(supabase: any, userId: string, tenantId: string) {
  const { data: isSO } = await supabase.rpc("is_super_owner", { _user_id: userId });
  if (isSO) return;
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.some((r: string) => ["owner", "manager"].includes(r))) {
    throw new Error("غير مصرح");
  }
}

/** Compute + create a payroll run for a given month/year (+optional branch). */
export const runMonthlyPayroll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        tenant_id: z.string().uuid(),
        branch_id: z.string().uuid().nullable().optional(),
        month: z.number().int().min(1).max(12),
        year: z.number().int().min(2020).max(2100),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertHRAccess(context.supabase, context.userId, data.tenant_id);
    const supabase = context.supabase;

    // Reject if a run already exists
    let existQ = supabase
      .from("payroll_runs")
      .select("id")
      .eq("tenant_id", data.tenant_id)
      .eq("period_year", data.year)
      .eq("period_month", data.month);
    existQ = data.branch_id ? existQ.eq("branch_id", data.branch_id) : existQ.is("branch_id", null);
    const { data: existing } = await existQ.maybeSingle();
    if (existing) throw new Error("دورة الرواتب لهذا الشهر موجودة مسبقاً");

    // Fetch active employees
    let empQuery = supabase
      .from("employees")
      .select("id, base_salary, daily_salary, hourly_salary, salary_type, working_hours_per_day, working_days_per_month, branch_id")
      .eq("tenant_id", data.tenant_id)
      .eq("status", "active");
    if (data.branch_id) empQuery = empQuery.eq("branch_id", data.branch_id);
    const { data: employees, error: empErr } = await empQuery;
    if (empErr) throw new Error(empErr.message);
    if (!employees || employees.length === 0) throw new Error("لا يوجد موظفون نشطون");

    const startDate = `${data.year}-${String(data.month).padStart(2, "0")}-01`;
    const endDateObj = new Date(data.year, data.month, 0);
    const endDate = endDateObj.toISOString().slice(0, 10);

    // Create run
    const { data: run, error: runErr } = await supabase
      .from("payroll_runs")
      .insert({
        tenant_id: data.tenant_id,
        branch_id: data.branch_id ?? null,
        period_month: data.month,
        period_year: data.year,
        status: "draft",
        created_by: context.userId,
      })
      .select()
      .single();
    if (runErr) throw new Error(runErr.message);

    let totalGross = 0, totalNet = 0, totalBonuses = 0, totalDeductions = 0;

    for (const e of employees) {
      const empId = e.id as string;
      const workingDays = Number((e as any).working_days_per_month || 26);
      const workingHours = Number((e as any).working_hours_per_day || 8);
      const baseMonthly = Number(e.base_salary || 0);
      const dailyRate = Number((e as any).daily_salary) || (baseMonthly / Math.max(1, workingDays));
      const hourlyRate = Number((e as any).hourly_salary) || (dailyRate / Math.max(1, workingHours));

      const [{ data: bList }, { data: dList }, { data: attList }] = await Promise.all([
        supabase.from("bonuses").select("id, amount").eq("employee_id", empId)
          .is("payroll_item_id", null)
          .gte("applied_date", startDate).lte("applied_date", endDate),
        supabase.from("deductions").select("id, amount").eq("employee_id", empId)
          .is("payroll_item_id", null)
          .gte("applied_date", startDate).lte("applied_date", endDate),
        supabase.from("attendance").select("status, hours_worked, late_minutes, overtime_hours")
          .eq("employee_id", empId).gte("date", startDate).lte("date", endDate),
      ]);
      const bonusesTotal = (bList ?? []).reduce((s: number, x: any) => s + Number(x.amount), 0);
      const manualDeductions = (dList ?? []).reduce((s: number, x: any) => s + Number(x.amount), 0);

      const att = attList ?? [];
      const presentDays = att.filter((a: any) => ["present", "late", "early_leave", "overtime", "half_day"].includes(a.status)).length;
      const holidays = att.filter((a: any) => ["weekly_holiday", "official_holiday"].includes(a.status)).length;
      const leaves = att.filter((a: any) => ["annual_leave", "sick_leave"].includes(a.status)).length;
      const unexcusedAbsent = att.filter((a: any) => ["absent", "absent_unexcused"].includes(a.status)).length;
      const totalLateMinutes = att.reduce((s: number, a: any) => s + Number(a.late_minutes || 0), 0);
      const overtimeHours = att.reduce((s: number, a: any) => s + Number(a.overtime_hours || 0), 0);
      const workedHours = att.reduce((s: number, a: any) => s + Number(a.hours_worked || 0), 0);

      // Deductions computed from BASE salary rate (not final)
      const absenceDeduction = +(unexcusedAbsent * dailyRate).toFixed(2);
      const lateDeduction = +((totalLateMinutes / 60) * hourlyRate).toFixed(2);
      const overtimeAmount = +(overtimeHours * hourlyRate * 1.5).toFixed(2); // 1.5x standard

      const deductionsTotal = +(manualDeductions + absenceDeduction + lateDeduction).toFixed(2);
      const gross = +(baseMonthly + bonusesTotal + overtimeAmount).toFixed(2);
      const net = +(gross - deductionsTotal).toFixed(2);

      const { data: item, error: itemErr } = await supabase.from("payroll_items").insert({
        tenant_id: data.tenant_id,
        payroll_run_id: run.id,
        employee_id: empId,
        base_salary: baseMonthly,
        daily_rate: dailyRate,
        hourly_rate: hourlyRate,
        working_hours: workedHours,
        attendance_days: presentDays,
        overtime_hours: overtimeHours,
        overtime_amount: overtimeAmount,
        absence_deduction: absenceDeduction,
        late_deduction: lateDeduction,
        holidays_count: holidays,
        leave_days: leaves,
        bonuses_total: bonusesTotal,
        deductions_total: deductionsTotal,
        gross,
        net,
      }).select().single();
      if (itemErr) throw new Error(itemErr.message);

      const bIds = (bList ?? []).map((x: any) => x.id);
      const dIds = (dList ?? []).map((x: any) => x.id);
      if (bIds.length) await supabase.from("bonuses").update({ payroll_item_id: item.id }).in("id", bIds);
      if (dIds.length) await supabase.from("deductions").update({ payroll_item_id: item.id }).in("id", dIds);

      totalGross += gross; totalNet += net; totalBonuses += bonusesTotal; totalDeductions += deductionsTotal;
    }

    await supabase.from("payroll_runs").update({
      total_gross: totalGross, total_net: totalNet,
      total_bonuses: totalBonuses, total_deductions: totalDeductions,
    }).eq("id", run.id);

    return { run_id: run.id as string, employees_count: employees.length };
  });

export const approvePayroll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid(), tenant_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertHRAccess(context.supabase, context.userId, data.tenant_id);
    const { error } = await context.supabase.from("payroll_runs").update({
      status: "approved", approved_by: context.userId, approved_at: new Date().toISOString(),
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markPayrollPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid(), tenant_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertHRAccess(context.supabase, context.userId, data.tenant_id);
    const { error } = await context.supabase.from("payroll_runs").update({
      status: "paid", paid_at: new Date().toISOString(),
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Reject a payroll run. Detaches its items' bonuses/deductions so they can be
 * re-picked by the next run, deletes items, and sets the run to `rejected`
 * with a stored reason. The month can be re-run afterwards.
 */
export const rejectPayroll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({
      id: z.string().uuid(),
      tenant_id: z.string().uuid(),
      reason: z.string().min(1).max(500),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertHRAccess(context.supabase, context.userId, data.tenant_id);
    const supabase = context.supabase;

    const { data: items } = await supabase.from("payroll_items").select("id").eq("payroll_run_id", data.id);
    const itemIds = (items ?? []).map((x: any) => x.id);
    if (itemIds.length) {
      await supabase.from("bonuses").update({ payroll_item_id: null }).in("payroll_item_id", itemIds);
      await supabase.from("deductions").update({ payroll_item_id: null }).in("payroll_item_id", itemIds);
      await supabase.from("payroll_items").delete().eq("payroll_run_id", data.id);
    }

    const { error } = await supabase.from("payroll_runs").update({
      status: "rejected",
      rejection_reason: data.reason,
      rejected_by: context.userId,
      rejected_at: new Date().toISOString(),
      total_gross: 0, total_net: 0, total_bonuses: 0, total_deductions: 0,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
