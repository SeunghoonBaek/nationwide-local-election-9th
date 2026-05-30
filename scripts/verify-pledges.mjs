import fs from "node:fs";

function loadKey() {
  if (process.env.NEC_SERVICE_KEY) return process.env.NEC_SERVICE_KEY.trim();
  const env = fs.readFileSync(".env.local", "utf8");
  const m = env.match(/^NEC_SERVICE_KEY=(.*)$/m);
  return m?.[1]?.trim() ?? "";
}

const KEY = loadKey();
if (!KEY) {
  console.error("NEC_SERVICE_KEY missing");
  process.exit(1);
}

const BASE = "https://apis.data.go.kr/9760000";
const SG_ID = "20260603";

async function fetchJson(path, params) {
  const entries = Object.entries({
    serviceKey: KEY,
    resultType: "json",
    numOfRows: "100",
    pageNo: "1",
    sgId: SG_ID,
    ...params,
  }).filter(([, v]) => v != null && v !== "");
  const qs = new URLSearchParams(entries);
  const url = `${BASE}/${path}?${qs}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const json = await res.json();
  return { http: res.status, json };
}

function items(json) {
  const raw = json?.response?.body?.items?.item;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function header(json) {
  return json?.response?.header ?? {};
}

async function getCandidates(sgTypecode, sdName, sggName) {
  const { http, json } = await fetchJson(
    "PofelcddInfoInqireService/getPofelcddRegistSttusInfoInqire",
    { sgTypecode, sdName, sggName }
  );
  const h = header(json);
  return { http, code: h.resultCode, msg: h.resultMsg, list: items(json) };
}

async function getPledgesRaw(sgTypecode, cnddtId) {
  const { http, json } = await fetchJson(
    "ElecPrmsInfoInqireService/getCnddtElecPrmsInfoInqire",
    { sgTypecode, cnddtId }
  );
  const h = header(json);
  const list = items(json);
  const titles = [];
  for (const it of list) {
    const cnt = Number(it.prmsCnt) || 0;
    for (let i = 1; i <= Math.max(cnt, 30); i++) {
      const t = it[`prmsTitle${i}`];
      if (t) titles.push(String(t));
    }
  }
  return { http, code: h.resultCode, msg: h.resultMsg, prmsCnt: list[0]?.prmsCnt, titles, raw: list[0] };
}

async function checkDistrict(label, sgTypecode, sdName, sggName) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(label);
  console.log(`sgType=${sgTypecode} sdName=${sdName} sggName=${sggName}`);
  console.log("=".repeat(60));

  const cand = await getCandidates(sgTypecode, sdName, sggName);
  console.log(`후보 API: HTTP ${cand.http} / ${cand.code} ${cand.msg ?? ""}`);
  console.log(`후보 ${cand.list.length}명\n`);

  if (cand.list.length === 0) return;

  let withPledge = 0;
  let withoutPledge = 0;

  for (const c of cand.list) {
    const id = c.huboid || c.cnddtId;
    const p = await getPledgesRaw(sgTypecode, id);
    const status =
      p.code === "INFO-00" && p.titles.length > 0
        ? `공약 ${p.titles.length}건 (prmsCnt=${p.prmsCnt})`
        : p.code === "INFO-03" || p.code === "INFO-200"
          ? "공약 없음 (INFO-03/200)"
          : `${p.code} ${p.msg}`;

    if (p.titles.length > 0) withPledge++;
    else withoutPledge++;

    console.log(
      `  ${c.giho}${c.gihoSangse ? "-" + c.gihoSangse : ""} | ${c.name} | ${c.jdName} | id=${id}`
    );
    console.log(`    -> ${status}`);
    if (p.titles.length > 0) {
      for (const t of p.titles.slice(0, 3)) {
        console.log(`       · ${t.slice(0, 70)}${t.length > 70 ? "…" : ""}`);
      }
      if (p.titles.length > 3) console.log(`       … 외 ${p.titles.length - 3}건`);
    }
  }

  console.log(`\n요약: 공약 있음 ${withPledge}명 / 없음 ${withoutPledge}명`);
}

// 스크린샷과 동일: 경기도 · 구·시·군의원 · 수원시권선구 · 수원시마선거구
await checkDistrict(
  "[1] 구·시·군의원 — 수원시마선거구 (스크린샷 선거구)",
  "6",
  "경기도",
  "수원시마선거구"
);

// 비교: 같은 권선구 다른 선거구
await checkDistrict(
  "[2] 구·시·군의원 — 수원시가선거구 (같은 권선구, 다른 선거구)",
  "6",
  "경기도",
  "수원시가선거구"
);

// 비교: 공약이 있는 것으로 확인된 선거
await checkDistrict(
  "[3] 시·도지사 — 서울특별시 (공약 있음 확인용)",
  "3",
  "서울특별시",
  "서울특별시"
);

await checkDistrict(
  "[4] 구·시·군의 장 — 수원시 (공약 있음 확인용)",
  "4",
  undefined,
  "수원시"
);
