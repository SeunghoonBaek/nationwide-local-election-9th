#!/usr/bin/env node
/**
 * Compare src/data/region-cache.json against live NEC-derived lists
 * using the same logic as build-region-cache.mjs / nec.ts.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SG_ID = "20260603";
const BASE = "https://apis.data.go.kr/9760000";
const CACHE_PATH = path.join(ROOT, "src/data/region-cache.json");

const SELECTABLE_SG_TYPES = ["3", "11", "4", "5", "6", "8", "9", "2"];
const TYPES_SIDO_WIDE = new Set(["3", "8", "11"]);

function loadKey() {
  if (process.env.NEC_SERVICE_KEY) return process.env.NEC_SERVICE_KEY.trim();
  const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const m = env.match(/^NEC_SERVICE_KEY=(.*)$/m);
  if (!m) throw new Error("NEC_SERVICE_KEY missing");
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

function diff(expected, actual) {
  const exp = new Set(expected);
  const act = new Set(actual);
  const missing = [...exp].filter((x) => !act.has(x));
  const extra = [...act].filter((x) => !exp.has(x));
  return { missing, extra };
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
      throw new Error(`${operation}: ${code}`);
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
  if (sgType === "4") return [...(adminGusigunMap[sido] ?? [])];

  const items = sggRowsByType[sgType] ?? [];
  const set = new Set();
  const adminSet = sgType === "2" ? new Set(adminGusigunMap[sido] ?? []) : null;

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
        // ok
      } else if (
        sgType === "2" &&
        splitSggAdminTokens(sggName)
          .map((t) => t.replace(/\s+/g, ""))
          .includes(gusigunKey)
      ) {
        // ok
      } else if (wiwName !== gusigun) {
        continue;
      }
    }
    if (sggName) set.add(sggName);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "ko"));
}

function buildExpected(adminGusigunMap, sggRowsByType, sido) {
  const expected = { sido, adminGusigun: adminGusigunMap, gusigun: {}, sgg: {} };

  for (const sgType of SELECTABLE_SG_TYPES) {
    expected.gusigun[sgType] = {};
    expected.sgg[sgType] = {};

    for (const sd of sido) {
      if (TYPES_SIDO_WIDE.has(sgType)) {
        expected.gusigun[sgType][sd] = [];
        expected.sgg[sgType][sd] = { "": [sd] };
        continue;
      }

      const gList = computeGusigunList(sgType, sd, sggRowsByType, adminGusigunMap);
      expected.gusigun[sgType][sd] = gList;
      expected.sgg[sgType][sd] = {};
      for (const g of gList) {
        expected.sgg[sgType][sd][g] = computeSggList(sgType, sd, g, sggRowsByType);
      }
    }
  }
  return expected;
}

async function main() {
  const cache = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
  if (cache.meta?.sgId !== SG_ID) {
    console.error("Cache sgId mismatch:", cache.meta?.sgId);
    process.exit(2);
  }

  console.log("Fetching live NEC data (same as build-region-cache)…");
  const adminRows = await callNec("CommonCodeService", "getCommonGusigunCodeList", {});
  const adminGusigunMap = buildAdminGusigunMap(adminRows);
  const sidoSet = new Set();
  for (const it of adminRows) {
    const name = str(it.sdName);
    if (name) sidoSet.add(name);
  }
  const sido = [...sidoSet].sort((a, b) => a.localeCompare(b, "ko"));

  const sggRowsByType = {};
  for (const sgType of SELECTABLE_SG_TYPES) {
    process.stdout.write(`  sgType ${sgType}…`);
    sggRowsByType[sgType] = await callNec("CommonCodeService", "getCommonSggCodeList", {
      sgTypecode: sgType,
    });
    console.log(` ${sggRowsByType[sgType].length} rows`);
  }

  const expected = buildExpected(adminGusigunMap, sggRowsByType, sido);
  const issues = [];

  const sidoCmp = diff(expected.sido, cache.sido ?? []);
  if (sidoCmp.missing.length || sidoCmp.extra.length) {
    issues.push({ level: "sido", missing: sidoCmp.missing, extra: sidoCmp.extra });
  }

  for (const sd of sido) {
    const adminCmp = diff(expected.adminGusigun[sd] ?? [], cache.adminGusigun?.[sd] ?? []);
    if (adminCmp.missing.length || adminCmp.extra.length) {
      issues.push({
        level: "adminGusigun",
        sido: sd,
        missing: adminCmp.missing,
        extra: adminCmp.extra,
      });
    }
  }

  for (const sgType of SELECTABLE_SG_TYPES) {
    for (const sd of sido) {
      const gExp = expected.gusigun[sgType][sd] ?? [];
      const gCache = cache.gusigun?.[sgType]?.[sd] ?? [];
      const gCmp = diff(gExp, gCache);
      if (gCmp.missing.length || gCmp.extra.length) {
        issues.push({
          level: "gusigun",
          sgType,
          sido: sd,
          missing: gCmp.missing,
          extra: gCmp.extra,
        });
      }

      const sggExpByG = expected.sgg[sgType][sd] ?? {};
      const sggCacheByG = cache.sgg?.[sgType]?.[sd] ?? {};
      const allG = new Set([...Object.keys(sggExpByG), ...Object.keys(sggCacheByG)]);

      for (const g of allG) {
        const sCmp = diff(sggExpByG[g] ?? [], sggCacheByG[g] ?? []);
        if (sCmp.missing.length || sCmp.extra.length) {
          issues.push({
            level: "sgg",
            sgType,
            sido: sd,
            gusigun: g || "(sido-wide)",
            missing: sCmp.missing,
            extra: sCmp.extra,
          });
        }
      }
    }
  }

  console.log("\n=== Verification summary ===");
  console.log(`Cache built: ${cache.meta.builtAt}`);
  console.log(`Sido: ${sido.length}`);
  console.log(`Compared sgTypes: ${SELECTABLE_SG_TYPES.join(", ")}`);

  if (issues.length === 0) {
    console.log("\nOK — cache matches live NEC-derived lists (no missing/extra regions).");
    process.exit(0);
  }

  console.log(`\nMISMATCHES: ${issues.length}`);
  for (const i of issues.slice(0, 40)) {
    console.log("\n---", i.level, i.sgType ?? "", i.sido ?? "", i.gusigun ?? "");
    if (i.missing?.length) console.log("  missing in cache:", i.missing.join(", "));
    if (i.extra?.length) console.log("  extra in cache:", i.extra.join(", "));
  }
  if (issues.length > 40) console.log(`\n… and ${issues.length - 40} more`);

  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
