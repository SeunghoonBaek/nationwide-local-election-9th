"use client";

/** Browser-native PDF rendering (PDFium / WebKit). Handles InDesign effects pdf.js misses. */
export function BulletinNativePdfViewer({
  src,
  title,
}: {
  src: string;
  title: string;
}) {
  const iframeSrc = `${src}#view=FitH&toolbar=1&navpanes=0`;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-neutral-100 dark:bg-neutral-950">
      <p className="shrink-0 border-b border-neutral-200 px-2 py-1.5 text-center text-[10px] text-neutral-400 dark:border-neutral-800">
        브라우저 PDF 뷰어 · 스크롤·확대는 뷰어 안에서 조작
      </p>
      <iframe
        src={iframeSrc}
        title={title}
        className="min-h-0 w-full flex-1 border-0 bg-white"
      />
    </div>
  );
}
