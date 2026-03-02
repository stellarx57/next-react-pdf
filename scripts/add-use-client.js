#!/usr/bin/env node
/**
 * Prepends "use client" directive to the bundled CJS and ESM outputs.
 * Required for Next.js App Router to recognize the package as a client module.
 */
'use strict';

const { readFileSync, writeFileSync } = require('fs');
const path = require('path');

const directive = '"use client";\n';
const files     = ['dist/index.js', 'dist/index.mjs'];

files.forEach((file) => {
  const fullPath = path.join(__dirname, '..', file);
  const content  = readFileSync(fullPath, 'utf8');
  if (!content.startsWith('"use client"') && !content.startsWith("'use client'")) {
    writeFileSync(fullPath, directive + content);
    console.log(`[next-react-pdf] ✓ Added "use client" to ${file}`);
  }
});
