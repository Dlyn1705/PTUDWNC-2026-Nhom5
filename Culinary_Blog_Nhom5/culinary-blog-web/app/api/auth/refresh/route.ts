import { NextResponse } from "next/server";
import { auth, updateSession } from "@/lib/auth";

const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (request.headers.get("x-requested-with") !== "culinary-web") {
    return NextResponse.json({ detail: "Yêu cầu làm mới phiên không hợp lệ." }, { status: 403, headers: noStore });
  }

  let rejectedAccessToken: string | undefined;
  try {
    const body = await request.json() as { rejectedAccessToken?: unknown };
    if (typeof body.rejectedAccessToken === "string" && body.rejectedAccessToken.length <= 16_384) {
      rejectedAccessToken = body.rejectedAccessToken;
    }
  } catch {
    // Invalid input is handled by the response below without exposing details.
  }
  if (!rejectedAccessToken) {
    return NextResponse.json({ detail: "Thiếu access token bị từ chối." }, { status: 400, headers: noStore });
  }

  const currentSession = await auth();
  if (!currentSession?.user || currentSession.error) {
    return NextResponse.json(
      { detail: "Phiên đăng nhập không còn hợp lệ." },
      { status: 401, headers: noStore },
    );
  }

  const session = await updateSession({ rejectedAccessToken } as never);
  if (!session?.user || session.error || !session.user.accessToken) {
    return NextResponse.json(
      { detail: "Không thể làm mới phiên đăng nhập." },
      { status: 401, headers: noStore },
    );
  }

  return NextResponse.json(
    {
      user: {
        accessToken: session.user.accessToken,
        accessTokenExpiry: session.user.accessTokenExpiry,
      },
    },
    { headers: noStore },
  );
}
