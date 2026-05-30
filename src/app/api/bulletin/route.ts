import { NextRequest, NextResponse } from "next/server";
import { SG_ID } from "@/lib/constants";

const CDN_BULLETIN = "https://cdn.nec.go.kr/policy_pdf/";

/** Only allow NEC election bulletin paths for this election. */
const PATH_RE = new RegExp(`^${SG_ID}/PDF/[A-Za-z0-9/_\\-.]+\\.pdf$`, "i");

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path")?.trim();
  if (!path || path.includes("..") || !PATH_RE.test(path)) {
    return NextResponse.json({ error: "유효하지 않은 경로입니다." }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${CDN_BULLETIN}${path}`, {
      headers: { "User-Agent": "election-june/0.1 (public info)" },
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!upstream.ok) {
      return NextResponse.json(
        { error: "선거공보를 불러올 수 없습니다." },
        { status: upstream.status === 404 ? 404 : 502 }
      );
    }

    const body = await upstream.arrayBuffer();
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "선거공보를 불러올 수 없습니다." },
      { status: 502 }
    );
  }
}
