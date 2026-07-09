import { describe, expect, it } from 'vitest';
import { getClientIp } from '../supabase/functions/_shared/ip-utils';

describe('getClientIp', () => {
  it('prioritizes cf-connecting-ip', () => {
    const headers = new Headers({
      'cf-connecting-ip': '203.0.113.1',
      'x-forwarded-for': '192.0.2.1, 198.51.100.1',
      'x-client-ip': '198.51.100.2',
    });
    expect(getClientIp(headers)).toBe('203.0.113.1');
  });

  it('uses the first element of x-forwarded-for if cf-connecting-ip is missing', () => {
    const headers = new Headers({
      'x-forwarded-for': '192.0.2.1, 198.51.100.1',
      'x-client-ip': '198.51.100.2',
    });
    expect(getClientIp(headers)).toBe('192.0.2.1');
  });

  it('uses x-client-ip if other preferred headers are missing', () => {
    const headers = new Headers({
      'x-client-ip': '198.51.100.2',
    });
    expect(getClientIp(headers)).toBe('198.51.100.2');
  });

  it('returns "unknown" if no IP headers are present', () => {
    const headers = new Headers();
    expect(getClientIp(headers)).toBe('unknown');
  });

  it('handles spaces in x-forwarded-for correctly', () => {
    const headers = new Headers({
      'x-forwarded-for': ' 192.0.2.5 , 198.51.100.1',
    });
    expect(getClientIp(headers)).toBe('192.0.2.5');
  });
});
