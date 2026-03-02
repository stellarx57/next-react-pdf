#!/usr/bin/env node
/**
 * next-react-pdf — copy-worker helper
 *
 * Copies the PDF.js web worker bundle from `pdfjs-dist` into your Next.js
 * `public/` directory so the viewer can load it at `/pdf.worker.min.js`.
 *
 * Usage options:
 *
 *   # Run directly via npx (package ships a bin entry):
 *   npx next-react-pdf-copy-worker
 *
 *   # Or reference it in package.json scripts:
 *   "copy-pdf-worker": "node node_modules/next-react-pdf/scripts/copy-worker.js",
 *   "predev":   "npm run copy-pdf-worker",
 *   "prebuild": "npm run copy-pdf-worker",
 */
'use strict';

const { copyFileSync, mkdirSync, existsSync } = require('fs');
const path = require('path');

// Use process.cwd() so this script works regardless of node_modules nesting
// depth (flat npm layout, pnpm, yarn workspaces, etc.).
const projectRoot = process.cwd();
const publicDir   = path.join(projectRoot, 'public');
const destFile    = path.join(publicDir, 'pdf.worker.min.js');

let workerSrc;
try {
  const pkgDir = path.dirname(
    require.resolve('pdfjs-dist/package.json', { paths: [projectRoot] }),
  );
  workerSrc = path.join(pkgDir, 'build', 'pdf.worker.min.js');
} catch {
  console.error(
    '[next-react-pdf] ERROR: pdfjs-dist is not installed in this project.\n' +
    '  Install react-pdf (which includes pdfjs-dist) as a peer dependency:\n' +
    '  npm install react-pdf pdfjs-dist',
  );
  process.exit(1);
}

if (!existsSync(workerSrc)) {
  // pdfjs-dist v4+ ships .mjs workers — fall back gracefully.
  const mjs = workerSrc.replace('.js', '.mjs');
  if (existsSync(mjs)) {
    workerSrc = mjs;
  } else {
    console.error(
      `[next-react-pdf] ERROR: pdf.worker bundle not found at:\n  ${workerSrc}\n` +
      '  Please check your pdfjs-dist installation.',
    );
    process.exit(1);
  }
}

if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });

copyFileSync(workerSrc, destFile);
console.log(`[next-react-pdf] ✓ Copied ${path.basename(workerSrc)} → public/pdf.worker.min.js`);
