import type { SgTypeCode } from "@/lib/constants";

const STORAGE_KEY = "election-june:home";

export type HomePersistedSearch = {
  sgType: SgTypeCode;
  sido: string;
  sgg: string;
};

export type HomePersistedState = {
  sido: string;
  sgType: SgTypeCode | "";
  gusigun: string;
  sgg: string;
  addressInput: string;
  locationHint: string | null;
  locationGusigun: string;
  lastSearch: HomePersistedSearch | null;
  scrollY: number;
};

const EMPTY: HomePersistedState = {
  sido: "",
  sgType: "",
  gusigun: "",
  sgg: "",
  addressInput: "",
  locationHint: null,
  locationGusigun: "",
  lastSearch: null,
  scrollY: 0,
};

function isSgType(v: string): v is SgTypeCode {
  return ["3", "4", "5", "6", "11"].includes(v);
}

/** True only when the user returned via browser back/forward (not refresh or direct visit). */
export function shouldRestoreHomeState(): boolean {
  if (typeof window === "undefined") return false;
  const nav = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  return nav?.type === "back_forward";
}

export function clearHomeState() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode */
  }
}

export function readHomeState(): HomePersistedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HomePersistedState>;
    const sgType =
      parsed.sgType && isSgType(parsed.sgType) ? parsed.sgType : "";
    const lastSearch =
      parsed.lastSearch &&
      isSgType(parsed.lastSearch.sgType) &&
      parsed.lastSearch.sido &&
      parsed.lastSearch.sgg
        ? parsed.lastSearch
        : null;
    return {
      sido: typeof parsed.sido === "string" ? parsed.sido : "",
      sgType,
      gusigun: typeof parsed.gusigun === "string" ? parsed.gusigun : "",
      sgg: typeof parsed.sgg === "string" ? parsed.sgg : "",
      addressInput:
        typeof parsed.addressInput === "string" ? parsed.addressInput : "",
      locationHint:
        typeof parsed.locationHint === "string" ? parsed.locationHint : null,
      locationGusigun:
        typeof parsed.locationGusigun === "string" ? parsed.locationGusigun : "",
      lastSearch,
      scrollY:
        typeof parsed.scrollY === "number" && parsed.scrollY >= 0
          ? parsed.scrollY
          : 0,
    };
  } catch {
    return null;
  }
}

export function writeHomeState(state: HomePersistedState) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
}

export function pickPersistedFields(state: {
  sido: string;
  sgType: SgTypeCode | "";
  gusigun: string;
  sgg: string;
  addressInput: string;
  locationHint: string | null;
  locationGusigun: string;
  lastSearch: HomePersistedSearch | null;
  scrollY: number;
}): HomePersistedState {
  return {
    sido: state.sido,
    sgType: state.sgType,
    gusigun: state.gusigun,
    sgg: state.sgg,
    addressInput: state.addressInput,
    locationHint: state.locationHint,
    locationGusigun: state.locationGusigun,
    lastSearch: state.lastSearch,
    scrollY: state.scrollY,
  };
}

export { EMPTY as emptyHomeState };
