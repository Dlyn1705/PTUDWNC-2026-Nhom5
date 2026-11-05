export const dynamic = "force-dynamic";

import type { ReactNode } from "react";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { AuthSessionProvider } from "@/components/providers/AuthSessionProvider";
import { Toaster } from "@/components/ui/sonner";
import DashboardShell from "@/components/layout/DashboardShell";
import { RecipeNavigationGuard } from "@/hooks/useUnsavedRecipe";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <AuthSessionProvider>
        <RecipeNavigationGuard />
        <DashboardShell>{children}</DashboardShell>
      </AuthSessionProvider>
      <Toaster position="bottom-right" closeButton richColors />
    </QueryProvider>
  );
}
