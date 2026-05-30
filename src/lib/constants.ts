export const SG_ID = "20260603"; // 9th nationwide local election (2026-06-03)
export const SG_DATE = "2026년 6월 3일";

/** Election type code → Korean label (label shown in UI) */
export const SG_TYPES = {
  "3": "시·도지사",
  "4": "구·시·군의 장",
  "5": "시·도의원",
  "6": "구·시·군의원",
  "8": "비례대표 광역의원",
  "9": "비례대표 기초의원",
  "11": "교육감",
} as const;

export type SgTypeCode = keyof typeof SG_TYPES;

/** Election types selectable by the user (proportional types are party-vote, so excluded from the district flow) */
export const SELECTABLE_SG_TYPES: SgTypeCode[] = ["3", "11", "4", "5", "6"];

/** Election types whose districts must be narrowed by gu/si/gun */
export const TYPES_NEEDING_GUSIGUN: SgTypeCode[] = ["4", "5", "6", "9"];
/** Election types where the province itself is the district (no gu/si/gun needed) */
export const TYPES_SIDO_WIDE: SgTypeCode[] = ["3", "8", "11"];
