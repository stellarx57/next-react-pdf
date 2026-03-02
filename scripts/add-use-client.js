#!/usr/bin/env node
/**
 * Prepends "use client" to every .js and .mjs file in dist/.
 * Required for Next.js App Router to recognise the package as client-only.
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
  .filter((f) => f.endsWith('.js') || f.endsWith('.mjs'))
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
