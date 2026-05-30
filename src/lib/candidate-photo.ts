import "server-only";
import { SG_ID } from "./constants";

/**
 * Resolve a candidate portrait URL from the NEC election statistics site.
 * Photos are not in the Open API; they are served from cdn.nec.go.kr and
 * linked on info.nec.go.kr candidate detail pages.
 */
const NEC_INFO_ELECTION_ID = `00${SG_ID}`;
const DETAIL_URL =
  "https://info.nec.go.kr/electioninfo/candidate_detail_info.xhtml";

const THUMBNAIL_RE =
  /https?:\/\/cdn\.nec\.go\.kr\/photo_\d+\/Gsg\d+\/Hb\d+\/gicho\/thumbnail\.\d+\.JPG(?:\?[^"'\s>]*)?/i;
const FULL_RE =
  /https?:\/\/cdn\.nec\.go\.kr\/photo_\d+\/Gsg\d+\/Hb\d+\/gicho\/\d+\.JPG(?:\?[^"'\s>]*)?/i;

const cache = new Map<string, string | null>();

function normalizePhotoUrl(url: string): string {
  // Drop cache-buster query (?ver=...) — next/image rejects unmatched search params.
  const withoutQuery = url.split("?")[0] ?? url;
  return withoutQuery.replace(/^http:/i, "https:");
}

function extractPhotoUrl(html: string): string | undefined {
  const thumb = html.match(THUMBNAIL_RE)?.[0];
  if (thumb) return normalizePhotoUrl(thumb);
  const full = html.match(FULL_RE)?.[0];
  return full ? normalizePhotoUrl(full) : undefined;
}

export async function getCandidatePhotoUrl(
  huboid: string
): Promise<string | undefined> {
  const id = huboid.trim();
  if (!id) return undefined;

  if (cache.has(id)) {
    const cached = cache.get(id);
    return cached ?? undefined;
  }

  try {
    const url = `${DETAIL_URL}?electionId=${NEC_INFO_ELECTION_ID}&huboId=${encodeURIComponent(id)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "election-june/0.1 (public info)" },
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) {
      cache.set(id, null);
      return undefined;
    }

    const photoUrl = extractPhotoUrl(await res.text());
    cache.set(id, photoUrl ?? null);
    return photoUrl;
  } catch {
    cache.set(id, null);
    return undefined;
  }
}
