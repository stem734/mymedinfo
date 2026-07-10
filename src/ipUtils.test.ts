import { describe, expect, it } from 'vitest';
import { getClientIp } from '../supabase/functions/_shared/ip-utils.ts';

describe('getClientIp', () => {
  it('prioritizes cf-connecting-ip then x-forwarded-for', () => {
    const h1 = new Headers({ 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' });
    expect(getClientIp(h1)).toBe('1.1.1.1');

    const h2 = new Headers({ 'x-forwarded-for': ' 2.2.2.2 , 3.3.3.3 ', 'x-client-ip': '4.4.4.4' });
    expect(getClientIp(h2)).toBe('2.2.2.2');
  });

  it('falls back to x-client-ip then unknown', () => {
    const h3 = new Headers({ 'x-client-ip': '4.4.4.4' });
    expect(getClientIp(h3)).toBe('4.4.4.4');

    expect(getClientIp(new Headers())).toBe('unknown');
  });
});
