"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import {
  SG_DATE,
  SELECTABLE_SG_TYPES,
  SG_TYPES,
  TYPES_SIDO_WIDE,
  type SgTypeCode,
} from "@/lib/constants";
import type { CandidateView } from "./api/candidates/route";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) {
    const err = new Error(json.error ?? `요청 실패 (${res.status})`);
    Object.assign(err, { hasKey: json.hasKey });
    throw err;
  }
  return json as T;
}

export default function Home() {
  const [sidoList, setSidoList] = useState<string[]>([]);
  const [gusigunList, setGusigunList] = useState<string[]>([]);
  const [sggList, setSggList] = useState<string[]>([]);

  const [sido, setSido] = useState("");
  const [sgType, setSgType] = useState<SgTypeCode | "">("");
  const [gusigun, setGusigun] = useState("");
  const [sgg, setSgg] = useState("");

  const [candidates, setCandidates] = useState<CandidateView[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);
  const [keyMissing, setKeyMissing] = useState(false);

  const sidoWide = sgType !== "" && TYPES_SIDO_WIDE.includes(sgType);

  const handleError = useCallback((e: unknown) => {
    const err = e as Error & { hasKey?: boolean };
    if (err.hasKey === false) setKeyMissing(true);
    setTopError(err.message);
  }, []);

  // Load province (sido) list
  useEffect(() => {
    fetchJson<{ sido: string[] }>("/api/sido")
      .then((d) => setSidoList(d.sido))
      .catch(handleError);
  }, [handleError]);

  // Load districts (gu/si/gun) when province or election type changes
  useEffect(() => {
    setGusigun("");
    setGusigunList([]);
    if (!sido || !sgType || sidoWide) return;
    const q = new URLSearchParams({ sgType, sido }).toString();
    fetchJson<{ gusigun: string[] }>(`/api/gusigun?${q}`)
      .then((d) => setGusigunList(d.gusigun))
      .catch(handleError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sido, sgType, sidoWide]);

  // Load electoral districts when election type / province / district changes
  useEffect(() => {
    setSgg("");
    setSggList([]);
    if (!sido || !sgType) return;
    if (sidoWide) {
      setSggList([sido]);
      setSgg(sido);
      return;
    }
    if (!gusigun) return;
    const q = new URLSearchParams({ sgType, sido, gusigun }).toString();
    fetchJson<{ sgg: string[] }>(`/api/sgg?${q}`)
      .then((d) => setSggList(d.sgg))
      .catch(handleError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sgType, sido, gusigun, sidoWide]);

  const search = useCallback(async () => {
    if (!sgType || !sido || !sgg) return;
    setLoading(true);
    setTopError(null);
    setCandidates(null);
    try {
      const q = new URLSearchParams({ sgType, sido, sgg }).toString();
      const data = await fetchJson<{ candidates: CandidateView[] }>(
        `/api/candidates?${q}`
      );
      setCandidates(data.candidates);
    } catch (e) {
      handleError(e);
    } finally {
      setLoading(false);
    }
  }, [sgType, sido, sgg, handleError]);

  const canSearch = Boolean(sgType && sido && sgg);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-8">
        <p className="text-sm font-medium text-blue-600">{SG_DATE} 투표</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          제9회 전국동시지방선거 후보자·공약 비교
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          거주 지역과 선거를 선택하면 후보자의 소속·공약·특징·논란 정보를 표로
          확인할 수 있습니다.
        </p>
      </header>

      {keyMissing && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">선관위 API 인증키가 설정되지 않았습니다.</p>
          <p className="mt-1">
            공공데이터포털에서 인증키를 발급받아 프로젝트 루트의{" "}
            <code className="rounded bg-amber-100 px-1">.env.local</code> 파일에{" "}
            <code className="rounded bg-amber-100 px-1">NEC_SERVICE_KEY=발급키</code>{" "}
            형태로 추가한 뒤 서버를 재시작하세요. 발급 방법은 README를 참고하세요.
          </p>
        </div>
      )}

      {/* 선택 영역 */}
      <section className="grid grid-cols-1 gap-4 rounded-xl border border-neutral-200 bg-white/60 p-5 sm:grid-cols-2 lg:grid-cols-4 dark:border-neutral-800 dark:bg-neutral-900/40">
        <Field label="시·도">
          <Select
            value={sido}
            onChange={setSido}
            placeholder={sidoList.length ? "시·도 선택" : "불러오는 중…"}
            options={sidoList}
            disabled={!sidoList.length}
          />
        </Field>

        <Field label="선거 종류">
          <Select
            value={sgType}
            onChange={(v) => setSgType(v as SgTypeCode)}
            placeholder="선거 선택"
            options={SELECTABLE_SG_TYPES.map((c) => ({
              value: c,
              label: SG_TYPES[c],
            }))}
            disabled={!sido}
          />
        </Field>

        <Field label="구·시·군">
          <Select
            value={gusigun}
            onChange={setGusigun}
            placeholder={sidoWide ? "해당 없음" : "구·시·군 선택"}
            options={gusigunList}
            disabled={sidoWide || !sgType || !gusigunList.length}
          />
        </Field>

        <Field label="선거구">
          <Select
            value={sgg}
            onChange={setSgg}
            placeholder={sggList.length ? "선거구 선택" : "—"}
            options={sggList}
            disabled={sidoWide || !sggList.length}
          />
        </Field>

        <div className="sm:col-span-2 lg:col-span-4">
          <button
            onClick={search}
            disabled={!canSearch || loading}
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "조회 중…" : "후보자 조회"}
          </button>
        </div>
      </section>

      {topError && !keyMissing && (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          오류: {topError}
        </p>
      )}

      {/* 결과 */}
      {candidates && (
        <section className="mt-8">
          {candidates.length === 0 ? (
            <p className="rounded-lg border border-neutral-200 bg-neutral-50 p-6 text-center text-sm text-neutral-500">
              해당 선거구의 후보자 정보가 아직 없습니다. (후보자 등록 이후 제공)
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm text-neutral-500">
                <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                  {sido} {sgg}
                </span>{" "}
                · {sgType && SG_TYPES[sgType]} · 후보자 {candidates.length}명
              </p>
              <CandidateTable candidates={candidates} />
            </>
          )}
        </section>
      )}

      <Footer />
    </div>
  );
}

function CandidateTable({ candidates }: { candidates: CandidateView[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
      <table className="min-w-full divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
        <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
          <tr>
            <Th className="w-12">기호</Th>
            <Th>후보자</Th>
            <Th>소속(정당)</Th>
            <Th className="min-w-[220px]">특징 (경력·직업·학력)</Th>
            <Th className="min-w-[280px]">주요 공약</Th>
            <Th className="min-w-[220px]">논란·이슈</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
          {candidates.map((c) => (
            <tr key={c.cnddtId || c.name} className="align-top">
              <Td>
                <span className="text-lg font-bold">{c.giho}</span>
                {c.gihoSangse && (
                  <span className="ml-1 text-neutral-400">{c.gihoSangse}</span>
                )}
              </Td>
              <Td>
                <div className="flex items-start gap-3">
                  <CandidatePhoto candidate={c} />
                  <div>
                    <div className="font-semibold">{c.name}</div>
                    <div className="mt-0.5 text-xs text-neutral-500">
                      {[c.gender, c.age && `${c.age}세`].filter(Boolean).join(" · ")}
                    </div>
                    {c.status && c.status !== "등록" && (
                      <span className="mt-1 inline-block rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                        {c.status}
                      </span>
                    )}
                  </div>
                </div>
              </Td>
              <Td>
                <span className="inline-block rounded-md bg-blue-50 px-2 py-1 font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                  {c.party || "무소속"}
                </span>
              </Td>
              <Td>
                <ul className="space-y-1 text-neutral-700 dark:text-neutral-300">
                  {c.job && <li>· 직업: {c.job}</li>}
                  {c.edu && <li>· 학력: {c.edu}</li>}
                  {c.career1 && <li>· {c.career1}</li>}
                  {c.career2 && <li>· {c.career2}</li>}
                  {c.tags.length > 0 && (
                    <li className="flex flex-wrap gap-1 pt-1">
                      {c.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                        >
                          {t}
                        </span>
                      ))}
                    </li>
                  )}
                </ul>
              </Td>
              <Td>
                {c.pledges.length === 0 ? (
                  <span className="text-neutral-400">등록된 공약 없음</span>
                ) : (
                  <ol className="space-y-1.5">
                    {c.pledges.slice(0, 10).map((p, i) => (
                      <li key={i}>
                        {p.realm && (
                          <span className="mr-1 rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                            {p.realm}
                          </span>
                        )}
                        <span className="font-medium">{p.title}</span>
                        {p.content && (
                          <p className="mt-0.5 text-xs text-neutral-500">
                            {p.content}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </Td>
              <Td>
                {c.controversies.length === 0 ? (
                  <span className="text-neutral-400">등록된 항목 없음</span>
                ) : (
                  <ul className="space-y-2">
                    {c.controversies.map((ct, i) => (
                      <li key={i}>
                        <p className="text-neutral-700 dark:text-neutral-300">
                          {ct.summary}
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-400">
                          {ct.date}
                          {ct.source && (
                            <>
                              {" · "}
                              <a
                                href={ct.source}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 underline"
                              >
                                {ct.sourceName ?? "출처"}
                              </a>
                            </>
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CandidatePhoto({ candidate }: { candidate: CandidateView }) {
  const [failed, setFailed] = useState(false);
  const photoUrl = candidate.photoUrl;
  const showPhoto = Boolean(photoUrl) && !failed;

  return (
    <div className="relative h-[72px] w-[54px] shrink-0 overflow-hidden rounded-md border border-neutral-200 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800">
      {showPhoto && photoUrl ? (
        <Image
          src={photoUrl}
          alt={`${candidate.name} 사진`}
          width={54}
          height={72}
          className="h-full w-full object-cover object-top"
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center text-lg font-semibold text-neutral-400"
          aria-hidden
        >
          {candidate.name.slice(0, 1)}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

type Option = string | { value: string; label: string };

function Select({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:disabled:bg-neutral-800"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => {
        const v = typeof o === "string" ? o : o.value;
        const l = typeof o === "string" ? o : o.label;
        return (
          <option key={v} value={v}>
            {l}
          </option>
        );
      })}
    </select>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 font-semibold ${className}`}>{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3">{children}</td>;
}

function Footer() {
  return (
    <footer className="mt-12 border-t border-neutral-200 pt-6 text-xs leading-relaxed text-neutral-500 dark:border-neutral-800">
      <p>
        <strong>데이터 출처</strong> · 후보자·공약 정보: 중앙선거관리위원회
        공공데이터포털(data.go.kr) Open API. 공약은 후보자가 직접 등록한
        내용입니다.
      </p>
      <p className="mt-1">
        <strong>안내</strong> · &lsquo;논란·이슈&rsquo; 항목은 공식 API에 포함되지
        않는 정보로, 출처가 확인된 사실만 중립적으로 수동 정리한 것입니다. 특정
        후보에 대한 지지·반대를 의도하지 않습니다. 최종 확인은 선거공보 및
        중앙선관위 정책·공약마당(policy.nec.go.kr)을 함께 참고하세요.
      </p>
    </footer>
  );
}
