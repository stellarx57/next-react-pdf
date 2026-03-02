import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
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
    'react-pdf',
    'pdfjs-dist',
    // react-pdf CSS side-effect imports stay as external references
    'react-pdf/dist/Page/AnnotationLayer.css',
    'react-pdf/dist/Page/TextLayer.css',
  ],
  treeshake: true,
  minify: false,
});
