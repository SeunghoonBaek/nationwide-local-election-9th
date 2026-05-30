#!/usr/bin/env node
/**
 * Scan sgType 6 districts for candidates without NEC API pledges.
 */
import fs from "node:fs";

const SG_ID = "20260603";
const BASE = "https://apis.data.go.kr/9760000";

function loadKey() {
  if (process.env.NEC_SERVICE_KEY) return process.env.NEC_SERVICE_KEY.trim();
  const env = fs.readFileSync(".env.local", "utf8");
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

async function hasApiPledge(sgTypecode, cnddtId) {
  const u = new URL(
    `${BASE}/ElecPrmsInfoInqireService/getCnddtElecPrmsInfoInqire`
  );
  u.searchParams.set("serviceKey", KEY);
  u.searchParams.set("resultType", "json");
  u.searchParams.set("numOfRows", "10");
  u.searchParams.set("pageNo", "1");
  u.searchParams.set("sgId", SG_ID);
  u.searchParams.set("sgTypecode", sgTypecode);
  u.searchParams.set("cnddtId", cnddtId);
  const d = await (await fetch(u)).json();
  const code = d.response?.header?.resultCode;
  if (code !== "INFO-00") return false;
  const item = d.response?.body?.items?.item;
  const row = Array.isArray(item) ? item[0] : item;
  const cnt = Number(row?.prmsCnt) || 0;
  return cnt > 0;
}

const SIDO = process.argv[2] ?? "경기도";
const SG_TYPE = "6";

const sggRows = await callNec("CommonCodeService", "getCommonSggCodeList", {
  sgTypecode: SG_TYPE,
});
const sggSet = new Set();
for (const r of sggRows) {
  if (r.sdName !== SIDO) continue;
  if (r.sggName) sggSet.add(r.sggName);
}
const sggList = [...sggSet].sort();

console.log(`# ${SIDO} sgType ${SG_TYPE}: ${sggList.length} districts\n`);

let total = 0;
let noPledge = 0;
const missing = [];

for (const sgg of sggList) {
  const cands = await callNec(
    "PofelcddInfoInqireService",
    "getPofelcddRegistSttusInfoInqire",
    { sgTypecode: SG_TYPE, sdName: SIDO, sggName: sgg }
  );
  if (cands.length === 0) continue;

  for (const c of cands) {
    total++;
    const id = c.huboid || c.cnddtId;
    const ok = await hasApiPledge(SG_TYPE, id);
    if (!ok) {
      noPledge++;
      missing.push({
        sgg,
        name: c.name,
        party: c.jdName,
        giho: `${c.giho}${c.gihoSangse ? "-" + c.gihoSangse : ""}`,
        id,
      });
    }
    await sleep(120);
  }
}

console.log(`Total candidates: ${total}, API pledge missing: ${noPledge}\n`);
for (const m of missing) {
  console.log(`${m.sgg}\t${m.giho}\t${m.name}\t${m.party}`);
}
