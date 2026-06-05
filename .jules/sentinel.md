## 2025-05-14 - Use getUser for secure session verification
**Vulnerability:** Supabase Edge Functions using `getClaims(token)` only perform local signature verification, which doesn't check for user revocation or bans on the Supabase Auth server.
**Learning:** `supabase.auth.getUser(token)` should be used in Edge Functions for user session verification to ensure the token is checked against the Supabase Auth server.
**Prevention:** Always use `getUser` for authenticating users in server-side contexts like Edge Functions.
