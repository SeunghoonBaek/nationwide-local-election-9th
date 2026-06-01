import "server-only";
import { SG_ID, type SgTypeCode } from "./constants";

/**
 * Resolve pledge bulletin links from the NEC policy·pledge site (policy.nec.go.kr).
 */

const POLICY_COMMIMENT = "https://policy.nec.go.kr/plc/commiment";
const POLICY_MENU_ID = "CNDDT25";
const CDN_BASE = "https://cdn.nec.go.kr";

/** policy.nec.go.kr sub-election id (prefix = sgType code) */
const SUB_SG_ID: Partial<Record<SgTypeCode, string>> = {
  "2": "220260603",
  "3": "320260603",
  "4": "420260603",
  "5": "520260603",
  "6": "620260603",
  "8": "820260603",
  "9": "920260603",
  "11": "1120260603",
};

export interface PolicyPledgeLink {
  /** Deep link to the district on policy.nec.go.kr */
  pageUrl: string;
  /** CDN URL for the candidate election bulletin (선거공보) PDF, when published */
  bulletinUrl?: string;
  /** Path segment after /policy_pdf/ — for inline viewer proxy */
  bulletinPath?: string;
}

interface PolicyListRow {
  huboid?: string;
  fileinfo?: string;
}

interface DistrictPolicyCache {
  links: Map<string, PolicyPledgeLink>;
}

const districtCache = new Map<string, DistrictPolicyCache | null>();

async function postPolicy<T extends Record<string, unknown>>(
  path: string,
  data: Record<string, string>
): Promise<T | null> {
  try {
    const res = await fetch(`${POLICY_COMMIMENT}/${path}`, {
      method: "POST",
      headers: {
        "User-Agent": "election-june/0.1 (public info)",
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: `${POLICY_COMMIMENT}/initUCACommiment.do?menuId=${POLICY_MENU_ID}`,
      },
      body: new URLSearchParams(data).toString(),
      next: { revalidate: 60 * 60 * 6 },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function parseBulletinUrl(fileinfo?: string): { url: string; path: string } | undefined {
  if (!fileinfo) return undefined;

  for (const part of fileinfo.split(",")) {
    const fields = part.split("||");
    const label = fields[0]?.trim();
    const path = fields[1]?.trim();
    if (!path) continue;
    if (
      label === "선거공보" ||
      label?.includes("공약") ||
      label?.includes("공보")
    ) {
      return { path, url: `${CDN_BASE}/policy_pdf/${path}` };
    }
  }

  const fallback = fileinfo.split("||")[1]?.trim();
  return fallback
    ? { path: fallback, url: `${CDN_BASE}/policy_pdf/${fallback}` }
    : undefined;
}

function buildPageUrl(regionId: string, sggid: string, subSgId: string): string {
  const q = new URLSearchParams({
    menuId: POLICY_MENU_ID,
    psggid: sggid,
    psidoId: regionId,
    pwiwid: "",
    psubSgId: subSgId,
    psgId: SG_ID,
  });
  return `${POLICY_COMMIMENT}/initUCACommiment.do?${q}`;
}

function findSggName(
  list: { sggname?: string }[] | undefined,
  sgg: string
): { sggname?: string; sggid?: string } | undefined {
  if (!list?.length) return undefined;
  const exact = list.find((r) => r.sggname === sgg);
  if (exact) return exact;
  return list.find((r) => r.sggname?.includes(sgg) || sgg.includes(r.sggname ?? ""));
}

async function loadDistrictLinks(
  sgType: SgTypeCode,
  sido: string,
  sgg: string
): Promise<Map<string, PolicyPledgeLink>> {
  const subSgId = SUB_SG_ID[sgType];
  if (!subSgId) return new Map();

  const cacheKey = `${sgType}:${sido}:${sgg}`;
  if (districtCache.has(cacheKey)) {
    return districtCache.get(cacheKey)?.links ?? new Map();
  }

  const links = new Map<string, PolicyPledgeLink>();

  const regions = await postPolicy<{ regionlist?: { wiwname?: string; wiwid?: string }[] }>(
    "initUCACommimentRegion.do",
    { sgId: SG_ID, subSgId }
  );
  const region = regions?.regionlist?.find((r) => r.wiwname === sido);
  if (!region?.wiwid) {
    districtCache.set(cacheKey, { links });
    return links;
  }

  const sggRes = await postPolicy<{ sgglist?: { sggname?: string; sggid?: string }[] }>(
    "initUCACommimentSgg.do",
    {
      sgId: SG_ID,
      subSgId,
      wiwsidocode: region.wiwid,
      wiwid: "",
      sortYn: "",
    }
  );
  const sggRow = findSggName(sggRes?.sgglist, sgg);
  if (!sggRow?.sggid) {
    districtCache.set(cacheKey, { links });
    return links;
  }

  const pageUrl = buildPageUrl(region.wiwid, sggRow.sggid, subSgId);

  const listRes = await postPolicy<{ list?: PolicyListRow[] }>(
    "initUCACommimentList.do",
    {
      sgId: SG_ID,
      subSgId,
      hRegionId: region.wiwid,
      hGuId: "",
      hSggId: sggRow.sggid,
      sgTypecode: sgType,
      pageIndex: "1",
      elecEndYn: "N",
    }
  );

  for (const row of listRes?.list ?? []) {
    const id = row.huboid?.trim();
    if (!id) continue;
    const bulletin = parseBulletinUrl(row.fileinfo);
    links.set(
      id,
      bulletin
        ? {
            pageUrl,
            bulletinUrl: bulletin.url,
            bulletinPath: bulletin.path,
          }
        : { pageUrl }
    );
  }

  districtCache.set(cacheKey, { links });
  return links;
}

/** Bulletin / policy-site links for candidates in a district, keyed by cnddtId (huboid). */
export async function getPolicyPledgeLinks(
  sgType: SgTypeCode,
  sido: string,
  sgg: string
): Promise<Map<string, PolicyPledgeLink>> {
  return loadDistrictLinks(sgType, sido, sgg);
}

export async function getPolicyPledgeLink(
  sgType: SgTypeCode,
  sido: string,
  sgg: string,
  cnddtId: string
): Promise<PolicyPledgeLink | undefined> {
  const id = cnddtId.trim();
  if (!id) return undefined;
  const links = await loadDistrictLinks(sgType, sido, sgg);
  return links.get(id);
}
