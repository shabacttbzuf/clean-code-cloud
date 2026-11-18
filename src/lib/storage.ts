import { supabase } from "@/integrations/supabase/client";

/**
 * Resolve a stored profile avatar reference. Legacy public URLs remain supported;
 * private avatars are stored as "private://<bucket path>" and get short-lived
 * signed URLs under the caller's storage RLS permissions.
 */
export async function resolveAvatarUrl(
  value: string | null | undefined,
): Promise<string | null> {
  if (!value) return null;
  if (!value.startsWith("private://")) return value;

  const path = value.slice("private://".length);
  const parts = path.split("/");
  if (
    parts.length !== 4 ||
    !/^[0-9a-f-]{36}$/i.test(parts[0]) ||
    parts[1] !== "profiles" ||
    !/^[0-9a-f-]{36}$/i.test(parts[2]) ||
    !/^[a-zA-Z0-9._-]+$/.test(parts[3])
  ) {
    throw new Error("مسار الصورة الشخصية غير صالح");
  }

  const { data, error } = await supabase.storage
    .from("restaurant-private-assets")
    .createSignedUrl(path, 60 * 60 * 24);
  if (error) throw error;
  return data.signedUrl;
}
