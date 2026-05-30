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

export type CandidateView = Candidate & {
  pledges: Pledge[];
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
        try {
          pledges = await getPledges(sgType, c.cnddtId);
        } catch {
          pledges = [];
        }
        const photoUrl = await getCandidatePhotoUrl(c.cnddtId);
        const extra = getCandidateExtra(sido, sgg, c.name);
        return { ...c, pledges, photoUrl, ...extra };
      })
    );

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
