import type { Metadata } from "next";
import { connection } from "next/server";
import { AuthSessionProvider } from "@/components/providers/AuthSessionProvider";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { RecipeNavigationGuard } from "@/hooks/useUnsavedRecipe";
import "./globals.css";

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
    <html lang="vi" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans bg-background text-foreground">
        <RecipeNavigationGuard />
        <QueryProvider>
          <AuthSessionProvider>{children}</AuthSessionProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
