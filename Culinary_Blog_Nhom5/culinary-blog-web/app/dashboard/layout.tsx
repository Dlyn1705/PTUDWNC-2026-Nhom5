import React from "react";
import Link from "next/link";
import { ChefHat, FolderTree, BookOpen, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Dashboard Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft">
                <ChefHat className="size-5" />
              </span>
              <span className="font-display text-lg font-semibold tracking-tight">
                Culinary Studio
              </span>
            </Link>

            <nav className="hidden sm:flex items-center gap-2 text-sm">
              <Link
                href="/dashboard/categories"
                className="rounded-full bg-accent px-3.5 py-1.5 font-semibold text-accent-foreground flex items-center gap-1.5"
              >
                <FolderTree className="size-4" />
                <span>Categories</span>
              </Link>

              <Link
                href="/dashboard/recipes"
                className="rounded-full px-3.5 py-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors flex items-center gap-1.5"
              >
                <BookOpen className="size-4" />
                <span>Recipes</span>
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm" className="rounded-full gap-1.5 text-xs">
              <Link href="/">
                <ArrowLeft className="size-3.5" />
                <span>Back to Site</span>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
