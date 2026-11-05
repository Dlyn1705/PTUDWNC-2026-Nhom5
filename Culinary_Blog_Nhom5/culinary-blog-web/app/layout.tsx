import type { Metadata } from "next";
import { connection } from "next/server";
import { AuthSessionProvider } from "@/components/providers/AuthSessionProvider";
import { RecipeNavigationGuard } from "@/hooks/useUnsavedRecipe";
import { geist, playfair } from "@/lib/fonts";
import "./globals.css";
import { MaintenanceNotice } from "@/components/layout/MaintenanceNotice";

export const metadata: Metadata = {
  title: "Culinary Blog — Recipes worth cooking twice",
  description: "Seasonal, twice-tested recipes for real home kitchens.",
  openGraph: {
    title: "Culinary Blog | Recipes worth cooking twice",
    description: "Seasonal, twice-tested recipes for real home kitchens.",
    type: "website",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await connection();
  return (
    <html lang="vi" className={`${geist.variable} ${playfair.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans bg-background text-foreground">
        <MaintenanceNotice />
        <RecipeNavigationGuard />
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
