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
    expect(source).toContain("import { getClientIp } from './ip-utils.ts'");
  });

  it('provides a robust IP extraction utility', () => {
    const source = readSource('supabase/functions/_shared/ip-utils.ts');
    expect(source).toContain('export function getClientIp');
    expect(source).toContain('cf-connecting-ip'); // Security best practice for IP extraction
    expect(source).toContain('x-forwarded-for');
  });
});
