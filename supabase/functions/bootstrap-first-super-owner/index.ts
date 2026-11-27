import { createClient } from "npm:@supabase/supabase-js@2";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readAllowedOrigins(): Set<string> {
  const configured = Deno.env.get("APP_ALLOWED_ORIGINS") ?? "";
  const origins = new Set<string>();
  for (const entry of configured.split(",")) {
    const value = entry.trim();
    if (!value) continue;
    try {
      const parsed = new URL(value);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        origins.add(parsed.origin);
      }
    } catch {
      // Invalid configured origins are ignored; browser requests then fail closed.
    }
  }
  return origins;
}

const allowedOrigins = readAllowedOrigins();

function getCorsHeaders(req: Request): Record<string, string> | null {
  const origin = req.headers.get("Origin");
  if (origin && !allowedOrigins.has(origin)) return null;

  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(status: number, body: Record<string, unknown>, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (!cors) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403,
      headers: { "Content-Type": "application/json", "Vary": "Origin" },
    });
  }

  if (req.method === "OPTIONS") return new Response("ok", { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" }, cors);

  try {
    const initialOwnerId = Deno.env.get("INITIAL_SUPER_OWNER_USER_ID")?.trim();
    if (!initialOwnerId || !UUID_PATTERN.test(initialOwnerId)) {
      console.error("INITIAL_SUPER_OWNER_USER_ID is missing or invalid");
      return json(500, { error: "Initial owner configuration is incomplete" }, cors);
    }

    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return json(401, { error: "Authentication required" }, cors);
    }
    const token = authorization.slice("Bearer ".length).trim();
    if (!token) return json(401, { error: "Authentication required" }, cors);

    const url = Deno.env.get("SUPABASE_URL");
    const publishableKeysRaw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
    const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (!url || !publishableKeysRaw || !secretKeysRaw) {
      console.error("Required Supabase function environment is missing");
      return json(500, { error: "Server configuration is incomplete" }, cors);
    }

    const publishableKeys = JSON.parse(publishableKeysRaw);
    const secretKeys = JSON.parse(secretKeysRaw);
    const publishableKey = publishableKeys.default;
    const secretKey = secretKeys.default;
    if (!publishableKey || !secretKey) {
      console.error("Default Supabase API keys are unavailable");
      return json(500, { error: "Server keys are unavailable" }, cors);
    }

    const authClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData.user) {
      return json(401, { error: "Invalid or expired session" }, cors);
    }
    if (userData.user.id !== initialOwnerId) {
      return json(403, { error: "This account is not authorized for initial owner setup" }, cors);
    }

    const admin = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // The one-time setup path is disabled as soon as any Super Owner exists.
    const { data: existingOwner, error: ownerLookupError } = await admin
      .from("super_owners")
      .select("user_id")
      .limit(1)
      .maybeSingle();
    if (ownerLookupError) {
      console.error("Could not verify initial owner setup state");
      return json(500, { error: "Could not verify initial owner setup state" }, cors);
    }
    if (existingOwner) {
      return json(409, { error: "Initial super owner has already been configured" }, cors);
    }

    const { error: bootstrapError } = await admin.rpc("bootstrap_first_super_owner", {
      _user_id: initialOwnerId,
    });
    if (bootstrapError) {
      console.error("Initial owner bootstrap failed:", bootstrapError.message);
      if (bootstrapError.message.includes("already been configured")) {
        return json(409, { error: "Initial super owner has already been configured" }, cors);
      }
      return json(500, { error: "Could not configure the initial super owner" }, cors);
    }

    return json(200, { success: true, message: "Initial super owner configured" }, cors);
  } catch {
    console.error("Unexpected bootstrap error");
    return json(500, { error: "Unexpected server error" }, cors);
  }
});
