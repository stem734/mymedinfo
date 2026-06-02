# Sentinel Security Journal

## 2026-06-02 - SSRF via Protocol-Relative URLs in PDF Service
**Vulnerability:** The 'api/pdf.ts' endpoint was vulnerable to Server-Side Request Forgery (SSRF) because it used 'new URL(source, request.url)' without sufficient validation. An attacker could provide a 'source' parameter like '//evil.com' which would bypass a simple 'startsWith("/")' check and resolve to an external origin.
**Learning:** In JavaScript's URL constructor, a base URL is only used if the first argument is a relative path. Paths starting with '//' (protocol-relative) or '/\' are treated as absolute or specially handled, allowing an attacker to break out of the intended origin.
**Prevention:** Always validate that paths intended to be relative do not start with '//' or '/\', and perform a final origin check on the resolved URL to ensure it matches the expected target.
