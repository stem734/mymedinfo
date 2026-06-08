## 2025-01-24 - PDF SSRF Prevention
**Vulnerability:** Server-Side Request Forgery (SSRF) in `api/pdf.ts` via protocol-relative URLs (e.g., `//evil.com`) or backslash-prefixed paths (e.g., `/\\evil.com`).
**Learning:** `new URL(source, request.url)` can resolve to a different origin if `source` starts with `//` or `/\`, even if a simple `startsWith('/')` check is present.
**Prevention:** Explicitly block `//` and `/\` prefixes and enforce origin matching (`targetUrl.origin === url.origin`) for all internal URL resolution.
