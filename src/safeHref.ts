import { isValidHttpUrl } from '../supabase/functions/_shared/url-validation.ts';

/**
 * Defense-in-depth XSS guard for rendering stored URLs into `href` attributes.
 *
 * Edge Functions validate URLs at save time, but patient-facing pages must not
 * trust that as the only line of defence: legacy rows, direct DB writes, or a
 * future regression could still surface a `javascript:`/`data:`/`vbscript:` URI
 * that would execute when a patient clicks the link. This re-validates the
 * protocol at render time and fails closed (returns `undefined`, so React omits
 * the attribute and the anchor becomes inert) for anything that is not http(s).
 */
export function safeHttpHref(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return isValidHttpUrl(trimmed) ? trimmed : undefined;
}
