"use client";

import {
  getDocument,
  GlobalWorkerOptions,
  version,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

if (typeof window !== "undefined") {
  GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
}

const PDFJS_ASSETS = `https://unpkg.com/pdfjs-dist@${version}`;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
/** Retina phones often use 3x; cap to limit memory on extreme zoom. */
const MAX_DPR = 3;
const MAX_CANVAS_EDGE = 8192;

type LoadState = "loading" | "ready" | "error";

function clampZoom(z: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));
}

function outputDpr() {
  return Math.min(window.devicePixelRatio || 1, MAX_DPR);
}

/** Poster PDFs embed large bitmaps — supersample on narrow screens. */
function qualityBoost() {
  if (typeof window === "undefined") return 1;
  if (window.innerWidth < 640) return 2;
  if (window.innerWidth < 1024) return 1.5;
  return 1;
}

function computeRenderScale(cssScale: number, pageWidth: number, pageHeight: number) {
  let renderScale = cssScale * outputDpr() * qualityBoost();
  const w = pageWidth * renderScale;
  const h = pageHeight * renderScale;
  if (w > MAX_CANVAS_EDGE || h > MAX_CANVAS_EDGE) {
    renderScale *= Math.min(MAX_CANVAS_EDGE / w, MAX_CANVAS_EDGE / h);
  }
  return renderScale;
}

function PdfPageCanvas({
  pdf,
  pageNumber,
  scale: cssScale,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const taskRef = useRef<{ cancel: () => void } | null>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;

    (async () => {
      taskRef.current?.cancel();
      taskRef.current = null;

      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;

      const base = page.getViewport({ scale: 1 });
      const renderScale = computeRenderScale(cssScale, base.width, base.height);
      const cssViewport = page.getViewport({ scale: cssScale });
      const viewport = page.getViewport({ scale: renderScale });

      const ctx = canvas.getContext("2d", { alpha: true });
      if (!ctx || cancelled) return;

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(cssViewport.width)}px`;
      canvas.style.height = `${Math.floor(cssViewport.height)}px`;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      const task = page.render({
        canvasContext: ctx,
        viewport,
        intent: "display",
        background: "#ffffff",
        canvas,
      });
      taskRef.current = task;
      await task.promise;
    })().catch(() => {
      /* ignore render errors on unmount / cancel */
    });

    return () => {
      cancelled = true;
      taskRef.current?.cancel();
      taskRef.current = null;
    };
  }, [pdf, pageNumber, cssScale]);

  return (
    <canvas
      ref={canvasRef}
      className="mb-2 block max-w-none bg-white last:mb-0"
    />
  );
}

export function BulletinPdfViewer({
  src,
  title,
}: {
  src: string;
  title: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
  const zoomRef = useRef(1);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [baseFit, setBaseFit] = useState(1);
  const [zoom, setZoom] = useState(1);
  /** Live CSS scale during pinch — canvas re-renders only after pinch ends. */
  const [pinchScale, setPinchScale] = useState(1);
  const [viewportTick, setViewportTick] = useState(0);
  const [layoutSize, setLayoutSize] = useState({ w: 0, h: 0 });
  const pinchScaleRef = useRef(1);
  zoomRef.current = zoom;
  pinchScaleRef.current = pinchScale;

  const renderScale = baseFit * zoom;
  const displayZoom = zoom * pinchScale;

  const measureFit = useCallback(async (pdf: PDFDocumentProxy) => {
    const page = await pdf.getPage(1);
    const natural = page.getViewport({ scale: 1 });
    const containerW = scrollRef.current?.clientWidth ?? window.innerWidth - 32;
    return Math.max(0.1, (containerW - 8) / natural.width);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    setPdfDoc(null);
    setNumPages(0);

    (async () => {
      try {
        const pdf = await getDocument({
          url: src,
          cMapUrl: `${PDFJS_ASSETS}/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `${PDFJS_ASSETS}/standard_fonts/`,
        }).promise;
        if (cancelled) {
          pdf.destroy();
          return;
        }
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
        const fit = await measureFit(pdf);
        if (cancelled) return;
        setBaseFit(fit);
        setZoom(1);
        setPinchScale(1);
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [src, measureFit]);

  useEffect(() => {
    return () => {
      pdfDoc?.destroy();
    };
  }, [pdfDoc]);

  useEffect(() => {
    const onResize = () => setViewportTick((t) => t + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (loadState !== "ready") return;

    const el = scrollRef.current;
    if (!el) return;

    const touchDist = (touches: TouchList) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    };

    const beginPinch = (touches: TouchList) => {
      pinchRef.current = { dist: touchDist(touches), zoom: zoomRef.current };
      setPinchScale(1);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        beginPinch(e.touches);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      if (!pinchRef.current) {
        beginPinch(e.touches);
      }
      const ratio = touchDist(e.touches) / pinchRef.current!.dist;
      const next = clampZoom(pinchRef.current!.zoom * ratio);
      setPinchScale(next / pinchRef.current!.zoom);
      e.preventDefault();
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length >= 2) return;
      if (!pinchRef.current) return;
      const committed = clampZoom(
        pinchRef.current.zoom * pinchScaleRef.current
      );
      setZoom(committed);
      setPinchScale(1);
      pinchRef.current = null;
    };

    // Capture phase so pinch wins over scroll on iOS/Android.
    el.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
    el.addEventListener("touchend", onTouchEnd, { capture: true });
    el.addEventListener("touchcancel", onTouchEnd, { capture: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart, { capture: true });
      el.removeEventListener("touchmove", onTouchMove, { capture: true });
      el.removeEventListener("touchend", onTouchEnd, { capture: true });
      el.removeEventListener("touchcancel", onTouchEnd, { capture: true });
    };
  }, [loadState]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pdfDoc || loadState !== "ready") return;

    const updateFit = () => {
      void measureFit(pdfDoc).then(setBaseFit);
    };

    const ro = new ResizeObserver(updateFit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loadState, pdfDoc, measureFit]);

  useEffect(() => {
    const node = contentRef.current;
    if (!node || loadState !== "ready") return;

    const measure = () => {
      setLayoutSize({ w: node.offsetWidth, h: node.offsetHeight });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [loadState, zoom, numPages, viewportTick]);

  const zoomIn = () => {
    setPinchScale(1);
    setZoom((z) => clampZoom(z + 0.25));
  };
  const zoomOut = () => {
    setPinchScale(1);
    setZoom((z) => clampZoom(z - 0.25));
  };
  const resetZoom = () => {
    setPinchScale(1);
    setZoom(1);
  };

  if (loadState === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center bg-neutral-100 text-sm text-neutral-500 dark:bg-neutral-950">
        선거공보 불러오는 중…
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-neutral-100 px-4 text-center text-sm text-neutral-500 dark:bg-neutral-950">
        <p>선거공보를 표시할 수 없습니다.</p>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline"
        >
          새 탭에서 열기
        </a>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-neutral-100 dark:bg-neutral-950">
      <div className="flex shrink-0 items-center justify-center gap-2 border-b border-neutral-200 px-2 py-1.5 dark:border-neutral-800">
        <button
          type="button"
          onClick={zoomOut}
          className="rounded px-2.5 py-1 text-base text-neutral-600 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-800"
          aria-label="축소"
        >
          −
        </button>
        <button
          type="button"
          onClick={resetZoom}
          className="min-w-[3.5rem] rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800"
        >
          {Math.round(displayZoom * 100)}%
        </button>
        <button
          type="button"
          onClick={zoomIn}
          className="rounded px-2.5 py-1 text-base text-neutral-600 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-800"
          aria-label="확대"
        >
          +
        </button>
        {numPages > 1 && (
          <span className="text-[10px] text-neutral-400">{numPages}쪽</span>
        )}
        <span className="hidden text-[10px] text-neutral-400 sm:inline">
          좌우·상하 스크롤 · 핀치 확대/축소
        </span>
        <span className="hidden text-[10px] text-amber-600/90 sm:inline">
          · 일부 포스터는 그림자·투명 효과가 어긋날 수 있음 (정확한 보기: 새 탭)
        </span>
        <span className="text-[10px] text-neutral-400 sm:hidden">
          스크롤 · 핀치 확대/축소
        </span>
        <span className="text-[10px] text-amber-600/90 sm:hidden">
          그림자·투명 효과가 어긋날 수 있음
        </span>
      </div>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-x-auto overflow-y-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x pan-y" }}
        aria-label={title}
      >
        <div
          className="inline-block p-1 sm:p-2"
          style={
            pinchScale !== 1 && layoutSize.w > 0
              ? {
                  width: Math.ceil(layoutSize.w * pinchScale),
                  height: Math.ceil(layoutSize.h * pinchScale),
                }
              : undefined
          }
        >
          <div
            ref={contentRef}
            className="inline-block origin-top-left"
            style={
              pinchScale !== 1
                ? {
                    transform: `scale(${pinchScale})`,
                    transformOrigin: "top left",
                    width: layoutSize.w > 0 ? layoutSize.w : undefined,
                  }
                : undefined
            }
          >
            {pdfDoc &&
              Array.from({ length: numPages }, (_, i) => (
                <PdfPageCanvas
                  key={`${src}-page-${i + 1}-z${zoom.toFixed(2)}-v${viewportTick}`}
                  pdf={pdfDoc}
                  pageNumber={i + 1}
                  scale={renderScale}
                />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
