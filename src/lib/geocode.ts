import "server-only";
import { resolveSidoFromAddress, resolveSidoName } from "./sido-names";

export type LocationSource = "address" | "gps";

export interface ResolvedLocation {
  sido: string;
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

async function nominatimReverse(
  lat: number,
  lng: number
): Promise<ResolvedLocation | null> {
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
  const parts = [
    data.address?.city,
    data.address?.state,
    data.address?.province,
    data.display_name,
  ].filter(Boolean) as string[];

  for (const part of parts) {
    const sido = resolveSidoName(part);
    if (sido) {
      return {
        sido,
        source: "nominatim",
        label: data.display_name,
      };
    }
  }

  if (data.display_name) {
    const sido = resolveSidoFromAddress(data.display_name);
    if (sido) {
      return {
        sido,
        source: "nominatim",
        label: data.display_name,
      };
    }
  }

  return null;
}

/** Resolve 시·도 from a Korean address (heuristic; no external API key). */
export function resolveLocationFromAddress(
  address: string
): ResolvedLocation | null {
  const trimmed = address.trim();
  if (trimmed.length < 2) return null;

  const sido = resolveSidoFromAddress(trimmed);
  if (!sido) return null;

  return {
    sido,
    source: "heuristic",
    label: trimmed,
  };
}

/** Resolve 시·도 from WGS84 coordinates (OpenStreetMap Nominatim). */
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
  return nominatimReverse(lat, lng);
}
