import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://culinaryblog.local")
    .trim()
    .replace(/\/+$/, "");

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard/", "/profile", "/api/", "/forbidden"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
