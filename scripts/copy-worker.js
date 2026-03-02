#!/usr/bin/env node
/**
 * next-react-pdf — copy-worker helper
 *
 * Copies the PDF.js web worker bundle from `pdfjs-dist` (installed as a
 * peer dependency of `react-pdf`) into your Next.js `public/` directory so
 * the viewer can load it as a static asset at `/pdf.worker.min.js`.
 *
 * Add to your project's package.json scripts:
 *
 *   "copy-pdf-worker": "node node_modules/next-react-pdf/scripts/copy-worker.js",
 *   "predev":   "npm run copy-pdf-worker",
 *   "prebuild": "npm run copy-pdf-worker",
 *
 * Or run it once manually:
 *   npx next-react-pdf-copy-worker
 */
'use strict';

const { copyFileSync, mkdirSync, existsSync } = require('fs');
const path = require('path');

// Resolve relative to the consuming project's root (two levels up from
// node_modules/next-react-pdf/scripts/).
const projectRoot = path.resolve(__dirname, '..', '..', '..');
const publicDir   = path.join(projectRoot, 'public');
const destFile    = path.join(publicDir, 'pdf.worker.min.js');

let workerSrc;
try {
  const pkgDir = path.dirname(require.resolve('pdfjs-dist/package.json', { paths: [projectRoot] }));
  workerSrc    = path.join(pkgDir, 'build', 'pdf.worker.min.js');
} catch {
  console.error('[next-react-pdf] ERROR: pdfjs-dist is not installed. Install react-pdf which includes it as a dependency.');
  process.exit(1);
}

if (!existsSync(workerSrc)) {
  const mjs = workerSrc.replace('.js', '.mjs');
  if (existsSync(mjs)) {
    workerSrc = mjs;
  } else {
    console.error('[next-react-pdf] ERROR: pdf.worker bundle not found at', workerSrc);
    process.exit(1);
  }
}

if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });

copyFileSync(workerSrc, destFile);
console.log('[next-react-pdf] ✓ Copied', path.basename(workerSrc), '→ public/pdf.worker.min.js');
