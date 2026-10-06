import type { Metadata } from "next";
import { AuthSessionProvider } from "@/components/providers/AuthSessionProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Culinary Blog — Recipes worth cooking twice",
  description:
    "Seasonal, twice-tested recipes: pasta, roasts, baking and salads, written for real home kitchens.",
  openGraph: {
    title: "Culinary Blog | Recipes worth cooking twice",
    description: "Seasonal, twice-tested recipes for real home kitchens.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans bg-background text-foreground">
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
