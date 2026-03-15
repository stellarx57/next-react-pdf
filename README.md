# next-react-pdf

A feature-rich, SSR-safe, **self-sustaining** PDF viewer component for **Next.js** and React applications built on [PDF.js](https://mozilla.github.io/pdf.js/) and [Material-UI](https://mui.com/).

> **v2.0.0 — Breaking change:** `react-pdf` has been removed as a dependency. The viewer renders directly with `pdfjs-dist` v5, so `react-pdf` is no longer required and should be removed from your project.

## Features

- **Self-sustaining** — renders directly with `pdfjs-dist` v5; no `react-pdf` dependency
- **Secure by default** — built-in JWT authentication; automatically attaches `Authorization` headers to every fetch (document load, download, print)
- **SSR-safe** — uses `next/dynamic` with `ssr: false`; the PDF.js runtime never runs on the server
- **Thumbnail sidebar** — lazy-loaded page strip with live previews
- **Table of contents** — renders the PDF outline/bookmarks via `pdf.getOutline()`
- **Attachments** — list and download embedded file attachments
- **Text search** — full-document search with highlighted matches and page navigation
- **Zoom** — presets (Page Fit, Page Width, Actual Size) plus custom levels from 25% to 400%
- **Rotation** — left/right 90° rotation
- **Continuous / single-page scroll** — toggle between modes
- **Text selection & hand-scroll modes**
- **Drag-and-drop** — open a local PDF by dropping it onto the viewer
- **Open local file** — file picker button in the toolbar
- **Download & Print** — auth-aware; fetches with headers before creating a blob URL
- **Document properties** — title, author, creation date, etc.
- **Full-screen** — native browser Fullscreen API
- **Keyboard shortcuts** — arrow keys, Home/End, Ctrl+F for search

## Installation

```bash
npm install next-react-pdf pdfjs-dist @mui/material @mui/icons-material @emotion/react @emotion/styled
```

> `pdfjs-dist` and the MUI packages are peer dependencies and must be installed alongside this package.

> **Upgrading from v1?** Remove `react-pdf` from your dependencies — it is no longer needed. See the [migration guide](#migrating-from-v1) below.

## Setup

### 1. Copy the PDF.js worker

The PDF.js worker must be served as a static file. Add the setup script to your `package.json` so it runs automatically before every dev start and production build:

```json
{
  "scripts": {
    "copy-pdf-worker": "node node_modules/next-react-pdf/scripts/copy-worker.js",
    "predev":   "npm run copy-pdf-worker",
    "prebuild": "npm run copy-pdf-worker"
  }
}
```

Or run it once manually:

```bash
node node_modules/next-react-pdf/scripts/copy-worker.js
```

This copies `pdf.worker.min.js` into your `public/` directory, making it available at `/pdf.worker.min.js`.

### 2. Next.js config

Add the following to your `next.config.js` to prevent webpack from trying to bundle the PDF.js worker and to correctly handle `pdfjs-dist` (ESM-only):

```js
// next.config.js
module.exports = {
  transpilePackages: ['pdfjs-dist'],
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
};
```

### 3. (Optional) Custom worker URL

If you serve the worker from a non-default path, call `configurePdfWorker` once at the root of your application **before** the viewer renders:

```tsx
// app/layout.tsx  or  pages/_app.tsx
'use client';
import { configurePdfWorker } from 'next-react-pdf';

configurePdfWorker('/static/pdf.worker.min.js');
```

If you skip this step, the viewer falls back to `/pdf.worker.min.js` automatically.

## Usage

### Basic

```tsx
'use client';
import { PdfViewer } from 'next-react-pdf';

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

### Secured endpoint (JWT auto-resolved from localStorage)

By default the viewer reads `access_token` and `token_type` from `localStorage` and attaches them as an `Authorization` header to every request — including download and print. No extra configuration needed for most single-page app setups:

```tsx
<PdfViewer
  fileUrl="https://api.example.com/documents/123/pdf"
  fileName="Contract.pdf"
/>
```

### Explicit `Authorization` header via `options`

Pass `options.httpHeaders` to take full control. This has the highest priority and overrides the automatic token lookup:

```tsx
<PdfViewer
  fileUrl="https://api.example.com/documents/123/pdf"
  fileName="Contract.pdf"
  options={{ httpHeaders: { Authorization: `Bearer ${myToken}` } }}
/>
```

### Dynamic token resolver

Use `tokenResolver` when the token lives outside `localStorage` (e.g. in a React context, Zustand store, or cookie):

```tsx
import { useAuthStore } from '@/stores/authStore';

export default function SecureViewer({ url }: { url: string }) {
  const getToken = useAuthStore((s) => s.getAccessToken);

  return (
    <PdfViewer
      fileUrl={url}
      tokenResolver={getToken}
    />
  );
}
```

### Custom token storage keys

If your app stores the token under different `localStorage` keys:

```tsx
<PdfViewer
  fileUrl={url}
  tokenKey="my_app_token"
  tokenTypeKey="my_app_token_type"
/>
```

### Disable authentication (public PDFs)

```tsx
<PdfViewer
  fileUrl="https://public.example.com/sample.pdf"
  disableAuth
/>
```

### Full example with all options

```tsx
<PdfViewer
  fileUrl="https://api.example.com/doc.pdf"
  fileName="Annual Report.pdf"

  // Auth — choose one approach (listed highest to lowest priority):
  options={{ httpHeaders: { Authorization: `Bearer ${token}` } }}
  tokenResolver={() => myStore.getToken()}
  tokenKey="my_app_access_token"
  tokenTypeKey="my_app_token_type"
  disableAuth={false}

  // Lifecycle
  onDocumentLoad={(numPages) => setPages(numPages)}
  onPageChange={(page) => setCurrentPage(page)}
  onError={(err) => console.error(err)}

  // Display
  initialPage={3}
  defaultZoom="page-fit"
/>
```

## API

### `<PdfViewer>` props

#### Content

| Prop       | Type             | Default          | Description                                              |
|------------|------------------|------------------|----------------------------------------------------------|
| `fileUrl`  | `string \| null` | **required**     | URL or blob URL of the PDF. Pass `null` for empty state. |
| `fileName` | `string`         | `'document.pdf'` | Display name used in the toolbar and as the download filename. |

#### Authentication

Auth is resolved in priority order: `options.httpHeaders` → `tokenResolver()` → `localStorage` fallback. Every request (document load, download, print) uses the resolved headers.

| Prop            | Type                    | Default                | Description                                                                                           |
|-----------------|-------------------------|------------------------|-------------------------------------------------------------------------------------------------------|
| `options`       | `PdfDocumentOptions`    | —                      | Options forwarded to `pdfjs.getDocument()`. Use `httpHeaders` for explicit auth or other PDF.js flags. |
| `tokenResolver` | `() => string \| null`  | —                      | Called at render time to retrieve a token. Takes priority over `localStorage`.                        |
| `tokenKey`      | `string`                | `'access_token'`       | `localStorage` key for the access token.                                                              |
| `tokenTypeKey`  | `string`                | `'token_type'`         | `localStorage` key for the token type (e.g. `'Bearer'`).                                             |
| `disableAuth`   | `boolean`               | `false`                | Set `true` to skip all auth resolution and fetch PDFs without headers.                                |

#### Lifecycle

| Prop             | Type                         | Default | Description                                        |
|------------------|------------------------------|---------|----------------------------------------------------|
| `onDocumentLoad` | `(numPages: number) => void` | —       | Fired once PDF metadata is loaded.                 |
| `onPageChange`   | `(page: number) => void`     | —       | Fired every time the visible page changes.         |
| `onError`        | `(err: Error) => void`       | —       | Fired when the PDF fails to load.                  |

#### Display

| Prop          | Type         | Default      | Description                                                                                   |
|---------------|--------------|--------------|-----------------------------------------------------------------------------------------------|
| `initialPage` | `number`     | `1`          | Page to display on first load.                                                                |
| `defaultZoom` | `string`     | `'page-fit'` | Initial zoom. One of `'page-fit'`, `'page-width'`, `'actual'`, or `'custom'`. |

### `PdfDocumentOptions`

All fields are forwarded verbatim to `pdfjs.getDocument()`. See the [PDF.js API docs](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html) for the full option reference.

```ts
import type { PdfDocumentOptions } from 'next-react-pdf';

// Common fields:
interface PdfDocumentOptions {
  httpHeaders?:     Record<string, string>; // e.g. { Authorization: 'Bearer ...' }
  withCredentials?: boolean;
  password?:        string;
  cMapUrl?:         string;
  cMapPacked?:      boolean;
  // ...and any other pdfjs.getDocument() option
}
```

### `configurePdfWorker(src: string)`

Sets the PDF.js worker URL globally. Call before the first render if you serve the worker from a non-default path.

```tsx
import { configurePdfWorker } from 'next-react-pdf';
configurePdfWorker('/static/pdf.worker.min.js');
```

### Direct client import

For advanced use cases where you manage the `next/dynamic` import yourself:

```tsx
// Only safe inside 'use client' components
import PdfViewerClient from 'next-react-pdf/PdfViewerClient';
```

### Type exports

```ts
import type { PdfViewerProps, PdfDocumentOptions } from 'next-react-pdf';
```

## Migrating from v1

### 1. Uninstall `react-pdf`

```bash
npm uninstall react-pdf
```

### 2. Update `next.config.js`

```js
// Before
transpilePackages: ['react-pdf', 'pdfjs-dist'],

// After
transpilePackages: ['pdfjs-dist'],
```

### 3. Remove manual CSS imports

```ts
// Delete these — CSS is now injected automatically:
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
```

### 4. Remove manual auth workarounds

Any `pdfOptions` / `httpHeaders` objects you were passing to the old `options` prop still work — pass them as `options` on `<PdfViewer>`. Or use the new `tokenResolver` / `tokenKey` props to let the viewer handle it automatically.

### 5. Update type imports

```ts
// New in v2:
import type { PdfViewerProps, PdfDocumentOptions } from 'next-react-pdf';
```

## Peer Dependencies

| Package               | Version              |
|-----------------------|----------------------|
| `react`               | ^18.0.0 \| ^19.0.0  |
| `react-dom`           | ^18.0.0 \| ^19.0.0  |
| `next`                | ^14.0.0 \| ^15.0.0  |
| `pdfjs-dist`          | ^5.0.0               |
| `@mui/material`       | ^5.0.0 \| ^6.0.0    |
| `@mui/icons-material` | ^5.0.0 \| ^6.0.0    |
| `@emotion/react`      | ^11.0.0              |
| `@emotion/styled`     | ^11.0.0              |

## Keyboard Shortcuts

| Key              | Action              |
|------------------|---------------------|
| `→` / `↓`       | Next page           |
| `←` / `↑`       | Previous page       |
| `Home`           | First page          |
| `End`            | Last page           |
| `Ctrl+F` / `⌘F` | Toggle search panel |

## License

MIT © [StellarX Team](https://github.com/stellarx57)
