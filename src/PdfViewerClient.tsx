// ─── pdfjs-dist (self-sustaining — no react-pdf) ─────────────────────────────
import * as pdfjs from 'pdfjs-dist';
import type {
  PDFDocumentProxy,
} from 'pdfjs-dist';
import type { TextLayerParameters } from 'pdfjs-dist/types/src/display/text_layer';
import type { AnnotationLayerParameters } from 'pdfjs-dist/types/src/display/annotation_layer';

// Set default worker only once, client-side. Can be overridden via configurePdfWorker().
if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
}

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
  type ChangeEvent, type DragEvent, type KeyboardEvent,
} from 'react';

import {
  Alert, Box, CircularProgress, Dialog, DialogContent, DialogTitle,
  Divider, IconButton, InputBase, List, ListItemButton, ListItemText,
  MenuItem, Paper, Select, Skeleton, Tab, Tabs, Tooltip, Typography,
} from '@mui/material';
import {
  AttachFileOutlined, BookmarkBorderOutlined, BookmarkOutlined,
  CloseOutlined, CloudDownloadOutlined, DescriptionOutlined,
  FileOpenOutlined, FirstPageOutlined, FullscreenExitOutlined, FullscreenOutlined,
  InfoOutlined, LastPageOutlined, NavigateBeforeOutlined, NavigateNextOutlined,
  PictureAsPdfOutlined, PrintOutlined, RotateLeftOutlined, RotateRightOutlined,
  SearchOutlined, TextFieldsOutlined, ViewDayOutlined, ViewStreamOutlined,
  WarningAmberOutlined, ZoomInOutlined, ZoomOutOutlined,
} from '@mui/icons-material';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Options forwarded directly to `pdfjs.getDocument()`.
 * Use `httpHeaders` to attach an Authorization header for secured PDF endpoints.
 */
export interface PdfDocumentOptions {
  /** HTTP headers forwarded to every PDF fetch (e.g. `{ Authorization: 'Bearer …' }`). */
  httpHeaders?: Record<string, string>;
  /** Send cookies with cross-origin requests. */
  withCredentials?: boolean;
  /** Password for password-protected PDFs. */
  password?: string;
  /** Any additional options understood by pdfjs `getDocument()`. */
  [key: string]: unknown;
}

export interface PdfViewerProps {
  /** URL or blob URL of the PDF to display. Pass `null` for an empty state. */
  fileUrl: string | null;
  /** Display name used in the toolbar and for download. Defaults to `'document.pdf'`. */
  fileName?: string;
  /** Fired once the PDF document metadata is loaded; receives total page count. */
  onDocumentLoad?: (numPages: number) => void;
  /** Fired when the current visible page changes. */
  onPageChange?: (page: number) => void;
  /** Fired when the PDF fails to load. */
  onError?: (err: Error) => void;
  /** Page number to open when a new document loads. Defaults to `1`. */
  initialPage?: number;
  /** Initial zoom. A number is treated as a scale factor (1.0 = 100%). Defaults to `'page-fit'`. */
  defaultZoom?: number | 'page-fit' | 'page-width';
  /**
   * pdfjs `getDocument()` options. The most important field is `httpHeaders`
   * for passing an Authorization header to secured endpoints.
   *
   * @example
   * ```tsx
   * <PdfViewer
   *   fileUrl="/api/attachment?fileName=abc.pdf"
   *   options={{ httpHeaders: { Authorization: `Bearer ${token}` } }}
   * />
   * ```
   */
  options?: PdfDocumentOptions;
  /**
   * Custom token resolver called when `options.httpHeaders` is not set.
   * Return the raw JWT (without the scheme prefix); the viewer prepends `'Bearer '`.
   * Return `null` or `undefined` to skip auth injection.
   *
   * @example
   * ```tsx
   * <PdfViewer
   *   fileUrl={url}
   *   tokenResolver={() => sessionStorage.getItem('jwt')}
   * />
   * ```
   */
  tokenResolver?: () => string | null | undefined;
  /**
   * `localStorage` key for the access token.
   * Used when neither `options` nor `tokenResolver` is provided.
   * Defaults to `'access_token'`.
   */
  tokenKey?: string;
  /**
   * `localStorage` key for the token type (e.g. `'Bearer'`).
   * Used when neither `options` nor `tokenResolver` is provided.
   * Defaults to `'token_type'`.
   */
  tokenTypeKey?: string;
  /**
   * Set to `true` to completely disable automatic auth-header injection.
   * Useful when the PDF URL is public or the token is already embedded in the URL.
   * Defaults to `false`.
   */
  disableAuth?: boolean;
}

// ─── Internal types ───────────────────────────────────────────────────────────

type SidebarTab = 'thumbnails' | 'outline' | 'attachments';
type ScrollMode = 'continuous' | 'single';
type SelectMode = 'text' | 'hand';
type ZoomPreset = 'page-fit' | 'page-width' | 'actual' | 'custom';

interface PdfAttachment {
  name:     string;
  content:  Uint8Array;
  mimeType: string;
}
interface PdfProperties {
  title:    string;
  author:   string;
  subject:  string;
  creator:  string;
  producer: string;
  created:  string;
  modified: string;
  pages:    number;
}

// ─── Theme ────────────────────────────────────────────────────────────────────

const T = {
  toolbarBg:     '#FFFFFF',
  toolbarBorder: '#DDE3EF',
  sidebarBg:     '#F4F6FB',
  sidebarTabBg:  '#EBF0FA',
  viewerBg:      '#E8EDF6',
  blue:          '#1565C0',
  blueDark:      '#0D47A1',
  blueHover:     'rgba(21,101,192,0.07)',
  blueActive:    'rgba(21,101,192,0.13)',
  textPrimary:   '#263238',
  textMuted:     '#78909C',
  textIcon:      '#546E7A',
  border:        '#DDE3EF',
  scrollThumb:   '#90A4AE',
  scrollTrack:   '#D7DCE8',
} as const;

// ─── Constants ────────────────────────────────────────────────────────────────

const SIDEBAR_W      = 220;
const TOOLBAR_H      = 48;
const VIEWER_PADDING = 48;     // horizontal + vertical padding inside viewer box
const ZOOM_MIN       = 0.25;
const ZOOM_MAX       = 4.0;
const ZOOM_STEP      = 0.25;
const THUMB_W        = 140;
const SEARCH_DEBOUNCE_MS = 350;

const ZOOM_OPTIONS: { label: string; value: number | null; preset: ZoomPreset }[] = [
  { label: 'Page Fit',    value: null, preset: 'page-fit'   },
  { label: 'Page Width',  value: null, preset: 'page-width' },
  { label: 'Actual Size', value: 1.0,  preset: 'actual'     },
  { label: '50%',         value: 0.50, preset: 'custom'     },
  { label: '75%',         value: 0.75, preset: 'custom'     },
  { label: '100%',        value: 1.00, preset: 'custom'     },
  { label: '125%',        value: 1.25, preset: 'custom'     },
  { label: '150%',        value: 1.50, preset: 'custom'     },
  { label: '200%',        value: 2.00, preset: 'custom'     },
  { label: '300%',        value: 3.00, preset: 'custom'     },
  { label: '400%',        value: 4.00, preset: 'custom'     },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Returns HTML with matched query wrapped in <mark>. XSS-safe via escaping. */
function highlightText(str: string, query: string): string {
  if (!query.trim()) return escHtml(str);
  const escaped = escHtml(str);
  const q       = escHtml(query.trim());
  if (!q) return escaped;
  try {
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escaped.replace(re, '<mark style="background:#FFEB3B;color:#000;border-radius:2px">$1</mark>');
  } catch {
    return escaped;
  }
}

function formatDate(raw: string | undefined): string {
  if (!raw) return '—';
  const m = raw.match(/D:(\d{4})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return raw;
}

function formatBytes(n: number): string {
  if (n < 1024)          return `${n} B`;
  if (n < 1024 * 1024)   return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

/** Map common file extensions to MIME types for downloaded attachments. */
const MIME_MAP: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', tiff: 'image/tiff',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  doc:  'application/msword',  xls: 'application/vnd.ms-excel',
  ppt:  'application/vnd.ms-powerpoint', zip: 'application/zip',
  txt: 'text/plain', xml: 'text/xml', json: 'application/json',
  mp4: 'video/mp4', mp3: 'audio/mpeg',
};
function mimeFromFilename(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_MAP[ext] ?? 'application/octet-stream';
}

// ─── Minimal IPDFLinkService — handles external links & in-doc navigation ──────
// Fulfils the interface required by pdfjs-dist AnnotationLayer with a lightweight
// implementation. Callers can pass an `onGotoPage` callback for in-document jumps.
class SimpleLinkService {
  private _page = 1;
  private _pagesCount = 0;
  private _onGotoPage: (n: number) => void;

  constructor(options: { pagesCount?: number; onGotoPage?: (n: number) => void } = {}) {
    this._pagesCount  = options.pagesCount  ?? 0;
    this._onGotoPage  = options.onGotoPage  ?? (() => {});
  }

  get pagesCount()           { return this._pagesCount; }
  get page()                 { return this._page; }
  set page(v: number)        { this._page = v; }
  get rotation()             { return 0; }
  set rotation(_v: number)   { /* no-op */ }
  get isInPresentationMode() { return false; }
  get externalLinkEnabled()  { return true; }
  set externalLinkEnabled(_v: boolean) { /* no-op */ }

  goToDestination(dest: string | unknown[]): Promise<void> {
    if (typeof dest === 'number') this._onGotoPage(dest as number);
    return Promise.resolve();
  }
  goToPage(val: number | string): void {
    const n = typeof val === 'string' ? parseInt(val, 10) : val;
    if (!isNaN(n)) this._onGotoPage(n);
  }
  goToXY(pageNumber: number, _x: number, _y: number): void { this._onGotoPage(pageNumber); }

  addLinkAttributes(link: HTMLAnchorElement, url: string, newWindow = true): void {
    link.href   = url;
    link.target = newWindow ? '_blank' : '_self';
    link.rel    = 'noopener noreferrer';
  }
  getDestinationHash(_dest: unknown): string { return ''; }
  getAnchorUrl(_hash: unknown): string { return ''; }
  setHash(_hash: string): void { /* no-op */ }
  executeNamedAction(_action: string): void { /* no-op */ }
  executeSetOCGState(_action: object): void { /* no-op */ }
}

// ─── Layer CSS (injected at module scope) ──────────────────────────────────────
// We inject the CSS needed for pdfjs TextLayer and AnnotationLayer as inline
// JS to keep the package self-contained (no CSS import required by the consumer).
const LAYER_CSS = `
.nrp-text-layer {
  position:absolute; inset:0; overflow:clip; opacity:0.25;
  line-height:1; text-size-adjust:none; forced-color-adjust:none;
  transform-origin:0 0; caret-color:CanvasText; z-index:2;
  pointer-events:none;
}
.nrp-text-selectable .nrp-text-layer { pointer-events:auto; cursor:text; }
.nrp-text-layer span, .nrp-text-layer br {
  color:transparent; position:absolute; white-space:pre;
  transform-origin:0% 0%;
}
.nrp-text-layer .highlight {
  margin:-1px; padding:1px; background-color:rgba(180,0,170,1); border-radius:4px;
}
.nrp-text-layer .highlight.selected { background-color:rgba(0,100,0,1); }
.nrp-text-layer ::selection { background:rgba(0,0,255,0.25); }
.nrp-annot-layer {
  position:absolute; inset:0; overflow:hidden;
  pointer-events:none; transform-origin:0 0; z-index:3;
}
.nrp-annot-layer section { pointer-events:auto; position:absolute; transform-origin:0 0; }
.nrp-annot-layer canvas { position:absolute; width:100%; height:100%; }
.nrp-annot-layer .linkAnnotation > a,
.nrp-annot-layer .buttonWidgetAnnotation.pushButton > a {
  position:absolute; font-size:1em; top:0; left:0; width:100%; height:100%;
}
.nrp-annot-layer .linkAnnotation > a:hover,
.nrp-annot-layer .buttonWidgetAnnotation.pushButton > a:hover {
  opacity:0.2; background:rgb(255,255,0); box-shadow:0px 2px 10px rgb(255,255,0);
}
`;

if (typeof document !== 'undefined') {
  const id = 'nrp-layer-css';
  if (!document.getElementById(id)) {
    const style = document.createElement('style');
    style.id = id;
    style.textContent = LAYER_CSS;
    document.head.appendChild(style);
  }
}

// ─── PdfPage — renders a single PDF page using pdfjs-dist directly ────────────
// Replaces react-pdf's <Page> component. Manages canvas, TextLayer, AnnotationLayer.

interface PdfPageProps {
  /** Loaded PDFDocumentProxy — must be valid and not destroyed. */
  pdf:                   PDFDocumentProxy;
  pageNumber:            number;
  scale:                 number;
  /** Rotation in degrees (0, 90, 180, 270). */
  rotation:              number;
  renderTextLayer:       boolean;
  renderAnnotationLayer: boolean;
  /** Called with the first-page dimensions after successful render. */
  onLoadSuccess?: (dimensions: { originalWidth: number; originalHeight: number }) => void;
  /** Fallback rendered while page loads. */
  loading?: React.ReactNode;
  /** Map (string → HTML) applied to text spans; enables search highlighting. */
  customTextRenderer?: (str: string) => string;
  /** Used by AnnotationLayer for internal navigation. */
  linkService?: SimpleLinkService;
  /** Extra inline style on the page root. */
  style?: React.CSSProperties;
}

function PdfPage({
  pdf, pageNumber, scale, rotation,
  renderTextLayer: doText,
  renderAnnotationLayer: doAnnot,
  onLoadSuccess, loading, customTextRenderer, linkService, style,
}: PdfPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded]       = useState(false);
  const [renderErr, setRenderErr] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let renderTask: any = null;

    setLoaded(false);
    setRenderErr(null);

    // Clear previous content
    container.innerHTML = '';

    const run = async () => {
      const page         = await pdf.getPage(pageNumber);
      if (cancelled) return;

      const viewport = page.getViewport({ scale, rotation });

      // ── Canvas ────────────────────────────────────────────────────────────
      const canvas       = document.createElement('canvas');
      const ctx          = canvas.getContext('2d');
      if (!ctx) { setRenderErr('Canvas 2D context unavailable.'); return; }

      const outputScale   = window.devicePixelRatio || 1;
      canvas.width        = Math.floor(viewport.width  * outputScale);
      canvas.height       = Math.floor(viewport.height * outputScale);
      canvas.style.width  = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      canvas.style.display = 'block';
      canvas.style.position = 'relative';
      canvas.style.zIndex   = '1';

      container.style.position = 'relative';
      container.style.width    = `${viewport.width}px`;
      container.style.height   = `${viewport.height}px`;
      container.appendChild(canvas);

      const transform = outputScale !== 1
        ? [outputScale, 0, 0, outputScale, 0, 0]
        : undefined;

      renderTask = page.render({ canvas, canvasContext: ctx, viewport, transform } as Parameters<typeof page.render>[0]);
      await renderTask.promise;
      if (cancelled) return;

      // ── Text layer ────────────────────────────────────────────────────────
      if (doText) {
        const textDiv = document.createElement('div');
        textDiv.className = 'nrp-text-layer';
        textDiv.style.width  = `${viewport.width}px`;
        textDiv.style.height = `${viewport.height}px`;
        container.appendChild(textDiv);

        const textContent = await page.getTextContent();
        if (cancelled) return;

        // Apply custom highlight renderer if provided
        if (customTextRenderer) {
          textContent.items.forEach((item) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const it = item as any;
            if (it.str != null) it.str = customTextRenderer(it.str);
          });
        }

        try {
          const tl = new pdfjs.TextLayer({
            textContentSource: textContent,
            container: textDiv,
            viewport,
          } as TextLayerParameters);
          await tl.render();
        } catch { /* non-critical; omit text layer gracefully */ }
        if (cancelled) return;
      }

      // ── Annotation layer ──────────────────────────────────────────────────
      if (doAnnot) {
        const annotDiv = document.createElement('div');
        annotDiv.className = 'nrp-annot-layer';
        annotDiv.style.width  = `${viewport.width}px`;
        annotDiv.style.height = `${viewport.height}px`;
        container.appendChild(annotDiv);

        try {
          const annotations = await page.getAnnotations({ intent: 'display' });
          if (cancelled) return;

          const ls = linkService ?? new SimpleLinkService();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const annLayer = new (pdfjs as any).AnnotationLayer({
            div:                      annotDiv,
            accessibilityManager:     null,
            annotationCanvasMap:      null,
            annotationEditorUIManager:null,
            page,
            viewport:                 viewport.clone({ dontFlip: true }),
            structTreeLayer:          null,
            commentManager:           null,
            linkService:              ls,
            annotationStorage:        null,
          });
          await annLayer.render({
            viewport: viewport.clone({ dontFlip: true }),
            div:      annotDiv,
            annotations,
            page,
            linkService:    ls,
            renderForms:    false,
          } as AnnotationLayerParameters);
        } catch { /* non-critical; omit annotation layer gracefully */ }
        if (cancelled) return;
      }

      onLoadSuccess?.({ originalWidth: viewport.width / scale, originalHeight: viewport.height / scale });
      setLoaded(true);
    };

    run().catch((err) => {
      if (!cancelled) setRenderErr(err?.message ?? 'Page render error.');
    });

    return () => {
      cancelled = true;
      try { renderTask?.cancel(); } catch { /* ignore */ }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, pageNumber, scale, rotation, doText, doAnnot]);

  const viewport = useMemo(() => {
    // Derive dimensions without rendering — for skeleton sizing
    // This is a rough estimate (595 × 842 is A4 at 72 dpi)
    return { width: 595 * scale, height: 842 * scale };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  if (renderErr) return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: viewport.width, height: viewport.height, color: '#EF5350' }}>
      <WarningAmberOutlined sx={{ mr: 0.5, fontSize: 16 }} />
      <Typography variant="caption">{renderErr}</Typography>
    </Box>
  );

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', display: 'inline-block', lineHeight: 0, ...style }}
      aria-label={`PDF page ${pageNumber}`}
    >
      {!loaded && (loading ?? (
        <Skeleton variant="rectangular"
          width={Math.round(viewport.width)}
          height={Math.round(viewport.height)}
        />
      ))}
    </div>
  );
}

// ─── PdfOutline — renders the document's table of contents ───────────────────

interface OutlineItem {
  title: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dest:  string | any[] | null;
  items: OutlineItem[];
}

function OutlineNode({
  item, indent, onItemClick,
}: { item: OutlineItem; indent: number; onItemClick: (dest: OutlineItem['dest']) => void }) {
  const [open, setOpen] = useState(indent < 2);
  return (
    <>
      <Box
        component="a"
        href="#"
        onClick={(e: React.MouseEvent) => {
          e.preventDefault();
          if (item.items.length) setOpen((v) => !v);
          onItemClick(item.dest);
        }}
        sx={{
          display: 'block', px: `${8 + indent * 12}px`, py: '4px',
          borderRadius: '6px', color: T.blue, fontSize: '0.78rem', fontWeight: 500,
          textDecoration: 'none', lineHeight: 1.4, wordBreak: 'break-word',
          transition: 'background 0.15s, color 0.15s',
          '&:hover': { backgroundColor: T.blueHover, color: T.blueDark },
          '&:focus-visible': { outline: `2px solid ${T.blue}`, outlineOffset: '1px' },
        }}
      >
        {item.items.length > 0 && (
          <span style={{ marginRight: 4, fontSize: '0.65em', opacity: 0.7 }}>
            {open ? '▾' : '▸'}
          </span>
        )}
        {item.title}
      </Box>
      {open && item.items.map((child, i) => (
        <OutlineNode key={i} item={child} indent={indent + 1} onItemClick={onItemClick} />
      ))}
    </>
  );
}

interface PdfOutlineProps {
  pdf:         PDFDocumentProxy | null;
  onItemClick: (dest: OutlineItem['dest']) => void;
}
function PdfOutline({ pdf, onItemClick }: PdfOutlineProps) {
  const [items, setItems] = useState<OutlineItem[]>([]);

  useEffect(() => {
    if (!pdf) return;
    pdf.getOutline()
      .then((outline) => setItems((outline as OutlineItem[]) ?? []))
      .catch(() => setItems([]));
  }, [pdf]);

  if (items.length === 0)
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <BookmarkBorderOutlined sx={{ fontSize: 32, color: T.scrollThumb, mb: 1 }} />
        <Typography variant="caption" color={T.textMuted}>No outline</Typography>
      </Box>
    );

  return (
    <Box sx={{ p: 0.5 }}>
      {items.map((item, i) => (
        <OutlineNode key={i} item={item} indent={0} onItemClick={onItemClick} />
      ))}
    </Box>
  );
}

// ─── Shared toolbar button ────────────────────────────────────────────────────
// Defined at module level so React never re-mounts it due to reference changes.

const BTN_SX  = { color: T.textIcon, padding: '4px', '&:hover': { color: T.blue, backgroundColor: T.blueHover } };
const ACTV_SX = { color: T.blue, backgroundColor: T.blueActive };

interface BtnProps {
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}
function Btn({ title, onClick, active = false, disabled = false, children }: BtnProps) {
  return (
    <Tooltip title={title} arrow placement="bottom">
      <span>
        <IconButton size="small" onClick={onClick} disabled={disabled}
          sx={active ? [BTN_SX, ACTV_SX] : BTN_SX}>
          {children}
        </IconButton>
      </span>
    </Tooltip>
  );
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────

interface ToolbarProps {
  numPages:       number;
  currentPage:    number;
  scale:          number;
  zoomPreset:     ZoomPreset;
  rotation:       number;
  scrollMode:     ScrollMode;
  selectMode:     SelectMode;
  isFullScreen:   boolean;
  sidebarOpen:    boolean;
  sidebarTab:     SidebarTab;
  searchOpen:     boolean;
  fileName:       string;
  onPageInput:    (p: number) => void;
  onFirstPage:    () => void;
  onPrevPage:     () => void;
  onNextPage:     () => void;
  onLastPage:     () => void;
  onZoomIn:       () => void;
  onZoomOut:      () => void;
  onZoomSelect:   (value: number | null, preset: ZoomPreset) => void;
  onRotateLeft:   () => void;
  onRotateRight:  () => void;
  onScrollToggle: () => void;
  onSelectToggle: () => void;
  onFullScreen:   () => void;
  onOpenFile:     () => void;
  onDownload:     () => void;
  onPrint:        () => void;
  onProperties:   () => void;
  onSidebarTab:   (tab: SidebarTab) => void;
  onSearchToggle: () => void;
}

const DIVIDER_SX = { borderColor: T.border, mx: 0.5, height: 24, alignSelf: 'center' };

function Toolbar(p: ToolbarProps) {
  const [pageInput, setPageInput] = useState(String(p.currentPage));
  useEffect(() => setPageInput(String(p.currentPage)), [p.currentPage]);

  const commitPage = () => {
    const n = parseInt(pageInput, 10);
    if (!isNaN(n) && n >= 1 && n <= p.numPages) p.onPageInput(n);
    else setPageInput(String(p.currentPage));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitPage();
  };

  // 'Actual Size' preset must match the ZOOM_OPTIONS label exactly.
  const zoomLabel =
    p.zoomPreset === 'page-fit'   ? 'Page Fit'    :
    p.zoomPreset === 'page-width' ? 'Page Width'  :
    p.zoomPreset === 'actual'     ? 'Actual Size' :
    `${Math.round(p.scale * 100)}%`;

  return (
    <Box sx={{
      height: TOOLBAR_H, display: 'flex', alignItems: 'center',
      px: 0.5, gap: 0.25, backgroundColor: T.toolbarBg,
      borderBottom: `1px solid ${T.toolbarBorder}`, flexShrink: 0, overflowX: 'auto',
      boxShadow: '0 1px 3px rgba(21,101,192,0.07)',
    }} role="toolbar" aria-label="PDF viewer toolbar">

      {/* Sidebar toggles */}
      <Btn title="Thumbnails" onClick={() => p.onSidebarTab('thumbnails')} active={p.sidebarOpen && p.sidebarTab === 'thumbnails'}>
        <ViewStreamOutlined sx={{ fontSize: 18 }} />
      </Btn>
      <Btn title="Table of Contents" onClick={() => p.onSidebarTab('outline')} active={p.sidebarOpen && p.sidebarTab === 'outline'}>
        <BookmarkBorderOutlined sx={{ fontSize: 18 }} />
      </Btn>
      <Btn title="Attachments" onClick={() => p.onSidebarTab('attachments')} active={p.sidebarOpen && p.sidebarTab === 'attachments'}>
        <AttachFileOutlined sx={{ fontSize: 18 }} />
      </Btn>

      <Divider orientation="vertical" sx={DIVIDER_SX} />

      {/* Page navigation */}
      <Btn title="First page (Home)" onClick={p.onFirstPage} disabled={p.currentPage <= 1}>
        <FirstPageOutlined sx={{ fontSize: 18 }} />
      </Btn>
      <Btn title="Previous page (↑)" onClick={p.onPrevPage} disabled={p.currentPage <= 1}>
        <NavigateBeforeOutlined sx={{ fontSize: 18 }} />
      </Btn>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mx: 0.5 }}>
        <InputBase
          value={pageInput}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setPageInput(e.target.value)}
          onBlur={commitPage}
          onKeyDown={onKeyDown}
          inputProps={{ 'aria-label': 'Current page', style: { textAlign: 'center' } }}
          sx={{
            width: 40, height: 28, color: T.textPrimary, fontSize: '0.8rem',
            backgroundColor: T.blueHover, borderRadius: 1, border: `1px solid ${T.border}`,
            '& input': { padding: '2px 4px' },
          }}
        />
        <Typography sx={{ color: T.textMuted, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
          / {p.numPages || '—'}
        </Typography>
      </Box>
      <Btn title="Next page (↓)" onClick={p.onNextPage} disabled={p.currentPage >= p.numPages}>
        <NavigateNextOutlined sx={{ fontSize: 18 }} />
      </Btn>
      <Btn title="Last page (End)" onClick={p.onLastPage} disabled={p.currentPage >= p.numPages}>
        <LastPageOutlined sx={{ fontSize: 18 }} />
      </Btn>

      <Divider orientation="vertical" sx={DIVIDER_SX} />

      {/* Zoom */}
      <Btn title="Zoom out" onClick={p.onZoomOut} disabled={p.scale <= ZOOM_MIN}>
        <ZoomOutOutlined sx={{ fontSize: 18 }} />
      </Btn>
      <Select
        value={zoomLabel}
        size="small"
        variant="outlined"
        renderValue={(v) => <Typography sx={{ fontSize: '0.75rem', color: T.textPrimary }}>{v}</Typography>}
        sx={{
          height: 28, minWidth: 100, color: T.textPrimary, fontSize: '0.75rem',
          backgroundColor: T.blueHover, borderRadius: 1, border: `1px solid ${T.border}`,
          '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
          '& .MuiSelect-icon': { color: T.textMuted },
        }}
        inputProps={{ 'aria-label': 'Zoom level' }}
        MenuProps={{ PaperProps: { sx: { backgroundColor: '#FFFFFF', color: T.textPrimary, boxShadow: `0 4px 16px ${T.blueActive}` } } }}
      >
        {ZOOM_OPTIONS.map((opt) => (
          <MenuItem key={opt.label} value={opt.label}
            onClick={() => p.onZoomSelect(opt.value, opt.preset)}
            sx={{ fontSize: '0.8rem', color: T.textPrimary, '&:hover': { backgroundColor: T.blueHover } }}>
            {opt.label}
          </MenuItem>
        ))}
      </Select>
      <Btn title="Zoom in" onClick={p.onZoomIn} disabled={p.scale >= ZOOM_MAX}>
        <ZoomInOutlined sx={{ fontSize: 18 }} />
      </Btn>

      <Divider orientation="vertical" sx={DIVIDER_SX} />

      {/* Rotate */}
      <Btn title="Rotate left"  onClick={p.onRotateLeft}>
        <RotateLeftOutlined sx={{ fontSize: 18 }} />
      </Btn>
      <Btn title="Rotate right" onClick={p.onRotateRight}>
        <RotateRightOutlined sx={{ fontSize: 18 }} />
      </Btn>

      <Divider orientation="vertical" sx={DIVIDER_SX} />

      {/* View modes */}
      <Btn title="Text selection mode" onClick={p.onSelectToggle} active={p.selectMode === 'text'}>
        <TextFieldsOutlined sx={{ fontSize: 18 }} />
      </Btn>
      <Btn title={p.scrollMode === 'continuous' ? 'Switch to single-page' : 'Switch to continuous scroll'}
        onClick={p.onScrollToggle} active={p.scrollMode === 'single'}>
        <ViewDayOutlined sx={{ fontSize: 18 }} />
      </Btn>
      <Btn title="Search in document" onClick={p.onSearchToggle} active={p.searchOpen}>
        <SearchOutlined sx={{ fontSize: 18 }} />
      </Btn>

      <Divider orientation="vertical" sx={DIVIDER_SX} />

      {/* File operations */}
      <Btn title="Open local file" onClick={p.onOpenFile}>
        <FileOpenOutlined sx={{ fontSize: 18 }} />
      </Btn>
      <Btn title="Download" onClick={p.onDownload}>
        <CloudDownloadOutlined sx={{ fontSize: 18 }} />
      </Btn>
      <Btn title="Print" onClick={p.onPrint}>
        <PrintOutlined sx={{ fontSize: 18 }} />
      </Btn>
      <Btn title="Document properties" onClick={p.onProperties}>
        <InfoOutlined sx={{ fontSize: 18 }} />
      </Btn>
      <Btn title={p.isFullScreen ? 'Exit full screen' : 'Full screen'} onClick={p.onFullScreen}>
        {p.isFullScreen
          ? <FullscreenExitOutlined sx={{ fontSize: 18 }} />
          : <FullscreenOutlined    sx={{ fontSize: 18 }} />}
      </Btn>

      {p.fileName && (
        <Typography sx={{
          ml: 1, color: T.textMuted, fontSize: '0.72rem',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200,
        }} title={p.fileName}>
          {p.fileName}
        </Typography>
      )}
    </Box>
  );
}

// ─── Lazy thumbnail ───────────────────────────────────────────────────────────
// Uses IntersectionObserver so only thumbnails in the viewport are rendered.
// For large documents this avoids loading all page canvases simultaneously.

interface LazyThumbProps {
  pageNum:     number;
  pdf:         PDFDocumentProxy;
  currentPage: number;
  onPageClick: (n: number) => void;
}

function LazyThumbnail({ pageNum: n, pdf, currentPage, onPageClick }: LazyThumbProps) {
  const ref             = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const active = n === currentPage;

  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); io.disconnect(); } },
      { rootMargin: '200px' },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  return (
    <Box ref={ref} onClick={() => onPageClick(n)} sx={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      cursor: 'pointer', borderRadius: 1, p: 0.5,
      border: active ? `2px solid ${T.blue}` : '2px solid transparent',
      backgroundColor: active ? T.blueActive : 'transparent',
      '&:hover': { backgroundColor: T.blueHover },
    }}>
      <Paper elevation={active ? 4 : 2} sx={{ overflow: 'hidden', mb: 0.5, lineHeight: 0 }}>
        {visible ? (
          <PdfPage
            pdf={pdf}
            pageNumber={n}
            scale={THUMB_W / 595}
            rotation={0}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            loading={<Skeleton variant="rectangular" width={THUMB_W} height={Math.round(THUMB_W * 1.414)} />}
          />
        ) : (
          <Skeleton variant="rectangular" width={THUMB_W} height={Math.round(THUMB_W * 1.414)} />
        )}
      </Paper>
      <Typography variant="caption" sx={{
        color: active ? T.blue : T.textMuted,
        fontSize: '0.65rem', fontWeight: active ? 700 : 400,
      }}>
        {n}
      </Typography>
    </Box>
  );
}

// ─── Thumbnail sidebar ────────────────────────────────────────────────────────

function ThumbnailSidebar({ pdf, numPages, currentPage, onPageClick }: {
  pdf: PDFDocumentProxy; numPages: number; currentPage: number; onPageClick: (n: number) => void;
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 1 }}>
      {Array.from({ length: numPages }, (_, i) => (
        <LazyThumbnail key={i + 1} pageNum={i + 1} pdf={pdf} currentPage={currentPage} onPageClick={onPageClick} />
      ))}
    </Box>
  );
}

// ─── Attachments sidebar ──────────────────────────────────────────────────────

function AttachmentsSidebar({ attachments }: { attachments: PdfAttachment[] }) {
  const download = (att: PdfAttachment) => {
    const blob = new Blob([att.content.buffer as ArrayBuffer], { type: att.mimeType });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = att.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (attachments.length === 0)
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <AttachFileOutlined sx={{ fontSize: 32, color: T.scrollThumb, mb: 1 }} />
        <Typography variant="caption" color={T.textMuted}>No attachments</Typography>
      </Box>
    );

  return (
    <List dense disablePadding>
      {attachments.map((att) => (
        <ListItemButton key={att.name} onClick={() => download(att)}
          sx={{ py: 0.75, '&:hover': { backgroundColor: T.blueHover } }}>
          <DescriptionOutlined sx={{ fontSize: 16, color: T.blue, mr: 1, flexShrink: 0 }} />
          <ListItemText
            primary={<Typography variant="caption" sx={{ color: T.textPrimary, wordBreak: 'break-word' }}>{att.name}</Typography>}
            secondary={<Typography variant="caption" sx={{ color: T.textMuted, fontSize: '0.65rem' }}>{formatBytes(att.content.byteLength)}</Typography>}
          />
          <CloudDownloadOutlined sx={{ fontSize: 14, color: T.scrollThumb, ml: 1 }} />
        </ListItemButton>
      ))}
    </List>
  );
}

// ─── Search panel ─────────────────────────────────────────────────────────────

interface SearchPanelProps {
  query:         string;
  matchPages:    number[];
  matchIdx:      number;
  searching:     boolean;
  onQueryChange: (q: string) => void;
  onPrev:        () => void;
  onNext:        () => void;
  onClose:       () => void;
}
function SearchPanel({ query, matchPages, matchIdx, searching, onQueryChange, onPrev, onNext, onClose }: SearchPanelProps) {
  return (
    <Paper elevation={0} sx={{
      position: 'absolute', top: 8, right: 8, zIndex: 10,
      display: 'flex', alignItems: 'center', gap: 0.5,
      px: 1.25, py: 0.75, borderRadius: 2, backgroundColor: '#FFFFFF',
      border: `1px solid ${T.border}`, boxShadow: `0 4px 20px ${T.blueActive}`,
    }}>
      <SearchOutlined sx={{ fontSize: 16, color: T.blue }} />
      <InputBase autoFocus placeholder="Search…" value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        inputProps={{ 'aria-label': 'Search document text' }}
        sx={{ color: T.textPrimary, fontSize: '0.8rem', width: 180, '& input': { padding: '2px 4px' } }}
      />
      {searching && <CircularProgress size={14} sx={{ color: T.blue }} />}
      {!searching && query && (
        <Typography sx={{ fontSize: '0.72rem', color: T.textMuted, whiteSpace: 'nowrap', minWidth: 50 }}>
          {matchPages.length === 0 ? 'No results' : `${matchIdx + 1}/${matchPages.length} pages`}
        </Typography>
      )}
      <Tooltip title="Previous match"><span>
        <IconButton size="small" onClick={onPrev} disabled={matchPages.length === 0}
          sx={{ color: T.textIcon, p: '2px', '&:hover': { color: T.blue } }}>
          <NavigateBeforeOutlined sx={{ fontSize: 16 }} />
        </IconButton>
      </span></Tooltip>
      <Tooltip title="Next match"><span>
        <IconButton size="small" onClick={onNext} disabled={matchPages.length === 0}
          sx={{ color: T.textIcon, p: '2px', '&:hover': { color: T.blue } }}>
          <NavigateNextOutlined sx={{ fontSize: 16 }} />
        </IconButton>
      </span></Tooltip>
      <Tooltip title="Close search"><span>
        <IconButton size="small" onClick={onClose}
          sx={{ color: T.textIcon, p: '2px', '&:hover': { color: T.blue } }}>
          <CloseOutlined sx={{ fontSize: 16 }} />
        </IconButton>
      </span></Tooltip>
    </Paper>
  );
}

// ─── Properties dialog ────────────────────────────────────────────────────────

function PropertiesDialog({ open, info, onClose }: {
  open: boolean; info: PdfProperties | null; onClose: () => void;
}) {
  const rows = info ? [
    ['Title',             info.title    || '—'],
    ['Author',            info.author   || '—'],
    ['Subject',           info.subject  || '—'],
    ['Creator',           info.creator  || '—'],
    ['Producer',          info.producer || '—'],
    ['Creation Date',     formatDate(info.created)],
    ['Modification Date', formatDate(info.modified)],
    ['Pages',             String(info.pages)],
  ] : [];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1.5 }}>
        <InfoOutlined fontSize="small" />
        Document Properties
        <IconButton size="small" onClick={onClose} sx={{ ml: 'auto' }}>
          <CloseOutlined fontSize="small" />
        </IconButton>
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ p: 0 }}>
        {rows.map(([label, value], i) => (
          <Box key={label} sx={{
            display: 'flex', px: 2, py: 1,
            backgroundColor: i % 2 === 0 ? 'action.hover' : 'transparent',
          }}>
            <Typography variant="body2" sx={{ width: 140, fontWeight: 600, flexShrink: 0, color: 'text.secondary' }}>
              {label}
            </Typography>
            <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>{value}</Typography>
          </Box>
        ))}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PdfViewerClient({
  fileUrl, fileName = 'document.pdf', onDocumentLoad,
  onPageChange, onError, initialPage = 1, defaultZoom = 'page-fit',
  options, tokenResolver, tokenKey = 'access_token',
  tokenTypeKey = 'token_type', disableAuth = false,
}: PdfViewerProps) {
  const [numPages,       setNumPages]       = useState(0);
  const [currentPage,    setCurrentPage]    = useState(initialPage);
  const [scale,          setScale]          = useState(1.0);
  const [zoomPreset,     setZoomPreset]     = useState<ZoomPreset>(defaultZoom as ZoomPreset);
  const [rotation,       setRotation]       = useState(0);
  const [scrollMode,     setScrollMode]     = useState<ScrollMode>('continuous');
  const [selectMode,     setSelectMode]     = useState<SelectMode>('text');
  const [sidebarOpen,    setSidebarOpen]    = useState(false);
  const [sidebarTab,     setSidebarTab]     = useState<SidebarTab>('thumbnails');
  const [searchOpen,     setSearchOpen]     = useState(false);
  const [searchQuery,    setSearchQuery]    = useState('');
  const [matchPages,     setMatchPages]     = useState<number[]>([]);
  const [matchIdx,       setMatchIdx]       = useState(0);
  const [isSearching,    setIsSearching]    = useState(false);
  const [isFullScreen,   setIsFullScreen]   = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [pdfProperties,  setPdfProperties]  = useState<PdfProperties | null>(null);
  const [attachments,    setAttachments]    = useState<PdfAttachment[]>([]);
  const [pdfDoc,         setPdfDoc]         = useState<PDFDocumentProxy | null>(null);
  const [loadError,      setLoadError]      = useState<string | null>(null);
  const [localFileUrl,   setLocalFileUrl]   = useState<string | null>(null);
  const [localFileName,  setLocalFileName]  = useState<string>('');
  const [isDragOver,     setIsDragOver]     = useState(false);
  const [origPageWidth,  setOrigPageWidth]  = useState(0);
  const [origPageHeight, setOrigPageHeight] = useState(0);

  const rootRef      = useRef<HTMLDivElement>(null);
  const viewerRef    = useRef<HTMLDivElement>(null);
  const pageRefs     = useRef<(HTMLDivElement | null)[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCountRef = useRef(0); // tracks nested dragenter/dragleave to prevent flicker

  const displayFile = localFileUrl || fileUrl;
  const displayName = localFileName || fileName;

  // ── Auth resolution (options → tokenResolver → localStorage) ─────────────

  const resolvedOptions = useMemo<PdfDocumentOptions>(() => {
    if (options?.httpHeaders) return options;
    if (disableAuth) return options ?? {};
    const rawToken = tokenResolver ? tokenResolver() : null;
    if (rawToken) return { ...options, httpHeaders: { Authorization: `Bearer ${rawToken}` } };
    if (typeof window === 'undefined') return options ?? {};
    const token     = window.localStorage.getItem(tokenKey);
    const tokenType = window.localStorage.getItem(tokenTypeKey) ?? 'Bearer';
    if (!token) return options ?? {};
    return { ...options, httpHeaders: { Authorization: `${tokenType} ${token}` } };
  }, [options, tokenResolver, disableAuth, tokenKey, tokenTypeKey]);

  // ── LinkService instance for AnnotationLayer navigation ──────────────────
  const linkServiceRef = useRef<SimpleLinkService>(
    new SimpleLinkService({ pagesCount: 0, onGotoPage: () => {} }),
  );

  // ── Pages array (memoized) ────────────────────────────────────────────────

  const pages = useMemo(() => Array.from({ length: numPages }, (_, i) => i + 1), [numPages]);

  // ── Zoom ──────────────────────────────────────────────────────────────────

  const computeFitScale = useCallback((width: number, height: number) => {
    if (!viewerRef.current || width <= 0 || height <= 0) return;
    const cw = viewerRef.current.clientWidth  - VIEWER_PADDING;
    const ch = viewerRef.current.clientHeight - VIEWER_PADDING;
    if (cw <= 0 || ch <= 0) return;
    if (zoomPreset === 'page-fit')
      setScale(Math.max(Math.min(cw / width, ch / height), ZOOM_MIN));
    else if (zoomPreset === 'page-width')
      setScale(Math.max(cw / width, ZOOM_MIN));
  }, [zoomPreset]);

  // Debounced ResizeObserver to recompute auto-zoom without oscillation.
  useEffect(() => {
    if (!viewerRef.current || (zoomPreset !== 'page-fit' && zoomPreset !== 'page-width')) return;
    if (!origPageWidth || !origPageHeight) return;
    let rafId = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => computeFitScale(origPageWidth, origPageHeight));
    });
    observer.observe(viewerRef.current);
    computeFitScale(origPageWidth, origPageHeight);
    return () => { observer.disconnect(); cancelAnimationFrame(rafId); };
  }, [computeFitScale, origPageWidth, origPageHeight, zoomPreset]);


  const handlePageLoadSuccess = useCallback(({ originalWidth, originalHeight }: { originalWidth: number; originalHeight: number }) => {
    if (origPageWidth) return; // capture first-page dimensions only
    setOrigPageWidth(originalWidth);
    setOrigPageHeight(originalHeight);
    if (zoomPreset === 'page-fit' || zoomPreset === 'page-width')
      computeFitScale(originalWidth, originalHeight);
    else
      setScale(1.0);
  }, [origPageWidth, zoomPreset, computeFitScale]);

  // Reset + load PDF whenever the URL or auth options change.
  useEffect(() => {
    setNumPages(0);      setCurrentPage(initialPage);
    setOrigPageWidth(0); setOrigPageHeight(0);
    setMatchPages([]);   setSearchQuery('');
    setAttachments([]);  setPdfProperties(null);
    setLoadError(null);
    if (!displayFile) return;

    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let loadingTask: any = null;

    const run = async () => {
      loadingTask = pdfjs.getDocument({ url: displayFile, ...resolvedOptions });
      const pdf: PDFDocumentProxy = await loadingTask.promise;
      if (cancelled) { pdf.destroy(); return; }
      setPdfDoc(pdf);
      setNumPages(pdf.numPages);
      setLoadError(null);
      onDocumentLoad?.(pdf.numPages);
      pageRefs.current = new Array(pdf.numPages).fill(null);
      // Update link service with real page count.
      linkServiceRef.current = new SimpleLinkService({
        pagesCount: pdf.numPages,
        onGotoPage: (n) => goToPage(n),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pdf.getMetadata().then(({ info }: { info: any }) => {
        const s = (v: unknown) => (v != null ? String(v) : '');
        setPdfProperties({
          title:    s(info.Title),
          author:   s(info.Author),
          subject:  s(info.Subject),
          creator:  s(info.Creator),
          producer: s(info.Producer),
          created:  s(info.CreationDate),
          modified: s(info.ModDate),
          pages:    pdf.numPages,
        });
      }).catch(() => {});

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (pdf as any).getAttachments()
        .then((atts: Record<string, { content: Uint8Array; filename: string }> | null) => {
          if (!atts) return;
          setAttachments(Object.values(atts).map((a) => ({
            name:     a.filename || 'attachment',
            content:  a.content,
            mimeType: mimeFromFilename(a.filename || ''),
          })));
        })
        .catch(() => {});
    };

    run().catch((err: Error) => {
      if (!cancelled) {
        const msg = err?.message || 'Failed to load PDF.';
        setLoadError(msg);
        onError?.(err);
      }
    });

    return () => {
      cancelled = true;
      loadingTask?.destroy?.();
      setPdfDoc(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayFile, resolvedOptions, initialPage]);

  // Cleanup local blob URL on unmount.
  useEffect(() => () => { if (localFileUrl) URL.revokeObjectURL(localFileUrl); }, [localFileUrl]);

  // ── Navigation ────────────────────────────────────────────────────────────

  const scrollToPage = useCallback((n: number) => {
    pageRefs.current[n - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const goToPage = useCallback((n: number) => {
    const clamped = Math.max(1, Math.min(n, numPages));
    setCurrentPage(clamped);
    onPageChange?.(clamped);
    if (scrollMode === 'continuous') scrollToPage(clamped);
  }, [numPages, scrollMode, scrollToPage, onPageChange]);

  // IntersectionObserver to track visible page in continuous mode.
  useEffect(() => {
    if (scrollMode !== 'continuous' || !viewerRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = pageRefs.current.indexOf(entry.target as HTMLDivElement);
            if (idx !== -1) setCurrentPage(idx + 1);
          }
        });
      },
      { root: viewerRef.current, rootMargin: '0px', threshold: 0.5 },
    );
    pageRefs.current.forEach((el) => { if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, [numPages, scrollMode]);

  // ── Zoom actions ──────────────────────────────────────────────────────────

  const handleZoomIn  = () => { setZoomPreset('custom'); setScale((s) => Math.min(s + ZOOM_STEP, ZOOM_MAX)); };
  const handleZoomOut = () => { setZoomPreset('custom'); setScale((s) => Math.max(s - ZOOM_STEP, ZOOM_MIN)); };
  const handleZoomSelect = (value: number | null, preset: ZoomPreset) => {
    setZoomPreset(preset);
    if (value !== null) setScale(value);
    else if (origPageWidth && origPageHeight) computeFitScale(origPageWidth, origPageHeight);
  };

  const handleRotateLeft  = () => setRotation((r) => (r - 90 + 360) % 360);
  const handleRotateRight = () => setRotation((r) => (r + 90) % 360);

  // ── Full screen ───────────────────────────────────────────────────────────

  useEffect(() => {
    const onChange = () => setIsFullScreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const handleFullScreen = () => {
    if (!rootRef.current) return;
    if (!document.fullscreenElement) rootRef.current.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  };

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (numPages === 0) return; // no document loaded
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goToPage(currentPage + 1); }
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); goToPage(currentPage - 1); }
      if (e.key === 'Home')  { e.preventDefault(); goToPage(1); }
      if (e.key === 'End')   { e.preventDefault(); goToPage(numPages); }
      if (e.key === 'f' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setSearchOpen((v) => !v); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentPage, numPages, goToPage]);

  // ── Text search with debounce ─────────────────────────────────────────────

  useEffect(() => {
    if (!pdfDoc || !searchQuery.trim()) { setMatchPages([]); setMatchIdx(0); return; }
    const query = searchQuery.trim().toLowerCase();
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout>;

    timerId = setTimeout(async () => {
      setIsSearching(true);
      const hits: number[] = [];
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        if (cancelled) return;
        const page = await pdfDoc.getPage(i);
        const tc   = await page.getTextContent();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const text = tc.items.map((it: any) => it.str ?? '').join(' ').toLowerCase();
        if (text.includes(query)) hits.push(i);
      }
      if (!cancelled) { setMatchPages(hits); setMatchIdx(0); setIsSearching(false); }
    }, SEARCH_DEBOUNCE_MS);

    return () => { cancelled = true; clearTimeout(timerId); };
  }, [pdfDoc, searchQuery]);

  // Navigate to matching page when index changes.
  useEffect(() => {
    if (matchPages.length > 0) goToPage(matchPages[matchIdx]);
  }, [matchIdx, matchPages, goToPage]);

  // ── Drag-and-drop (flicker-free via counter) ──────────────────────────────

  const applyLocalFile = (file: File) => {
    if (file.type !== 'application/pdf') return;
    if (localFileUrl) URL.revokeObjectURL(localFileUrl);
    setLocalFileUrl(URL.createObjectURL(file));
    setLocalFileName(file.name);
  };

  const handleDragEnter = (e: DragEvent) => { e.preventDefault(); dragCountRef.current++; setIsDragOver(true); };
  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    dragCountRef.current--;
    if (dragCountRef.current <= 0) { dragCountRef.current = 0; setIsDragOver(false); }
  };
  const handleDrop = (e: DragEvent) => {
    e.preventDefault(); dragCountRef.current = 0; setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) applyLocalFile(file);
  };
  const handleDragOver = (e: DragEvent) => e.preventDefault();

  // ── Download ──────────────────────────────────────────────────────────────

  const handleDownload = async () => {
    if (!displayFile) return;
    try {
      const res  = await fetch(displayFile, { headers: resolvedOptions?.httpHeaders ?? {} });
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement('a'), { href: url, download: displayName });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(displayFile, '_blank', 'noopener,noreferrer');
    }
  };

  // ── Print ─────────────────────────────────────────────────────────────────

  const handlePrint = async () => {
    if (!displayFile) return;
    try {
      const res  = await fetch(displayFile, { headers: resolvedOptions?.httpHeaders ?? {} });
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;';
      iframe.src = url;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setTimeout(() => {
            if (document.body.contains(iframe)) document.body.removeChild(iframe);
            URL.revokeObjectURL(url);
          }, 3000);
        }, 500);
      };
    } catch {
      // fallback — no auth
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;';
      iframe.src = displayFile;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 3000);
        }, 500);
      };
    }
  };

  // ── Sidebar ───────────────────────────────────────────────────────────────

  const handleSidebarTab = (tab: SidebarTab) => {
    if (sidebarOpen && sidebarTab === tab) setSidebarOpen(false);
    else { setSidebarOpen(true); setSidebarTab(tab); }
  };

  // ── Custom text renderer (search highlighting) ────────────────────────────

  const customTextRenderer = useCallback((str: string): string =>
    highlightText(str, searchQuery),
  [searchQuery]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!displayFile) return (
    <Box sx={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', gap: 2, backgroundColor: T.viewerBg, color: T.textMuted,
    }}>
      <PictureAsPdfOutlined sx={{ fontSize: 64, color: T.blue, opacity: 0.25 }} />
      <Typography variant="body2" sx={{ color: T.textPrimary, fontWeight: 500 }}>
        Select a document to view it.
      </Typography>
      <Typography variant="caption" sx={{ color: T.textMuted }}>
        Or drag and drop a PDF file here to open it locally.
      </Typography>
    </Box>
  );

  return (
    <Box ref={rootRef} sx={{
      display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
      backgroundColor: T.toolbarBg, userSelect: selectMode === 'hand' ? 'none' : 'text',
    }}>
      <input
        ref={fileInputRef} type="file" accept="application/pdf" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) applyLocalFile(f); e.target.value = ''; }}
        aria-label="Open local PDF file"
      />

      <Toolbar
        numPages={numPages}       currentPage={currentPage}
        scale={scale}             zoomPreset={zoomPreset}
        rotation={rotation}       scrollMode={scrollMode}
        selectMode={selectMode}   isFullScreen={isFullScreen}
        sidebarOpen={sidebarOpen} sidebarTab={sidebarTab}
        searchOpen={searchOpen}   fileName={displayName}
        onPageInput={goToPage}
        onFirstPage={() => goToPage(1)}
        onPrevPage={() => goToPage(currentPage - 1)}
        onNextPage={() => goToPage(currentPage + 1)}
        onLastPage={() => goToPage(numPages)}
        onZoomIn={handleZoomIn}   onZoomOut={handleZoomOut}
        onZoomSelect={handleZoomSelect}
        onRotateLeft={handleRotateLeft} onRotateRight={handleRotateRight}
        onScrollToggle={() => setScrollMode((m) => m === 'continuous' ? 'single' : 'continuous')}
        onSelectToggle={() => setSelectMode((m) => m === 'text' ? 'hand' : 'text')}
        onFullScreen={handleFullScreen}
        onOpenFile={() => fileInputRef.current?.click()}
        onDownload={handleDownload}
        onPrint={handlePrint}
        onProperties={() => setPropertiesOpen(true)}
        onSidebarTab={handleSidebarTab}
        onSearchToggle={() => setSearchOpen((v) => !v)}
      />

      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', minHeight: 0 }}>

        {/* Loading overlay */}
        {displayFile && !pdfDoc && !loadError && (
          <Box sx={{
            position: 'absolute', inset: 0, zIndex: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: T.viewerBg,
          }}>
            <CircularProgress sx={{ color: T.blue }} />
          </Box>
        )}

        {/* Sidebar */}
        {sidebarOpen && (
          <Box sx={{
            width: SIDEBAR_W, flexShrink: 0,
            borderRight: `1px solid ${T.border}`, backgroundColor: T.sidebarBg,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <Tabs value={sidebarTab} onChange={(_, v) => setSidebarTab(v)} sx={{
              minHeight: 36, backgroundColor: T.sidebarTabBg, flexShrink: 0,
              borderBottom: `1px solid ${T.border}`,
              '& .MuiTab-root': { color: T.textMuted, minHeight: 36, py: 0.5, fontSize: '0.7rem' },
              '& .Mui-selected': { color: T.blue, fontWeight: 700 },
              '& .MuiTabs-indicator': { backgroundColor: T.blue, height: 3, borderRadius: '3px 3px 0 0' },
            }}>
              <Tab value="thumbnails"  label="Pages"       icon={<ViewStreamOutlined sx={{ fontSize: 14 }} />} iconPosition="start" />
              <Tab value="outline"     label="Outline"     icon={<BookmarkOutlined   sx={{ fontSize: 14 }} />} iconPosition="start" />
              <Tab value="attachments" label="Attachments" icon={<AttachFileOutlined sx={{ fontSize: 14 }} />} iconPosition="start" />
            </Tabs>
            <Box sx={{
              flex: 1, overflow: 'auto',
              '&::-webkit-scrollbar': { width: 4 },
              '&::-webkit-scrollbar-thumb': { backgroundColor: T.scrollThumb, borderRadius: 2 },
            }}>
              {sidebarTab === 'thumbnails' && pdfDoc && numPages > 0 && (
                <ThumbnailSidebar pdf={pdfDoc} numPages={numPages} currentPage={currentPage} onPageClick={goToPage} />
              )}
              {sidebarTab === 'outline' && (
                <Box sx={{ p: 1 }}>
                  <PdfOutline pdf={pdfDoc} onItemClick={(dest) => {
                    if (typeof dest === 'number') goToPage(dest + 1);
                  }} />
                </Box>
              )}
              {sidebarTab === 'attachments' && (
                <AttachmentsSidebar attachments={attachments} />
              )}
            </Box>
          </Box>
        )}

        {/* Main page viewer */}
        <Box
          ref={viewerRef}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          sx={{
            flex: 1, minHeight: 0, overflowX: 'hidden', overflowY: 'auto',
            position: 'relative',
            backgroundColor: isDragOver ? T.blueActive : T.viewerBg,
            outline: isDragOver ? `3px dashed ${T.blue}` : 'none',
            cursor: selectMode === 'hand' ? 'grab' : 'text',
            '&::-webkit-scrollbar':       { width: 8 },
            '&::-webkit-scrollbar-thumb': { backgroundColor: T.scrollThumb, borderRadius: 4 },
            '&::-webkit-scrollbar-track': { backgroundColor: T.scrollTrack },
          }}
        >
          {isDragOver && (
            <Box sx={{
              position: 'absolute', inset: 0, zIndex: 5, display: 'flex',
              alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
              pointerEvents: 'none', gap: 1, color: T.blue,
            }}>
              <FileOpenOutlined sx={{ fontSize: 48 }} />
              <Typography variant="body1" fontWeight={600}>Drop PDF to open</Typography>
            </Box>
          )}

          {searchOpen && (
            <SearchPanel
              query={searchQuery} matchPages={matchPages}
              matchIdx={matchIdx} searching={isSearching}
              onQueryChange={setSearchQuery}
              onPrev={() => setMatchIdx((i) => (i - 1 + matchPages.length) % matchPages.length)}
              onNext={() => setMatchIdx((i) => (i + 1) % matchPages.length)}
              onClose={() => { setSearchOpen(false); setSearchQuery(''); }}
            />
          )}

          {loadError && <Alert severity="error" sx={{ m: 2 }}>{loadError}</Alert>}

          {pdfDoc && (scrollMode === 'continuous'
            ? pages.map((n) => (
                <Box
                  key={n}
                  ref={(el) => { pageRefs.current[n - 1] = el as HTMLDivElement | null; }}
                  sx={{ display: 'flex', justifyContent: 'center', p: '8px 8px 0 8px' }}
                  aria-label={`Page ${n}`}
                >
                  <Paper elevation={4} sx={{ lineHeight: 0 }}>
                    <PdfPage
                      pdf={pdfDoc}
                      pageNumber={n}
                      scale={scale}
                      rotation={rotation}
                      renderTextLayer={selectMode === 'text'}
                      renderAnnotationLayer
                      customTextRenderer={searchQuery ? customTextRenderer : undefined}
                      onLoadSuccess={n === 1 ? handlePageLoadSuccess : undefined}
                      linkService={linkServiceRef.current}
                    />
                  </Paper>
                </Box>
              ))
            : (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                  <Paper elevation={4} sx={{ lineHeight: 0 }}>
                    <PdfPage
                      pdf={pdfDoc}
                      pageNumber={currentPage}
                      scale={scale}
                      rotation={rotation}
                      renderTextLayer={selectMode === 'text'}
                      renderAnnotationLayer
                      customTextRenderer={searchQuery ? customTextRenderer : undefined}
                      onLoadSuccess={handlePageLoadSuccess}
                      linkService={linkServiceRef.current}
                    />
                  </Paper>
                </Box>
              )
          )}

          {scrollMode === 'continuous' && numPages > 0 && <Box sx={{ height: 16 }} />}
        </Box>
      </Box>

      <PropertiesDialog open={propertiesOpen} info={pdfProperties} onClose={() => setPropertiesOpen(false)} />
    </Box>
  );
}
