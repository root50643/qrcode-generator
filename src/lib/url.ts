/** Normalize a website address without opening it or sending it to a server. */
export function normalizeUrl(raw: string): string {
  const value = raw.trim();

  if (!value) {
    throw new Error('Enter a website URL first.');
  }
  if (/[\s\u0000-\u001f\u007f\\]/u.test(value)) {
    throw new Error('The URL cannot contain spaces, control characters, or backslashes.');
  }

  const scheme = /^([a-z][a-z\d+.-]*):/iu.exec(value)?.[1]?.toLowerCase();
  const isHostWithPort = /^(?:localhost|[^/?#:]+\.[^/?#:]+):\d+(?:[/?#]|$)/iu.test(value);
  let candidate: string;

  if (scheme && !isHostWithPort) {
    if (scheme !== 'http' && scheme !== 'https') {
      throw new Error('Only HTTP and HTTPS website URLs are supported.');
    }
    if (!/^https?:\/\/[^/]/iu.test(value)) {
      throw new Error('Enter a complete website URL, such as https://example.com.');
    }
    candidate = value;
  } else {
    candidate = value.startsWith('//') ? `https:${value}` : `https://${value}`;
  }

  if (!/^https?:\/\/[^/]/iu.test(candidate)) {
    throw new Error('Enter a complete website URL, such as https://example.com.');
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('Enter a valid website URL, such as https://example.com.');
  }

  if (!parsed.hostname || !['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only HTTP and HTTPS website URLs are supported.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Remove the username and password from the URL.');
  }

  // URL serialization preserves the destination while safely encoding Unicode.
  return parsed.href;
}
