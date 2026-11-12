/**
 * Release 1.2 — Enterprise User Management server functions.
 * All actions are protected by requireSupabaseAuth and server-verified tenant permissions.
 * This module is additive; existing users.functions.ts remains untouched.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

async function assertPermission(
  supabase: any,
  userId: string,
  tenantId: string,
  permissionKey: string,
) {
  const { data, error } = await supabase.rpc("has_permission", {
    _user_id: userId,
    _tenant_id: tenantId,
    _permission_key: permissionKey,
  });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error(`غير مصرح: الصلاحية المطلوبة ${permissionKey}.`);
}

async function assertTenantOwnerOrSuperOwner(supabase: any, userId: string, tenantId: string) {
  const { data: isSuperOwner, error: superOwnerError } = await supabase.rpc("is_super_owner", { _user_id: userId });
  if (superOwnerError) throw new Error(superOwnerError.message);
  if (isSuperOwner) return;
  const { data, error } = await supabase.from("user_roles").select("id")
    .eq("user_id", userId).eq("tenant_id", tenantId).eq("role", "owner").limit(1);
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("إدارة الأدوار المخصصة متاحة لمالك المؤسسة فقط.");
}

async function assertTargetUserManageable(
  supabase: any,
  supabaseAdmin: any,
  actorId: string,
  targetUserId: string,
  tenantId: string,
) {
  const { data: targetRoles, error: targetError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", targetUserId)
    .eq("tenant_id", tenantId);
  if (targetError) throw new Error(targetError.message);
  if (!targetRoles?.length) {
    throw new Error("المستخدم المستهدف لا ينتمي إلى المؤسسة المحددة.");
  }

  const { data: isSuperOwner, error: superOwnerError } = await supabase.rpc(
    "is_super_owner",
    { _user_id: actorId },
  );
  if (superOwnerError) throw new Error(superOwnerError.message);
  if (isSuperOwner) return;

  const { data: actorRoles, error: actorError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", actorId)
    .eq("tenant_id", tenantId);
  if (actorError) throw new Error(actorError.message);
  if ((actorRoles ?? []).some((r: any) => r.role === "owner")) return;

  if ((targetRoles ?? []).some((r: any) => ["owner", "manager"].includes(r.role))) {
    throw new Error("لا يحق للمدير إدارة حساب مالك المؤسسة أو مدير آخر.");
  }
}

/* -------------------- Login history -------------------- */

export const recordLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        user_agent: z.string().max(500).optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ip = getRequestIP({ xForwardedFor: true }) ?? null;
    const ua = getRequestHeader("user-agent") ?? data.user_agent ?? null;
    const device = deviceFromUA(ua);
    const browser = browserFromUA(ua);
    const os = osFromUA(ua);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile, error: profileReadError } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (profileReadError) throw new Error(profileReadError.message);

    const { data: entry, error: loginError } = await supabaseAdmin
      .from("login_history")
      .insert({
        user_id: context.userId,
        tenant_id: profile?.tenant_id ?? null,
        event: "login",
        ip,
        user_agent: ua,
        browser,
        os,
        device,
      })
      .select("id")
      .single();
    if (loginError) throw new Error(loginError.message);

    // Server-side only: profile login metadata is not user-editable.
    const { error: profileUpdateError } = await supabaseAdmin
      .from("profiles")
      .update({
        last_login_at: new Date().toISOString(),
        last_ip: ip,
        last_device: device,
        last_user_agent: ua,
      })
      .eq("id", context.userId);
    if (profileUpdateError) console.warn("Could not update last-login metadata", profileUpdateError);

    return { ok: true, ip, device, browser, os, login_history_id: entry.id };
  });

export const recordLogout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ login_history_id: uuid.optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("login_history")
      .select("id, login_at")
      .eq("user_id", context.userId)
      .is("logout_at", null);
    if (data.login_history_id) query = query.eq("id", data.login_history_id);
    const { data: session, error: readError } = await query
      .order("login_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (readError) throw new Error(readError.message);

    if (session) {
      const seconds = Math.max(
        0,
        Math.floor((Date.now() - new Date(session.login_at).getTime()) / 1000),
      );
      const { error } = await supabaseAdmin
        .from("login_history")
        .update({
          logout_at: new Date().toISOString(),
          session_duration_seconds: seconds,
        })
        .eq("id", session.id)
        .eq("user_id", context.userId)
        .is("logout_at", null);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const getAccountStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("status, must_change_password")
      .eq("id", context.userId)
      .maybeSingle();
    return { status: (data?.status ?? "active") as string, must_change_password: !!data?.must_change_password };
  });

/* -------------------- Companies -------------------- */

const companyInput = z.object({
  id: uuid.optional(),
  tenant_id: uuid,
  name: z.string().min(1).max(200),
  legal_name: z.string().max(200).optional().nullable(),
  tax_number: z.string().max(50).optional().nullable(),
  logo_url: z.string().url().optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  is_active: z.boolean().optional(),
});

export const upsertCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => companyInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, data.tenant_id, "companies.manage");
    const payload = { ...data };
    const { error } = data.id
      ? await context.supabase.from("companies").update(payload).eq("id", data.id)
      : await context.supabase.from("companies").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: uuid, tenant_id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, data.tenant_id, "companies.manage");
    const { error } = await context.supabase.from("companies").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------- Departments -------------------- */

const departmentInput = z.object({
  id: uuid.optional(),
  tenant_id: uuid,
  branch_id: uuid.nullable().optional(),
  company_id: uuid.nullable().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  photo_url: z.string().url().optional().nullable(),
  manager_id: uuid.nullable().optional(),
  is_active: z.boolean().optional(),
});

export const upsertDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => departmentInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, data.tenant_id, "departments.manage");
    const { error } = data.id
      ? await context.supabase.from("departments").update(data).eq("id", data.id)
      : await context.supabase.from("departments").insert(data);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: uuid, tenant_id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, data.tenant_id, "departments.manage");
    const { error } = await context.supabase.from("departments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------- Job titles -------------------- */

const jobTitleInput = z.object({
  id: uuid.optional(),
  tenant_id: uuid,
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  is_active: z.boolean().optional(),
});

export const upsertJobTitle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => jobTitleInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, data.tenant_id, "job_titles.manage");
    const { error } = data.id
      ? await context.supabase.from("job_titles").update(data).eq("id", data.id)
      : await context.supabase.from("job_titles").insert(data);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteJobTitle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: uuid, tenant_id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, data.tenant_id, "job_titles.manage");
    const { error } = await context.supabase.from("job_titles").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------- Employment types -------------------- */

const employmentTypeInput = z.object({
  id: uuid.optional(),
  tenant_id: uuid,
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  is_active: z.boolean().optional(),
});

export const upsertEmploymentType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => employmentTypeInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, data.tenant_id, "employment_types.manage");
    const { error } = data.id
      ? await context.supabase.from("employment_types").update(data).eq("id", data.id)
      : await context.supabase.from("employment_types").insert(data);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteEmploymentType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: uuid, tenant_id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, data.tenant_id, "employment_types.manage");
    const { error } = await context.supabase.from("employment_types").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------- Enterprise user actions -------------------- */

const STATUS = z.enum(["active", "suspended", "frozen", "pending_approval", "password_expired", "archived"]);

export const updateUserEnterpriseProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        user_id: uuid,
        tenant_id: uuid,
        patch: z.object({
          employee_no: z.string().max(50).nullable().optional(),
          national_id: z.string().max(50).nullable().optional(),
          job_title: z.string().max(120).nullable().optional(),
          department_id: uuid.nullable().optional(),
          company_id: uuid.nullable().optional(),
          employment_date: z.string().nullable().optional(),
          phone: z.string().max(30).nullable().optional(),
          full_name: z.string().min(1).max(120).optional(),
        }),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, data.tenant_id, "users.edit");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertTargetUserManageable(context.supabase, supabaseAdmin, context.userId, data.user_id, data.tenant_id);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update(data.patch)
      .eq("id", data.user_id)
      .eq("tenant_id", data.tenant_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUserStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ user_id: uuid, tenant_id: uuid, status: STATUS }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const statusPermission = data.status === "suspended" ? "users.suspend" : data.status === "frozen" ? "users.freeze" : data.status === "archived" ? "users.archive" : "users.approve";
    await assertPermission(context.supabase, context.userId, data.tenant_id, statusPermission);
    if (data.user_id === context.userId && data.status !== "active") {
      throw new Error("لا يمكنك تغيير حالة حسابك بنفسك.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertTargetUserManageable(context.supabase, supabaseAdmin, context.userId, data.user_id, data.tenant_id);
    const { data: targetProfile, error: readError } = await supabaseAdmin
      .from("profiles")
      .select("is_active")
      .eq("id", data.user_id)
      .eq("tenant_id", data.tenant_id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!targetProfile) throw new Error("ملف المستخدم غير موجود داخل المؤسسة المحددة.");

    const is_active = data.status === "active";
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: is_active ? "none" : "876000h",
    });
    if (authError) throw new Error(authError.message);

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ status: data.status, is_active })
      .eq("id", data.user_id)
      .eq("tenant_id", data.tenant_id);
    if (error) {
      await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
        ban_duration: targetProfile.is_active ? "none" : "876000h",
      });
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const approveUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ user_id: uuid, tenant_id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, data.tenant_id, "users.approve");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertTargetUserManageable(context.supabase, supabaseAdmin, context.userId, data.user_id, data.tenant_id);
    const { data: targetProfile, error: readError } = await supabaseAdmin
      .from("profiles")
      .select("is_active")
      .eq("id", data.user_id)
      .eq("tenant_id", data.tenant_id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!targetProfile) throw new Error("ملف المستخدم غير موجود داخل المؤسسة المحددة.");

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: "none",
    });
    if (authError) throw new Error(authError.message);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        status: "active",
        is_active: true,
        approved_by: context.userId,
        approved_at: new Date().toISOString(),
      })
      .eq("id", data.user_id)
      .eq("tenant_id", data.tenant_id);
    if (error) {
      await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
        ban_duration: targetProfile.is_active ? "none" : "876000h",
      });
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const forcePasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ user_id: uuid, tenant_id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, data.tenant_id, "users.force_password_reset");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertTargetUserManageable(context.supabase, supabaseAdmin, context.userId, data.user_id, data.tenant_id);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", data.user_id)
      .eq("tenant_id", data.tenant_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------- Roles -------------------- */

export const createCustomRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        tenant_id: uuid,
        name: z.string().min(1).max(80),
        description: z.string().max(500).optional().nullable(),
        copy_from_builtin: z
          .enum(["owner", "manager", "accountant", "cashier", "warehouse", "waiter", "kitchen"])
          .optional()
          .nullable(),
        copy_from_custom: uuid.optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, data.tenant_id, "roles.manage");
    await assertTenantOwnerOrSuperOwner(context.supabase, context.userId, data.tenant_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: role, error } = await supabaseAdmin
      .from("custom_roles")
      .insert({
        tenant_id: data.tenant_id,
        name: data.name,
        description: data.description ?? null,
        copied_from_builtin: data.copy_from_builtin ?? null,
        copied_from_custom: data.copy_from_custom ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (data.copy_from_builtin || data.copy_from_custom) {
      const { error: cloneError } = await supabaseAdmin.rpc("clone_role_permissions", {
        _tenant_id: data.tenant_id,
        _dst_custom_role_id: role.id,
        _src_builtin: (data.copy_from_builtin ?? undefined) as any,
        _src_custom_role_id: (data.copy_from_custom ?? undefined) as any,
      });
      if (cloneError) {
        await supabaseAdmin.from("custom_roles").delete().eq("id", role.id).eq("tenant_id", data.tenant_id);
        throw new Error(cloneError.message);
      }
    }
    return { ok: true, id: role.id };
  });

export const deleteCustomRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: uuid, tenant_id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, data.tenant_id, "roles.manage");
    await assertTenantOwnerOrSuperOwner(context.supabase, context.userId, data.tenant_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("custom_roles").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setCustomRolePermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        tenant_id: uuid,
        custom_role_id: uuid,
        permission_key: z.string(),
        granted: z.boolean(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, data.tenant_id, "roles.manage");
    await assertTenantOwnerOrSuperOwner(context.supabase, context.userId, data.tenant_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: role, error: roleError } = await supabaseAdmin
      .from("custom_roles")
      .select("id")
      .eq("id", data.custom_role_id)
      .eq("tenant_id", data.tenant_id)
      .maybeSingle();
    if (roleError) throw new Error(roleError.message);
    if (!role) throw new Error("الدور المخصص لا يتبع المؤسسة المحددة.");

    const { data: permission, error: permissionError } = await supabaseAdmin
      .from("permissions")
      .select("key")
      .eq("key", data.permission_key)
      .maybeSingle();
    if (permissionError) throw new Error(permissionError.message);
    if (!permission) throw new Error("الصلاحية المطلوبة غير موجودة.");

    if (data.granted) {
      const { error } = await supabaseAdmin.from("role_permissions").insert({
        tenant_id: data.tenant_id,
        role_kind: "custom",
        custom_role_id: data.custom_role_id,
        permission_key: data.permission_key,
      });
      if (error && error.code !== "23505") throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("role_permissions")
        .delete()
        .eq("tenant_id", data.tenant_id)
        .eq("custom_role_id", data.custom_role_id)
        .eq("permission_key", data.permission_key);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/* -------------------- Notifications (architecture only) -------------------- */

export const createNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        tenant_id: uuid,
        audience_type: z.enum(["owner", "manager", "branch", "department", "user", "all"]),
        audience_id: uuid.nullable().optional(),
        kind: z.string().max(80),
        urgency: z.enum(["low", "normal", "urgent", "critical"]).default("normal"),
        title: z.string().min(1).max(200),
        body: z.string().max(2000).optional().nullable(),
        payload: z.record(z.string(), z.unknown()).default({}),
        scheduled_for: z.string().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, data.tenant_id, "notifications.manage");
    const { error } = await context.supabase.from("notifications").insert({
      ...data,
      audience_id: data.audience_id ?? null,
      body: data.body ?? null,
      scheduled_for: data.scheduled_for ?? null,
      payload: (data.payload ?? {}) as any,
      created_by: context.userId,
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------- UA helpers (no dependencies) -------------------- */

function deviceFromUA(ua: string | null | undefined): string | null {
  if (!ua) return null;
  if (/iPad/i.test(ua)) return "iPad";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? "Android Phone" : "Android Tablet";
  if (/Windows/i.test(ua)) return "Windows PC";
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Linux/i.test(ua)) return "Linux";
  return "Unknown";
}
function browserFromUA(ua: string | null | undefined): string | null {
  if (!ua) return null;
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\//i.test(ua)) return "Opera";
  if (/Chrome\//i.test(ua)) return "Chrome";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Safari\//i.test(ua)) return "Safari";
  return "Other";
}
function osFromUA(ua: string | null | undefined): string | null {
  if (!ua) return null;
  if (/Windows NT/i.test(ua)) return "Windows";
  if (/Mac OS X/i.test(ua)) return "macOS";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Other";
}
