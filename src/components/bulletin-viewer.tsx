"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

const BulletinPdfViewer = dynamic(
  () =>
    import("@/components/bulletin-pdf-viewer").then((m) => m.BulletinPdfViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 items-center justify-center bg-neutral-100 text-sm text-neutral-500 dark:bg-neutral-950">
        선거공보 불러오는 중…
      </div>
    ),
  }
);

export function bulletinViewerSrc(bulletinPath: string): string {
  return `/api/bulletin?path=${encodeURIComponent(bulletinPath)}`;
}

const MIN_W = 320;
const MIN_H = 240;
const PAD = 24;

const PRESETS = {
  sm: { w: 480, h: 400 },
  md: { w: 768, h: 576 },
  lg: { w: 1024, h: 768 },
} as const;

type PresetKey = keyof typeof PRESETS;

function clampSize(w: number, h: number) {
  const maxW = typeof window !== "undefined" ? window.innerWidth - PAD : w;
  const maxH = typeof window !== "undefined" ? window.innerHeight - PAD : h;
  return {
    w: Math.max(MIN_W, Math.min(maxW, w)),
    h: Math.max(MIN_H, Math.min(maxH, h)),
  };
}

function defaultSize() {
  if (typeof window === "undefined") return PRESETS.md;
  const isMobile = window.innerWidth < 640;
  if (isMobile) {
    return clampSize(window.innerWidth - 8, window.innerHeight - 8);
  }
  return clampSize(
    Math.min(PRESETS.lg.w, window.innerWidth - PAD),
    Math.min(Math.round(window.innerHeight * 0.85), 820)
  );
}

export function BulletinViewerModal({
  title,
  bulletinPath,
  onClose,
}: {
  title: string;
  bulletinPath: string;
  onClose: () => void;
}) {
  const src = bulletinViewerSrc(bulletinPath);
  const [size, setSize] = useState(defaultSize);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prev;
    };
  }, [handleKeyDown]);

  useEffect(() => {
    const onWindowResize = () => {
      setSize((s) => clampSize(s.w, s.h));
    };
    window.addEventListener("resize", onWindowResize);
    return () => window.removeEventListener("resize", onWindowResize);
  }, []);

  const applyPreset = (key: PresetKey | "full") => {
    if (key === "full") {
      setSize(clampSize(window.innerWidth - PAD, window.innerHeight - PAD));
      return;
    }
    setSize(clampSize(PRESETS[key].w, PRESETS[key].h));
  };

  const startResize = (
    e: React.PointerEvent,
    axis: "both" | "x" | "y"
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY, w: size.w, h: size.h };

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      setSize(
        clampSize(
          axis === "y" ? start.w : start.w + dx,
          axis === "x" ? start.h : start.h + dy
        )
      );
    };

    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-1 sm:p-3 md:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulletin-viewer-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="닫기"
        onClick={onClose}
      />
      <div
        className="relative flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-2xl sm:rounded-xl dark:border-neutral-700 dark:bg-neutral-900"
        style={{ width: size.w, height: size.h }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-200 px-3 py-2.5 dark:border-neutral-700 sm:px-4 sm:py-3">
          <h2
            id="bulletin-viewer-title"
            className="min-w-0 truncate text-sm font-semibold text-neutral-800 dark:text-neutral-100"
          >
            {title}
          </h2>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <div
              className="hidden items-center gap-0.5 sm:flex"
              role="group"
              aria-label="창 크기"
            >
              {(
                [
                  ["sm", "작게"],
                  ["md", "보통"],
                  ["lg", "크게"],
                  ["full", "최대"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyPreset(key)}
                  className="rounded px-1.5 py-0.5 text-[11px] text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                >
                  {label}
                </button>
              ))}
            </div>
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-neutral-500 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-700 dark:hover:text-neutral-300"
            >
              새 탭
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
              aria-label="닫기"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <BulletinPdfViewer src={src} title={title} />
        </div>
        {/* Desktop resize handles */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="가로 크기 조절"
          onPointerDown={(e) => startResize(e, "x")}
          className="absolute bottom-4 right-0 top-10 hidden w-1.5 cursor-ew-resize touch-none sm:block"
        />
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="세로 크기 조절"
          onPointerDown={(e) => startResize(e, "y")}
          className="absolute bottom-0 left-0 right-4 hidden h-1.5 cursor-ns-resize touch-none sm:block"
        />
        <button
          type="button"
          aria-label="창 크기 조절"
          onPointerDown={(e) => startResize(e, "both")}
          className="absolute bottom-0 right-0 z-10 hidden h-5 w-5 cursor-se-resize touch-none items-end justify-end border-0 bg-transparent p-0.5 text-neutral-400 hover:text-neutral-600 sm:flex dark:hover:text-neutral-300"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="currentColor"
            aria-hidden
          >
            <path d="M12 12H10V10H12V12ZM12 8H10V6H12V8ZM8 12H6V10H8V12ZM12 4H10V2H12V4Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
