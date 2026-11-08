import { Geist, Playfair_Display } from "next/font/google";

export const geist = Geist({
  subsets: ["latin", "vietnamese"],
  display: "swap",
  variable: "--font-geist-sans",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

export const playfair = Playfair_Display({
  preload: false,
  display: "swap",
  variable: "--font-playfair",
  fallback: ["Georgia", "Times New Roman", "serif"],
});
