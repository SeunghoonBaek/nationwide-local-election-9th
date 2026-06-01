import { NextRequest, NextResponse } from "next/server";
import {
  getCandidates,
  getPledges,
  hasServiceKey,
  SG_TYPES,
  SgTypeCode,
  type Candidate,
  type Pledge,
} from "@/lib/nec";
import { getCandidatePhotoUrl } from "@/lib/candidate-photo";
import { getCandidateExtra, type CandidateExtra } from "@/lib/controversies";
import { inferCandidateTags } from "@/lib/candidate-tags";
import {
  getManualPledges,
  type PledgeSource,
} from "@/lib/pledges-manual";
import {
  getPolicyPledgeLinks,
  type PolicyPledgeLink,
} from "@/lib/policy-nec";

export type CandidateView = Candidate & {
  pledges: Pledge[];
  pledgeSource?: PledgeSource;
  pledgePolicy?: PolicyPledgeLink;
} & CandidateExtra;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const sgType = (sp.get("sgType") ?? "") as SgTypeCode;
  const sido = sp.get("sido") ?? "";
  const sgg = sp.get("sgg") ?? "";

  if (!sgType || !(sgType in SG_TYPES) || !sido || !sgg) {
    return NextResponse.json(
      { error: "sgType, sido, sgg 파라미터가 필요합니다." },
      { status: 400 }
    );
  }

  try {
    const candidates = await getCandidates(sgType, sido, sgg);

    const views: CandidateView[] = await Promise.all(
      candidates.map(async (c) => {
        let pledges: Pledge[] = [];
        let pledgeSource: PledgeSource | undefined;
        try {
          pledges = await getPledges(sgType, c.cnddtId);
        } catch {
          pledges = [];
        }
        if (pledges.length === 0) {
          const manual = getManualPledges(sido, sgg, c.name);
          if (manual) {
            pledges = manual.pledges;
            pledgeSource = manual.pledgeSource;
          }
        }
        const photoUrl = await getCandidatePhotoUrl(c.cnddtId);
        const extra = getCandidateExtra(sido, sgg, c.name);
        const inferredTags = inferCandidateTags(c.job, c.career1, c.career2);
        const tags = [...new Set([...(extra.tags ?? []), ...inferredTags])];
        return { ...c, pledges, pledgeSource, photoUrl, ...extra, tags };
      })
    );

    const policyLinks = await getPolicyPledgeLinks(sgType, sido, sgg);
    for (const v of views) {
      const link = policyLinks.get(v.cnddtId) ?? policyLinks.get(`party:${v.party}`);
      if (link) v.pledgePolicy = link;
    }

    // sort by ballot number (giho)
    views.sort((a, b) => {
      const ga = parseInt(a.giho, 10);
      const gb = parseInt(b.giho, 10);
      if (isNaN(ga) || isNaN(gb)) return a.giho.localeCompare(b.giho);
      return ga - gb;
    });

    return NextResponse.json({
      election: { sgType, sgTypeName: SG_TYPES[sgType], sido, sgg },
      candidates: views,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message, hasKey: hasServiceKey() },
      { status: 502 }
    );
  }
}
