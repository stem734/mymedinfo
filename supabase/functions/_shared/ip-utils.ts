/**
 * Centralized utility for extracting the client's IP address from request headers.
 * Prioritizes trusted proxy headers (Cloudflare) followed by standard forwarding
 * headers.
 */
export function getClientIp(headers: Headers): string {
  return (
    headers.get('cf-connecting-ip') ||
    headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    headers.get('x-client-ip') ||
    'unknown'
  );
}
