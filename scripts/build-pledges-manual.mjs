#!/usr/bin/env node
/**
 * Build src/data/pledges-manual.json for Suwon city council districts (sgType 6).
 * - Scrapes pledge pages from council.suwon.go.kr for incumbent councillors.
 * - Keeps existing manual entries from other sources (news interviews, etc.).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SG_ID = "20260603";
const BASE = "https://apis.data.go.kr/9760000";
const COUNCIL = "https://council.suwon.go.kr";
const OUT = path.join(ROOT, "src/data/pledges-manual.json");
const MEMBER_IDS_FILE = path.join(ROOT, "scripts/suwon-council-member-ids.txt");
const NEWS_SUPPLEMENTS = path.join(ROOT, "scripts/pledges-news-supplements.json");
const SIDO = "경기도";
const SG_TYPE = "6";
const FETCH_DELAY_MS = 120;

function loadKey() {
  if (process.env.NEC_SERVICE_KEY) return process.env.NEC_SERVICE_KEY.trim();
  const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const m = env.match(/^NEC_SERVICE_KEY=(.*)$/m);
  if (!m) throw new Error("NEC_SERVICE_KEY missing");
  return m[1].trim();
}

const KEY = loadKey();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callNec(service, operation, params) {
  const all = [];
  for (let pageNo = 1; pageNo <= 50; pageNo++) {
    const u = new URL(`${BASE}/${service}/${operation}`);
    u.searchParams.set("serviceKey", KEY);
    u.searchParams.set("resultType", "json");
    u.searchParams.set("numOfRows", "100");
    u.searchParams.set("pageNo", String(pageNo));
    u.searchParams.set("sgId", SG_ID);
    for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
    const d = await (await fetch(u)).json();
    const body = d.response?.body;
    if (!body) break;
    let items = body.items?.item;
    if (!items) break;
    if (!Array.isArray(items)) items = [items];
    all.push(...items);
    if (all.length >= Number(body.totalCount) || items.length < 100) break;
  }
  return all;
}

async function hasApiPledge(cnddtId) {
  const u = new URL(
    `${BASE}/ElecPrmsInfoInqireService/getCnddtElecPrmsInfoInqire`
  );
  u.searchParams.set("serviceKey", KEY);
  u.searchParams.set("resultType", "json");
  u.searchParams.set("numOfRows", "10");
  u.searchParams.set("pageNo", "1");
  u.searchParams.set("sgId", SG_ID);
  u.searchParams.set("sgTypecode", SG_TYPE);
  u.searchParams.set("cnddtId", cnddtId);
  const d = await (await fetch(u)).json();
  if (d.response?.header?.resultCode !== "INFO-00") return false;
  const item = d.response?.body?.items?.item;
  const row = Array.isArray(item) ? item[0] : item;
  return (Number(row?.prmsCnt) || 0) > 0;
}

function decodeHtml(s) {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function isValidPledge(t) {
  if (!t || t.length < 4 || t.length > 180) return false;
  if (/[{}";=]|is_mobile|is_robot|user_agent|version_str|reqInfo/.test(t)) {
    return false;
  }
  return true;
}

function parsePromises(html) {
  const box = html.match(/<div class="promisebox">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i)?.[1];
  if (!box) return [];

  const pledges = [];

  // Category blocks: <p>1. category</p><ul><li>item</li>...</ul>
  const categories = box.matchAll(
    /<li>\s*<p>([^<]+)<\/p>\s*<ul>([\s\S]*?)<\/ul>\s*<\/li>/gi
  );
  for (const cat of categories) {
    const realm = decodeHtml(cat[1]).replace(/^\d+\.\s*/, "");
    for (const m of cat[2].matchAll(/<li>([^<]+)<\/li>/gi)) {
      const title = decodeHtml(m[1]);
      if (isValidPledge(title)) pledges.push({ title, realm });
    }
  }

  if (pledges.length > 0) return dedupePledges(pledges);

  // Flat or single-nested list items
  for (const m of box.matchAll(/<li>([^<]+)<\/li>/gi)) {
    let title = decodeHtml(m[1]).replace(/^\d+\.\s*/, "");
    if (isValidPledge(title)) pledges.push({ title });
  }

  return dedupePledges(pledges);
}

function dedupePledges(pledges) {
  const seen = new Set();
  const out = [];
  for (const p of pledges) {
    const key = `${p.realm ?? ""}|${p.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out.slice(0, 15).map((p, i) => ({
    order: String(i + 1),
    ...(p.realm ? { realm: p.realm } : {}),
    title: p.title,
  }));
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "election-june/0.1 (pledge-builder)" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return null;
  const text = await res.text();
  if (text.includes("404error")) return null;
  return text;
}

async function scrapeMember(memberId) {
  const promiseUrl = `${COUNCIL}/member/${memberId}/promise.do`;
  const profileUrl = `${COUNCIL}/member/${memberId}/profile.do`;
  const [promiseHtml, profileHtml] = await Promise.all([
    fetchHtml(promiseUrl),
    fetchHtml(profileUrl),
  ]);
  if (!promiseHtml) return null;

  const name =
    profileHtml?.match(/의원명\s*:\s*([^\s<]+)/)?.[1] ??
    promiseHtml.match(/시의회\s+([^\s<]+)/)?.[1]?.replace(/부의장|의장|위원장/g, "");
  if (!name) return null;

  return {
    name,
    source: promiseUrl,
    pledges: parsePromises(promiseHtml),
  };
}

function itemKey(it) {
  return `${it.match?.sido}|${it.match?.sgg}|${it.match?.name}`;
}

async function main() {
  const memberIds = fs
    .readFileSync(MEMBER_IDS_FILE, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const byName = new Map();
  for (const id of memberIds) {
    const row = await scrapeMember(id);
    if (row && row.pledges.length > 0) {
      byName.set(row.name, row);
      console.error(`  council: ${row.name} (${row.pledges.length})`);
    }
    await sleep(FETCH_DELAY_MS);
  }
  console.error(`Council scraped: ${byName.size} members`);

  const sggRows = await callNec("CommonCodeService", "getCommonSggCodeList", {
    sgTypecode: SG_TYPE,
  });
  const suwonSggs = [
    ...new Set(
      sggRows
        .filter((r) => r.sdName === SIDO && String(r.wiwName ?? "").includes("수원"))
        .map((r) => r.sggName)
    ),
  ].sort();

  const autoItems = [];
  let matched = 0;
  let skippedApi = 0;

  for (const sgg of suwonSggs) {
    const cands = await callNec(
      "PofelcddInfoInqireService",
      "getPofelcddRegistSttusInfoInqire",
      { sgTypecode: SG_TYPE, sdName: SIDO, sggName: sgg }
    );
    for (const c of cands) {
      const id = c.huboid || c.cnddtId;
      if (await hasApiPledge(id)) {
        skippedApi++;
        continue;
      }
      const scraped = byName.get(c.name);
      if (!scraped) continue;
      matched++;
      autoItems.push({
        match: { sido: SIDO, sgg, name: c.name },
        source: scraped.source,
        sourceName: "수원특례시의회",
        note: "현직 의원 매니페스토 공약. NEC API 미등록.",
        pledges: scraped.pledges,
      });
      await sleep(80);
    }
    await sleep(FETCH_DELAY_MS);
  }

  console.error(
    `Suwon auto: ${matched} candidates (${skippedApi} already in API), ${suwonSggs.length} districts`
  );

  const existing = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const autoKeys = new Set(autoItems.map(itemKey));

  let newsItems = [];
  if (fs.existsSync(NEWS_SUPPLEMENTS)) {
    newsItems = JSON.parse(fs.readFileSync(NEWS_SUPPLEMENTS, "utf8")).items ?? [];
  }
  const newsKeys = new Set(newsItems.map(itemKey));

  const kept = existing.items.filter((it) => {
    const k = itemKey(it);
    if (autoKeys.has(k) || newsKeys.has(k)) return false;
    if (
      it.sourceName === "수원특례시의회" &&
      String(it.match?.sgg ?? "").includes("수원시")
    ) {
      return false;
    }
    return true;
  });

  const newsToAdd = newsItems.filter((it) => !autoKeys.has(itemKey(it)));

  const merged = {
    _comment: existing._comment,
    _meta: {
      collectedAt: new Date().toISOString().slice(0, 10),
      scope: `수원시 구·시·군의원 ${suwonSggs.length}개 선거구 (시의회 스크래핑 + 언론 보완)`,
      suwonCouncilMembers: byName.size,
      suwonAutoMatched: matched,
      newsSupplements: newsToAdd.length,
    },
    items: [...autoItems, ...newsToAdd, ...kept],
  };

  merged.items.sort((a, b) => {
    const sa = a.match?.sgg ?? "";
    const sb = b.match?.sgg ?? "";
    if (sa !== sb) return sa.localeCompare(sb, "ko");
    return (a.match?.name ?? "").localeCompare(b.match?.name ?? "", "ko");
  });

  fs.writeFileSync(OUT, JSON.stringify(merged, null, 2) + "\n");
  console.error(`Wrote ${merged.items.length} total entries to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
