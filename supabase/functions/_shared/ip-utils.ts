/**
 * Centralized utility for extracting the client's IP address from request headers.
 * Following security standard: prioritize Cloudflare, then X-Forwarded-For,
 * then X-Client-IP, with 'unknown' as fallback.
 */
export function getClientIp(headers: Headers): string {
  const cfIp = headers.get('cf-connecting-ip');
  if (cfIp) return cfIp;

  const xff = headers.get('x-forwarded-for');
  if (xff) {
    // x-forwarded-for can be a comma-separated list; the first one is the original client.
    const first = xff.split(',')[0].trim();
    if (first) return first;
  }

  const xClientIp = headers.get('x-client-ip');
  if (xClientIp) return xClientIp;

  return 'unknown';
}
