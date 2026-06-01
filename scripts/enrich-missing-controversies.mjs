#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SG_ID = "20260603";
const BASE = "https://apis.data.go.kr/9760000";
const FILE = path.join(ROOT, "src/data/controversies.json");
const FETCH_DELAY_MS = 250;

const SUBPAGE_KEYWORDS = /논란|비판|사건|물의|파문|구속|혐의|수사/;

function loadKey() {
  if (process.env.NEC_SERVICE_KEY) return process.env.NEC_SERVICE_KEY.trim();
  const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const m = env.match(/^NEC_SERVICE_KEY=(.*)$/m);
  if (!m) throw new Error("NEC_SERVICE_KEY missing");
  return m[1].trim();
}

const KEY = loadKey();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const str = (v) => (v == null ? "" : String(v).trim());

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

function parseTopicList(html) {
  const SKIP = new Set(["개요", "여담", "논란", "외부 링크"]);
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

async function fetchNamu(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "election-june/0.1 (controversy-enricher)" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return null;
  return res.text();
}

async function fetchControversiesForName(name) {
  const mainUrl = `https://namu.wiki/w/${encodeURIComponent(name)}`;
  const mainHtml = await fetchNamu(mainUrl);
  await sleep(FETCH_DELAY_MS);
  if (!mainHtml || mainHtml.length < 15000) return [];

  const subpaths = findControversySubpages(mainHtml, name);
  const controversies = [];
  for (const subpath of subpaths.slice(0, 2)) {
    const seg = decodeURIComponent(subpath);
    const subUrl = `https://namu.wiki/w/${encodeURIComponent(name)}/${encodeURIComponent(seg)}`;
    const subHtml = await fetchNamu(subUrl);
    await sleep(FETCH_DELAY_MS);
    if (!subHtml) continue;

    const sectionTitle = decodeURIComponent(subpath.replace(/\+/g, " "));
    const topics = parseTopicList(subHtml);

    if (topics.length === 0) {
      controversies.push({
        summary: `나무위키 '${sectionTitle}' 항목에 관련 정리가 있음.`,
        date: "2026-06",
        source: subUrl,
        sourceName: "나무위키",
      });
      continue;
    }

    for (const topic of topics.slice(0, 4)) {
      controversies.push({
        summary: `${topic} (나무위키 '${sectionTitle}' 항목)`,
        date: "2026-06",
        source: subUrl,
        sourceName: "나무위키",
      });
    }
  }

  const seen = new Set();
  return controversies.filter((c) => {
    const k = c.summary;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function callNec(service, operation, params) {
  const all = [];
  for (let pageNo = 1; pageNo <= 500; pageNo++) {
    const u = new URL(`${BASE}/${service}/${operation}`);
    u.searchParams.set("serviceKey", KEY);
    u.searchParams.set("resultType", "json");
    u.searchParams.set("numOfRows", "100");
    u.searchParams.set("pageNo", String(pageNo));
    u.searchParams.set("sgId", SG_ID);
    for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);

    const d = await (await fetch(u)).json();
    const code = d?.response?.header?.resultCode;
    if (code && code !== "INFO-00" && code !== "INFO-03" && code !== "INFO-200") break;

    let items = d?.response?.body?.items?.item;
    if (!items) break;
    if (!Array.isArray(items)) items = [items];
    all.push(...items);
    if (all.length >= Number(d?.response?.body?.totalCount) || items.length < 100) break;
  }
  return all;
}

function hasControversy(items, sido, sgg, name) {
  for (const it of items) {
    const m = it.match ?? {};
    if (m.name && !name.includes(m.name) && !m.name.includes(name)) continue;
    if (m.sido && m.sido !== sido) continue;
    if (m.sgg && !sgg.includes(m.sgg) && !m.sgg.includes(sgg)) continue;
    if (!m.name) continue;
    if ((it.controversies ?? []).length > 0) return true;
  }
  return false;
}

function upsertControversy(items, candidate, controversies) {
  const idx = items.findIndex((it) => {
    const m = it.match ?? {};
    return m.sido === candidate.sido && m.sgg === candidate.sgg && m.name === candidate.name;
  });
  if (idx >= 0) {
    const prev = items[idx].controversies ?? [];
    const seen = new Set(prev.map((c) => c.summary));
    for (const c of controversies) if (!seen.has(c.summary)) prev.push(c);
    items[idx].controversies = prev;
    return "updated";
  }
  items.push({
    match: { sido: candidate.sido, sgg: candidate.sgg, name: candidate.name },
    tags: [],
    controversies,
  });
  return "created";
}

async function main() {
  const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const items = data.items ?? [];

  const allCandidates = [];
  for (const sgType of ["3", "4", "11"]) {
    const rows = await callNec(
      "PofelcddInfoInqireService",
      "getPofelcddRegistSttusInfoInqire",
      { sgTypecode: sgType }
    );
    for (const r of rows) {
      allCandidates.push({
        sgType,
        sido: str(r.sdName),
        sgg: str(r.sggName),
        name: str(r.name),
      });
    }
  }

  const unique = new Map();
  for (const c of allCandidates) unique.set(`${c.sido}|${c.sgg}|${c.name}`, c);
  const candidates = [...unique.values()];
  const missing = candidates.filter((c) => !hasControversy(items, c.sido, c.sgg, c.name));

  console.log(`Candidates(target types): ${candidates.length}`);
  console.log(`Missing controversies: ${missing.length}`);

  const cache = new Map();
  let added = 0;
  let updated = 0;
  let fetchedWithResult = 0;
  let processed = 0;

  for (const c of missing) {
    processed++;
    if (!cache.has(c.name)) {
      try {
        cache.set(c.name, await fetchControversiesForName(c.name));
      } catch {
        cache.set(c.name, []);
      }
    }
    const controversies = cache.get(c.name) ?? [];
    if (controversies.length > 0) {
      fetchedWithResult++;
      const mode = upsertControversy(items, c, controversies);
      if (mode === "created") added++;
      if (mode === "updated") updated++;
    }
    if (processed % 50 === 0) {
      console.log(`processed ${processed}/${missing.length} (found:${fetchedWithResult})`);
    }
  }

  data.items = items;
  if (!data._meta) data._meta = {};
  data._meta.enrichedAt = new Date().toISOString().slice(0, 10);
  data._meta.enrichedScope = "sgType 3,4,11 missing-controversy backfill";
  data._meta.enrichedFound = fetchedWithResult;

  fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`Done. added=${added}, updated=${updated}, found=${fetchedWithResult}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
