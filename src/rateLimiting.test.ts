import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '..');

const readSource = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

describe('rate limiting coverage', () => {
  it('enforces rate limits in the public password reset Edge Function', () => {
    const source = readSource('supabase/functions/send-password-reset/index.ts');

    expect(source).toContain('recordAndCheckRateLimit');
    expect(source).toContain('eventType: \'password_reset\'');
  });

  it('provides a shared rate limiting utility', () => {
    const source = readSource('supabase/functions/_shared/rate-limit.ts');

    expect(source).toContain('export async function recordAndCheckRateLimit');
    expect(source).toContain('getClientIp');
  });
});
