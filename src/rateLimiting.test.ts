import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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
    expect(source).toContain('getClientIp(headers)'); // Uses centralized IP extraction
  });

  it('implements a centralized IP extraction utility', () => {
    const source = readSource('supabase/functions/_shared/ip-utils.ts');
    expect(source).toContain('export function getClientIp');
    expect(source).toContain('cf-connecting-ip'); // Prioritizes Cloudflare
    expect(source).toContain('x-forwarded-for'); // Followed by standard proxy
    expect(source).toContain('x-client-ip'); // And fallback proxy header
  });

  it('uses centralized IP extraction in security auditing', () => {
    const source = readSource('supabase/functions/record-login-audit/index.ts');
    expect(source).toContain('getClientIp(req.headers)');
  });
});
