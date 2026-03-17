#!/usr/bin/env node
/**
 * Prepends "use client" to PdfViewerClient and chunk files in dist/.
 *
 * IMPORTANT: "use client" must NOT be added to index.js/index.mjs because
 * that file is the SSR-safe entry point (it uses next/dynamic with ssr:false)
 * and needs to remain importable from Server Components.  Only the actual
 * client-rendering module (PdfViewerClient) and its split chunks need the
 * directive.
 */
'use strict';

const { existsSync, readdirSync, readFileSync, writeFileSync } = require('fs');
const path = require('path');

const distDir   = path.join(__dirname, '..', 'dist');
const directive = '"use client";\n';

if (!existsSync(distDir)) {
  console.error('[next-react-pdf] ERROR: dist/ not found — run `npm run build` first.');
  process.exit(1);
}

readdirSync(distDir)
  .filter((f) => {
    // Only PdfViewerClient files and shared chunks — never index.*
    if (!f.endsWith('.js') && !f.endsWith('.mjs')) return false;
    if (f.startsWith('index.')) return false; // skip SSR-safe entry
    return true; // PdfViewerClient.* and chunk-*.* files
  })
  .forEach((file) => {
    const fullPath = path.join(distDir, file);
    const content  = readFileSync(fullPath, 'utf8');
    if (!content.startsWith('"use client"') && !content.startsWith("'use client'")) {
      writeFileSync(fullPath, directive + content);
      console.log(`[next-react-pdf] ✓ Added "use client" to dist/${file}`);
    } else {
      console.log(`[next-react-pdf]   Skipped dist/${file} (already has directive)`);
    }
  });
