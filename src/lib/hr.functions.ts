import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertPermission(supabase: any, userId: string, tenantId: string, permissionKey: string) {
  const { data, error } = await supabase.rpc("has_permission", {
    _user_id: userId,
    _tenant_id: tenantId,
    _permission_key: permissionKey,
  });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error(`غير مصرح: الصلاحية المطلوبة ${permissionKey}.`);
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
    await assertPermission(context.supabase, context.userId, data.tenant_id, "payroll.run");
    const supabase = context.supabase;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Reject if a run already exists
    let existQ = supabase
      .from("payroll_runs")
      .select("id")
      .eq("tenant_id", data.tenant_id)
      .eq("period_year", data.year)
      .eq("period_month", data.month);
    existQ = data.branch_id ? existQ.eq("branch_id", data.branch_id) : existQ.is("branch_id", null);
    const { data: existing, error: existingError } = await existQ.maybeSingle();
    if (existingError) throw new Error(existingError.message);
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

    try {
      let totalGross = 0, totalNet = 0, totalBonuses = 0, totalDeductions = 0;

      for (const e of employees) {
      const empId = e.id as string;
      const workingDays = Number((e as any).working_days_per_month || 26);
      const workingHours = Number((e as any).working_hours_per_day || 8);
      const baseMonthly = Number(e.base_salary || 0);
      const dailyRate = Number((e as any).daily_salary) || (baseMonthly / Math.max(1, workingDays));
      const hourlyRate = Number((e as any).hourly_salary) || (dailyRate / Math.max(1, workingHours));

      const [bonusResult, deductionResult, attendanceResult] = await Promise.all([
        supabase.from("bonuses").select("id, amount").eq("employee_id", empId)
          .is("payroll_item_id", null)
          .gte("applied_date", startDate).lte("applied_date", endDate),
        supabase.from("deductions").select("id, amount").eq("employee_id", empId)
          .is("payroll_item_id", null)
          .gte("applied_date", startDate).lte("applied_date", endDate),
        supabase.from("attendance").select("status, hours_worked, late_minutes, overtime_hours")
          .eq("employee_id", empId).gte("date", startDate).lte("date", endDate),
      ]);
      if (bonusResult.error) throw new Error(bonusResult.error.message);
      if (deductionResult.error) throw new Error(deductionResult.error.message);
      if (attendanceResult.error) throw new Error(attendanceResult.error.message);

      const bList = bonusResult.data ?? [];
      const dList = deductionResult.data ?? [];
      const att = attendanceResult.data ?? [];
      const bonusesTotal = bList.reduce((s: number, x: any) => s + Number(x.amount), 0);
      const manualDeductions = dList.reduce((s: number, x: any) => s + Number(x.amount), 0);

      const presentDays = att.reduce((sum: number, row: any) =>
        sum + (row.status === "present" ? 1 : row.status === "half_day" ? 0.5 : 0), 0);
      const holidays = att.filter((row: any) => row.status === "holiday").length;
      const leaves = att.filter((row: any) => row.status === "leave").length;
      const unexcusedAbsent = att.filter((row: any) => row.status === "absent").length;
      const totalLateMinutes = att.reduce((sum: number, row: any) => sum + Number(row.late_minutes || 0), 0);
      const overtimeHours = att.reduce((sum: number, row: any) => sum + Number(row.overtime_hours || 0), 0);
      const workedHours = att.reduce((sum: number, row: any) => sum + Number(row.hours_worked || 0), 0);

      const salaryType = String(e.salary_type || "monthly");
      const overtimeAmount = +(overtimeHours * hourlyRate * 1.5).toFixed(2);
      const regularHourlyEarnings = Math.max(0, workedHours - overtimeHours) * hourlyRate;
      const baseEarnings =
        salaryType === "daily" ? presentDays * dailyRate :
        salaryType === "hourly" ? regularHourlyEarnings :
        baseMonthly;

      // Monthly salaries deduct absences; hourly salaries already reflect actual hours.
      const absenceDeduction = salaryType === "monthly" ? +(unexcusedAbsent * dailyRate).toFixed(2) : 0;
      const lateDeduction = salaryType === "hourly"
        ? 0
        : +((totalLateMinutes / 60) * hourlyRate).toFixed(2);

      const deductionsTotal = +(manualDeductions + absenceDeduction + lateDeduction).toFixed(2);
      const gross = +(baseEarnings + bonusesTotal + overtimeAmount).toFixed(2);
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
      if (bIds.length) {
        const { error } = await supabaseAdmin.from("bonuses").update({ payroll_item_id: item.id }).in("id", bIds);
        if (error) throw new Error(error.message);
      }
      if (dIds.length) {
        const { error } = await supabaseAdmin.from("deductions").update({ payroll_item_id: item.id }).in("id", dIds);
        if (error) throw new Error(error.message);
      }

      totalGross += gross; totalNet += net; totalBonuses += bonusesTotal; totalDeductions += deductionsTotal;
    }

    const { error: totalsError } = await supabaseAdmin.from("payroll_runs").update({
      total_gross: totalGross, total_net: totalNet,
      total_bonuses: totalBonuses, total_deductions: totalDeductions,
    }).eq("id", run.id).eq("tenant_id", data.tenant_id);
      if (totalsError) throw new Error(totalsError.message);

      return { run_id: run.id as string, employees_count: employees.length };
    } catch (error) {
      // Remove the draft and its items if any calculation or write fails.
      // FK cleanup detaches bonus/deduction references so they remain reusable.
      const { error: cleanupError } = await supabaseAdmin
        .from("payroll_runs")
        .delete()
        .eq("id", run.id)
        .eq("tenant_id", data.tenant_id);
      if (cleanupError) {
        throw new Error(
          `Payroll generation failed: ${error instanceof Error ? error.message : String(error)}. Cleanup also failed: ${cleanupError.message}`,
        );
      }
      throw error;
    }
  });

export const approvePayroll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid(), tenant_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, data.tenant_id, "payroll.approve");
    const { data: updated, error } = await context.supabase
      .from("payroll_runs")
      .update({
        status: "approved",
        approved_by: context.userId,
        approved_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("tenant_id", data.tenant_id)
      .eq("status", "draft")
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("لا يمكن اعتماد دورة الرواتب: يجب أن تكون في حالة مسودة.");
    return { ok: true };
  });

export const markPayrollPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid(), tenant_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, data.tenant_id, "payroll.approve");
    const { data: updated, error } = await context.supabase
      .from("payroll_runs")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("tenant_id", data.tenant_id)
      .eq("status", "approved")
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("لا يمكن صرف دورة الرواتب: يجب أن تكون معتمدة أولاً.");
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
    await assertPermission(context.supabase, context.userId, data.tenant_id, "payroll.approve");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("reject_payroll_run", {
      _run_id: data.id,
      _tenant_id: data.tenant_id,
      _reason: data.reason,
      _actor_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
