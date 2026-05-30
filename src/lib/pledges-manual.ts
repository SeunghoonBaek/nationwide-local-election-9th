import data from "@/data/pledges-manual.json";
import type { Pledge } from "@/lib/nec";

export interface PledgeSource {
  source: string;
  sourceName: string;
  note?: string;
}

interface RawItem {
  match: { sido?: string; sgg?: string; name?: string };
  source: string;
  sourceName: string;
  note?: string;
  pledges: Pledge[];
}

const items = (data as { items: RawItem[] }).items ?? [];

/**
 * Manual pledge fallback when the NEC Open API returns no data.
 * Matches by partial match on sido/sgg/name (same rules as controversies).
 */
export function getManualPledges(
  sido: string,
  sgg: string,
  name: string
): { pledges: Pledge[]; pledgeSource: PledgeSource } | null {
  for (const it of items) {
    const m = it.match ?? {};
    if (m.name && !name.includes(m.name) && !m.name.includes(name)) continue;
    if (m.sido && m.sido !== sido) continue;
    if (m.sgg && !sgg.includes(m.sgg) && !m.sgg.includes(sgg)) continue;
    if (!m.name) continue;
    if (!it.pledges?.length) continue;

    return {
      pledges: it.pledges,
      pledgeSource: {
        source: it.source,
        sourceName: it.sourceName,
        note: it.note,
      },
    };
  }
  return null;
}
