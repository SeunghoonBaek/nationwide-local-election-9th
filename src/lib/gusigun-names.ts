/** Remove spaces and punctuation for fuzzy matching. */
export function normalizeGusigunKey(text: string): string {
  return text.replace(/\s+/g, "").replace(/[,，·]/g, "").trim();
}

const isMetroSido = (sido: string): boolean =>
  sido.endsWith("특별시") || sido.endsWith("광역시");

/**
 * Map a resolved admin 구·시·군 name to an election-type-specific dropdown value.
 * Handles cases where type 4 lists one representative gu per split city (e.g. 수원).
 */
export function matchGusigunToElectionList(
  adminGusigun: string,
  electionList: readonly string[]
): string | null {
  if (!adminGusigun || electionList.length === 0) return null;

  if (electionList.includes(adminGusigun)) return adminGusigun;

  const adminKey = normalizeGusigunKey(adminGusigun);
  for (const name of electionList) {
    if (normalizeGusigunKey(name) === adminKey) return name;
  }

  // Split city: admin "수원시장안구" → election list "수원시팔달구"
  const cityPrefix = adminGusigun.match(/^([가-힣]+(?:시|군))/)?.[1];
  if (cityPrefix) {
    const sameCity = electionList.filter((n) => n.startsWith(cityPrefix));
    if (sameCity.length === 1) return sameCity[0];
  }

  // Substring overlap (longest wins)
  let best: string | null = null;
  for (const name of electionList) {
    const nameKey = normalizeGusigunKey(name);
    if (adminKey.includes(nameKey) || nameKey.includes(adminKey)) {
      if (!best || name.length > best.length) best = name;
    }
  }
  return best;
}

/** Build candidate 구·시·군 strings from geocoder address parts. */
export function gusigunCandidatesFromParts(
  sido: string,
  parts: { city?: string; borough?: string; county?: string }
): string[] {
  const out: string[] = [];
  const city = (parts.city ?? parts.county ?? "").trim();
  const borough = (parts.borough ?? "").trim();
  const cityKey = normalizeGusigunKey(city);
  const boroughKey = normalizeGusigunKey(borough);

  if (isMetroSido(sido) && boroughKey.endsWith("구")) {
    out.push(borough);
  } else if (cityKey && boroughKey.endsWith("구")) {
    out.push(cityKey + boroughKey);
    out.push(`${city} ${borough}`);
  }

  if (cityKey && (cityKey.endsWith("시") || cityKey.endsWith("군"))) {
    out.push(city);
  }

  if (boroughKey.endsWith("구") && isMetroSido(sido)) {
    out.push(borough);
  }

  return [...new Set(out.map((s) => s.trim()).filter(Boolean))];
}

/**
 * Match free-form text (address tail, geocoder hints) to an NEC admin 구·시·군 label.
 */
export function resolveGusigunFromText(
  text: string,
  sido: string,
  allowed: readonly string[]
): string | null {
  if (!text.trim() || allowed.length === 0) return null;

  const normalized = normalizeGusigunKey(text);
  const sorted = [...allowed].sort((a, b) => b.length - a.length);

  for (const name of sorted) {
    if (normalized.includes(normalizeGusigunKey(name))) return name;
  }

  const splitGu = text.match(/([가-힣]+시)\s*([가-힣]+구)/);
  if (splitGu) {
    const combined = splitGu[1] + splitGu[2];
    const hit = sorted.find(
      (n) => normalizeGusigunKey(n) === normalizeGusigunKey(combined)
    );
    if (hit) return hit;
  }

  if (isMetroSido(sido)) {
    const guMatches = text.match(/([가-힣]+구)/g);
    if (guMatches) {
      for (const gu of guMatches) {
        if (allowed.includes(gu)) return gu;
      }
    }
  }

  const siGun = text.match(/([가-힣]+(?:시|군))/);
  if (siGun) {
    const hit = sorted.find((n) => n === siGun[1] || n.startsWith(siGun[1]));
    if (hit) return hit;
  }

  for (const candidate of gusigunCandidatesFromParts(sido, {
    city: splitGu?.[1],
    borough: splitGu?.[2],
  })) {
    const hit = sorted.find(
      (n) => normalizeGusigunKey(n) === normalizeGusigunKey(candidate)
    );
    if (hit) return hit;
  }

  return null;
}
