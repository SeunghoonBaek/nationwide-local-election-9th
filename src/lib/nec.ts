import "server-only";
import { SG_ID, SG_TYPES, TYPES_SIDO_WIDE, type SgTypeCode } from "./constants";

/**
 * Client for the National Election Commission (NEC) Open API on data.go.kr.
 *
 * Fetches data for the 9th nationwide local election (2026-06-03).
 * The service key is injected via the NEC_SERVICE_KEY env var (.env.local).
 * Note: user-facing error strings are intentionally kept in Korean because
 * they are surfaced in the browser UI.
 */

export { SG_ID, SG_TYPES, type SgTypeCode };

export const NEC_BASE = "https://apis.data.go.kr/9760000";

export interface Candidate {
  cnddtId: string;
  giho: string;
  gihoSangse?: string;
  party: string; // party name (affiliation)
  name: string;
  hanjaName?: string;
  gender?: string;
  birthday?: string;
  age?: string;
  job?: string;
  edu?: string;
  career1?: string;
  career2?: string;
  status?: string; // registration status
  sggName?: string;
  sdName?: string;
  photoUrl?: string;
}

export interface Pledge {
  order: string;
  realm?: string; // pledge field/category
  title: string; // pledge title
  content?: string; // pledge detail
}

const SERVICE_KEY = process.env.NEC_SERVICE_KEY ?? "";

export function hasServiceKey(): boolean {
  return SERVICE_KEY.trim().length > 0;
}

interface NecError {
  code?: string;
  message: string;
}

// Result codes that simply mean "no data" (not an error)
const NO_DATA_CODES = new Set(["INFO-03", "INFO-200"]);
// The gateway caps page size at 100 regardless of the requested numOfRows.
const PAGE_SIZE = 100;
const MAX_PAGES = 200; // safety bound

const asRecord = (v: unknown): Record<string, unknown> | undefined =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;

interface ParsedPage {
  items: Record<string, unknown>[];
  totalCount: number;
}

/**
 * Parse a single data.go.kr / NEC JSON response page into items + totalCount.
 * Standard shape: { response: { header: { resultCode }, body: { items: { item }, totalCount } } }
 * Also tolerates the legacy { <operation>: { head, item } } shape.
 * Throws on real errors; returns empty for "no data" codes.
 */
function parsePage(json: unknown, operation: string): ParsedPage {
  const root = asRecord(json);
  if (!root) return { items: [], totalCount: 0 };

  // Gateway error envelope (e.g. unregistered key)
  if (root.OpenAPI_ServiceResponse) {
    const header = asRecord(asRecord(root.OpenAPI_ServiceResponse)?.cmmMsgHeader);
    const err: NecError = {
      code: String(header?.returnReasonCode ?? ""),
      message: String(
        header?.returnAuthMsg ?? header?.errMsg ?? "알 수 없는 API 오류"
      ),
    };
    throw Object.assign(new Error(err.message), { necError: err });
  }

  // Standard format: response.header / response.body.items.item
  const response = asRecord(root.response);
  if (response) {
    const header = asRecord(response.header);
    const code = String(header?.resultCode ?? "");
    if (code && code !== "INFO-00") {
      if (NO_DATA_CODES.has(code)) return { items: [], totalCount: 0 };
      throw new Error(String(header?.resultMsg ?? code));
    }
    const body = asRecord(response.body);
    const items = normalizeItem(asRecord(body?.items)?.item);
    const totalCount = Number(body?.totalCount) || items.length;
    return { items, totalCount };
  }

  // Legacy format: { <operation>: { head: [...], item: [...] } }
  const body = asRecord(root[operation]) ?? root;
  const head = body.head as unknown[] | undefined;
  if (Array.isArray(head)) {
    for (const h of head) {
      const result = asRecord(asRecord(h)?.RESULT);
      if (result?.resultCode && result.resultCode !== "INFO-00") {
        if (NO_DATA_CODES.has(String(result.resultCode)))
          return { items: [], totalCount: 0 };
        throw new Error(String(result.resultMsg ?? result.resultCode));
      }
    }
  }
  const items = normalizeItem(body.item);
  return { items, totalCount: Number(body.totalCount) || items.length };
}

function normalizeItem(item: unknown): Record<string, unknown>[] {
  if (Array.isArray(item)) return item as Record<string, unknown>[];
  const rec = asRecord(item);
  return rec ? [rec] : [];
}

async function fetchPage(
  service: string,
  operation: string,
  params: Record<string, string | undefined>,
  pageNo: number
): Promise<ParsedPage> {
  const url = new URL(`${NEC_BASE}/${service}/${operation}`);
  url.searchParams.set("serviceKey", SERVICE_KEY);
  url.searchParams.set("resultType", "json");
  url.searchParams.set("numOfRows", String(PAGE_SIZE));
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("sgId", SG_ID);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") url.searchParams.set(k, v);
  }

  const res = await fetch(url, { next: { revalidate: 60 * 30 } });
  if (!res.ok) {
    throw new Error(`API 요청 실패 (HTTP ${res.status})`);
  }
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    // Non-JSON response (usually unregistered key or quota-exceeded errors)
    throw new Error(
      `API가 JSON이 아닌 응답을 반환했습니다(인증키/요청 한도 확인 필요): ${text.slice(0, 200)}`
    );
  }
  return parsePage(json, operation);
}

/** Call an NEC operation, transparently paginating until all rows are fetched. */
async function callNec(
  service: string,
  operation: string,
  params: Record<string, string | undefined>
): Promise<Record<string, unknown>[]> {
  if (!hasServiceKey()) {
    throw new Error(
      "NEC_SERVICE_KEY 가 설정되지 않았습니다. .env.local 에 인증키를 추가하세요."
    );
  }

  const all: Record<string, unknown>[] = [];
  let total = Infinity;
  for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
    const { items, totalCount } = await fetchPage(service, operation, params, pageNo);
    if (pageNo === 1) total = totalCount;
    if (items.length === 0) break;
    all.push(...items);
    if (all.length >= total || items.length < PAGE_SIZE) break;
  }
  return all;
}

const str = (v: unknown): string => (v == null ? "" : String(v).trim());

/**
 * List of provinces/metropolitan cities, derived from the (complete) gu/si/gun
 * code list so every region is included regardless of merged governor races.
 */
export async function getSidoList(): Promise<string[]> {
  const items = await callNec("CommonCodeService", "getCommonGusigunCodeList", {});
  const set = new Set<string>();
  for (const it of items) {
    const name = str(it.sdName);
    if (name) set.add(name);
  }
  return [...set];
}

/**
 * List of districts (gu/si/gun) for a given election type within a province.
 * Derived from the election type's own electoral-district code list (via wiwName)
 * so it stays consistent with getSggList.
 */
export async function getGusigunList(
  sgTypecode: SgTypeCode,
  sido: string
): Promise<string[]> {
  const items = await callNec("CommonCodeService", "getCommonSggCodeList", {
    sgTypecode,
  });
  const set = new Set<string>();
  for (const it of items) {
    if (str(it.sdName) !== sido) continue;
    const name = str(it.wiwName);
    if (name && name !== sido) set.add(name);
  }
  return [...set];
}

/** List of electoral districts matching the election type / province / district */
export async function getSggList(
  sgTypecode: SgTypeCode,
  sido: string,
  gusigun?: string
): Promise<string[]> {
  const items = await callNec("CommonCodeService", "getCommonSggCodeList", {
    sgTypecode,
  });
  const set = new Set<string>();
  for (const it of items) {
    if (str(it.sdName) !== sido) continue;
    if (gusigun && str(it.wiwName) !== gusigun) continue;
    const name = str(it.sggName);
    if (name) set.add(name);
  }
  return [...set];
}

/** Fetch the list of candidates */
export async function getCandidates(
  sgTypecode: SgTypeCode,
  sido: string,
  sggName: string
): Promise<Candidate[]> {
  const items = await callNec(
    "PofelcddInfoInqireService",
    "getPofelcddRegistSttusInfoInqire", // registered candidates (not preliminary)
    {
      sgTypecode,
      sdName: TYPES_SIDO_WIDE.includes(sgTypecode) ? undefined : sido,
      sggName,
    }
  );
  return items.map((it) => ({
    cnddtId: str(it.huboid) || str(it.cnddtId),
    giho: str(it.giho),
    gihoSangse: str(it.gihoSangse) || undefined,
    party: str(it.jdName),
    name: str(it.name),
    hanjaName: str(it.hanjaName) || undefined,
    gender: str(it.gender) || undefined,
    birthday: str(it.birthday) || undefined,
    age: str(it.age) || undefined,
    job: str(it.job) || undefined,
    edu: str(it.edu) || undefined,
    career1: str(it.career1) || undefined,
    career2: str(it.career2) || undefined,
    status: str(it.status) || undefined,
    sggName: str(it.sggName) || sggName,
    sdName: str(it.sdName) || sido,
  }));
}

/** Fetch the pledges for a single candidate */
export async function getPledges(
  sgTypecode: SgTypeCode,
  cnddtId: string
): Promise<Pledge[]> {
  if (!cnddtId) return [];
  const items = await callNec(
    "ElecPrmsInfoInqireService",
    "getCnddtElecPrmsInfoInqire",
    { sgTypecode, cnddtId }
  );
  const pledges: Pledge[] = [];
  for (const it of items) {
    const count = Number(str(it.prmsCnt)) || 0;
    for (let i = 1; i <= Math.max(count, 30); i++) {
      const title = str(it[`prmsTitle${i}`]);
      if (!title) continue;
      pledges.push({
        order: str(it[`prmsOrd${i}`]) || String(i),
        realm: str(it[`prmsRealmName${i}`]) || undefined,
        title,
        content:
          str(it[`prmsCont${i}`]) ||
          str(it[`prmsMainTitle${i}`]) ||
          undefined,
      });
    }
  }
  return pledges;
}
