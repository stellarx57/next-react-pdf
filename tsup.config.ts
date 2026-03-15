import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index:           'src/index.ts',
    PdfViewerClient: 'src/PdfViewerClient.tsx',
  },
  format: ['cjs', 'esm'],
  dts: true,
  // splitting: true lets the dynamic import in PdfViewer.tsx resolve to a real
  // separate chunk so that consuming bundlers (Next.js / webpack) never pull
  // PdfViewerClient — and therefore pdfjs-dist — into the server bundle.
  splitting: true,
  sourcemap: true,
  clean: true,
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    'next',
    'next/dynamic',
    '@mui/material',
    '@mui/icons-material',
    '@mui/material/styles',
    'pdfjs-dist',
  ],
  treeshake: true,
  minify: false,
});
