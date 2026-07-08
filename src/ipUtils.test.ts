import { describe, it, expect } from 'vitest';
import { getClientIp } from '../supabase/functions/_shared/ip-utils.ts';

describe('getClientIp', () => {
  it('prioritizes cf-connecting-ip', () => {
    const headers = new Headers({
      'cf-connecting-ip': '1.1.1.1',
      'x-forwarded-for': '2.2.2.2',
      'x-client-ip': '3.3.3.3',
    });
    expect(getClientIp(headers)).toBe('1.1.1.1');
  });

  it('uses the first element of x-forwarded-for if cf-connecting-ip is missing', () => {
    const headers = new Headers({
      'x-forwarded-for': '2.2.2.2, 8.8.8.8',
      'x-client-ip': '3.3.3.3',
    });
    expect(getClientIp(headers)).toBe('2.2.2.2');
  });

  it('uses x-client-ip if both cf-connecting-ip and x-forwarded-for are missing', () => {
    const headers = new Headers({
      'x-client-ip': '3.3.3.3',
    });
    expect(getClientIp(headers)).toBe('3.3.3.3');
  });

  it('returns unknown if all headers are missing', () => {
    const headers = new Headers();
    expect(getClientIp(headers)).toBe('unknown');
  });

  it('handles empty headers gracefully', () => {
    const headers = new Headers({
      'x-forwarded-for': '',
      'x-client-ip': '',
    });
    expect(getClientIp(headers)).toBe('unknown');
  });
});
