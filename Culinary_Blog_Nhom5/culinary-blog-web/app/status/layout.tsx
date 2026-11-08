import type { ReactNode } from "react";
import { QueryProvider } from "@/components/providers/QueryProvider";

export const dynamic = "force-dynamic";

export default function StatusLayout({ children }: { children: ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>;
}
