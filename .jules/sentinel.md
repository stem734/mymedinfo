## 2025-06-14 - Prevent Stored XSS via URL Fields
**Vulnerability:** The `save-medication` and `save-practice-medication-card` Edge Functions accepted `nhs_link` and `trend_links` URLs without protocol validation. An attacker could inject `javascript:` URIs (e.g., `javascript:alert('xss')`) or `data:` URIs that would execute when rendered in the frontend.
**Learning:** User-supplied URLs must be validated to only allow safe protocols (http:// and https://). Dangerous protocols like `javascript:`, `data:`, `vbscript:`, and `file:` can execute arbitrary code in the browser. URL validation must happen server-side before storing data, not relying on frontend sanitization alone.
**Prevention:** Always validate URLs using the URL API to parse the protocol. Reject any URLs that don't use http: or https: protocols. Apply this validation both when accepting user input and before rendering URLs in href/src attributes on the frontend.

## 2025-06-14 - Add IP-Based Rate Limiting to Practice Signup
**Vulnerability:** The `submit-practice-signup` Edge Function only enforced email-based rate limiting (max 3 signups per email per day). An attacker could bypass this by using multiple email addresses to spam signup requests from a single IP address.
**Learning:** Email-only rate limiting is insufficient for preventing abuse. Attackers can easily generate new email addresses (e.g., via temporary email services) or mass-create accounts. IP-based rate limiting provides a secondary defense layer that is harder to bypass without distributed infrastructure.
**Prevention:** Implement multi-factor rate limiting: combine email-based checks with IP-based checks. Store the client IP address (`x-forwarded-for`, `cf-connecting-ip`, or `x-client-ip` headers) with each signup request and enforce limits on both email and IP dimensions independently. Use database indexes on (ip, timestamp) for efficient rate limit checks.

## 2025-06-14 - Prevent Admin Password Reset Link Leakage
**Vulnerability:** The `send-admin-password-reset` and `create-admin-user` Edge Functions returned the `resetLink` in their JSON responses, allowing an attacker to intercept the API response and bypass secure email delivery. An attacker could call these endpoints, extract the resetLink from the response, and reset another admin's password without their knowledge or email verification.
**Learning:** Security-sensitive tokens (password reset links, email verification links, MFA codes) must ONLY be transmitted via secure out-of-band channels (email, SMS, authenticator apps), never in API responses. Even if the API uses HTTPS, logging, monitoring, or proxy systems may record the response, exposing the sensitive token.
**Prevention:** Always send sensitive tokens via email/SMS only. Return generic success messages (e.g., `{ success: true }`) without exposing the actual token. Log the token transmission only to secure internal logs, never in structured API responses.

## 2025-05-15 - Hardening PDF Generation API
**Vulnerability:** The `api/pdf.ts` endpoint was vulnerable to potential SSRF bypasses via control characters, header injection in `Content-Disposition`, and information disclosure via unmasked 500 error messages. It also lacked standard security headers.
**Learning:** Even with basic path checks (e.g., `startsWith("/")`), non-printable control characters (like `%00`) can sometimes bypass filters or cause unexpected behavior in URL resolution and header generation. Leaking stack traces or raw error messages in serverless functions can expose sensitive backend infrastructure details.
**Prevention:** Always strip control characters `[\x00-\x1F\x7F]` from user-supplied strings used in URLs or headers. Sanitize error responses to return generic messages while logging details internally. Apply defense-in-depth security headers like `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY` even on API endpoints.

## 2025-06-15 - Protocol Validation for Global Card Templates
**Vulnerability:** The `save-card-template` Edge Function accepted arbitrary strings for `website`, `nhsLinks`, and `videoUrl` without protocol validation. This allowed Stored XSS via `javascript:` or `data:` URIs in the global template library.
**Learning:** Security validation must be applied to all entry points that store user-supplied URLs, including those in nested JSON payloads or complex objects. Relying on "admin-only" access is not enough; defense-in-depth requires server-side validation to prevent malicious data from entering the system.
**Prevention:** Implement recursive or targeted protocol checks (allowing only http: and https:) for all URL-like fields within JSON payloads. Use `Record<string, unknown>` and safe casting in TypeScript Edge Functions to maintain type safety while performing these security checks.

## 2025-06-16 - Safe User Deactivation in Supabase Auth
**Vulnerability:** The `update-admin-user` Edge Function incorrectly unbanned users when they were deactivated due to a logic reversal (`isActive === false ? 'none' : ...`). Additionally, a simple boolean check for deactivation can cause security regressions during partial updates if the field is missing, leading to unintended unbanning of previously deactivated users.
**Learning:** `ban_duration` in Supabase Auth must be set to a duration (e.g., '876600h') to deactivate and 'none' to reactivate. Partial updates must explicitly check for `true` and `false` to avoid overwriting the ban status when the field is omitted from the request payload.
**Prevention:** Always use explicit equality checks (e.g., `isActive === false ? '876600h' : isActive === true ? 'none' : undefined`) when updating Auth metadata or ban status to ensure state is only changed when intended.

## 2025-06-17 - Rate Limiting Public Password Resets
**Vulnerability:** The public `send-password-reset` Edge Function lacked rate limiting, allowing automated scripts to flood users with emails or perform account enumeration via timing analysis.
**Learning:** Publicly accessible endpoints that trigger side effects (like sending emails) must be protected by multi-factor rate limiting (IP and Identifier-based). To maintain security, rate-limit responses must be indistinguishable from successful ones to avoid leaking account existence or the threshold status.
**Prevention:** Use a dedicated database table or Redis cache to track attempts by IP address and normalized email/identifier. Prioritize trusted headers like `cf-connecting-ip` to mitigate IP spoofing. Ensure that the rate-limiting table is pruned regularly to prevent performance degradation.
