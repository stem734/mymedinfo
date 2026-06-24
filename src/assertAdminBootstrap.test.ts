import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '..');
const readSource = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

// Guardrail: every Edge Function runs with verify_jwt = false, so assertAdmin's
// in-code check is the only gate. The owner self-bootstrap must never promote an
// arbitrary authenticated user — it has to be fenced behind an explicit allow-list.
describe('assertAdmin bootstrap guardrail', () => {
  const source = readSource('supabase/functions/_shared/assert-admin.ts');

  it('gates the owner bootstrap behind the BOOTSTRAP_ADMIN_EMAILS allow-list', () => {
    expect(source).toContain('BOOTSTRAP_ADMIN_EMAILS');
  });

  it('checks the allow-list before creating the owner record', () => {
    const allowlistIndex = source.indexOf('BOOTSTRAP_ADMIN_EMAILS');
    const ownerInsertIndex = source.indexOf('.insert(bootstrapAdmin)');

    expect(allowlistIndex).toBeGreaterThan(-1);
    expect(ownerInsertIndex).toBeGreaterThan(-1);
    expect(allowlistIndex).toBeLessThan(ownerInsertIndex);
  });
});
