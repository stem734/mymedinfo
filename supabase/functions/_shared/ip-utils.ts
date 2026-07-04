/**
 * Extract the client's IP address from request headers.
 *
 * Priority:
 * 1. cf-connecting-ip (Cloudflare)
 * 2. x-forwarded-for (standard proxy, take first element)
 * 3. x-client-ip
 * 4. 'unknown' fallback
 */
export function getClientIp(headers: Headers): string {
  const cf = headers.get('cf-connecting-ip');
  if (cf) return cf;

  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const clientIp = headers.get('x-client-ip');
  if (clientIp) return clientIp;

  return 'unknown';
}
