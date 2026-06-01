# Sentinel's Journal 🛡️

## 2025-05-22 - SSRF Vulnerability in PDF Generation
**Vulnerability:** The `api/pdf.ts` endpoint was vulnerable to SSRF because `new URL(source, request.url)` allows `source` values starting with `//` or `/\\` to resolve to external origins, bypassing simple path checks like `startsWith("/")`.
**Learning:** `new URL(path, base)` interprets paths starting with `//` as protocol-relative URLs, switching the origin. Path validation must be more robust than just checking the first character.
**Prevention:** Enforce origin matching between the resolved target URL and the request URL, and explicitly block protocol-relative paths.

## 2025-05-22 - Insecure Local JWT Verification
**Vulnerability:** Supabase Edge Functions used `supabase.auth.getClaims(token)`, which only performs local JWT signature verification.
**Learning:** Local verification does not check if a user has been banned, deleted, or if their session has been revoked. `supabase.auth.getUser(token)` is required for full server-side validation.
**Prevention:** Always use `getUser(token)` instead of `getClaims(token)` for authenticating user sessions in Edge Functions.
