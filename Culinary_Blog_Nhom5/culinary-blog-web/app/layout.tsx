import type { Metadata } from "next";
import { Noto_Sans } from "next/font/google";
import { connection } from "next/server";
import { AuthSessionProvider } from "@/components/providers/AuthSessionProvider";
import "./globals.css";

const notoSans = Noto_Sans({
  subsets: ["latin", "vietnamese"],
  display: "swap",
  variable: "--font-noto-sans",
});

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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Per-request CSP nonces require request-time rendering of all HTML routes.
  await connection();
  return (
    <html lang="vi" className={`${notoSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans bg-background text-foreground">
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
