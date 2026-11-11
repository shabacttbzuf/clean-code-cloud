import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ROLE_ENUM = z.enum([
  "owner",
  "manager",
  "cashier",
  "accountant",
  "warehouse",
  "waiter",
  "kitchen",
]);

async function assertPermission(supabase: any, userId: string, tenantId: string, permissionKey: string) {
  const { data, error } = await supabase.rpc("has_permission", {
    _user_id: userId,
    _tenant_id: tenantId,
    _permission_key: permissionKey,
  });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error(`غير مصرح: الصلاحية المطلوبة ${permissionKey}.`);
}
async function assertTargetBelongsToTenant(
  supabaseAdmin: any,
  targetUserId: string,
  tenantId: string,
) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", targetUserId)
    .eq("tenant_id", tenantId)
    .limit(1);
  if (error) throw new Error(error.message);
  if (!data?.length) {
    throw new Error("المستخدم المستهدف لا ينتمي إلى المؤسسة المحددة.");
  }
}

async function assertBranchBelongsToTenant(
  supabaseAdmin: any,
  branchId: string | null | undefined,
  tenantId: string,
) {
  if (!branchId) return;
  const { data, error } = await supabaseAdmin
    .from("branches")
    .select("id")
    .eq("id", branchId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("الفرع المحدد لا يتبع المؤسسة المطلوبة.");
}

async function assertCanAssignRole(
  supabase: any,
  actorId: string,
  tenantId: string,
  role: string,
) {
  if (role !== "owner" && role !== "manager") return;
  const { data: isSuperOwner, error: superOwnerError } = await supabase.rpc(
    "is_super_owner",
    { _user_id: actorId },
  );
  if (superOwnerError) throw new Error(superOwnerError.message);
  if (isSuperOwner) return;

  const { data, error } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", actorId)
    .eq("tenant_id", tenantId)
    .eq("role", "owner")
    .limit(1);
  if (error) throw new Error(error.message);
  if (!data?.length) {
    throw new Error("لا يحق للمدير منح صلاحيات المالك أو المدير.");
  }
}

async function assertTargetRoleManageable(
  supabase: any,
  supabaseAdmin: any,
  actorId: string,
  targetUserId: string,
  tenantId: string,
) {
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

  const { data: targetRoles, error: targetError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", targetUserId)
    .eq("tenant_id", tenantId);
  if (targetError) throw new Error(targetError.message);
  if ((targetRoles ?? []).some((r: any) => ["owner", "manager"].includes(r.role))) {
    throw new Error("لا يحق للمدير إدارة حساب مالك المؤسسة أو مدير آخر.");
  }
}

/**
 * Create a new user (auth account + profile + role assignment) inside a tenant.
 * Caller must be Super Owner OR owner/manager of the given tenant.
 */
export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        tenant_id: z.string().uuid(),
        email: z.string().email(),
        password: z.string().min(8),
        full_name: z.string().min(1).max(120),
        username: z.string().min(2).max(60).optional().nullable(),
        phone: z.string().max(30).optional().nullable(),
        role: ROLE_ENUM,
        branch_id: z.string().uuid().optional().nullable(),
        avatar_url: z.string().url().optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: actorIsSuperOwner, error: actorRoleError } = await context.supabase.rpc(
      "is_super_owner",
      { _user_id: context.userId },
    );
    if (actorRoleError) throw new Error(actorRoleError.message);

    // Platform Super Owner provisions ONLY the institution owner account.
    // All operational staff accounts must be created by that institution's owner.
    if (actorIsSuperOwner && data.role !== "owner") {
      throw new Error("المالك الأعلى ينشئ حساب مالك المؤسسة فقط. يجب على مالك المؤسسة إنشاء حسابات الموظفين.");
    }
    if (!actorIsSuperOwner && data.role === "owner") {
      throw new Error("إنشاء حساب مالك المؤسسة مخصص للمالك الأعلى للمنصة.");
    }

    await assertPermission(context.supabase, context.userId, data.tenant_id, "users.create");
    await assertCanAssignRole(context.supabase, context.userId, data.tenant_id, data.role);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (actorIsSuperOwner) {
      const { data: tenantRecord, error: tenantReadError } = await supabaseAdmin
        .from("tenants")
        .select("id, owner_id")
        .eq("id", data.tenant_id)
        .maybeSingle();
      if (tenantReadError) throw new Error(tenantReadError.message);
      if (!tenantRecord) throw new Error("المؤسسة المحددة غير موجودة.");
      if (tenantRecord.owner_id && tenantRecord.owner_id !== context.userId) {
        throw new Error("هذه المؤسسة مرتبطة بمالك آخر بالفعل.");
      }
    }
    await assertBranchBelongsToTenant(supabaseAdmin, data.branch_id, data.tenant_id);

    // Create auth user (auto-confirm so they can sign in immediately)
    const { data: created, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (authErr) throw new Error(authErr.message);
    const newId = created.user.id;

    // Upsert profile (the handle_new_user trigger creates a minimal one)
    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: newId,
        full_name: data.full_name,
        username: data.username ?? null,
        phone: data.phone ?? null,
        avatar_url: data.avatar_url ?? null,
        tenant_id: data.tenant_id,
        branch_id: data.branch_id ?? null,
        is_active: true,
      });
    if (profErr) {
      await supabaseAdmin.auth.admin.deleteUser(newId);
      throw new Error(profErr.message);
    }

    // Assign role
    const { error: roleErr } = await supabaseAdmin.from("user_roles").insert({
      user_id: newId,
      tenant_id: data.tenant_id,
      role: data.role as any,
      branch_id: data.branch_id ?? null,
      hired_by: context.userId,
    });
    if (roleErr) {
      await supabaseAdmin.auth.admin.deleteUser(newId);
      throw new Error(roleErr.message);
    }

    // Also stamp hired_by on profile for quick lookups
    const { error: hiredByError } = await supabaseAdmin
      .from("profiles")
      .update({ hired_by: context.userId })
      .eq("id", newId);
    if (hiredByError) {
      await supabaseAdmin.auth.admin.deleteUser(newId);
      throw new Error(hiredByError.message);
    }

    return { ok: true, user_id: newId };
  });

/**
 * Update user password. Caller must be tenant admin of a tenant the target belongs to,
 * or Super Owner, or the user themselves.
 */
export const updateUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        user_id: z.string().uuid(),
        new_password: z.string().min(8),
        tenant_id: z.string().uuid().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    if (data.user_id !== context.userId) {
      if (!data.tenant_id) throw new Error("tenant_id مطلوب لتغيير كلمة مرور مستخدم آخر.");
      await assertPermission(context.supabase, context.userId, data.tenant_id, "users.change_password");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.user_id !== context.userId) {
      await assertTargetBelongsToTenant(supabaseAdmin, data.user_id, data.tenant_id!);
      await assertTargetRoleManageable(context.supabase, supabaseAdmin, context.userId, data.user_id, data.tenant_id!);
    }
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.new_password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Toggle a user's active status inside a tenant.
 */
export const toggleUserStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        user_id: z.string().uuid(),
        tenant_id: z.string().uuid(),
        is_active: z.boolean(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, data.tenant_id, data.is_active ? "users.approve" : "users.suspend");
    if (data.user_id === context.userId && !data.is_active) {
      throw new Error("لا يمكنك إيقاف حسابك بنفسك.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertTargetBelongsToTenant(supabaseAdmin, data.user_id, data.tenant_id);
    await assertTargetRoleManageable(context.supabase, supabaseAdmin, context.userId, data.user_id, data.tenant_id);
    const { data: targetProfile, error: profileReadError } = await supabaseAdmin
      .from("profiles")
      .select("is_active")
      .eq("id", data.user_id)
      .eq("tenant_id", data.tenant_id)
      .maybeSingle();
    if (profileReadError) throw new Error(profileReadError.message);
    if (!targetProfile) throw new Error("ملف المستخدم غير موجود داخل المؤسسة المحددة.");

    // Change the Auth ban first; restore it if the profile write fails.
    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: data.is_active ? "none" : "876000h",
    });
    if (authErr) throw new Error(authErr.message);

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: data.is_active })
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

/**
 * Transfer a user's role assignment to a different branch of the same tenant.
 */
export const transferUserToBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        user_role_id: z.string().uuid(),
        tenant_id: z.string().uuid(),
        branch_id: z.string().uuid().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, data.tenant_id, "users.change_branch");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roleTarget, error: roleTargetError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("id", data.user_role_id)
      .eq("tenant_id", data.tenant_id)
      .maybeSingle();
    if (roleTargetError) throw new Error(roleTargetError.message);
    if (!roleTarget) throw new Error("تعيين المستخدم غير موجود داخل المؤسسة المحددة.");
    await assertTargetRoleManageable(context.supabase, supabaseAdmin, context.userId, roleTarget.user_id, data.tenant_id);
    const { error } = await supabaseAdmin.rpc("transfer_user_role_branch", {
      _user_role_id: data.user_role_id,
      _tenant_id: data.tenant_id,
      _branch_id: data.branch_id,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Change a user's role in a tenant (replaces existing role rows for that tenant).
 */
export const changeUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        user_id: z.string().uuid(),
        tenant_id: z.string().uuid(),
        role: ROLE_ENUM,
        branch_id: z.string().uuid().optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, data.tenant_id, "users.change_role");
    await assertCanAssignRole(context.supabase, context.userId, data.tenant_id, data.role);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertTargetBelongsToTenant(supabaseAdmin, data.user_id, data.tenant_id);
    await assertTargetRoleManageable(context.supabase, supabaseAdmin, context.userId, data.user_id, data.tenant_id);
    const { error } = await supabaseAdmin.rpc("replace_user_role_in_tenant", {
      _user_id: data.user_id,
      _tenant_id: data.tenant_id,
      _role: data.role,
      _branch_id: data.branch_id ?? null,
      _actor_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Update the caller's own profile (name, username, phone, avatar).
 */
export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        full_name: z.string().min(1).max(120).optional(),
        username: z.string().min(2).max(60).optional().nullable(),
        phone: z.string().max(30).optional().nullable(),
        avatar_url: z.string().url().optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const patch: {
      full_name?: string;
      username?: string | null;
      phone?: string | null;
      avatar_url?: string | null;
    } = {};
    if (data.full_name !== undefined) patch.full_name = data.full_name;
    if (data.username !== undefined) patch.username = data.username;
    if (data.phone !== undefined) patch.phone = data.phone;
    if (data.avatar_url !== undefined) patch.avatar_url = data.avatar_url;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await context.supabase
      .from("profiles")
      .update(patch)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

