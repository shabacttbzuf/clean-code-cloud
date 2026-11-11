import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_INITIAL_OWNER_ID = "bc6e84c8-9f68-473e-b51f-6fef900b779d";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json(401, { error: "Authentication required" });
    const token = authorization.slice("Bearer ".length).trim();
    if (!token) return json(401, { error: "Authentication required" });

    const url = Deno.env.get("SUPABASE_URL");
    const publishableKeysRaw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
    const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (!url || !publishableKeysRaw || !secretKeysRaw) {
      console.error("Required Supabase function environment is missing");
      return json(500, { error: "Server configuration is incomplete" });
    }

    const publishableKeys = JSON.parse(publishableKeysRaw);
    const secretKeys = JSON.parse(secretKeysRaw);
    const publishableKey = publishableKeys.default;
    const secretKey = secretKeys.default;
    if (!publishableKey || !secretKey) {
      console.error("Default Supabase API keys are unavailable");
      return json(500, { error: "Server keys are unavailable" });
    }

    const authClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData.user) return json(401, { error: "Invalid or expired session" });
    if (userData.user.id !== ALLOWED_INITIAL_OWNER_ID) {
      return json(403, { error: "This account is not authorized for initial owner setup" });
    }

    const admin = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: bootstrapError } = await admin.rpc("bootstrap_first_super_owner", {
      _user_id: ALLOWED_INITIAL_OWNER_ID,
    });
    if (bootstrapError) {
      console.error("Initial owner bootstrap failed:", bootstrapError.message);
      if (bootstrapError.message.includes("already been configured")) {
        return json(409, { error: "Initial super owner has already been configured" });
      }
      return json(500, { error: "Could not configure the initial super owner" });
    }

    return json(200, { success: true, message: "Initial super owner configured" });
  } catch (error) {
    console.error("Unexpected bootstrap error:", error);
    return json(500, { error: "Unexpected server error" });
  }
});
