import { NextRequest, NextResponse } from "next/server";
import {
  resolveLocationFromAddress,
  resolveLocationFromCoords,
} from "@/lib/geocode";
import { getSidoList } from "@/lib/nec";
import { resolveSidoName } from "@/lib/sido-names";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const address = sp.get("address")?.trim();
  const latRaw = sp.get("lat");
  const lngRaw = sp.get("lng");

  try {
    const allowed = await getSidoList();

    if (address) {
      const found = resolveLocationFromAddress(address);
      if (!found) {
        return NextResponse.json(
          {
            error:
              "주소에서 시·도를 찾지 못했습니다. 예: 서울특별시 중구 …, 경기도 수원시 …",
          },
          { status: 404 }
        );
      }
      const sido = resolveSidoName(found.sido, allowed) ?? found.sido;
      if (!allowed.includes(sido)) {
        return NextResponse.json(
          { error: `인식한 지역(${sido})이 선거 코드 목록과 일치하지 않습니다.` },
          { status: 404 }
        );
      }
      return NextResponse.json({
        sido,
        source: found.source,
        label: found.label,
      });
    }

    if (latRaw != null && lngRaw != null) {
      const lat = Number(latRaw);
      const lng = Number(lngRaw);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return NextResponse.json(
          { error: "lat, lng는 숫자여야 합니다." },
          { status: 400 }
        );
      }
      const found = await resolveLocationFromCoords(lat, lng);
      if (!found) {
        return NextResponse.json(
          {
            error:
              "좌표로 시·도를 확인하지 못했습니다. 주소로 다시 시도해 주세요.",
          },
          { status: 404 }
        );
      }
      const sido = resolveSidoName(found.sido, allowed) ?? found.sido;
      if (!allowed.includes(sido)) {
        return NextResponse.json(
          { error: `인식한 지역(${sido})이 선거 코드 목록과 일치하지 않습니다.` },
          { status: 404 }
        );
      }
      return NextResponse.json({
        sido,
        source: found.source,
        label: found.label,
      });
    }

    return NextResponse.json(
      { error: "address 또는 lat·lng 파라미터가 필요합니다." },
      { status: 400 }
    );
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 502 }
    );
  }
}
