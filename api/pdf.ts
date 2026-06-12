import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

const sanitizeFilename = (value: string | undefined) =>
  (value || 'MyMedInfo page')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 120) || 'MyMedInfo page';

const getExportCleanupScript = () => `
  (() => {
    const selectors = [
      '.no-print',
      '.patient-demo-banner',
      '.patient-print-bar',
      '.hc-rating',
      '.hc-rating__notice',
      '.patient-page-shell__brand'
    ];
    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((node) => node.remove());
    });
    document.documentElement.style.background = '#ffffff';
    document.body.style.background = '#ffffff';
    document.body.style.webkitPrintColorAdjust = 'exact';
    document.body.style.printColorAdjust = 'exact';
  })();
`;

async function launchBrowser() {
  const executablePath = await chromium.executablePath();
  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1280, height: 1600 },
    executablePath,
    headless: true,
  });
}

export function resolvePdfSourceUrl(source: string, requestUrl: string): URL | null {
  if (!source.startsWith('/') || source.startsWith('//') || source.startsWith('/\\')) {
    return null;
  }

  const requestOrigin = new URL(requestUrl).origin;
  const targetUrl = new URL(source, requestUrl);

  return targetUrl.origin === requestOrigin ? targetUrl : null;
}

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      if (process.platform !== 'linux' && process.env.VERCEL !== '1') {
        return new Response('Server-side PDF generation is available in production only.', { status: 501 });
      }

      const url = new URL(request.url);
      const source = url.searchParams.get('source') || '';
      const filename = sanitizeFilename(url.searchParams.get('filename') || undefined);
      const targetUrl = resolvePdfSourceUrl(source, request.url);
      if (!targetUrl) {
        return new Response('Missing or invalid source path', { status: 400 });
      }
      const browser = await launchBrowser();
      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 2000, deviceScaleFactor: 1 });
        await page.emulateMediaType('screen');
        await page.goto(targetUrl.toString(), { waitUntil: 'networkidle2' });

        await page.waitForFunction(
          () => document.querySelectorAll('.patient-card, .patient-section-card, .hc-card, .patient-state-card').length > 0,
          { timeout: 30000 },
        ).catch(() => undefined);

    await page.addScriptTag({ content: getExportCleanupScript() });
    await page.evaluate(() => {
      document.querySelectorAll('.no-print, .patient-demo-banner, .patient-print-bar, .hc-rating, .hc-rating__notice, .patient-page-shell__brand')
        .forEach((node) => node.remove());
      document.querySelectorAll('.patient-support-footer')
        .forEach((node) => {
          node.classList.add('patient-support-footer--compact');
          const text = node.querySelector('.patient-support-footer__text');
          if (text) {
            text.textContent = text.textContent?.trim() || '';
          }
        });
    });
    await page.addStyleTag({
      content: `
            html, body { background: #ffffff !important; margin: 0 !important; padding: 0 !important; }
            .patient-page-shell { max-width: 100% !important; width: 100% !important; }
            .patient-view, .hc-page { box-shadow: none !important; }
            .patient-section-card, .patient-card, .card { break-inside: avoid; page-break-inside: avoid; }
            .patient-section { break-inside: auto; page-break-inside: auto; }
            .patient-support-footer { margin-top: 12px !important; padding: 0 !important; background: transparent !important; border: 0 !important; }
            .patient-support-footer__text { margin: 0 !important; padding: 0 !important; font-size: 10pt !important; color: #4c6272 !important; }
          `,
    });

        const pdf = await page.pdf({
          format: 'A4',
          printBackground: true,
          preferCSSPageSize: false,
          margin: {
            top: '12mm',
            right: '12mm',
            bottom: '12mm',
            left: '12mm',
          },
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new Response(pdf as any, {
          headers: {
            'content-type': 'application/pdf',
            'content-disposition': `attachment; filename="${filename}.pdf"`,
            'cache-control': 'no-store',
          },
        });
      } finally {
        await browser.close();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to generate PDF';
      return new Response(message, { status: 500 });
    }
  },
};
