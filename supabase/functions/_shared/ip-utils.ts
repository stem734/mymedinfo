/** Extracts client IP prioritizing Cloudflare, then X-Forwarded-For, then X-Client-IP. */
export function getClientIp(headers: Headers): string {
  return headers.get('cf-connecting-ip')?.trim() ||
         headers.get('x-forwarded-for')?.split(',')[0].trim() ||
         headers.get('x-client-ip')?.trim() ||
         'unknown';
}
