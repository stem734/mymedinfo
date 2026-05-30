## 2025-05-30 - SSRF Vulnerability in PDF Export
**Vulnerability:** Server-Side Request Forgery (SSRF) in `api/pdf.ts`. The endpoint allowed rendering of arbitrary URLs by passing a protocol-relative path (e.g., `//evil.com`) in the `source` parameter.
**Learning:** Using `new URL(source, request.url)` to resolve relative paths is insufficient for security validation if `source` is user-controlled, as it treats strings starting with `//` or `/` as absolute paths if the protocol is implied or if a backslash is used.
**Prevention:** Always validate that user-provided paths start with a single `/` and do not contain sequences like `//` or `/\`. Additionally, verify that the final resolved URL's origin matches the expected application origin.
