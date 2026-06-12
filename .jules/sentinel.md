## 2025-05-15 - PDF API Hardening
**Vulnerability:** Information leakage via verbose 500 error messages and potential SSRF bypass using control characters in URL paths.
**Learning:** Puppeteer/Chromium errors often contain internal file paths and environment details. Standard Node.js `URL` resolution can be bypassed if control characters are not explicitly blocked before path validation.
**Prevention:** Always sanitize 500 error responses to return generic messages. Use `eslint-disable-next-line no-control-regex` when implementing necessary control character blocks in security-critical URL parsing logic.
