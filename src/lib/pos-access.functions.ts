import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const tenantInput = z.object({ tenant_id: z.string().uuid() });
const passcodeInput = z.object({
  tenant_id: z.string().uuid(),
  passcode: z.string().min(8).max(128),
});

async function assertOwnTenantAccess(supabase: any, userId: string, tenantId: string) {
  const { data: isSuperOwner, error: ownerError } = await supabase.rpc("is_super_owner", { _user_id: userId });
  if (ownerError) throw new Error(ownerError.message);
  if (isSuperOwner === true) return;

  const { data, error } = await supabase.from("user_roles")
    .select("id").eq("user_id", userId).eq("tenant_id", tenantId).limit(1);
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("لا تملك حساباً نشطاً ضمن المؤسسة المحددة.");
}

/** Returns only whether the signed-in user has configured a POS passphrase. */
export const getMyPosAccessStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => tenantInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertOwnTenantAccess(context.supabase, context.userId, data.tenant_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: credential, error } = await supabaseAdmin.from("pos_access_credentials")
      .select("user_id").eq("tenant_id", data.tenant_id).eq("user_id", context.userId).maybeSingle();
    if (error) throw new Error(error.message);
    return { configured: !!credential };
  });

/** Stores a per-user, per-tenant passphrase hash. Plaintext is never persisted. */
export const setMyPosPasscode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => passcodeInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertOwnTenantAccess(context.supabase, context.userId, data.tenant_id);
    const { randomBytes, scryptSync } = await import("node:crypto");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const salt = randomBytes(16).toString("hex");
    const passwordHash = scryptSync(data.passcode, salt, 64).toString("hex");
    const { error } = await supabaseAdmin.from("pos_access_credentials").upsert({
      tenant_id: data.tenant_id,
      user_id: context.userId,
      password_salt: salt,
      password_hash: passwordHash,
      failed_attempts: 0,
      locked_until: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "tenant_id,user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Verifies only the caller's passphrase and rate-limits failed attempts. */
export const verifyMyPosPasscode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => passcodeInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertOwnTenantAccess(context.supabase, context.userId, data.tenant_id);
    const { scryptSync, timingSafeEqual } = await import("node:crypto");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: credential, error } = await supabaseAdmin.from("pos_access_credentials")
      .select("password_salt,password_hash,failed_attempts,locked_until")
      .eq("tenant_id", data.tenant_id).eq("user_id", context.userId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!credential) throw new Error("لم يتم إعداد كلمة مرور نقطة البيع لهذا الحساب. أعد إعدادها من ملفك الشخصي.");

    const now = Date.now();
    const lockedUntil = credential.locked_until ? new Date(credential.locked_until).getTime() : 0;
    if (Number.isFinite(lockedUntil) && lockedUntil > now) {
      return { ok: false, locked: true, retry_after: credential.locked_until };
    }

    const candidate = scryptSync(data.passcode, credential.password_salt, 64);
    const expected = Buffer.from(credential.password_hash, "hex");
    const matches = expected.length === candidate.length && timingSafeEqual(candidate, expected);
    if (!matches) {
      const failedAttempts = Number(credential.failed_attempts ?? 0) + 1;
      const nextLock = failedAttempts >= 5 ? new Date(now + 15 * 60 * 1000).toISOString() : null;
      const { error: updateError } = await supabaseAdmin.from("pos_access_credentials").update({
        failed_attempts: failedAttempts >= 5 ? 0 : failedAttempts,
        locked_until: nextLock,
        updated_at: new Date().toISOString(),
      }).eq("tenant_id", data.tenant_id).eq("user_id", context.userId);
      if (updateError) throw new Error(updateError.message);
      return { ok: false, locked: !!nextLock, retry_after: nextLock };
    }

    const { error: resetError } = await supabaseAdmin.from("pos_access_credentials").update({
      failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString(),
    }).eq("tenant_id", data.tenant_id).eq("user_id", context.userId);
    if (resetError) throw new Error(resetError.message);
    return { ok: true, locked: false };
  });
