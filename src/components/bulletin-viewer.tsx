/** Build the inline-PDF proxy URL for an election bulletin (선거공보). */
export function bulletinViewerSrc(bulletinPath: string): string {
  return `/api/bulletin?path=${encodeURIComponent(bulletinPath)}`;
}
