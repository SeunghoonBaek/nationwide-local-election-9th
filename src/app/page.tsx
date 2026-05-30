"use client";

import Image from "next/image";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  SG_DATE,
  SELECTABLE_SG_TYPES,
  SG_TYPES,
  TYPES_SIDO_WIDE,
  type SgTypeCode,
} from "@/lib/constants";
import { matchGusigunToElectionList } from "@/lib/gusigun-names";
import {
  pickPersistedFields,
  readHomeState,
  writeHomeState,
  type HomePersistedSearch,
} from "@/lib/home-state-storage";
import { ThemeToggle } from "@/components/theme-toggle";
import { BulletinViewerModal } from "@/components/bulletin-viewer";
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
  const [loadingSido, setLoadingSido] = useState(true);
  const [loadingGusigun, setLoadingGusigun] = useState(false);
  const [loadingSgg, setLoadingSgg] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);
  const [keyMissing, setKeyMissing] = useState(false);

  const [addressInput, setAddressInput] = useState("");
  const [locating, setLocating] = useState(false);
  const [locationHint, setLocationHint] = useState<string | null>(null);
  const [locationGusigun, setLocationGusigun] = useState("");

  const [lastSearch, setLastSearch] = useState<HomePersistedSearch | null>(null);
  const [scrollY, setScrollY] = useState(0);
  const [storageReady, setStorageReady] = useState(false);

  const persistReady = useRef(false);
  const restoreSearchDone = useRef(false);
  const scrollRestored = useRef(false);

  const sidoWide = sgType !== "" && TYPES_SIDO_WIDE.includes(sgType);

  const handleError = useCallback((e: unknown) => {
    const err = e as Error & { hasKey?: boolean };
    if (err.hasKey === false) setKeyMissing(true);
    setTopError(err.message);
  }, []);

  useLayoutEffect(() => {
    const saved = readHomeState();
    if (saved) {
      setSido(saved.sido);
      setSgType(saved.sgType);
      setGusigun(saved.gusigun);
      setSgg(saved.sgg);
      setAddressInput(saved.addressInput);
      setLocationHint(saved.locationHint);
      setLocationGusigun(saved.locationGusigun);
      setLastSearch(saved.lastSearch);
      setScrollY(saved.scrollY);
    }
    setStorageReady(true);
    persistReady.current = true;
  }, []);

  useEffect(() => {
    if (!persistReady.current) return;
    writeHomeState(
      pickPersistedFields({
        sido,
        sgType,
        gusigun,
        sgg,
        addressInput,
        locationHint,
        locationGusigun,
        lastSearch,
        scrollY,
      })
    );
  }, [
    sido,
    sgType,
    gusigun,
    sgg,
    addressInput,
    locationHint,
    locationGusigun,
    lastSearch,
    scrollY,
  ]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setScrollY(window.scrollY), 150);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      const saved = readHomeState();
      if (!saved) return;
      setSido(saved.sido);
      setSgType(saved.sgType);
      setGusigun(saved.gusigun);
      setSgg(saved.sgg);
      setAddressInput(saved.addressInput);
      setLocationHint(saved.locationHint);
      setLocationGusigun(saved.locationGusigun);
      setLastSearch(saved.lastSearch);
      setScrollY(saved.scrollY);
      setCandidates(null);
      scrollRestored.current = false;
      restoreSearchDone.current = false;
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  // Load province (sido) list
  useEffect(() => {
    setLoadingSido(true);
    fetchJson<{ sido: string[] }>("/api/sido")
      .then((d) => setSidoList(d.sido))
      .catch(handleError)
      .finally(() => setLoadingSido(false));
  }, [handleError]);

  // Load districts (gu/si/gun) when province or election type changes
  useEffect(() => {
    if (!storageReady) return;
    setGusigunList([]);
    if (!sido || !sgType || sidoWide) {
      setLoadingGusigun(false);
      if (!locationGusigun) setGusigun("");
      return;
    }
    setLoadingGusigun(true);
    const q = new URLSearchParams({ sgType, sido }).toString();
    fetchJson<{ gusigun: string[] }>(`/api/gusigun?${q}`)
      .then((d) => {
        setGusigunList(d.gusigun);
        setGusigun((current) => {
          if (locationGusigun) {
            return matchGusigunToElectionList(locationGusigun, d.gusigun) ?? "";
          }
          if (current && d.gusigun.includes(current)) return current;
          return "";
        });
      })
      .catch(handleError)
      .finally(() => setLoadingGusigun(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageReady, sido, sgType, sidoWide, locationGusigun]);

  // Load electoral districts when election type / province / district changes
  useEffect(() => {
    if (!storageReady) return;
    if (!sido || !sgType) {
      setLoadingSgg(false);
      setSggList([]);
      return;
    }
    if (sidoWide) {
      setLoadingSgg(false);
      setSggList([sido]);
      setSgg(sido);
      return;
    }
    if (!gusigun) {
      setLoadingSgg(false);
      setSggList([]);
      return;
    }
    setLoadingSgg(true);
    const q = new URLSearchParams({ sgType, sido, gusigun }).toString();
    fetchJson<{ sgg: string[] }>(`/api/sgg?${q}`)
      .then((d) => {
        setSggList(d.sgg);
        setSgg((current) => {
          if (current && d.sgg.includes(current)) return current;
          return "";
        });
      })
      .catch(handleError)
      .finally(() => setLoadingSgg(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageReady, sgType, sido, gusigun, sidoWide]);

  const search = useCallback(
    async (override?: { sgType: SgTypeCode; sido: string; sgg: string }) => {
      const type = override?.sgType ?? sgType;
      const sd = override?.sido ?? sido;
      const district = override?.sgg ?? sgg;
      if (!type || !sd || !district) return;
      setLoading(true);
      setTopError(null);
      setCandidates(null);
      try {
        const q = new URLSearchParams({
          sgType: type,
          sido: sd,
          sgg: district,
        }).toString();
        const data = await fetchJson<{ candidates: CandidateView[] }>(
          `/api/candidates?${q}`
        );
        if (override) {
          setSgType(type);
          setSido(sd);
          setSgg(district);
        }
        setCandidates(data.candidates);
        setLastSearch({ sgType: type, sido: sd, sgg: district });
      } catch (e) {
        handleError(e);
      } finally {
        setLoading(false);
      }
    },
    [sgType, sido, sgg, handleError]
  );

  useEffect(() => {
    if (
      !storageReady ||
      restoreSearchDone.current ||
      !lastSearch ||
      candidates !== null ||
      loadingSido ||
      loadingGusigun ||
      loadingSgg
    ) {
      return;
    }
    if (
      lastSearch.sgType !== sgType ||
      lastSearch.sido !== sido ||
      lastSearch.sgg !== sgg
    ) {
      return;
    }
    restoreSearchDone.current = true;
    void search(lastSearch);
  }, [
    storageReady,
    lastSearch,
    candidates,
    search,
    sgType,
    sido,
    sgg,
    loadingSido,
    loadingGusigun,
    loadingSgg,
  ]);

  useEffect(() => {
    if (!candidates?.length || scrollRestored.current || scrollY <= 0) return;
    scrollRestored.current = true;
    requestAnimationFrame(() => window.scrollTo(0, scrollY));
  }, [candidates, scrollY]);

  const applyLocationFromLookup = useCallback(
    (resolved: { sido: string; gusigun?: string; label?: string }) => {
      setSido(resolved.sido);
      setLocationGusigun(resolved.gusigun ?? "");
      const regionLabel = resolved.gusigun
        ? `${resolved.sido} · ${resolved.gusigun}`
        : resolved.sido;
      setLocationHint(
        resolved.label
          ? `${regionLabel} (「${resolved.label.length > 36 ? `${resolved.label.slice(0, 36)}…` : resolved.label}」)`
          : regionLabel
      );
      if (sgType && TYPES_SIDO_WIDE.includes(sgType)) {
        setSgg(resolved.sido);
      }
    },
    [sgType]
  );

  const resolveByAddress = useCallback(async () => {
    const q = addressInput.trim();
    if (q.length < 2) {
      setTopError("주소를 2글자 이상 입력해 주세요.");
      return;
    }
    setLocating(true);
    setTopError(null);
    try {
      const data = await fetchJson<{
        sido: string;
        gusigun?: string;
        label?: string;
      }>(`/api/location?${new URLSearchParams({ address: q })}`);
      applyLocationFromLookup(data);
    } catch (e) {
      handleError(e);
    } finally {
      setLocating(false);
    }
  }, [addressInput, applyLocationFromLookup, handleError]);

  const resolveByGps = useCallback(() => {
    if (!navigator.geolocation) {
      setTopError("이 브라우저에서는 위치 정보를 사용할 수 없습니다.");
      return;
    }
    setLocating(true);
    setTopError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude: lat, longitude: lng } = pos.coords;
          const data = await fetchJson<{
            sido: string;
            gusigun?: string;
            label?: string;
          }>(
            `/api/location?${new URLSearchParams({
              lat: String(lat),
              lng: String(lng),
            })}`
          );
          applyLocationFromLookup(data);
        } catch (e) {
          handleError(e);
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        const msg =
          err.code === 1
            ? "위치 권한이 거부되었습니다. 주소로 시·도를 찾아 주세요."
            : "현재 위치를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.";
        setTopError(msg);
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }
    );
  }, [applyLocationFromLookup, handleError]);

  const searchSidoWide = useCallback(
    (type: "3" | "11") => {
      if (!sido) {
        setTopError("먼저 주소 또는 현재 위치로 시·도를 찾아 주세요.");
        return;
      }
      void search({ sgType: type, sido, sgg: sido });
    },
    [sido, search]
  );

  const canSearch = Boolean(sgType && sido && sgg);

  return (
    <main className="flex min-h-full flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-[1920px] flex-1 flex-col px-3 py-4 sm:px-5 sm:py-6 lg:px-8 lg:py-8 xl:px-10">
      <header className="mb-6 shrink-0 lg:mb-8">
        <div className="flex items-start justify-between gap-3 sm:gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-blue-600 sm:text-sm">
              {SG_DATE} 투표
            </p>
            <h1 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">
              제9회 전국동시지방선거 후보자·공약 비교
            </h1>
            <p className="mt-2 text-xs text-neutral-500 sm:text-sm">
              거주 지역과 선거를 선택하면 후보자의 소속·공약·특징·논란 정보를 표로
              확인할 수 있습니다.
            </p>
          </div>
          <ThemeToggle />
        </div>
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

      {/* 주소 / GPS → 시·도·구·시·군 */}
      <section className="mb-4 shrink-0 rounded-xl border border-blue-200 bg-blue-50/50 p-4 sm:p-5 dark:border-blue-900/50 dark:bg-blue-950/20">
        <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
          내 지역 찾기
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          주소 또는 현재 위치로 시·도·구·시·군을 자동 설정합니다. 시·도지사·교육감은
          아래 버튼으로 바로 조회할 수 있고, 다른 선거는 선거 종류·선거구를 고른 뒤
          조회하세요.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <input
            type="text"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void resolveByAddress();
            }}
            placeholder="예: 경기도 수원시 영통구 …"
            disabled={locating}
            className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => void resolveByAddress()}
              disabled={locating}
              className="rounded-lg border border-blue-600 bg-white px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-50 disabled:opacity-40 dark:bg-neutral-900 dark:hover:bg-blue-950"
            >
              {locating ? "찾는 중…" : "주소로 찾기"}
            </button>
            <button
              type="button"
              onClick={resolveByGps}
              disabled={locating}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-40"
            >
              현재 위치
            </button>
          </div>
        </div>
        {locationHint && (
          <p className="mt-2 text-xs text-blue-800 dark:text-blue-300">
            설정된 지역: <span className="font-semibold">{locationHint}</span>
            {locationGusigun && !sgType && (
              <span className="text-neutral-500">
                {" "}
                · 선거 종류를 선택하면 구·시·군 드롭다운에 반영됩니다.
              </span>
            )}
            {locationGusigun && sgType && sidoWide && (
              <span className="text-neutral-500">
                {" "}
                · 교육감·시·도지사는 시·도만 사용합니다. 구·시·군은 다른
                선거 종류 선택 시 자동 적용됩니다.
              </span>
            )}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => searchSidoWide("3")}
            disabled={!sido || loading || locating}
            className="rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-900 disabled:opacity-40 dark:bg-neutral-200 dark:text-neutral-900 dark:hover:bg-white"
          >
            시·도지사 후보 조회
          </button>
          <button
            type="button"
            onClick={() => searchSidoWide("11")}
            disabled={!sido || loading || locating}
            className="rounded-lg border border-neutral-400 bg-white px-4 py-2 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
          >
            교육감 후보 조회
          </button>
        </div>
      </section>

      {/* 선택 영역 */}
      <section className="grid shrink-0 grid-cols-1 gap-3 rounded-xl border border-neutral-200 bg-white/60 p-4 sm:grid-cols-2 sm:gap-4 sm:p-5 lg:grid-cols-4 dark:border-neutral-800 dark:bg-neutral-900/40">
        <Field label="시·도">
          <Select
            value={sido}
            onChange={(v) => {
              setLocationGusigun("");
              setLocationHint(null);
              setSido(v);
            }}
            placeholder={
              loadingSido ? "데이터를 읽고 있습니다" : "시·도 선택"
            }
            options={sidoList}
            disabled={loadingSido}
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

        <Field
          label="구·시·군"
          hint={
            sidoWide && locationGusigun
              ? "시·도지사·교육감 선거에는 구·시·군 선택이 필요 없습니다."
              : !sidoWide &&
                  sgType &&
                  locationGusigun &&
                  gusigunList.length > 0 &&
                  !gusigun
                ? "인식한 구·시·군을 이 선거 종류 목록에서 찾지 못했습니다. 직접 선택해 주세요."
                : undefined
          }
        >
          {sidoWide ? (
            <ReadonlyValue
              value={
                locationGusigun ||
                "해당 없음 (시·도지사·교육감은 시·도 단위)"
              }
              muted={!locationGusigun}
            />
          ) : (
            <Select
              value={gusigun}
              onChange={setGusigun}
              placeholder={
                loadingGusigun ? "데이터를 읽고 있습니다" : "구·시·군 선택"
              }
              options={gusigunList}
              disabled={!sgType || loadingGusigun || !gusigunList.length}
            />
          )}
        </Field>

        <Field label="선거구">
          <Select
            value={sgg}
            onChange={setSgg}
            placeholder={
              loadingSgg
                ? "데이터를 읽고 있습니다"
                : sggList.length
                  ? "선거구 선택"
                  : gusigun
                    ? "선거구 없음"
                    : "구·시·군을 먼저 선택"
            }
            options={sggList}
            disabled={sidoWide || loadingSgg || !sggList.length}
          />
        </Field>

        <div className="sm:col-span-2 lg:col-span-4">
          <button
            onClick={() => void search()}
            disabled={!canSearch || loading}
            className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
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
        <section className="mt-6 min-w-0 flex-1 lg:mt-8">
          {candidates.length === 0 ? (
            <p className="rounded-lg border border-neutral-200 bg-neutral-50 p-6 text-center text-sm text-neutral-500">
              해당 선거구의 후보자 정보가 아직 없습니다. (후보자 등록 이후 제공)
            </p>
          ) : (
            <>
              <p className="mb-3 text-xs text-neutral-500 sm:text-sm">
                <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                  {sido} {sgg}
                </span>{" "}
                · {sgType && SG_TYPES[sgType]} · 후보자 {candidates.length}명
              </p>
              <div className="lg:hidden">
                <CandidateCards candidates={candidates} />
              </div>
              <div className="hidden lg:block">
                <CandidateTable candidates={candidates} />
              </div>
            </>
          )}
        </section>
      )}

      <Footer />
      </div>
    </main>
  );
}

function CandidateTable({ candidates }: { candidates: CandidateView[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
      <table className="w-full table-fixed divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
        <colgroup>
          <col className="w-[4%]" />
          <col className="w-[14%]" />
          <col className="w-[10%]" />
          <col className="w-[22%]" />
          <col className="w-[28%]" />
          <col className="w-[22%]" />
        </colgroup>
        <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
          <tr>
            <Th>기호</Th>
            <Th>후보자</Th>
            <Th>소속(정당)</Th>
            <Th>특징 (경력·직업·학력)</Th>
            <Th>주요 공약</Th>
            <Th>논란·이슈</Th>
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
                <CandidateIdentity candidate={c} compact />
              </Td>
              <Td>
                <PartyBadge party={c.party} />
              </Td>
              <Td>
                <CandidateTraits candidate={c} />
              </Td>
              <Td>
                <CandidatePledges candidate={c} />
              </Td>
              <Td>
                <CandidateControversies candidate={c} />
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CandidateCards({ candidates }: { candidates: CandidateView[] }) {
  return (
    <ul className="space-y-4">
      {candidates.map((c) => (
        <li
          key={c.cnddtId || c.name}
          className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900/40"
        >
          <div className="flex items-start gap-3">
            <div className="flex shrink-0 flex-col items-center gap-1">
              <span className="text-xl font-bold leading-none">{c.giho}</span>
              {c.gihoSangse && (
                <span className="text-xs text-neutral-400">{c.gihoSangse}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <CandidateIdentity candidate={c} />
              <div className="mt-2">
                <PartyBadge party={c.party} />
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-4 border-t border-neutral-100 pt-4 dark:border-neutral-800">
            <CardSection title="특징">
              <CandidateTraits candidate={c} />
            </CardSection>
            <CardSection title="주요 공약">
              <CandidatePledges candidate={c} />
            </CardSection>
            {c.controversies.length > 0 && (
              <CardSection title="논란·이슈">
                <CandidateControversies candidate={c} />
              </CardSection>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function CardSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </h3>
      {children}
    </div>
  );
}

function CandidateIdentity({
  candidate,
  compact = false,
}: {
  candidate: CandidateView;
  compact?: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 ${compact ? "min-w-0" : ""}`}>
      <CandidatePhoto candidate={candidate} compact={compact} />
      <div className="min-w-0">
        <div className="font-semibold">{candidate.name}</div>
        <div className="mt-0.5 text-xs text-neutral-500">
          {[candidate.gender, candidate.age && `${candidate.age}세`]
            .filter(Boolean)
            .join(" · ")}
        </div>
        {candidate.status && candidate.status !== "등록" && (
          <span className="mt-1 inline-block rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
            {candidate.status}
          </span>
        )}
      </div>
    </div>
  );
}

function PartyBadge({ party }: { party: string }) {
  return (
    <span className="inline-block max-w-full break-words rounded-md bg-blue-50 px-2 py-1 text-sm font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
      {party || "무소속"}
    </span>
  );
}

function CandidateTraits({ candidate }: { candidate: CandidateView }) {
  const hasContent =
    candidate.job ||
    candidate.edu ||
    candidate.career1 ||
    candidate.career2 ||
    candidate.tags.length > 0;

  if (!hasContent) {
    return <span className="text-neutral-400">등록된 정보 없음</span>;
  }

  return (
    <ul className="space-y-1 break-words text-neutral-700 dark:text-neutral-300">
      {candidate.job && <li>· 직업: {candidate.job}</li>}
      {candidate.edu && <li>· 학력: {candidate.edu}</li>}
      {candidate.career1 && <li>· {candidate.career1}</li>}
      {candidate.career2 && <li>· {candidate.career2}</li>}
      {candidate.tags.length > 0 && (
        <li className="flex flex-wrap gap-1 pt-1">
          {candidate.tags.map((t) => (
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
  );
}

function PolicyPosterLink({
  policy,
  candidateName,
}: {
  policy: NonNullable<CandidateView["pledgePolicy"]>;
  candidateName?: string;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const canPreview = Boolean(policy.bulletinPath);
  const title = candidateName
    ? `${candidateName} 선거공보`
    : "선거공보";

  return (
    <>
      <p className="mt-2 text-xs leading-relaxed text-neutral-400">
        {canPreview ? (
          <>
            <button
              type="button"
              onClick={() => setViewerOpen(true)}
              className="text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              공약 포스터(선거공보) 보기
            </button>
            {" · "}
            <a
              href={policy.pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-neutral-300 underline-offset-2 hover:text-neutral-600 dark:hover:text-neutral-300"
            >
              공약마당
            </a>
          </>
        ) : (
          <a
            href={policy.pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          >
            공약마당에서 포스터·선거공보 확인
          </a>
        )}
      </p>
      {viewerOpen && policy.bulletinPath && (
        <BulletinViewerModal
          title={title}
          bulletinPath={policy.bulletinPath}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </>
  );
}

function CandidatePledges({ candidate }: { candidate: CandidateView }) {
  const policy = candidate.pledgePolicy;
  const src = candidate.pledgeSource;

  if (candidate.pledges.length === 0) {
    return (
      <div className="text-neutral-400">
        <span>등록된 공약 없음</span>
        {policy && <PolicyPosterLink policy={policy} candidateName={candidate.name} />}
      </div>
    );
  }

  return (
    <div>
      <ol className="space-y-1.5 break-words">
        {candidate.pledges.slice(0, 10).map((p, i) => (
          <li key={i}>
            {p.realm && (
              <span className="mr-1 rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                {p.realm}
              </span>
            )}
            <span className="font-medium">{p.title}</span>
            {p.content && (
              <p className="mt-0.5 text-xs text-neutral-500">{p.content}</p>
            )}
          </li>
        ))}
      </ol>
      {src && (
        <p className="mt-2 text-xs text-neutral-400">
          출처:{" "}
          <a
            href={src.source}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-neutral-300 underline-offset-2 hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            {src.sourceName}
          </a>
          {src.note && <> · {src.note}</>}
        </p>
      )}
      {policy && <PolicyPosterLink policy={policy} candidateName={candidate.name} />}
    </div>
  );
}

function CandidateControversies({ candidate }: { candidate: CandidateView }) {
  if (candidate.controversies.length === 0) {
    return null;
  }

  return (
    <ul className="space-y-2 break-words">
      {candidate.controversies.map((ct, i) => (
        <li key={i}>
          <p className="text-neutral-700 dark:text-neutral-300">{ct.summary}</p>
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
  );
}

function CandidatePhoto({
  candidate,
  compact = false,
}: {
  candidate: CandidateView;
  compact?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const photoUrl = candidate.photoUrl;
  const showPhoto = Boolean(photoUrl) && !failed;

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-md border border-neutral-200 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 ${
        compact ? "h-14 w-11 sm:h-16 sm:w-12" : "h-16 w-12 sm:h-[72px] sm:w-[54px]"
      }`}
    >
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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-neutral-500">{label}</span>
      {children}
      {hint && (
        <span className="text-xs leading-relaxed text-neutral-400">{hint}</span>
      )}
    </label>
  );
}

function ReadonlyValue({
  value,
  muted = false,
}: {
  value: string;
  muted?: boolean;
}) {
  return (
    <div
      className={`w-full rounded-lg border px-3 py-2 text-sm ${
        muted
          ? "border-neutral-200 bg-neutral-50 text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900/60"
          : "border-blue-200 bg-blue-50/80 font-medium text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200"
      }`}
    >
      {value}
    </div>
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
      className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:disabled:bg-neutral-800"
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
  return (
    <th className={`px-3 py-3 font-semibold xl:px-4 ${className}`}>{children}</th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="break-words px-3 py-3 xl:px-4">{children}</td>
  );
}

function Footer() {
  return (
    <footer className="mt-8 shrink-0 border-t border-neutral-200 pt-5 text-xs leading-relaxed text-neutral-500 dark:border-neutral-800 lg:mt-12 lg:pt-6">
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
