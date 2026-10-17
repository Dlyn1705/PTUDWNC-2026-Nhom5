import { NextResponse } from "next/server";
import { auth, updateSession } from "@/lib/auth";

export async function POST() {
  const currentSession = await auth();
  if (!currentSession?.user || currentSession.error) {
    return NextResponse.json(
      { detail: "Phiên đăng nhập không còn hợp lệ." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const session = await updateSession({});
  if (!session?.user || session.error || !session.user.accessToken) {
    return NextResponse.json(
      { detail: "Không thể làm mới phiên đăng nhập." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
