import { NextResponse } from "next/server";
import { getSidoList, hasServiceKey } from "@/lib/nec";

export async function GET() {
  try {
    const sido = await getSidoList();
    return NextResponse.json({ sido });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message, hasKey: hasServiceKey() },
      { status: 502 }
    );
  }
}
