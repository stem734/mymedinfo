import { describe, expect, it } from 'vitest';
import { safeHttpHref } from './safeHref';

describe('safeHttpHref', () => {
  it('passes through valid http(s) URLs (trimmed)', () => {
    expect(safeHttpHref('https://www.nhs.uk/conditions/')).toBe('https://www.nhs.uk/conditions/');
    expect(safeHttpHref('http://example.test/resource')).toBe('http://example.test/resource');
    expect(safeHttpHref('  https://www.nhs.uk/  ')).toBe('https://www.nhs.uk/');
  });

  it('fails closed (undefined) for dangerous or non-http(s) schemes', () => {
    expect(safeHttpHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHttpHref('JavaScript:alert(1)')).toBeUndefined();
    expect(safeHttpHref('data:text/html,<script>alert(1)</script>')).toBeUndefined();
    expect(safeHttpHref('vbscript:msgbox(1)')).toBeUndefined();
    expect(safeHttpHref('file:///etc/passwd')).toBeUndefined();
    expect(safeHttpHref('ftp://example.test/resource')).toBeUndefined();
    expect(safeHttpHref('not a url')).toBeUndefined();
  });

  it('fails closed for empty and non-string values', () => {
    expect(safeHttpHref('')).toBeUndefined();
    expect(safeHttpHref('   ')).toBeUndefined();
    expect(safeHttpHref(undefined)).toBeUndefined();
    expect(safeHttpHref(null)).toBeUndefined();
    expect(safeHttpHref(123)).toBeUndefined();
    expect(safeHttpHref({ href: 'https://example.test' })).toBeUndefined();
  });
});
