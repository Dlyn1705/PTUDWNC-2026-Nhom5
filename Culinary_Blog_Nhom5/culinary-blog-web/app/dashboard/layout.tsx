export const dynamic = "force-dynamic";

import type { ReactNode } from "react";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { Toaster } from "@/components/ui/sonner";
import DashboardShell from "@/components/layout/DashboardShell";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <DashboardShell>{children}</DashboardShell>
      <Toaster position="bottom-right" closeButton richColors />
    </QueryProvider>
  );
}
