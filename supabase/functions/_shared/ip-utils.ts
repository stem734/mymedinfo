/**
 * Centralized utility for extracting the client IP address from request headers.
 * Prioritizes Cloudflare, then X-Forwarded-For, then X-Client-IP.
 */
export function getClientIp(headers: Headers): string {
  return (
    headers.get('cf-connecting-ip') ||
    headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    headers.get('x-client-ip') ||
    'unknown'
  );
}
