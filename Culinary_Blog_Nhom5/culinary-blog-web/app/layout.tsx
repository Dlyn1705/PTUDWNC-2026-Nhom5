import type { Metadata } from "next";
import { DM_Sans, Playfair_Display } from "next/font/google";
import "./globals.css";

const bodyFont = DM_Sans({
  variable: "--font-body",
import { Playfair_Display, Inter } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const displayFont = Playfair_Display({
  variable: "--font-display",
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Culinary Blog",
  description: "Nơi công thức ngon bắt đầu câu chuyện.",
  title: "Culinary Blog — Recipes worth cooking twice",
  description:
    "Seasonal, twice-tested recipes: pasta, roasts, baking and salads, written for real home kitchens.",
  openGraph: {
    title: "Culinary Blog — Recipes worth cooking twice",
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
    <html
      lang="vi"
      className={`${bodyFont.variable} ${displayFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    <html lang="en" className={`${inter.variable} ${playfair.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
