/**
 * Lightweight tag inference from NEC candidate fields.
 * Used as a fallback when curated controversy data has no row.
 */
export function inferCandidateTags(
  job?: string,
  career1?: string,
  career2?: string
): string[] {
  const tags = new Set<string>();
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
