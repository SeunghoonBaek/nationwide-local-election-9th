import "server-only";
import {
  gusigunCandidatesFromParts,
  resolveGusigunFromText,
} from "./gusigun-names";
import { getAdminGusigunList } from "./nec";
import { resolveSidoFromAddress, resolveSidoName } from "./sido-names";

export interface ResolvedLocation {
  sido: string;
  gusigun?: string;
  source: "heuristic" | "nominatim";
  /** Human-readable hint for the UI */
  label?: string;
}

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const USER_AGENT = "election-june/1.0 (local-election-compare)";

interface NominatimReverse {
  address?: {
    city?: string;
    state?: string;
    province?: string;
    county?: string;
    borough?: string;
  };
  display_name?: string;
}

function stripSidoPrefix(address: string, sido: string): string {
  let tail = address;
  if (tail.includes(sido)) {
    tail = tail.slice(tail.indexOf(sido) + sido.length);
  }
  return tail.trim();
}

function resolveGusigunFromHints(
  sido: string,
  hints: string[],
  allowed: readonly string[]
): string | undefined {
  for (const hint of hints) {
    const hit = resolveGusigunFromText(hint, sido, allowed);
    if (hit) return hit;
  }
  return undefined;
}

function gusigunHintsFromNominatim(
  sido: string,
  data: NominatimReverse
): string[] {
  const addr = data.address;
  return [
    ...gusigunCandidatesFromParts(sido, {
      city: addr?.city ?? addr?.county,
      borough: addr?.borough,
      county: addr?.county,
    }),
    data.display_name ?? "",
    stripSidoPrefix(data.display_name ?? "", sido),
  ];
}

function resolveSidoFromNominatim(data: NominatimReverse): string | null {
  const addr = data.address;
  const parts = [
    addr?.city,
    addr?.state,
    addr?.province,
    data.display_name,
  ].filter(Boolean) as string[];

  for (const part of parts) {
    const sido = resolveSidoName(part);
    if (sido) return sido;
  }
  if (data.display_name) {
    return resolveSidoFromAddress(data.display_name);
  }
  return null;
}

/** Resolve 시·도 (+ 구·시·군 when possible) from a Korean address. */
export function resolveLocationFromAddress(
  address: string,
  allowedGusigun: readonly string[]
): ResolvedLocation | null {
  const trimmed = address.trim();
  if (trimmed.length < 2) return null;

  const sido = resolveSidoFromAddress(trimmed);
  if (!sido) return null;

  const tail = stripSidoPrefix(trimmed, sido);
  const gusigun = resolveGusigunFromText(
    tail || trimmed,
    sido,
    allowedGusigun
  );

  return {
    sido,
    gusigun: gusigun ?? undefined,
    source: "heuristic",
    label: trimmed,
  };
}

/** Resolve 시·도 (+ 구·시·군) from WGS84 coordinates (OpenStreetMap Nominatim). */
export async function resolveLocationFromCoords(
  lat: number,
  lng: number
): Promise<ResolvedLocation | null> {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < 33 ||
    lat > 39.5 ||
    lng < 124 ||
    lng > 132
  ) {
    return null;
  }

  const url = new URL(`${NOMINATIM_BASE}/reverse`);
  url.searchParams.set("format", "json");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("accept-language", "ko");

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as NominatimReverse;
  const sido = resolveSidoFromNominatim(data);
  if (!sido) return null;

  const adminList = await getAdminGusigunList(sido);
  const gusigun = resolveGusigunFromHints(
    sido,
    gusigunHintsFromNominatim(sido, data),
    adminList
  );

  return {
    sido,
    gusigun,
    source: "nominatim",
    label: data.display_name,
  };
}
