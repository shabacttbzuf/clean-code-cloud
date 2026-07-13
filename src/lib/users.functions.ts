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

async function assertTenantAdmin(
  supabase: any,
  userId: string,
  tenantId: string,
) {
  const { data: isSO } = await supabase.rpc("is_super_owner", { _user_id: userId });
  if (isSO) return;
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("owner") && !roles.includes("manager")) {
    throw new Error("غير مصرح: هذا الإجراء للمالك أو المدير فقط.");
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
        password: z.string().min(6),
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
    await assertTenantAdmin(context.supabase, context.userId, data.tenant_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
    if (profErr) throw new Error(profErr.message);

    // Assign role
    const { error: roleErr } = await supabaseAdmin.from("user_roles").insert({
      user_id: newId,
      tenant_id: data.tenant_id,
      role: data.role as any,
      branch_id: data.branch_id ?? null,
      hired_by: context.userId,
    });
    if (roleErr) throw new Error(roleErr.message);

    // Also stamp hired_by on profile for quick lookups
    await supabaseAdmin.from("profiles").update({ hired_by: context.userId }).eq("id", newId);

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
        new_password: z.string().min(6),
        tenant_id: z.string().uuid().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    if (data.user_id !== context.userId) {
      if (!data.tenant_id) throw new Error("tenant_id مطلوب لتغيير كلمة مرور مستخدم آخر.");
      await assertTenantAdmin(context.supabase, context.userId, data.tenant_id);
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
    await assertTenantAdmin(context.supabase, context.userId, data.tenant_id);
    if (data.user_id === context.userId && !data.is_active) {
      throw new Error("لا يمكنك إيقاف حسابك بنفسك.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: data.is_active })
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);
    // Also disable auth login on the auth side
    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: data.is_active ? "none" : "876000h", // ~100 years
    });
    if (authErr) throw new Error(authErr.message);
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
    await assertTenantAdmin(context.supabase, context.userId, data.tenant_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .update({ branch_id: data.branch_id })
      .eq("id", data.user_role_id)
      .eq("tenant_id", data.tenant_id);
    if (error) throw new Error(error.message);
    // Also update the profile's primary branch to match
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("id", data.user_role_id)
      .single();
    if (roleRow) {
      await supabaseAdmin
        .from("profiles")
        .update({ branch_id: data.branch_id })
        .eq("id", roleRow.user_id);
    }
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
    await assertTenantAdmin(context.supabase, context.userId, data.tenant_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Remove any previous role rows for this user in this tenant
    const { error: delErr } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id)
      .eq("tenant_id", data.tenant_id);
    if (delErr) throw new Error(delErr.message);
    const { error: insErr } = await supabaseAdmin.from("user_roles").insert({
      user_id: data.user_id,
      tenant_id: data.tenant_id,
      role: data.role as any,
      branch_id: data.branch_id ?? null,
    });
    if (insErr) throw new Error(insErr.message);
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

