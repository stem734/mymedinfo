## 2025-05-15 - [SSRF via protocol-relative URLs in api/pdf.ts]
**Vulnerability:** Server-Side Request Forgery (SSRF) via the `source` parameter in the PDF generation endpoint.
**Learning:** The check `source.startsWith('/')` was insufficient because `new URL(source, request.url)` treats paths starting with `//` or `/\` as protocol-relative, resolving them to the origin specified in the `source` itself rather than the intended local origin.
**Prevention:** Always validate that the resolved `targetUrl.origin` matches the expected `request.origin` (or a known allowlist) and strictly enforce local path prefixes before passing URLs to sensitive sinks like Puppeteer.
