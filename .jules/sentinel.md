## 2025-05-22 - SSRF in PDF Generation
**Vulnerability:** The `api/pdf.ts` endpoint was vulnerable to Server-Side Request Forgery (SSRF) because it allowed the `source` parameter to be manipulated to point to external origins. While it checked for a leading `/`, it did not account for protocol-relative URLs (e.g., `//example.com`) or backslash bypasses (e.g., `/\example.com`) which some URL parsers treat as absolute URLs.

**Learning:** Simple string prefix checks like `startsWith("/")` are insufficient for URL validation. The `new URL(source, base)` constructor in Node.js/Vercel environments will treat `//` or `/\` as indicating a new origin, overriding the base URL.

**Prevention:** Always validate that the resolved `targetUrl.origin` matches the expected `request.origin`. Additionally, explicitly reject paths starting with `//` or `/\` to prevent redirect/SSRF bypasses.
