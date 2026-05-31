## 2026-05-31 - SSRF Vulnerability in PDF Export
**Vulnerability:** The 'api/pdf.ts' endpoint was vulnerable to SSRF because 'new URL(source, request.url)' allows 'source' values starting with '//' or '/\' to resolve to external origins, bypassing simple path checks like 'startsWith("/")'.
**Learning:** Standard URL parsing in Node/Vercel environments treats '//' and '/\' as protocol-relative URLs when a base URL is provided, which can bypass naive path-based filters.
**Prevention:** Enforce that paths do not start with '//' or '/\', and always verify that the resolved URL's origin matches the expected origin.
