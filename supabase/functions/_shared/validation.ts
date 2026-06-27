/**
 * Validates that a value is a valid HTTP or HTTPS URL.
 * Returns true if the value is empty (null, undefined, or empty string)
 * to allow for optional fields. Rejects non-string types and unsafe protocols.
 */
export const isValidHttpUrl = (url: unknown): boolean => {
  if (url === null || url === undefined || url === '') return true;
  if (typeof url !== 'string') return false;

  const trimmed = url.trim();
  if (trimmed === '') return true;

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};
