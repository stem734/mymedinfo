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
      expect(source, path).toMatch(/recordAndCheckRateLimit|MAX_RECENT_IP_SIGNUPS/);
    }
  });

  it('provides a centralized rate limiting utility', () => {
    const source = readSource('supabase/functions/_shared/rate-limit.ts');
    expect(source).toContain('export async function recordAndCheckRateLimit');
  });

  it('provides a centralized IP extraction utility', () => {
    const source = readSource('supabase/functions/_shared/ip-utils.ts');
    expect(source).toContain('export function getClientIp');

    // Prioritization check
    expect(source).toContain('cf-connecting-ip');
    expect(source).toContain('x-forwarded-for');
    expect(source).toContain('x-client-ip');
  });

  it('correctly extracts and prioritizes IP addresses', () => {
    // 1. cf-connecting-ip has highest priority
    const headers1 = new Headers();
    headers1.set('cf-connecting-ip', '1.1.1.1');
    headers1.set('x-forwarded-for', '2.2.2.2, 3.3.3.3');
    headers1.set('x-client-ip', '4.4.4.4');
    expect(getClientIp(headers1)).toBe('1.1.1.1');

    // 2. x-forwarded-for (first element) has second priority
    const headers2 = new Headers();
    headers2.set('x-forwarded-for', '2.2.2.2, 3.3.3.3');
    headers2.set('x-client-ip', '4.4.4.4');
    expect(getClientIp(headers2)).toBe('2.2.2.2');

    // 3. x-client-ip has third priority
    const headers3 = new Headers();
    headers3.set('x-client-ip', '4.4.4.4');
    expect(getClientIp(headers3)).toBe('4.4.4.4');

    // 4. Default fallback to unknown
    const headers4 = new Headers();
    expect(getClientIp(headers4)).toBe('unknown');
  });

  it('ensures all relevant functions use the centralized getClientIp utility', () => {
    const paths = [
      'supabase/functions/_shared/rate-limit.ts',
      'supabase/functions/record-login-audit/index.ts',
      'supabase/functions/submit-practice-signup/index.ts',
    ];

    for (const path of paths) {
      const source = readSource(path);
      expect(source, path).toContain('getClientIp');
    }
  });
});
