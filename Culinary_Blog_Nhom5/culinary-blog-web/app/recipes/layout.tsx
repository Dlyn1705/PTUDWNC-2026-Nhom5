import type { ReactNode } from "react";
import { SiteShell } from "@/components/layout/SiteShell";

export default function RecipesLayout({ children }: { children: ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
