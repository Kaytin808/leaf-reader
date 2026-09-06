'use client';
/* oxlint-disable react/react-compiler -- Synchronizes canvas rendering and native scroll geometry. */
/* oxlint-disable nextjs/no-img-element -- EPUB artwork is a local blob, not an optimized server image. */
/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- Scroll regions must be keyboard focusable for native arrow-key panning. */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Minus, Plus } from 'lucide-react';
import {
  anchoredScroll,
  bindReaderTaps,
  clampZoom,
  MAX_ZOOM,
  MIN_ZOOM,
  zoomLayout,
} from '@/lib/reader-gestures';

export function ZoomControls({
  zoom,
  onChange,
  image = false,
}: {
  zoom: number;
  onChange: (zoom: number) => void;
  image?: boolean;
}) {
  return (
    <div
      className="zoom-controls"
      role="toolbar"
      aria-label={image ? 'Image zoom' : 'PDF zoom'}
    >
      <button
        className="icon-button"
        aria-label="Zoom out"
        disabled={zoom <= MIN_ZOOM}
        onClick={() => onChange(clampZoom(zoom - 0.25))}
      >
        <Minus size={18} />
      </button>
      <output aria-label="Zoom level">{Math.round(zoom * 100)}%</output>
      <button
        className="icon-button"
        aria-label="Zoom in"
        disabled={zoom >= MAX_ZOOM}
        onClick={() => onChange(clampZoom(zoom + 0.25))}
      >
        <Plus size={18} />
      </button>
      <button className="text-button" onClick={() => onChange(1)}>
        {image ? 'Fit image' : 'Fit width'}
      </button>
    </div>
  );
}

function ZoomViewport({
  width,
  height,
  zoom,
  onZoom,
  children,
  image = false,
  onTurn,
  onCenter,
  resetKey = 0,
}: {
  width: number;
  height: number;
  zoom: number;
  onZoom: (zoom: number) => void;
  children: (width: number) => ReactNode;
  image?: boolean;
  onTurn?: (direction: -1 | 1) => void;
  onCenter?: () => void;
  resetKey?: number;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const anchor = useRef<{
    x: number;
    y: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  const previousZoom = useRef(zoom);
  const previousReset = useRef(resetKey);
  const current = useRef({ zoom, onZoom, onTurn, onCenter });
  current.current = { zoom, onZoom, onTurn, onCenter };
  const layout = zoomLayout(
    width,
    height,
    size.width,
    size.height,
    zoom,
    image,
  );

  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    // Button zoom anchors the visible center. Pinch supplies its own focal point.
    if (zoom !== previousZoom.current && !anchor.current) {
      const old = zoomLayout(
        width,
        height,
        size.width,
        size.height,
        previousZoom.current,
        image,
      );
      anchor.current = {
        x: (el.scrollLeft + el.clientWidth / 2 - old.left) / old.width,
        y: (el.scrollTop + el.clientHeight / 2 - old.top) / old.height,
        clientX: el.clientWidth / 2,
        clientY: el.clientHeight / 2,
      };
    }
    if (
      resetKey !== previousReset.current ||
      (zoom === 1 && previousZoom.current !== 1)
    ) {
      el.scrollTo(0, 0);
    } else if (anchor.current) {
      const offset = anchoredScroll(anchor.current, layout);
      el.scrollTo(offset.left, offset.top);
    }
    anchor.current = null;
    previousZoom.current = zoom;
    previousReset.current = resetKey;
  });

  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    let measured = { width: 0, height: 0 };
    const measure = () => {
      const next = { width: el.clientWidth, height: el.clientHeight };
      if (next.width === measured.width && next.height === measured.height)
        return;
      if (measured.width && sheet.current && current.current.zoom > 1) {
        const page = sheet.current.getBoundingClientRect();
        const view = el.getBoundingClientRect();
        anchor.current = {
          x: (view.left + el.clientWidth / 2 - page.left) / page.width,
          y: (view.top + el.clientHeight / 2 - page.top) / page.height,
          clientX: el.clientWidth / 2,
          clientY: el.clientHeight / 2,
        };
      }
      measured = next;
      setSize(next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    let pinch: { distance: number; zoom: number; x: number; y: number } | null =
      null;
    const pair = (event: TouchEvent) => {
      if (event.touches.length !== 2) return null;
      const [a, b] = Array.from(event.touches);
      return {
        distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        x: (a.clientX + b.clientX) / 2,
        y: (a.clientY + b.clientY) / 2,
      };
    };
    const start = (event: TouchEvent) => {
      const points = pair(event);
      if (!points || !sheet.current) {
        pinch = null;
        return;
      }
      event.preventDefault();
      const bounds = sheet.current.getBoundingClientRect();
      pinch = {
        distance: Math.max(1, points.distance),
        zoom: current.current.zoom,
        x: (points.x - bounds.left) / bounds.width,
        y: (points.y - bounds.top) / bounds.height,
      };
    };
    const move = (event: TouchEvent) => {
      const points = pair(event);
      if (!pinch || !points) return;
      event.preventDefault();
      const bounds = el.getBoundingClientRect();
      anchor.current = {
        x: pinch.x,
        y: pinch.y,
        clientX: points.x - bounds.left,
        clientY: points.y - bounds.top,
      };
      current.current.onZoom(
        clampZoom((pinch.zoom * points.distance) / pinch.distance),
      );
    };
    const end = () => {
      pinch = null;
    };
    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    const unbind = bindReaderTaps(el, {
      enabled: () => !pinch,
      canTurn: () => current.current.zoom <= 1,
      bounds: () => el.getBoundingClientRect(),
      turn: (direction) => current.current.onTurn?.(direction),
      center: () => current.current.onCenter?.(),
    });
    return () => {
      observer.disconnect();
      unbind();
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, []);

  return (
    <section
      className="zoom-viewport"
      ref={viewport}
      tabIndex={0}
      aria-label={
        image
          ? 'Enlarged illustration. Pinch to zoom and scroll to pan.'
          : 'PDF page. Pinch to zoom and scroll to pan.'
      }
    >
      <div
        className="zoom-stage"
        style={{ width: layout.stageWidth, height: layout.stageHeight }}
      >
        <div
          className="zoom-sheet"
          ref={sheet}
          style={{
            width: layout.width,
            height: layout.height,
            left: layout.left,
            top: layout.top,
          }}
        >
          {children(layout.width)}
        </div>
      </div>
    </section>
  );
}

function PdfCanvas({
  document,
  page,
  width,
  onError,
}: {
  document: PDFDocumentProxy;
  page: number;
  width: number;
  onError: (message: string) => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    let task:
      | ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']>
      | undefined;
    const render = async () => {
      try {
        const pdfPage = await document.getPage(page);
        if (cancelled) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const view = pdfPage.getViewport({ scale: width / base.width });
        const ratio = Math.min(
          window.devicePixelRatio || 1,
          2,
          Math.sqrt(8000000 / (view.width * view.height)),
        );
        const canvas = window.document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(view.width * ratio));
        canvas.height = Math.max(1, Math.floor(view.height * ratio));
        canvas.setAttribute('role', 'img');
        canvas.setAttribute(
          'aria-label',
          `Page ${page} of ${document.numPages}`,
        );
        task = pdfPage.render({
          canvas,
          viewport: view,
          transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
        });
        await task.promise;
        if (!cancelled && mount.current) mount.current.replaceChildren(canvas);
      } catch (error) {
        if (
          !cancelled &&
          (error as Error).name !== 'RenderingCancelledException'
        )
          onError('This PDF page could not be rendered. Try another page.');
      }
    };
    // Keep the previous bitmap visible during a pinch, then sharpen when it settles.
    const timer = setTimeout(() => void render(), 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      task?.cancel();
    };
  }, [document, page, width, onError]);
  return <div ref={mount} className="pdf-canvas" />;
}

export function PdfPage({
  document,
  page,
  zoom,
  onZoom,
  onTurn,
  onCenter,
  onError,
  resetKey,
}: {
  document: PDFDocumentProxy;
  page: number;
  zoom: number;
  onZoom: (zoom: number) => void;
  onTurn: (direction: -1 | 1) => void;
  onCenter?: () => void;
  onError: (message: string) => void;
  resetKey: number;
}) {
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void document
      .getPage(page)
      .then((p) => {
        if (!cancelled) {
          const v = p.getViewport({ scale: 1 });
          setDimensions({ width: v.width, height: v.height });
        }
      })
      .catch(() => {
        if (!cancelled)
          onError('This PDF page could not be opened. Try another page.');
      });
    return () => {
      cancelled = true;
    };
  }, [document, page, onError]);
  if (!dimensions)
    return <output className="zoom-page-loading">Loading page…</output>;
  return (
    <ZoomViewport
      {...dimensions}
      zoom={zoom}
      onZoom={onZoom}
      onTurn={onTurn}
      onCenter={onCenter}
      resetKey={resetKey}
    >
      {(width) => (
        <PdfCanvas
          document={document}
          page={page}
          width={width}
          onError={onError}
        />
      )}
    </ZoomViewport>
  );
}

export function ImagePage({ src, alt }: { src: string; alt: string }) {
  const [zoom, setZoom] = useState(1);
  const [resetKey, setResetKey] = useState(0);
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled)
        setDimensions({
          width: image.naturalWidth || 1000,
          height: image.naturalHeight || 1000,
        });
    };
    image.onerror = () => {
      if (!cancelled) setFailed(true);
    };
    image.src = src;
    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [src]);
  return (
    <>
      <ZoomControls
        zoom={zoom}
        onChange={(value) => {
          setZoom(value);
          if (value === 1) setResetKey((key) => key + 1);
        }}
        image
      />
      {failed ? (
        <p role="alert">
          This illustration cannot be enlarged. Close this view to continue
          reading.
        </p>
      ) : dimensions ? (
        <ZoomViewport
          {...dimensions}
          zoom={zoom}
          onZoom={setZoom}
          resetKey={resetKey}
          image
        >
          {() => <img src={src} alt={alt} draggable={false} />}
        </ZoomViewport>
      ) : (
        <output>Opening illustration…</output>
      )}
    </>
  );
}
