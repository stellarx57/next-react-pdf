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

let pkgDir;
try {
  pkgDir = path.dirname(
    require.resolve('pdfjs-dist/package.json', { paths: [projectRoot] }),
  );
} catch {
  console.error(
    '[next-react-pdf] ERROR: pdfjs-dist is not installed in this project.\n' +
    '  Install it as a peer dependency:\n' +
    '  npm install pdfjs-dist',
  );
  process.exit(1);
}

// Probe multiple candidate paths in priority order to support pdfjs-dist v3/v4/v5+
const candidates = [
  path.join(pkgDir, 'build', 'pdf.worker.min.mjs'),
  path.join(pkgDir, 'build', 'pdf.worker.min.js'),
  path.join(pkgDir, 'legacy', 'build', 'pdf.worker.min.js'),
  path.join(pkgDir, 'legacy', 'build', 'pdf.worker.min.mjs'),
];

const workerSrc = candidates.find((c) => existsSync(c));

if (!workerSrc) {
  console.error(
    '[next-react-pdf] ERROR: pdf.worker bundle not found. Checked:\n' +
    candidates.map((c) => `  ${c}`).join('\n') + '\n' +
    '  Please check your pdfjs-dist installation.',
  );
  process.exit(1);
}

if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });

copyFileSync(workerSrc, destFile);
console.log(`[next-react-pdf] ✓ Copied ${path.basename(workerSrc)} → public/pdf.worker.min.js`);

