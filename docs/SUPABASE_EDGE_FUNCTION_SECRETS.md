# Supabase Edge Function secrets — initial Super Owner bootstrap

The `bootstrap-first-super-owner` Edge Function is a one-time, server-only bootstrap path. Configure the following values in Supabase Edge Function secrets; never commit their values or expose them through `VITE_*` variables.

| Secret | Purpose |
|---|---|
| `INITIAL_SUPER_OWNER_USER_ID` | Exact UUID of the one authorized initial owner account. Must match the authenticated Supabase user ID. |
| `APP_ALLOWED_ORIGINS` | Comma-separated exact browser origins allowed to invoke this function. No wildcard origins are accepted. |
| `SUPABASE_URL` | Supabase project URL used by the Edge Function runtime. |
| `SUPABASE_PUBLISHABLE_KEYS` | Supabase publishable key configuration supplied to the function runtime. |
| `SUPABASE_SECRET_KEYS` | Server-only Supabase secret key configuration supplied to the function runtime. |

## Origin configuration

Use exact origins only, including scheme and hostname, with no path. For example:

```text
https://your-production-domain.example,https://your-exact-preview-domain.example
```

Add a local development origin only when intentionally testing the bootstrap flow locally. Do not use `*` or a broad `*.vercel.app` wildcard.

## One-time lifecycle

1. Create the intended initial user account through the normal Supabase Auth process.
2. Set `INITIAL_SUPER_OWNER_USER_ID` to that account's UUID and configure exact `APP_ALLOWED_ORIGINS`.
3. Invoke the Edge Function with that user's valid Bearer session.
4. The function checks the authenticated user ID and checks that no Super Owner exists before invoking the atomic service-role RPC.
5. After the first Super Owner is created, the function returns HTTP 409 for subsequent calls. Remove `INITIAL_SUPER_OWNER_USER_ID` from Edge Function secrets to disable the bootstrap path entirely.

The function fails closed if the initial-owner secret is missing/invalid or if a browser origin is not allowlisted. The function must be redeployed after code changes; secrets are configured separately in Supabase and are not part of Vercel's browser environment.

No production Edge Function deployment or secret change is performed by this repository change.
