# Sentinel's Journal

## 2025-05-14 - Robust Auth Verification and Error Sanitization
**Vulnerability:** Weak user verification in Edge Functions and internal info leakage in error responses.
**Learning:** `supabase.auth.getClaims(token)` only performs local JWT decoding/verification, which misses revoked sessions or banned users. Additionally, `errorResponse` was previously returning detailed internal messages (like DB error strings) to the client on 500 errors.
**Prevention:** Always use `supabase.auth.getUser(token)` for server-side auth verification to ensure the session is still valid on the Auth server. Sanitize 500 error responses to return generic "Internal server error" while logging details to the server console.
