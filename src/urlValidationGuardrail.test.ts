import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isValidHttpUrl } from '../supabase/functions/_shared/url-validation.ts';

const repoRoot = resolve(__dirname, '..');
const readSource = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

describe('Edge Function URL validation', () => {
  it('accepts empty optional values and HTTP(S) URLs only', () => {
    expect(isValidHttpUrl(undefined)).toBe(true);
    expect(isValidHttpUrl(null)).toBe(true);
    expect(isValidHttpUrl('')).toBe(true);
    expect(isValidHttpUrl(' https://www.nhs.uk/conditions/ ')).toBe(true);
    expect(isValidHttpUrl('http://example.test/resource')).toBe(true);
    expect(isValidHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isValidHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isValidHttpUrl('ftp://example.test/resource')).toBe(false);
    expect(isValidHttpUrl('not a url')).toBe(false);
  });

  it('rejects non-string values when a URL field is provided with the wrong type', () => {
    expect(isValidHttpUrl(123)).toBe(false);
    expect(isValidHttpUrl(true)).toBe(false);
    expect(isValidHttpUrl({ href: 'https://example.test' })).toBe(false);
    expect(isValidHttpUrl(['https://example.test'])).toBe(false);
  });

  it('centralizes the helper across URL-validating Edge Functions', () => {
    const functionPaths = [
      'supabase/functions/save-medication/index.ts',
      'supabase/functions/save-practice-medication-card/index.ts',
      'supabase/functions/save-card-template/index.ts',
    ];

    for (const path of functionPaths) {
      const source = readSource(path);
      expect(source, path).toContain("import { isValidHttpUrl } from '../_shared/url-validation.ts';");
      expect(source, path).not.toMatch(/const isValidHttpUrl\s*=/);
    }
  });
});
