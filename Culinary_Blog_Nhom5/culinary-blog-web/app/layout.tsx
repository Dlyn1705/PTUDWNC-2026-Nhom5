import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Culinary Blog - Slow recipes, tested twice",
  description: "Slow recipes, tested twice, written for real kitchens and imperfect ovens.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
