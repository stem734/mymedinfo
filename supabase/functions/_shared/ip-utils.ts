export function getClientIp(headers: Headers): string {
  return headers.get('cf-connecting-ip') ||
         headers.get('x-forwarded-for')?.split(',')[0].trim() ||
         headers.get('x-client-ip') ||
         'unknown';
}
