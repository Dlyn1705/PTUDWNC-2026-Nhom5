import type { ReactNode } from "react";
import { QueryProvider } from "@/components/providers/QueryProvider";

export default function StatusLayout({ children }: { children: ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>;
}
