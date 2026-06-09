## 2025-05-22 - Auth Verification via getClaims vs getUser
**Vulnerability:** The `getAuthUser` implementation used `getClaims(token)`, which only performs local JWT signature verification. This allows revoked or banned users to continue accessing protected endpoints until their token expires.
**Learning:** `getClaims` is insufficient for session verification in a secure application as it bypasses the central authority check. `getUser(token)` is required to validate the session against the Supabase Auth server.
**Prevention:** Strictly use `supabase.auth.getUser(token)` for user session verification in all Edge Functions to ensure real-time enforcement of user status and token validity.
