## 2025-05-27 - Supabase Edge Function Security Verification
**Vulnerability:** Supabase Edge Functions using `supabase.auth.getClaims(token)` for user session verification.
**Learning:** `getClaims(token)` only performs local JWT signature verification. It doesn't check if the user is still active, banned, or if the token has been revoked on the Supabase Auth server.
**Prevention:** Always use `supabase.auth.getUser(token)` in Edge Functions to ensure the token is verified against the Auth server for valid, active sessions.
