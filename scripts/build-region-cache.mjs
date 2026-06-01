#!/usr/bin/env node
/**
 * Pre-fetch all 시·도 / 선거종류 / 구·시·군 / 선거구 combinations from NEC
 * and write src/data/region-cache.json for fast API responses.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SG_ID = "20260603";
const BASE = "https://apis.data.go.kr/9760000";
const OUT = path.join(ROOT, "src/data/region-cache.json");

const SELECTABLE_SG_TYPES = ["3", "11", "4", "5", "6", "8", "9", "2"];
const TYPES_SIDO_WIDE = new Set(["3", "8", "11"]);

function loadKey() {
  if (process.env.NEC_SERVICE_KEY) return process.env.NEC_SERVICE_KEY.trim();
  const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const m = env.match(/^NEC_SERVICE_KEY=(.*)$/m);
  if (!m) throw new Error("NEC_SERVICE_KEY missing in .env.local");
  return m[1].trim();
}

const KEY = loadKey();
const str = (v) => (v == null ? "" : String(v).trim());
const isMetroSido = (sido) => sido.endsWith("특별시") || sido.endsWith("광역시");

function mayorWiwScopeKey(wiwName) {
  const cityOrCounty = wiwName.match(/^([가-힣]+(?:시|군))/)?.[1];
  return cityOrCounty ?? wiwName;
}

function splitSggAdminTokens(sggName) {
  const tokens = sggName.match(/[가-힣]+?(?:시|군|구)/g) ?? [];
  return [...new Set(tokens)];
}

async function callNec(service, operation, params, maxPages = 200) {
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
    const code = d?.response?.header?.resultCode;
    if (code && code !== "INFO-00" && code !== "INFO-03" && code !== "INFO-200") {
      throw new Error(`${operation}: ${code} ${d?.response?.header?.resultMsg}`);
    }
    let items = d?.response?.body?.items?.item;
    if (!items) break;
    if (!Array.isArray(items)) items = [items];
    all.push(...items);
    if (all.length >= Number(d?.response?.body?.totalCount) || items.length < 100) break;
  }
  return all;
}

function buildAdminGusigunMap(adminRows) {
  const map = {};
  for (const it of adminRows) {
    const sido = str(it.sdName);
    const name = str(it.wiwName);
    if (!sido || !name) continue;
    if (!map[sido]) map[sido] = new Set();
    map[sido].add(name);
  }
  for (const sido of Object.keys(map)) {
    map[sido] = [...map[sido]].sort((a, b) => a.localeCompare(b, "ko"));
  }
  return map;
}

function computeGusigunList(sgType, sido, sggRowsByType, adminGusigunMap) {
  if (sgType === "4") return adminGusigunMap[sido] ?? [];

  const items = sggRowsByType[sgType] ?? [];
  const set = new Set();
  const adminSet =
    sgType === "2" ? new Set(adminGusigunMap[sido] ?? []) : null;

  for (const it of items) {
    if (str(it.sdName) !== sido) continue;
    const name = str(it.wiwName);
    if (name && name !== sido) set.add(name);
    if (sgType === "2" && adminSet) {
      for (const token of splitSggAdminTokens(str(it.sggName))) {
        if (adminSet.has(token) && token !== sido) set.add(token);
      }
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, "ko"));
}

function computeSggList(sgType, sido, gusigun, sggRowsByType) {
  const items = sggRowsByType[sgType] ?? [];
  const set = new Set();
  const metro = isMetroSido(sido);
  const gusigunScope = gusigun ? mayorWiwScopeKey(gusigun) : "";
  const gusigunKey = gusigun ? gusigun.replace(/\s+/g, "") : "";

  for (const it of items) {
    if (str(it.sdName) !== sido) continue;
    const wiwName = str(it.wiwName);
    const sggName = str(it.sggName);
    if (gusigun) {
      if (sgType === "4" && !metro && mayorWiwScopeKey(wiwName) === gusigunScope) {
        // city/county scope match
      } else if (
        sgType === "2" &&
        splitSggAdminTokens(sggName)
          .map((t) => t.replace(/\s+/g, ""))
          .includes(gusigunKey)
      ) {
        // multi-area by-election
      } else if (wiwName !== gusigun) {
        continue;
      }
    }
    if (sggName) set.add(sggName);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "ko"));
}

async function main() {
  console.log("Fetching NEC admin gu/si/gun list…");
  const adminRows = await callNec("CommonCodeService", "getCommonGusigunCodeList", {});
  const adminGusigunMap = buildAdminGusigunMap(adminRows);

  const sidoSet = new Set();
  for (const it of adminRows) {
    const name = str(it.sdName);
    if (name) sidoSet.add(name);
  }
  const sido = [...sidoSet].sort((a, b) => a.localeCompare(b, "ko"));
  console.log(`  ${sido.length} provinces`);

  console.log("Fetching electoral-district code lists per sgType…");
  const sggRowsByType = {};
  for (const sgType of SELECTABLE_SG_TYPES) {
    process.stdout.write(`  sgType ${sgType}…`);
    sggRowsByType[sgType] = await callNec("CommonCodeService", "getCommonSggCodeList", {
      sgTypecode: sgType,
    });
    console.log(` ${sggRowsByType[sgType].length} rows`);
  }

  const gusigun = {};
  const sgg = {};
  let gusigunCount = 0;
  let sggCount = 0;

  for (const sgType of SELECTABLE_SG_TYPES) {
    gusigun[sgType] = {};
    sgg[sgType] = {};

    for (const sd of sido) {
      if (TYPES_SIDO_WIDE.has(sgType)) {
        gusigun[sgType][sd] = [];
        sgg[sgType][sd] = { "": [sd] };
        sggCount += 1;
        continue;
      }

      const gList = computeGusigunList(sgType, sd, sggRowsByType, adminGusigunMap);
      gusigun[sgType][sd] = gList;
      gusigunCount += gList.length;

      sgg[sgType][sd] = {};
      for (const g of gList) {
        const sList = computeSggList(sgType, sd, g, sggRowsByType);
        sgg[sgType][sd][g] = sList;
        sggCount += sList.length;
      }
    }
  }

  const out = {
    _comment:
      "Pre-built region dropdown data. Regenerate with: npm run build-regions",
    meta: {
      sgId: SG_ID,
      builtAt: new Date().toISOString().slice(0, 10),
      sidoCount: sido.length,
      gusigunEntryCount: gusigunCount,
      sggEntryCount: sggCount,
    },
    sido,
    adminGusigun: adminGusigunMap,
    gusigun,
    sgg,
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");
  const kb = Math.round(fs.statSync(OUT).size / 1024);
  console.log(`Wrote ${OUT} (${kb} KB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
