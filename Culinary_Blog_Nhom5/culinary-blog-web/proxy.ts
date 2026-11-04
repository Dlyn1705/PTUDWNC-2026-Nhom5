import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, securityHeaders } from "@/lib/security/headers";

function protectedPath(pathname: string) {
  return pathname.startsWith("/dashboard") || pathname === "/profile" ||
    pathname.startsWith("/recipes/new") || /^\/recipes\/[^/]+\/edit(?:\/|$)/.test(pathname);
}

function publicCacheControl(pathname: string) {
  if (pathname === "/") return "public, max-age=60, s-maxage=120, stale-while-revalidate=240";
  if (pathname === "/categories" || /^\/categories\/[^/]+$/.test(pathname)) {
    return "public, max-age=60, s-maxage=300, stale-while-revalidate=600";
  }
  if (pathname === "/recipes") return "public, max-age=60, s-maxage=180, stale-while-revalidate=360";
  if (/^\/recipes\/[^/]+$/.test(pathname)) {
    return "public, max-age=60, s-maxage=3600, stale-while-revalidate=7200";
  }
  return "public, max-age=60, stale-while-revalidate=300";
}

async function legacyRecipeRedirect(request: NextRequest): Promise<URL | null> {
  const match = request.nextUrl.pathname.match(/^\/recipes\/([^/]+)$/);
  if (!match) return null;

  const backendUrl = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL;
  if (!backendUrl) return null;

  try {
    const resolverUrl = new URL(
      `/api/v1/recipes/resolve/${encodeURIComponent(match[1])}`,
      backendUrl,
    );
    const response = await fetch(resolverUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return null;

    const payload = await response.json() as {
      data?: { currentSlug?: string; redirected?: boolean };
    };
    const currentSlug = payload.data?.currentSlug?.trim();
    if (!payload.data?.redirected || !currentSlug || currentSlug === match[1]) return null;

    return new URL(`/recipes/${encodeURIComponent(currentSlug)}`, request.url);
  } catch {
    // A resolver outage must not make a public recipe unavailable.
    return null;
  }
}

function withSecurityHeaders(request: NextRequest) {
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
  const isSearch = pathname === "/search" || pathname.startsWith("/search/");
  const isSitemap = pathname === "/sitemap.xml";
  const finalize = (response: NextResponse) => {
    response.headers.set("Content-Security-Policy", policy);
    response.headers.set(
      "Cache-Control",
      isProtected || isSearch || isSitemap
        ? "private, no-store"
        : publicCacheControl(pathname),
    );
    for (const header of securityHeaders) response.headers.set(header.key, header.value);
    if (secure && !development) response.headers.set("Strict-Transport-Security", "max-age=31536000");
    return response;
  };
  return finalize(NextResponse.next({ request: { headers: requestHeaders } }));
}

export default function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const backendUrl = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL;
  if (!protectedPath(pathname) && backendUrl && /^\/recipes\/[^/]+$/.test(pathname)) {
    return legacyRecipeRedirect(request).then(legacyRedirect =>
      legacyRedirect ? NextResponse.redirect(legacyRedirect, 301) : withSecurityHeaders(request));
  }
  return withSecurityHeaders(request);
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
