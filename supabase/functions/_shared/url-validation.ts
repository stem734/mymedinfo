export function isValidHttpUrl(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value !== 'string') return false;

  const url = value.trim();
  if (!url) return true;

  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
