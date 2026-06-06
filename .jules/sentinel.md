## 2026-06-06 - SSRF via Protocol-Relative URLs
**Vulnerability:** The `api/pdf.ts` endpoint was vulnerable to SSRF because `new URL(source, request.url)` allows `source` values starting with `//` or `/` to resolve to external origins, bypassing simple path checks like `startsWith("/")`.
**Learning:** Checking for a leading slash is insufficient when the second character can also be a slash or a backslash, as `URL` constructor treats these as protocol-relative URLs.
**Prevention:** Always validate the resolved `targetUrl.origin` against the expected application origin after resolution.
