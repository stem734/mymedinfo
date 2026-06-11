## 2025-05-14 - SSRF Mitigation in PDF Generation
**Vulnerability:** Server-Side Request Forgery (SSRF) via the `source` parameter in `api/pdf.ts`. Naive `startsWith("/")` check was bypassable using `//` or `/\`.
**Learning:** `new URL(source, request.url)` resolves protocol-relative paths to the specified external origin even if they start with `/`.
**Prevention:** Explicitly block `//` and `/\` prefixes and perform a mandatory origin equality check (`targetUrl.origin === url.origin`) after resolution.
