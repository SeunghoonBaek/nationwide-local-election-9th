import data from "@/data/controversies.json";

export interface ControversyEntry {
  summary: string;
  date?: string;
  source?: string;
  sourceName?: string;
}

export interface CandidateExtra {
  tags: string[];
  controversies: ControversyEntry[];
}

interface RawItem {
  match: { sido?: string; sgg?: string; name?: string };
  tags?: string[];
  controversies?: ControversyEntry[];
}

const items = (data as { items: RawItem[] }).items ?? [];

/**
 * Find tags/controversies for a candidate from the manually curated data.
 * Matches by partial match on sido/sgg/name (only fields that are present).
 */
export function getCandidateExtra(
  sido: string,
  sgg: string,
  name: string
): CandidateExtra {
  const tags = new Set<string>();
  const controversies: ControversyEntry[] = [];

  for (const it of items) {
    const m = it.match ?? {};
    if (m.name && !name.includes(m.name) && !m.name.includes(name)) continue;
    if (m.sido && m.sido !== sido) continue;
    if (m.sgg && !sgg.includes(m.sgg) && !m.sgg.includes(sgg)) continue;
    // name match is required (prevents broad matching by region alone)
    if (!m.name) continue;

    (it.tags ?? []).forEach((t) => tags.add(t));
    (it.controversies ?? []).forEach((c) => controversies.push(c));
  }

  return { tags: [...tags], controversies };
}
