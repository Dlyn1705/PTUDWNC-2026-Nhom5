import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/permissions";
import { contentSecurityPolicy, securityHeaders } from "@/lib/security/headers";

function protectedPath(pathname: string) {
  return pathname.startsWith("/dashboard") || pathname === "/profile" ||
    pathname.startsWith("/recipes/new") || /^\/recipes\/[^/]+\/edit(?:\/|$)/.test(pathname);
}

function handleRequest(request: NextRequest & { auth?: Session | null }) {
  const { pathname, search } = request.nextUrl;
  const session = request.auth;
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const development = process.env.NODE_ENV === "development";
  const secure = request.nextUrl.protocol === "https:";
  const policy = contentSecurityPolicy(nonce, {
    development, secure,
    apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5156",
    imageOrigins: process.env.CSP_IMAGE_ORIGINS || "http://localhost:9000",
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const isProtected = protectedPath(pathname);
  // Public recipe HTML must disappear on the next request after a deletion.
  // Redis invalidation cannot evict an HTML response held by a browser/CDN.
  const containsRecipes = pathname === "/" || pathname === "/sitemap.xml" ||
    /^\/(recipes|search|categories)(?:\/|$)/.test(pathname);
  const finalize = (response: NextResponse) => {
    response.headers.set("Content-Security-Policy", policy);
    response.headers.set(
      "Cache-Control",
      isProtected || containsRecipes
        ? "private, no-store"
        : "public, max-age=60, stale-while-revalidate=300",
    );
    for (const header of securityHeaders) response.headers.set(header.key, header.value);
    if (secure && !development) response.headers.set("Strict-Transport-Security", "max-age=31536000");
    return response;
  };
  if (isProtected && (!session || session.error)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
    return finalize(NextResponse.redirect(loginUrl));
  }

  if (
    pathname.startsWith("/dashboard/categories") &&
    !hasRole(session?.user, "Admin")
  ) {
    return finalize(NextResponse.rewrite(new URL("/forbidden", request.url), { request: { headers: requestHeaders } }));
  }

  if (isProtected && !hasRole(session?.user, "Author") && !hasRole(session?.user, "Admin")) {
    return finalize(NextResponse.rewrite(new URL("/forbidden", request.url), { request: { headers: requestHeaders } }));
  }

  return finalize(NextResponse.next({ request: { headers: requestHeaders } }));
}

const authenticatedProxy = auth((request, event: NextFetchEvent) => {
  void event;
  return handleRequest(request);
});
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  // Public Link prefetches must not roll session cookies and resurrect a session after logout.
  return protectedPath(request.nextUrl.pathname)
    ? authenticatedProxy(request, event)
    : handleRequest(request);
}

export const config = {
  matcher: [{
    source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
    // RSC prefetches have no HTML CSP and must not roll cookies after a concurrent logout.
    // Protected server layouts still authorize the prefetched page.
    missing: [
      { type: "header", key: "next-router-prefetch" },
      { type: "header", key: "purpose", value: "prefetch" },
    ],
  }],
};
