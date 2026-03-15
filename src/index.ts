// PdfViewer is the SSR-safe entry point (uses next/dynamic with ssr:false internally).
// PdfViewerClient is a separate entry — import via 'next-react-pdf/PdfViewerClient'
// if you manage the dynamic import yourself.
export { default as PdfViewer } from './PdfViewer';
export type { PdfViewerProps, PdfDocumentOptions } from './PdfViewerClient';
export { configurePdfWorker } from './config';
