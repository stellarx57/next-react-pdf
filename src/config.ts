import * as pdfjs from 'pdfjs-dist';

/**
 * Configures the PDF.js worker URL.
 *
 * Call this once at the root of your application **inside a 'use client'
 * component** (e.g. a client layout or _app) before any PdfViewer renders.
 *
 * Safe to call in SSR contexts — it is a no-op on the server.
 *
 * If not called, the viewer falls back to `/pdf.worker.min.js`, which is the
 * path produced by the included `scripts/copy-worker.js` setup script.
 *
 * @example
 * 'use client';
 * import { configurePdfWorker } from 'next-react-pdf';
 * configurePdfWorker('/static/pdf.worker.min.js');
 */
export function configurePdfWorker(workerSrc: string): void {
  if (typeof window === 'undefined') return;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
}
