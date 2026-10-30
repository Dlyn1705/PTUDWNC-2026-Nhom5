import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, securityHeaders } from "@/lib/security/headers";

function protectedPath(pathname: string) {
  return pathname.startsWith("/dashboard") || pathname === "/profile" ||
    pathname.startsWith("/recipes/new") || /^\/recipes\/[^/]+\/edit(?:\/|$)/.test(pathname);
}

export default function proxy(request: NextRequest) {

  const { pathname } = request.nextUrl;
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
  return finalize(NextResponse.next({ request: { headers: requestHeaders } }));
}

export const config = {
  matcher: [{
    source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
    // RSC prefetches have no HTML CSP.
    missing: [
      { type: "header", key: "next-router-prefetch" },
      { type: "header", key: "purpose", value: "prefetch" },
    ],
  }],
};
