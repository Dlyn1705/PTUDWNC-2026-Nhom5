import type { ReactNode } from "react";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { Toaster } from "@/components/ui/sonner";

export const metadata = { title: "Hồ sơ — Culinary Blog" };
export const dynamic = "force-dynamic";

export default function ProfileLayout({ children }: { children: ReactNode }) {
  return <QueryProvider>{children}<Toaster position="bottom-right" closeButton richColors /></QueryProvider>;
}
