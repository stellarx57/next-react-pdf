/**
 * Configures the PDF.js worker URL.
 *
 * Call this once at the root of your application **inside a client component**
 * (e.g. a `'use client'` layout component) before any PdfViewer renders.
 *
 * If not called, the viewer defaults to `/pdf.worker.min.js`, which is the
 * path produced by the included `scripts/copy-worker.js` setup script.
 *
 * Safe to call in SSR contexts — it is a no-op on the server.
 *
 * @example
 * // In a 'use client' component
 * import { configurePdfWorker } from 'next-react-pdf';
 * configurePdfWorker('/pdf.worker.min.js');
 */
export function configurePdfWorker(workerSrc: string): void {
  if (typeof window === 'undefined') return;
  // Dynamically import pdfjs to avoid pulling it into the server bundle.
  import('react-pdf').then(({ pdfjs }) => {
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  }).catch(() => {});
}
