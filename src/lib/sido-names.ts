/**
 * Canonical 시·도 names from NEC gu/si/gun code list (getSidoList).
 * Used to normalize geocoder / address text output.
 */
export const NEC_SIDO_NAMES = [
  "서울특별시",
  "부산광역시",
  "대구광역시",
  "인천광역시",
  "광주광역시",
  "대전광역시",
  "울산광역시",
  "세종특별자치시",
  "경기도",
  "강원특별자치도",
  "충청북도",
  "충청남도",
  "전북특별자치도",
  "전라남도",
  "경상북도",
  "경상남도",
  "제주특별자치도",
] as const;

export type NecSidoName = (typeof NEC_SIDO_NAMES)[number];

/** Short or legacy spellings → NEC label */
const SIDO_ALIASES: Record<string, NecSidoName> = {
  서울: "서울특별시",
  서울시: "서울특별시",
  서울특별시: "서울특별시",
  부산: "부산광역시",
  부산시: "부산광역시",
  부산광역시: "부산광역시",
  대구: "대구광역시",
  대구시: "대구광역시",
  대구광역시: "대구광역시",
  인천: "인천광역시",
  인천시: "인천광역시",
  인천광역시: "인천광역시",
  광주: "광주광역시",
  광주시: "광주광역시",
  광주광역시: "광주광역시",
  대전: "대전광역시",
  대전시: "대전광역시",
  대전광역시: "대전광역시",
  울산: "울산광역시",
  울산시: "울산광역시",
  울산광역시: "울산광역시",
  세종: "세종특별자치시",
  세종시: "세종특별자치시",
  세종특별자치시: "세종특별자치시",
  경기: "경기도",
  경기도: "경기도",
  강원: "강원특별자치도",
  강원도: "강원특별자치도",
  강원특별자치도: "강원특별자치도",
  충북: "충청북도",
  충청북도: "충청북도",
  충남: "충청남도",
  충청남도: "충청남도",
  전북: "전북특별자치도",
  전라북도: "전북특별자치도",
  전북특별자치도: "전북특별자치도",
  전남: "전라남도",
  전라남도: "전라남도",
  경북: "경상북도",
  경상북도: "경상북도",
  경남: "경상남도",
  경상남도: "경상남도",
  제주: "제주특별자치도",
  제주도: "제주특별자치도",
  제주특별자치도: "제주특별자치도",
};

const SIDO_BY_LENGTH = [...NEC_SIDO_NAMES].sort((a, b) => b.length - a.length);

/**
 * Map free-form text (address line, geocoder city/state) to an NEC 시·도 label.
 */
export function resolveSidoName(
  raw: string,
  allowed?: readonly string[]
): string | null {
  const text = raw.trim();
  if (!text) return null;

  const allowSet = allowed ? new Set(allowed) : null;
  const pick = (name: NecSidoName | string): string | null => {
    if (allowSet && !allowSet.has(name)) return null;
    return name;
  };

  if (SIDO_ALIASES[text]) return pick(SIDO_ALIASES[text]);

  for (const canonical of SIDO_BY_LENGTH) {
    if (text.includes(canonical)) return pick(canonical);
  }

  const head = text.split(/\s+/)[0]?.replace(/[,.]/g, "") ?? "";
  if (head && SIDO_ALIASES[head]) return pick(SIDO_ALIASES[head]);

  // "경기 수원시 …" style: first token before space
  const m = text.match(
    /^([가-힣]+(?:특별시|광역시|특별자치시|특별자치도|도)?)/
  );
  if (m?.[1]) {
    const token = m[1];
    if (SIDO_ALIASES[token]) return pick(SIDO_ALIASES[token]);
    for (const canonical of SIDO_BY_LENGTH) {
      if (canonical.startsWith(token) || token.startsWith(canonical.slice(0, 2))) {
        if (canonical.includes(token) || token.length >= 2) {
          const hit = SIDO_ALIASES[token];
          if (hit) return pick(hit);
        }
      }
    }
  }

  return null;
}

/** Extract 시·도 from a full Korean address string. */
export function resolveSidoFromAddress(address: string): string | null {
  const normalized = address.replace(/\s+/g, " ").trim();
  return resolveSidoName(normalized);
}
