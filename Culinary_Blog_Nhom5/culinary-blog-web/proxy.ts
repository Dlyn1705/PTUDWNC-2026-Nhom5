import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export default auth((request) => {
  const { pathname, search } = request.nextUrl;
  const session = request.auth;
  const isProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/recipes/new") ||
    /^\/recipes\/[^/]+\/edit(?:\/|$)/.test(pathname);

  if (isProtected && !session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (
    pathname.startsWith("/dashboard/categories") &&
    session?.user.role !== "Admin"
  ) {
    return NextResponse.rewrite(new URL("/forbidden", request.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
