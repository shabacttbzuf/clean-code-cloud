import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * List all super owners (with basic profile info).
 * Available to any authenticated user (SELECT policy is public).
 */
export const listSuperOwners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: owners, error } = await context.supabase
      .from("super_owners")
      .select("user_id, granted_at, granted_by, notes")
      .order("granted_at", { ascending: true });
    if (error) throw new Error(error.message);
    const ids = (owners ?? []).map((o) => o.user_id);
    if (ids.length === 0) return { owners: [] as Array<{ user_id: string; granted_at: string; full_name: string | null; email: string | null }> };
    const { data: profiles } = await context.supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);
    const map = new Map((profiles ?? []).map((p) => [p.id, p.full_name] as const));
    return {
      owners: (owners ?? []).map((o) => ({
        user_id: o.user_id,
        granted_at: o.granted_at,
        full_name: map.get(o.user_id) ?? null,
        email: null as string | null,
      })),
    };
  });

/**
 * Bootstrap the first super owner. Only works if the super_owners table is
 * currently empty. Any authenticated user can claim the role at that point.
 * After bootstrap, only existing super owners can grant new ones.
 */
export const bootstrapSuperOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count, error: countError } = await supabaseAdmin
      .from("super_owners")
      .select("*", { count: "exact", head: true });
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) > 0) {
      throw new Error("تم تعيين المالك الرئيسي مسبقاً. لا يمكن التسجيل الذاتي بعد الآن.");
    }
    const { error } = await supabaseAdmin
      .from("super_owners")
      .insert({ user_id: context.userId, granted_by: context.userId, notes: "Bootstrap" });
    if (error) throw new Error(error.message);
    return { ok: true, user_id: context.userId };
  });

/**
 * Grant super-owner privileges to another user (by email).
 * Caller MUST already be a super owner.
 */
export const grantSuperOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ email: z.string().email(), notes: z.string().max(500).optional() }).parse(data))
  .handler(async ({ data, context }) => {
    // Verify caller is super owner
    const { data: isSO, error: rpcErr } = await context.supabase.rpc("is_super_owner", { _user_id: context.userId });
    if (rpcErr) throw new Error(rpcErr.message);
    if (!isSO) throw new Error("غير مصرح: هذا الإجراء للمالك الرئيسي فقط.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Look up user by email via Admin API
    const { data: usersPage, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listErr) throw new Error(listErr.message);
    const target = usersPage.users.find((u) => u.email?.toLowerCase() === data.email.toLowerCase());
    if (!target) throw new Error("لا يوجد مستخدم بهذا البريد.");

    const { error } = await supabaseAdmin.from("super_owners").insert({
      user_id: target.id,
      granted_by: context.userId,
      notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true, user_id: target.id };
  });

/**
 * Revoke super-owner privileges from a user. Cannot revoke self.
 */
export const revokeSuperOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ user_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    if (data.user_id === context.userId) throw new Error("لا يمكنك إزالة نفسك.");
    const { data: isSO } = await context.supabase.rpc("is_super_owner", { _user_id: context.userId });
    if (!isSO) throw new Error("غير مصرح.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("super_owners").delete().eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Toggle a permission on a built-in role (global default, tenant_id NULL).
 * Super owner only.
 */
export const toggleRolePermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        role: z.enum(["owner", "manager", "cashier", "accountant", "warehouse", "waiter", "kitchen"]),
        permission_key: z.string().min(1),
        enabled: z.boolean(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: isSO } = await context.supabase.rpc("is_super_owner", { _user_id: context.userId });
    if (!isSO) throw new Error("غير مصرح: للمالك الرئيسي فقط.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.enabled) {
      const { error } = await supabaseAdmin.from("role_permissions").insert({
        tenant_id: null,
        role_kind: "builtin",
        // deno-lint-ignore no-explicit-any
        builtin_role: data.role as never,
        permission_key: data.permission_key,
      });
      if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("role_permissions")
        .delete()
        .is("tenant_id", null)
        .eq("role_kind", "builtin")
        // deno-lint-ignore no-explicit-any
        .eq("builtin_role", data.role as never)
        .eq("permission_key", data.permission_key);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
