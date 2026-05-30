#!/usr/bin/env node
/**
 * NEC Open API key / connectivity check script.
 * Usage: NEC_SERVICE_KEY=... node scripts/check-nec.mjs
 *        or put the key in .env.local and run  node scripts/check-nec.mjs
 */
import fs from "node:fs";
import path from "node:path";

const SG_ID = "20260603";
const BASE = "https://apis.data.go.kr/9760000";

// Read the key from .env.local (falls back to the environment variable)
function loadKey() {
  if (process.env.NEC_SERVICE_KEY) return process.env.NEC_SERVICE_KEY.trim();
  try {
    const env = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    const m = env.match(/^NEC_SERVICE_KEY=(.*)$/m);
    if (m) return m[1].trim();
  } catch {}
  return "";
}

const KEY = loadKey();
if (!KEY) {
  console.error("ERROR: NEC_SERVICE_KEY is missing. Add it to .env.local or pass it as an env var.");
  process.exit(1);
}

const checks = [
  {
    name: "Code info (CommonCodeService)",
    url: `${BASE}/CommonCodeService/getCommonSggCodeList?serviceKey=${KEY}&resultType=json&numOfRows=3&pageNo=1&sgId=${SG_ID}&sgTypecode=3`,
  },
  {
    name: "Candidate info (PofelcddInfoInqireService)",
    url: `${BASE}/PofelcddInfoInqireService/getPofelcddRegistSttusInfoInqire?serviceKey=${KEY}&resultType=json&numOfRows=3&pageNo=1&sgId=${SG_ID}&sgTypecode=3&sdName=${encodeURIComponent("서울특별시")}`,
  },
  {
    name: "Pledges (ElecPrmsInfoInqireService)",
    url: `${BASE}/ElecPrmsInfoInqireService/getCnddtElecPrmsInfoInqire?serviceKey=${KEY}&resultType=json&numOfRows=3&pageNo=1&sgId=${SG_ID}&sgTypecode=3&cnddtId=1`,
  },
];

const preview = (s) => s.replace(/\s+/g, " ").slice(0, 160);

for (const c of checks) {
  try {
    const res = await fetch(c.url, { signal: AbortSignal.timeout(20000) });
    const text = await res.text();
    let status = "?";
    if (text.includes("SERVICE_KEY_IS_NOT_REGISTERED") || /unauthorized/i.test(text))
      status = "NOT AUTHORIZED (key not applied/activated)";
    else if (res.status === 403 || /forbidden/i.test(text))
      status = "PENDING gateway propagation (retry in ~30-60 min)";
    else if (text.includes("INFO-00") || text.trim().startsWith("{"))
      status = "OK";
    else if (text.includes("LIMITED_NUMBER")) status = "RATE LIMIT exceeded";
    else status = "NEEDS REVIEW";
    console.log(`\n[${c.name}] HTTP ${res.status} -> ${status}`);
    console.log(`   ${preview(text)}`);
  } catch (e) {
    console.log(`\n[${c.name}] REQUEST FAILED: ${e.message}`);
  }
}
