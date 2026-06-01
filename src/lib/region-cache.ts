import "server-only";
import fs from "node:fs";
import path from "node:path";
import { SG_ID, type SgTypeCode } from "./constants";

export interface RegionCacheFile {
  meta: {
    sgId: string;
    builtAt: string;
    sidoCount?: number;
    gusigunEntryCount?: number;
    sggEntryCount?: number;
  };
  sido: string[];
  adminGusigun: Record<string, string[]>;
  gusigun: Record<string, Record<string, string[]>>;
  sgg: Record<string, Record<string, Record<string, string[]>>>;
}

let loaded: RegionCacheFile | null | undefined;

function cacheDisabled(): boolean {
  return process.env.REGION_CACHE_DISABLED === "1";
}

/** Load pre-built region cache from src/data/region-cache.json (in-memory singleton). */
export function getRegionCache(): RegionCacheFile | null {
  if (cacheDisabled()) return null;
  if (loaded !== undefined) return loaded;

  try {
    const filePath = path.join(process.cwd(), "src/data/region-cache.json");
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as RegionCacheFile;
    if (raw.meta?.sgId !== SG_ID) {
      loaded = null;
      return null;
    }
    loaded = raw;
    return loaded;
  } catch {
    loaded = null;
    return null;
  }
}

export function getCachedSidoList(): string[] | null {
  const cache = getRegionCache();
  return cache?.sido ?? null;
}

export function getCachedAdminGusigunList(sido: string): string[] | null {
  const cache = getRegionCache();
  return cache?.adminGusigun[sido] ?? null;
}

export function getCachedGusigunList(
  sgType: SgTypeCode,
  sido: string
): string[] | null {
  const cache = getRegionCache();
  return cache?.gusigun[sgType]?.[sido] ?? null;
}

export function getCachedSggList(
  sgType: SgTypeCode,
  sido: string,
  gusigun?: string
): string[] | null {
  const cache = getRegionCache();
  const bySido = cache?.sgg[sgType]?.[sido];
  if (!bySido) return null;
  const key = gusigun ?? "";
  return bySido[key] ?? null;
}
