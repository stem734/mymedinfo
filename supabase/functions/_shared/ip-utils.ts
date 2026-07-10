/**
 * Extract the client's IP address from request headers.
 *
 * Prioritizes:
 * 1. cf-connecting-ip (Cloudflare)
 * 2. x-forwarded-for (Standard, takes first element)
 * 3. x-client-ip
 *
 * Fallback to 'unknown' if no headers are present.
 */
export function getClientIp(headers: Headers): string {
  return (
    headers.get('cf-connecting-ip') ||
    headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    headers.get('x-client-ip') ||
    'unknown'
  );
}
