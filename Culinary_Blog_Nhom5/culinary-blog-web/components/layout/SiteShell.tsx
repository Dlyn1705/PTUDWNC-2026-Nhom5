import { SkipLink } from "@/components/common/SkipLink";
import type { ReactNode } from "react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { cn } from "@/lib/utils";

type SiteShellProps = {
  children: ReactNode;
  className?: string;
};

export function SiteShell({ children, className }: SiteShellProps) {
  return (
    <div
      className={cn(
        "min-h-screen flex flex-col bg-background text-foreground",
        className,
      )}
    >
      <SkipLink />
      <Navbar />
      <main id="main-content" tabIndex={-1} className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

export default SiteShell;
