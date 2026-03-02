import { pdfjs } from 'react-pdf';

/**
 * Configures the PDF.js worker URL.
 *
 * Call this once at the root of your application (e.g. in `_app.tsx` or
 * `app/layout.tsx`) before rendering any PdfViewer.
 *
 * If not called, the viewer defaults to `/pdf.worker.min.js`, which is the
 * path produced by the included `scripts/copy-worker.js` setup script.
 *
 * @example
 * // app/layout.tsx
 * import { configurePdfWorker } from 'next-react-pdf';
 * configurePdfWorker('/pdf.worker.min.js');
 */
export function configurePdfWorker(workerSrc: string): void {
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
}
