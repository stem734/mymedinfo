import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getClientIp } from '../supabase/functions/_shared/ip-utils.ts';

const repoRoot = resolve(__dirname, '..');

const readSource = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

describe('rate limiting guardrails', () => {
  it('implements rate limiting in sensitive public edge functions', () => {
    const sensitivePublicFunctions = [
      'supabase/functions/send-password-reset/index.ts',
      'supabase/functions/submit-practice-signup/index.ts',
    ];

    for (const path of sensitivePublicFunctions) {
      const source = readSource(path);
      // Verify they use recordAndCheckRateLimit or a similar mechanism
      expect(source, path).toMatch(/recordAndCheckRateLimit|MAX_RECENT_IP_SIGNUPS/);
    }
  });

  it('provides a centralized rate limiting utility', () => {
    const source = readSource('supabase/functions/_shared/rate-limit.ts');
    expect(source).toContain('export async function recordAndCheckRateLimit');

    // IP extraction is now delegated to centralized ip-utils.ts
    const ipUtilsSource = readSource('supabase/functions/_shared/ip-utils.ts');
    expect(ipUtilsSource).toContain('cf-connecting-ip'); // Security best practice for IP extraction
  });

  it('extracts client IP correctly with prioritization', () => {
    // 1. Cloudflare header prioritised
    const headers1 = new Headers({
      'cf-connecting-ip': '1.1.1.1',
      'x-forwarded-for': '2.2.2.2, 3.3.3.3',
      'x-client-ip': '4.4.4.4',
    });
    expect(getClientIp(headers1)).toBe('1.1.1.1');

    // 2. x-forwarded-for first element prioritised when cf-connecting-ip is missing
    const headers2 = new Headers({
      'x-forwarded-for': '2.2.2.2, 3.3.3.3',
      'x-client-ip': '4.4.4.4',
    });
    expect(getClientIp(headers2)).toBe('2.2.2.2');

    // 3. x-client-ip when others are missing
    const headers3 = new Headers({
      'x-client-ip': '4.4.4.4',
    });
    expect(getClientIp(headers3)).toBe('4.4.4.4');

    // 4. Fallback to unknown
    const headers4 = new Headers({});
    expect(getClientIp(headers4)).toBe('unknown');
  });
});
