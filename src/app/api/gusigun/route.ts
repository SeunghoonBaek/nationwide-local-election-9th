import { NextRequest, NextResponse } from "next/server";
import { getGusigunList, hasServiceKey, SG_TYPES, SgTypeCode } from "@/lib/nec";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const sgType = (sp.get("sgType") ?? "") as SgTypeCode;
  const sido = sp.get("sido") ?? "";
  if (!sgType || !(sgType in SG_TYPES) || !sido) {
    return NextResponse.json(
      { error: "sgType, sido 파라미터가 필요합니다." },
      { status: 400 }
    );
  }
  try {
    const gusigun = await getGusigunList(sgType, sido);
    return NextResponse.json({ gusigun });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message, hasKey: hasServiceKey() },
      { status: 502 }
    );
  }
}
