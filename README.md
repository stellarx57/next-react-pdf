# next-react-pdf

A feature-rich, SSR-safe PDF viewer component for **Next.js** applications built on top of [react-pdf](https://github.com/wojtekmaj/react-pdf) and [Material-UI](https://mui.com/).

## Features

- **SSR-safe** — uses `next/dynamic` with `ssr: false`; the heavy PDF.js runtime is never evaluated on the server
- **Thumbnail sidebar** — page strip with live previews
- **Table of contents** — renders the PDF outline/bookmarks
- **Attachments** — list and download embedded file attachments
- **Text search** — full-document search with highlighted matches and page navigation
- **Zoom** — presets (Page Fit, Page Width, Actual Size) plus custom levels from 25 % to 400 %
- **Rotation** — left/right 90° rotation
- **Continuous / single-page scroll** — toggle between modes
- **Text selection & hand-scroll modes**
- **Drag-and-drop** — open a local PDF by dropping it onto the viewer
- **Open local file** — file picker button in the toolbar
- **Download & Print** — one-click from the toolbar
- **Document properties** — title, author, creation date, etc.
- **Full-screen** — native browser full-screen API
- **Keyboard shortcuts** — arrow keys, Home/End, Ctrl+F for search

## Installation

```bash
npm install next-react-pdf react-pdf pdfjs-dist @mui/material @mui/icons-material @emotion/react @emotion/styled
```

> `react-pdf` and `pdfjs-dist` are peer dependencies and must be installed alongside this package.

## Setup

### 1. Copy the PDF.js worker

The PDF.js worker must be served as a static file. Add the following script to your project:

```bash
# Run once (or add to predev / prebuild in package.json)
node node_modules/next-react-pdf/scripts/copy-worker.js
```

Or add it to your `package.json` scripts so it runs automatically:

```json
{
  "scripts": {
    "copy-pdf-worker": "node node_modules/next-react-pdf/scripts/copy-worker.js",
    "predev":   "npm run copy-pdf-worker",
    "prebuild": "npm run copy-pdf-worker"
  }
}
```

This copies `pdf.worker.min.js` into your `public/` directory, making it available at `/pdf.worker.min.js`.

### 2. (Optional) Custom worker URL

If you serve the worker from a different path, call `configurePdfWorker` once at the root of your application **before** the viewer renders:

```tsx
// app/layout.tsx  or  pages/_app.tsx
'use client';
import { configurePdfWorker } from 'next-react-pdf';

configurePdfWorker('/static/pdf.worker.min.js');
```

If you skip this step, the viewer falls back to `/pdf.worker.min.js` automatically.

### 3. Next.js webpack config (recommended)

Add the following to your `next.config.js` to prevent webpack from trying to bundle the PDF.js worker:

```js
// next.config.js
module.exports = {
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
};
```

## Usage

```tsx
'use client';

import PdfViewer from 'next-react-pdf';

export default function DocumentPage() {
  return (
    <div style={{ height: '100vh' }}>
      <PdfViewer
        fileUrl="/sample.pdf"
        fileName="Sample Document"
        onDocumentLoad={(numPages) => console.log(`Loaded ${numPages} pages`)}
      />
    </div>
  );
}
```

## API

### `<PdfViewer>` props

| Prop             | Type                          | Default            | Description                                         |
|------------------|-------------------------------|--------------------|-----------------------------------------------------|
| `fileUrl`        | `string \| null`              | **required**       | URL or blob URL of the PDF. Pass `null` for empty state. |
| `fileName`       | `string`                      | `'document.pdf'`   | Display name used in the toolbar title and download. |
| `onDocumentLoad` | `(numPages: number) => void`  | —                  | Callback fired when the PDF finishes loading.        |

### `configurePdfWorker(src: string)`

Sets the PDF.js worker URL globally. Call before the first render.

```tsx
import { configurePdfWorker } from 'next-react-pdf';
configurePdfWorker('/pdf.worker.min.js');
```

### Direct client import

For advanced use cases where you manage the dynamic import yourself:

```tsx
import { PdfViewerClient } from 'next-react-pdf';
```

## Requirements

| Peer dependency           | Version          |
|---------------------------|------------------|
| `react`                   | ^18.0.0 \| ^19.0.0 |
| `react-dom`               | ^18.0.0 \| ^19.0.0 |
| `next`                    | ^14.0.0 \| ^15.0.0 |
| `react-pdf`               | ^9.0.0 \| ^10.0.0  |
| `pdfjs-dist`              | ^4.0.0           |
| `@mui/material`           | ^5.0.0 \| ^6.0.0  |
| `@mui/icons-material`     | ^5.0.0 \| ^6.0.0  |

## License

MIT © [StellarX Team](https://github.com/stellarx57)
