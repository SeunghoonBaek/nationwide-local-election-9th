#!/usr/bin/env node
/**
 * Build src/data/controversies.json for:
 * - 시·도지사 (sgType 3), 교육감 (11), 주요 시장 (4) — tags + Namuwiki controversies
 * - 시·도의원 (5), 구·시·군의원 (6) — tags from NEC API only (no row if empty)
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SG_ID = "20260603";
const BASE = "https://apis.data.go.kr/9760000";
const OUT = path.join(ROOT, "src/data/controversies.json");
const FETCH_DELAY_MS = 300;
const MAX_PAGES = 500;

const MAJOR_CITIES = [
  "수원시", "고양시", "용인시", "성남시", "부천시", "청주시", "전주시", "천안시",
  "창원시", "김해시", "포항시", "안산시", "안양시", "남양주시", "화성시", "평택시",
  "시흥시", "파주시", "의정부시", "군포시", "하남시", "광명시", "오산시", "이천시",
  "양주시", "구리시", "안성시", "김포시", "여수시", "순천시", "목포시", "군산시",
  "익산시", "제주시", "원주시", "춘천시", "강릉시", "경주시", "진주시", "양산시",
];

const NAMU_SG_TYPES = new Set(["3", "4", "11"]);
const SUBPAGE_KEYWORDS = /논란|비판|사건|물의|파문|구속|혐의|수사/;

function loadKey() {
  if (process.env.NEC_SERVICE_KEY) return process.env.NEC_SERVICE_KEY.trim();
  const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const m = env.match(/^NEC_SERVICE_KEY=(.*)$/m);
  if (!m) throw new Error("NEC_SERVICE_KEY missing");
  return m[1].trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callNec(service, operation, params, maxPages = 50) {
  const KEY = loadKey();
  const all = [];
  for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
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

async function fetchNamu(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "election-june/0.1 (controversy-indexer)" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return null;
  return res.text();
}

function decodeHtml(s) {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function extractTags(job, career1, career2) {
  const tags = new Set();
  const text = [job, career1, career2].filter(Boolean).join(" ");

  const current = text.match(/\(현\)([^|,()]+)/);
  if (current) tags.add(current[1].trim().slice(0, 24));

  const former = text.match(/\(전\)([^|,()]+)/);
  if (former) {
    const f = former[1].trim().slice(0, 24);
    if (/의원|시장|군수|구청장|도지사|교육감/.test(f)) tags.add(`전직 ${f}`);
  }

  if (/국회의원/.test(text)) tags.add("국회의원 경력");
  if (/(\d+)선/.test(text)) tags.add(`${RegExp.$1}선`);

  if (/시·도의원|시도의원|광역의원/.test(text)) tags.add("시·도의원");
  if (/구·시·군의원|구시군의원|기초의원|시의원|군의원|구의원|의회의원/.test(text)) {
    tags.add("기초의원");
  }
  if (/의원/.test(text) && /\(현\)/.test(text) && !tags.has("시·도의원") && !tags.has("기초의원")) {
    tags.add("현직 의원");
  }

  if (/시장|군수|구청장|도지사|교육감|광역단체장/.test(text) && /\(현\)/.test(text)) {
    tags.add("현직 단체장");
  }
  if (/변호사/.test(text)) tags.add("변호사");
  if (/교수|교육자|교사/.test(text)) tags.add("교육계");
  if (/기업|대표|CEO|회사|상담사|사무장/.test(text)) tags.add("기업·전문직");
  if (/정당인|당대표|최고위원|국회의원/.test(text)) tags.add("정당·정치");

  return [...tags].slice(0, 6);
}

function findControversySubpages(mainHtml, name) {
  const encodedName = encodeURIComponent(name);
  const paths = new Set();

  const re = new RegExp(
    `wiki-link-internal' href='/w/${encodedName}/([^']+)' title='([^']+)'`,
    "g"
  );
  for (const m of mainHtml.matchAll(re)) {
    const title = decodeURIComponent(m[2].split("/").pop() ?? "");
    if (SUBPAGE_KEYWORDS.test(title)) paths.add(decodeURIComponent(m[1]));
  }

  const re2 = new RegExp(`href='/w/${encodedName}/([^']+)'`, "g");
  for (const m of mainHtml.matchAll(re2)) {
    const seg = decodeURIComponent(m[1]);
    if (SUBPAGE_KEYWORDS.test(seg)) paths.add(m[1]);
  }

  return [...paths];
}

function parseTopicList(html) {
  const SKIP = new Set([
    "개요",
    "여담",
    "논란",
    "외부 링크",
    "발언 관련",
    "정치 입문 이전",
    "국회의원 재임 시기",
  ]);
  const topics = new Set();
  const paras = [...html.matchAll(/wiki-paragraph[^>]*>([\s\S]*?)<\/div>/g)].map((m) =>
    decodeHtml(m[1])
  );

  for (const p of paras) {
    if (!/\d+\.\s*개요/.test(p) && !/\d+\.\s*[^\d]/.test(p)) continue;
    for (const m of p.matchAll(/\d+\.\s*(?!개요|여담|외부\s*링크)([^\d#]{2,48}?)(?=\d+\.|$)/g)) {
      const t = m[1].replace(/[#]+.*$/, "").trim();
      if (t.length < 4 || t.length > 48 || SKIP.has(t)) continue;
      if (/^논란/.test(t) && t.length < 8) continue;
      topics.add(t);
    }
  }

  return [...topics];
}

async function fetchControversiesForName(name) {
  const mainUrl = `https://namu.wiki/w/${encodeURIComponent(name)}`;
  const mainHtml = await fetchNamu(mainUrl);
  await sleep(FETCH_DELAY_MS);
  if (!mainHtml || mainHtml.length < 30000) return [];

  const subpaths = findControversySubpages(mainHtml, name);
  const controversies = [];

  for (const subpath of subpaths.slice(0, 2)) {
    const segment = decodeURIComponent(subpath);
    const subUrl = `https://namu.wiki/w/${encodeURIComponent(name)}/${encodeURIComponent(segment)}`;
    const subHtml = await fetchNamu(subUrl);
    await sleep(FETCH_DELAY_MS);
    if (!subHtml) continue;

    const sectionTitle = decodeURIComponent(subpath.replace(/\+/g, " "));
    const topics = parseTopicList(subHtml);

    if (topics.length === 0) {
      controversies.push({
        summary: `나무위키 '${sectionTitle}' 항목에 관련 정리가 있음.`,
        date: "2026-05",
        source: subUrl,
        sourceName: "나무위키",
      });
      continue;
    }

    for (const topic of topics.slice(0, 4)) {
      controversies.push({
        summary: `${topic} (나무위키 '${sectionTitle}' 항목)`,
        date: "2026-05",
        source: subUrl,
        sourceName: "나무위키",
      });
    }
  }

  const seen = new Set();
  return controversies
    .filter((c) => {
      const key = c.summary.slice(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

function mapCandidate(c, sgType) {
  return {
    sgType,
    sido: c.sdName,
    sgg: c.sggName,
    name: c.name,
    job: c.job,
    career1: c.career1,
    career2: c.career2,
  };
}

async function loadAllCandidates() {
  const candidates = [];
  const key = (c) => `${c.sido}|${c.sgg}|${c.name}`;

  console.log("  sgType 3, 11 (by province)…");
  const sidoItems = await callNec("CommonCodeService", "getCommonGusigunCodeList", {});
  const sidos = [...new Set(sidoItems.map((i) => i.sdName).filter(Boolean))].sort();

  for (const sido of sidos) {
    for (const sgType of ["3", "11"]) {
      const rows = await callNec(
        "PofelcddInfoInqireService",
        "getPofelcddRegistSttusInfoInqire",
        { sgTypecode: sgType, sggName: sido }
      );
      for (const c of rows) candidates.push(mapCandidate(c, sgType));
    }
  }

  console.log("  sgType 4 (major cities)…");
  for (const city of MAJOR_CITIES) {
    const rows = await callNec(
      "PofelcddInfoInqireService",
      "getPofelcddRegistSttusInfoInqire",
      { sgTypecode: "4", sggName: city }
    );
    for (const c of rows) candidates.push(mapCandidate(c, "4"));
  }

  console.log("  sgType 5, 6 (bulk)…");
  for (const sgType of ["5", "6"]) {
    const rows = await callNec(
      "PofelcddInfoInqireService",
      "getPofelcddRegistSttusInfoInqire",
      { sgTypecode: sgType },
      MAX_PAGES
    );
    for (const c of rows) candidates.push(mapCandidate(c, sgType));
  }

  const map = new Map();
  for (const c of candidates) map.set(key(c), c);
  return [...map.values()];
}

async function main() {
  console.log("Loading candidates from NEC API…");
  const candidates = await loadAllCandidates();
  console.log(`Candidates: ${candidates.length}`);

  const items = [];
  let withControversy = 0;
  let namuQueue = 0;

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    process.stdout.write(`\r[${i + 1}/${candidates.length}] ${c.name}…`.padEnd(60));

    const tags = extractTags(c.job, c.career1, c.career2);
    let controversies = [];

    if (NAMU_SG_TYPES.has(c.sgType)) {
      namuQueue++;
      try {
        controversies = await fetchControversiesForName(c.name);
      } catch {
        controversies = [];
      }
    }

    if (controversies.length) withControversy++;

    if (tags.length === 0 && controversies.length === 0) continue;

    items.push({
      match: { sido: c.sido, sgg: c.sgg, name: c.name },
      tags,
      controversies,
    });
  }

  const byType = Object.fromEntries(
    ["3", "4", "5", "6", "11"].map((t) => [
      t,
      candidates.filter((c) => c.sgType === t).length,
    ])
  );

  console.log(`\nDone. ${withControversy} with Namuwiki topics (${namuQueue} Namuwiki lookups).`);

  const out = {
    _comment:
      "Candidate tags (NEC API careers) and Namuwiki controversy topics (governors/superintendents/mayors only). " +
      "Council members (sgType 5/6) include tags when available. Rows omitted when both tags and controversies are empty.",
    _meta: {
      collectedAt: "2026-05-30",
      scope:
        "시·도지사(3) + 교육감(11) + major city mayors(4) + 시·도의원(5) + 구·시·군의원(6)",
      sourceNote:
        "Namuwiki: sgType 3/4/11 only. Council tags from NEC API career fields.",
      candidateCount: candidates.length,
      bySgType: byType,
      itemsWritten: items.length,
      withControversies: withControversy,
    },
    items,
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`Wrote ${OUT} (${items.length} items)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
