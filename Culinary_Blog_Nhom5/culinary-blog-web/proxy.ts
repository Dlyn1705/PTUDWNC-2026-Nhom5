import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/permissions";

export default auth((request) => {
  const { pathname, search } = request.nextUrl;
  const session = request.auth;
  const isProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/recipes/new") ||
    /^\/recipes\/[^/]+\/edit(?:\/|$)/.test(pathname);

  if (isProtected && (!session || session.error)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (
    pathname.startsWith("/dashboard/categories") &&
    !hasRole(session?.user, "Admin")
  ) {
    return NextResponse.rewrite(new URL("/forbidden", request.url));
  }

  if (isProtected && !hasRole(session?.user, "Author") && !hasRole(session?.user, "Admin")) {
    return NextResponse.rewrite(new URL("/forbidden", request.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
