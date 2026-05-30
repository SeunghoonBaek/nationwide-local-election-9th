"use client";

import {
  getDocument,
  GlobalWorkerOptions,
  version,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import { useCallback, useEffect, useRef, useState } from "react";

if (typeof window !== "undefined") {
  GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
}

const PDFJS_ASSETS = `https://unpkg.com/pdfjs-dist@${version}`;
const MOBILE_MQ = "(max-width: 639px)";

type PageLayout = { width: number; height: number };

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return isMobile;
}

async function loadPdfMeta(src: string) {
  const pdf = await getDocument({
    url: src,
    cMapUrl: `${PDFJS_ASSETS}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${PDFJS_ASSETS}/standard_fonts/`,
  }).promise;

  const layouts: PageLayout[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const vp = (await pdf.getPage(i)).getViewport({ scale: 1 });
    layouts.push({ width: vp.width, height: vp.height });
  }

  return { numPages: pdf.numPages, layouts, pdf };
}

async function splitSinglePage(
  pdfBytes: ArrayBuffer,
  pageIndex: number
): Promise<string> {
  const { PDFDocument } = await import("pdf-lib");
  const source = await PDFDocument.load(pdfBytes);
  const single = await PDFDocument.create();
  const [page] = await single.copyPages(source, [pageIndex]);
  single.addPage(page);
  const bytes = await single.save();
  return URL.createObjectURL(
    new Blob([Uint8Array.from(bytes)], { type: "application/pdf" })
  );
}

function DesktopNativeViewer({
  src,
  title,
  numPages,
  loadingMeta,
}: {
  src: string;
  title: string;
  numPages: number;
  loadingMeta: boolean;
}) {
  const [page, setPage] = useState(1);

  const goToPage = useCallback(
    (next: number) => {
      if (numPages <= 0) return;
      setPage(Math.min(numPages, Math.max(1, next)));
    },
    [numPages]
  );

  useEffect(() => {
    setPage(1);
  }, [src]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goToPage(page - 1);
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        goToPage(page + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goToPage, page]);

  return (
    <>
      <div className="flex shrink-0 items-center justify-center gap-2 border-b border-neutral-200 px-2 py-1.5 dark:border-neutral-800">
        <button
          type="button"
          onClick={() => goToPage(page - 1)}
          disabled={page <= 1 || loadingMeta}
          className="rounded px-2.5 py-1 text-base text-neutral-600 hover:bg-neutral-200 disabled:opacity-30 dark:text-neutral-300 dark:hover:bg-neutral-800"
          aria-label="이전 페이지"
        >
          ‹
        </button>
        <span className="min-w-[4.5rem] text-center text-xs text-neutral-500">
          {loadingMeta ? "…" : `${page} / ${numPages}`}
        </span>
        <button
          type="button"
          onClick={() => goToPage(page + 1)}
          disabled={page >= numPages || loadingMeta}
          className="rounded px-2.5 py-1 text-base text-neutral-600 hover:bg-neutral-200 disabled:opacity-30 dark:text-neutral-300 dark:hover:bg-neutral-800"
          aria-label="다음 페이지"
        >
          ›
        </button>
        {numPages > 1 && (
          <span className="hidden text-[10px] text-neutral-400 sm:inline">
            ← → 키로 페이지 이동 · 전체 스크롤은 「확대·스크롤」
          </span>
        )}
      </div>
      {loadingMeta ? (
        <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
          선거공보 불러오는 중…
        </div>
      ) : (
        <iframe
          key={`${src}-page-${page}`}
          src={`${src}#page=${page}&view=FitH&toolbar=0&navpanes=0`}
          title={title}
          className="min-h-0 w-full flex-1 border-0 bg-white"
        />
      )}
    </>
  );
}

function MobilePageFrame({
  index,
  layout,
  blobUrl,
  containerWidth,
  title,
  onVisible,
}: {
  index: number;
  layout: PageLayout;
  blobUrl: string | null;
  containerWidth: number;
  title: string;
  onVisible: (index: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const height =
    containerWidth > 0
      ? Math.ceil(containerWidth * (layout.height / layout.width))
      : 400;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) onVisible(index);
      },
      { rootMargin: "400px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [index, onVisible]);

  const embedSrc = blobUrl
    ? `${blobUrl}#view=Fit&toolbar=0&navpanes=0&scrollbar=0`
    : null;

  return (
    <div
      ref={ref}
      className="relative w-full shrink-0 overflow-hidden bg-white"
      style={{ height, touchAction: "none" }}
    >
      {embedSrc ? (
        <>
          <object
            data={embedSrc}
            type="application/pdf"
            aria-hidden
            tabIndex={-1}
            className="pointer-events-none absolute inset-0 h-full w-full border-0"
          >
            <iframe
              src={embedSrc}
              title={`${title} ${index + 1}쪽`}
              scrolling="no"
              tabIndex={-1}
              aria-hidden
              className="pointer-events-none absolute inset-0 h-full w-full border-0"
            />
          </object>
          {/* Pass scroll gestures to the outer container, not the PDF plugin. */}
          <div
            className="absolute inset-0 z-10"
            aria-label={`${title} ${index + 1}쪽`}
          />
        </>
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-neutral-400">
          {index + 1}쪽 불러오는 중…
        </div>
      )}
    </div>
  );
}

function MobileNativeViewer({
  src,
  title,
  numPages,
  layouts,
  loadingMeta,
}: {
  src: string;
  title: string;
  numPages: number;
  layouts: PageLayout[];
  loadingMeta: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pdfBytesRef = useRef<ArrayBuffer | null>(null);
  const blobUrlsRef = useRef<Map<number, string>>(new Map());
  const splittingRef = useRef<Set<number>>(new Set());

  const [containerWidth, setContainerWidth] = useState(0);
  const [pageUrls, setPageUrls] = useState<(string | null)[]>([]);
  const [preparing, setPreparing] = useState(true);

  useEffect(() => {
    blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    blobUrlsRef.current.clear();
    splittingRef.current.clear();
    pdfBytesRef.current = null;
    setPageUrls([]);
    setPreparing(true);

    if (loadingMeta || numPages <= 0) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error("fetch failed");
        const bytes = await res.arrayBuffer();
        if (cancelled) return;
        pdfBytesRef.current = bytes;
        setPageUrls(Array.from({ length: numPages }, () => null));
        setPreparing(false);
      } catch {
        if (!cancelled) setPreparing(false);
      }
    })();

    return () => {
      cancelled = true;
      blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      blobUrlsRef.current.clear();
    };
  }, [src, numPages, loadingMeta]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [preparing, loadingMeta]);

  const ensurePage = useCallback(async (index: number) => {
    if (blobUrlsRef.current.has(index) || splittingRef.current.has(index)) {
      return;
    }
    const bytes = pdfBytesRef.current;
    if (!bytes) return;

    splittingRef.current.add(index);
    try {
      const url = await splitSinglePage(bytes, index);
      blobUrlsRef.current.set(index, url);
      setPageUrls((prev) => {
        if (!prev.length) return prev;
        const next = [...prev];
        next[index] = url;
        return next;
      });
    } catch {
      /* ignore split errors */
    } finally {
      splittingRef.current.delete(index);
    }
  }, []);

  useEffect(() => {
    if (preparing || loadingMeta || numPages <= 0) return;
    for (let i = 0; i < Math.min(numPages, 4); i++) {
      void ensurePage(i);
    }
  }, [preparing, loadingMeta, numPages, ensurePage]);

  return (
    <>
      <p className="shrink-0 border-b border-neutral-200 px-2 py-1.5 text-center text-[10px] text-neutral-400 dark:border-neutral-800">
        {loadingMeta || preparing
          ? "선거공보 준비 중…"
          : `${numPages}쪽 · 아래로 스크롤`}
      </p>
      {loadingMeta || preparing ? (
        <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
          선거공보 불러오는 중…
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white"
          style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
        >
          <div className="w-full bg-white">
            {layouts.map((layout, index) => (
              <MobilePageFrame
                key={`${src}-mobile-${index + 1}`}
                index={index}
                layout={layout}
                blobUrl={pageUrls[index] ?? null}
                containerWidth={containerWidth}
                title={title}
                onVisible={ensurePage}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** Browser-native PDF rendering (PDFium / WebKit). Handles InDesign effects pdf.js misses. */
export function BulletinNativePdfViewer({
  src,
  title,
}: {
  src: string;
  title: string;
}) {
  const isMobile = useIsMobile();
  const [numPages, setNumPages] = useState(0);
  const [layouts, setLayouts] = useState<PageLayout[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let pdf: PDFDocumentProxy | null = null;

    setLoadingMeta(true);
    setNumPages(0);
    setLayouts([]);

    (async () => {
      try {
        const meta = await loadPdfMeta(src);
        pdf = meta.pdf;
        if (cancelled) return;
        setNumPages(meta.numPages);
        setLayouts(meta.layouts);
        setLoadingMeta(false);
      } catch {
        if (!cancelled) {
          setNumPages(1);
          setLayouts([{ width: 595, height: 842 }]);
          setLoadingMeta(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      pdf?.destroy();
    };
  }, [src]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-neutral-100 dark:bg-neutral-950">
      {isMobile ? (
        <MobileNativeViewer
          src={src}
          title={title}
          numPages={numPages}
          layouts={layouts}
          loadingMeta={loadingMeta}
        />
      ) : (
        <DesktopNativeViewer
          src={src}
          title={title}
          numPages={numPages}
          loadingMeta={loadingMeta}
        />
      )}
    </div>
  );
}
