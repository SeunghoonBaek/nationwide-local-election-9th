"use client";

import { useCallback, useEffect } from "react";

export function bulletinViewerSrc(bulletinPath: string): string {
  return `/api/bulletin?path=${encodeURIComponent(bulletinPath)}`;
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
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
      <div className="relative flex h-[min(90vh,820px)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <h2
            id="bulletin-viewer-title"
            className="truncate text-sm font-semibold text-neutral-800 dark:text-neutral-100"
          >
            {title}
          </h2>
          <div className="flex shrink-0 items-center gap-2">
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
        <iframe
          src={src}
          title={title}
          className="min-h-0 flex-1 border-0 bg-neutral-100 dark:bg-neutral-950"
        />
      </div>
    </div>
  );
}
