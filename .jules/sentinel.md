# Sentinel Journal 🛡️

## 2025-05-15 - Use getUser for real-time auth verification
**Vulnerability:** `getClaims(token)` only performs local signature verification and does not check if a user is banned or their session is revoked.
**Learning:** Supabase Edge Functions should use `supabase.auth.getUser(token)` to ensure the token is checked against the Supabase Auth server.
**Prevention:** Always use `getUser(token)` in `getAuthUser` or similar auth verification helpers in Edge Functions.
