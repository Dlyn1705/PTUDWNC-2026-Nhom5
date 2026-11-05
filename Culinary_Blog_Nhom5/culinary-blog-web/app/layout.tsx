import type { Metadata } from "next";
import { AuthSessionProvider } from "@/components/providers/AuthSessionProvider";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { RecipeNavigationGuard } from "@/hooks/useUnsavedRecipe";
import { Toaster } from "@/components/ui/sonner";
import { geist, playfair } from "@/lib/fonts";
import "./globals.css";
import { MaintenanceNotice } from "@/components/layout/MaintenanceNotice";
import { absoluteUrl, siteOrigin, DEFAULT_RECIPE_OG_IMAGE, OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from "@/lib/seo/siteUrl";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: "Culinary Blog — Recipes worth cooking twice",
  description: "Seasonal, twice-tested recipes for real home kitchens.",
  openGraph: {
    title: "Culinary Blog | Recipes worth cooking twice",
    description: "Seasonal, twice-tested recipes for real home kitchens.",
    type: "website",
    url: siteOrigin(),
    images: [{
      url: absoluteUrl(DEFAULT_RECIPE_OG_IMAGE),
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
      alt: "Culinary Blog",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Culinary Blog — Recipes worth cooking twice",
    description: "Seasonal, twice-tested recipes for real home kitchens.",
    images: [absoluteUrl(DEFAULT_RECIPE_OG_IMAGE)],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className={`${geist.variable} ${playfair.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans bg-background text-foreground">
        <MaintenanceNotice />
        <RecipeNavigationGuard />
        <QueryProvider>
          <AuthSessionProvider>{children}</AuthSessionProvider>
        </QueryProvider>
        <Toaster position="bottom-right" closeButton richColors />
      </body>
    </html>
  );
}
