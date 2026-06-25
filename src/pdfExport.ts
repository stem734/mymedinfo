import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const PDF_MARGIN_PT = 24;

const sanitizeFilename = (value: string) =>
  value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 120) || 'MyMedInfo page';

const downloadBlob = (blob: Blob, filename: string) => {
  const link = document.createElement('a');
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = `${sanitizeFilename(filename)}.pdf`;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
};

async function saveElementAsLocalPdf(element: HTMLElement, filename: string) {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.style.position = 'fixed';
  clone.style.left = '-10000px';
  clone.style.top = '0';
  clone.style.width = `${Math.max(element.scrollWidth, element.clientWidth, 1024)}px`;
  clone.style.background = '#ffffff';
  clone.setAttribute('aria-hidden', 'true');

  const selectorsToRemove = [
    '.no-print',
    '.patient-demo-banner',
    '.patient-print-bar',
    '.hc-rating',
    '.hc-rating__notice',
    '.patient-page-shell__masthead',
  ];

  selectorsToRemove.forEach((selector) => {
    clone.querySelectorAll<HTMLElement>(selector).forEach((node) => node.remove());
  });

  document.body.appendChild(clone);

  try {
    const canvas = await html2canvas(clone, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      windowWidth: Math.max(clone.scrollWidth, clone.clientWidth, 1024),
    });

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4',
      compress: true,
    });

    const availableWidth = A4_WIDTH_PT - PDF_MARGIN_PT * 2;
    const scale = availableWidth / canvas.width;
    const pageHeightPx = Math.floor((A4_HEIGHT_PT - PDF_MARGIN_PT * 2) / scale);
    const totalPages = Math.max(1, Math.ceil(canvas.height / pageHeightPx));

    const createSlice = (sourceCanvas: HTMLCanvasElement, y: number, height: number) => {
      const slice = document.createElement('canvas');
      slice.width = sourceCanvas.width;
      slice.height = height;
      const ctx = slice.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(sourceCanvas, 0, y, sourceCanvas.width, height, 0, 0, sourceCanvas.width, height);
      return slice;
    };

    for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
      const y = pageIndex * pageHeightPx;
      const sliceHeight = Math.min(pageHeightPx, canvas.height - y);
      const slice = createSlice(canvas, y, sliceHeight);
      if (!slice) continue;
      const sliceData = slice.toDataURL('image/png');
      if (pageIndex > 0) {
        pdf.addPage();
      }
      pdf.addImage(
        sliceData,
        'PNG',
        PDF_MARGIN_PT,
        PDF_MARGIN_PT,
        availableWidth,
        sliceHeight * scale,
        undefined,
        'FAST',
      );
    }

    pdf.save(`${sanitizeFilename(filename)}.pdf`);
  } finally {
    clone.remove();
  }
}

async function saveElementAsServerPdf(filename: string) {
  const source = `${window.location.pathname}${window.location.search}`;
  const response = await fetch(
    `/api/pdf?source=${encodeURIComponent(source)}&filename=${encodeURIComponent(filename)}`,
    {
      method: 'GET',
      credentials: 'same-origin',
    },
  );

  if (!response.ok) {
    throw new Error(`PDF export failed with status ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/pdf')) {
    throw new Error('PDF export did not return a PDF');
  }

  const blob = await response.blob();
  downloadBlob(blob, filename);
}

export async function saveElementAsPdf(element: HTMLElement, filename: string) {
  if (typeof window === 'undefined') return;

  try {
    await saveElementAsServerPdf(filename);
  } catch (error) {
    console.warn('Server-side PDF export failed, falling back to local render.', error);
    await saveElementAsLocalPdf(element, filename);
  }
}
