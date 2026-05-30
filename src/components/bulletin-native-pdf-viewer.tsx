"use client";

import {
  getDocument,
  GlobalWorkerOptions,
  version,
} from "pdfjs-dist";
import { useCallback, useEffect, useRef, useState } from "react";

if (typeof window !== "undefined") {
  GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
}

const PDFJS_ASSETS = `https://unpkg.com/pdfjs-dist@${version}`;

/** Browser-native PDF rendering (PDFium / WebKit). Handles InDesign effects pdf.js misses. */
export function BulletinNativePdfViewer({
  src,
  title,
}: {
  src: string;
  title: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingMeta, setLoadingMeta] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingMeta(true);
    setPage(1);
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
        setNumPages(pdf.numPages);
        setLoadingMeta(false);
        pdf.destroy();
      } catch {
        if (!cancelled) {
          setNumPages(1);
          setLoadingMeta(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [src]);

  const goToPage = useCallback(
    (next: number) => {
      if (numPages <= 0) return;
      setPage(Math.min(numPages, Math.max(1, next)));
    },
    [numPages]
  );

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || loadingMeta) return;
    iframe.src = `${src}#page=${page}&view=FitH&toolbar=0&navpanes=0`;
  }, [src, page, loadingMeta]);

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
    <div className="flex min-h-0 flex-1 flex-col bg-neutral-100 dark:bg-neutral-950">
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
          ref={iframeRef}
          title={title}
          className="min-h-0 w-full flex-1 border-0 bg-white"
        />
      )}
    </div>
  );
}
