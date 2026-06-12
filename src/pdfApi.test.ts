import { describe, expect, it } from 'vitest';

import pdfHandler, { resolvePdfSourceUrl } from '../api/pdf';

describe('resolvePdfSourceUrl', () => {
  it('accepts same-origin absolute paths', () => {
    const url = resolvePdfSourceUrl('/patient/123', 'https://mymedinfo.example/api/pdf');

    expect(url?.toString()).toBe('https://mymedinfo.example/patient/123');
  });

  it('rejects protocol-relative paths', () => {
    const url = resolvePdfSourceUrl('//evil.example/steal', 'https://mymedinfo.example/api/pdf');

    expect(url).toBeNull();
  });

  it('rejects backslash-prefixed paths', () => {
    const url = resolvePdfSourceUrl('/\\evil.example/steal', 'https://mymedinfo.example/api/pdf');

    expect(url).toBeNull();
  });

  it('rejects control characters', () => {
    const url = resolvePdfSourceUrl('/patient\x00/123', 'https://mymedinfo.example/api/pdf');

    expect(url).toBeNull();
  });
});

describe('pdf api validation', () => {
  it('returns 400 before launching the browser for invalid source paths', async () => {
    const originalVercelEnv = process.env.VERCEL;
    process.env.VERCEL = '1';

    try {
      const request = new Request('https://mymedinfo.example/api/pdf?source=%2F%2Fevil.example%2Fsteal');
      const response = await pdfHandler.fetch(request);

      expect(response.status).toBe(400);
      await expect(response.text()).resolves.toBe('Missing or invalid source path');
    } finally {
      process.env.VERCEL = originalVercelEnv;
    }
  });

  it('sanitizes 500 error responses', async () => {
    const originalVercelEnv = process.env.VERCEL;
    process.env.VERCEL = '1';

    try {
      // This will fail because chromium.executablePath() will likely fail in this environment
      // or puppeteer.launch will fail.
      const request = new Request('https://mymedinfo.example/api/pdf?source=/patient/123');
      const response = await pdfHandler.fetch(request);

      expect(response.status).toBe(500);
      await expect(response.text()).resolves.toBe('Unable to generate PDF');
    } finally {
      process.env.VERCEL = originalVercelEnv;
    }
  }, 20000);
});
