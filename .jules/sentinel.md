# Sentinel Security Journal

## 2025-05-14 - Insecure Session Verification in Edge Functions
**Vulnerability:** The `getAuthUser` implementation in `supabase/functions/_shared/supabase-client.ts` utilized `auth.getClaims(token)`, which only performs local JWT signature verification. This bypasses server-side checks for session revocation, user bans, or account deletions.
**Learning:** While `getClaims` is faster for simple client-side checks, Edge Functions performing sensitive operations (like admin tasks) must use `getUser` to ensure the session is still valid according to the Supabase Auth server.
**Prevention:** Always use `supabase.auth.getUser(token)` for user session verification in Supabase Edge Functions.
