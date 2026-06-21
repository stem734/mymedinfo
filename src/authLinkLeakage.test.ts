import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '..');

const readSource = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

describe('auth link leakage guardrails', () => {
  it('does not return setup or reset links from auth Edge Functions', () => {
    const authFunctionPaths = [
      'supabase/functions/create-admin-user/index.ts',
      'supabase/functions/create-practice-user/index.ts',
      'supabase/functions/send-admin-password-reset/index.ts',
      'supabase/functions/send-practice-password-reset/index.ts',
      'supabase/functions/upsert-practice-user/index.ts',
    ];

    for (const path of authFunctionPaths) {
      expect(readSource(path), path).not.toMatch(/jsonResponse\(\s*\{[^)]*resetLink/s);
    }
  });

  it('does not render or copy action links in practice user management', () => {
    const source = readSource('src/components/PracticeUserManagement.tsx');

    expect(source).not.toContain('actionLink');
    expect(source).not.toContain('data?.resetLink');
    expect(source).not.toContain('Copy Link');
  });
});
