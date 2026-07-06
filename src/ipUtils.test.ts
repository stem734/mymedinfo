import { describe, expect, it } from 'vitest';
import { getClientIp } from '../supabase/functions/_shared/ip-utils';

describe('getClientIp', () => {
  it('prioritizes cf-connecting-ip', () => {
    const headers = new Headers({
      'cf-connecting-ip': '1.1.1.1',
      'x-forwarded-for': '2.2.2.2, 3.3.3.3',
      'x-client-ip': '4.4.4.4',
    });
    expect(getClientIp(headers)).toBe('1.1.1.1');
  });

  it('falls back to the first entry in x-forwarded-for', () => {
    const headers = new Headers({
      'x-forwarded-for': '2.2.2.2, 3.3.3.3',
      'x-client-ip': '4.4.4.4',
    });
    expect(getClientIp(headers)).toBe('2.2.2.2');
  });

  it('falls back to x-client-ip if others are missing', () => {
    const headers = new Headers({
      'x-client-ip': '4.4.4.4',
    });
    expect(getClientIp(headers)).toBe('4.4.4.4');
  });

  it('returns "unknown" if no headers are present', () => {
    const headers = new Headers();
    expect(getClientIp(headers)).toBe('unknown');
  });

  it('handles empty or malformed x-forwarded-for', () => {
    const headers = new Headers({
      'x-forwarded-for': '',
    });
    expect(getClientIp(headers)).toBe('unknown');
  });
});
