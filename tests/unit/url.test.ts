import { describe, expect, it } from 'vitest';
import { normalizeUrl } from '../../src/lib/url';

describe('normalizeUrl', () => {
  it.each([
    ['example.com', 'https://example.com/'],
    ['  https://example.com/path?q=hello#section  ', 'https://example.com/path?q=hello#section'],
    ['http://example.com/a', 'http://example.com/a'],
    ['HTTPS://EXAMPLE.COM:443', 'https://example.com/'],
    ['example.com:8080/path', 'https://example.com:8080/path'],
    ['localhost:3000', 'https://localhost:3000/'],
    ['//example.com/path', 'https://example.com/path'],
    ['https://example.com/搜尋?q=咖啡😀', 'https://example.com/%E6%90%9C%E5%B0%8B?q=%E5%92%96%E5%95%A1%F0%9F%98%80'],
    ['https://例子.台灣/你好', 'https://xn--fsqu00a.xn--kpry57d/%E4%BD%A0%E5%A5%BD'],
    ['https://[::1]:8080/a', 'https://[::1]:8080/a'],
  ])('normalizes %s without losing its destination', (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected);
  });

  it.each([
    '',
    '   ',
    'https://',
    'https:example.com',
    'https:///example.com',
    '///example.com',
    '/relative-path',
    'https://exa mple.com',
    'https://example.com/a b',
    'https://exa\nmple.com',
    'https://example.com/\u0000',
    'https:\\example.com',
    'javascript:alert(1)',
    'data:text/html,hello',
    'ftp://example.com',
    'file:///etc/hosts',
    'mailto:hello@example.com',
    'https://user:password@example.com',
    'https://example.com:99999',
    'https://[broken',
  ])('rejects unsafe or malformed input %j', input => {
    expect(() => normalizeUrl(input)).toThrow(Error);
  });

  it('does not decode existing escapes or discard URL parameters', () => {
    const url = 'https://example.com/a%2Fb?redirect=https%3A%2F%2Fnuu.app&x=1#hello';
    expect(normalizeUrl(url)).toBe(url);
  });
});
