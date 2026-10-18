import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChefHat, FolderTree, BookOpen, ArrowLeft, Plus, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/permissions";
import { DashboardMobileNav } from "@/components/layout/DashboardMobileNav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session || session.error) redirect("/login?callbackUrl=/dashboard");
  if (!hasRole(session.user, "Author") && !hasRole(session.user, "Admin")) redirect("/forbidden");

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <a href="#dashboard-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-card focus:p-3">Đến nội dung chính</a>
      {/* Dashboard Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link href="/" aria-label="Culinary Studio — Trang chủ" className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft">
                <ChefHat className="size-5" />
              </span>
              <span className="font-display text-lg font-semibold tracking-tight hidden min-[400px]:inline">
                Culinary Studio
              </span>
            </Link>

            <nav aria-label="Điều hướng dashboard" className="hidden lg:flex items-center gap-2 text-sm">
              {hasRole(session.user, "Admin") && (
                <Link
                  href="/dashboard/categories"
                  className="rounded-full bg-accent px-3.5 py-1.5 font-semibold text-accent-foreground flex items-center gap-1.5"
                >
                  <FolderTree className="size-4" />
                  <span>Categories</span>
                </Link>
              )}

              <Link
                href="/dashboard/recipes"
                className="rounded-full px-3.5 py-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors flex items-center gap-1.5"
              >
                <BookOpen className="size-4" />
                <span>Recipes</span>
              </Link>
              <Link
                href="/dashboard/recipes/images"
                className="rounded-full px-3.5 py-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors flex items-center gap-1.5"
              >
                <ImageIcon className="size-4" />
                <span>Images</span>
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <Button
              asChild
              size="sm"
              className="rounded-full gap-1.5 text-xs shadow-soft"
            >
              <Link href="/dashboard/recipes/new" aria-label="Tạo công thức">
                <Plus className="size-3.5" />
                <span className="hidden sm:inline">Tạo công thức</span>
              </Link>
            </Button>

            <Button
              asChild
              variant="ghost"
              size="sm"
              className="hidden lg:inline-flex rounded-full gap-1.5 text-xs"
            >
              <Link href="/">
                <ArrowLeft className="size-3.5" />
                <span>Back to Site</span>
              </Link>
            </Button>
            <DashboardMobileNav isAdmin={hasRole(session.user, "Admin")} />
          </div>
        </div>
      </header>

      <main id="dashboard-content" tabIndex={-1} className="flex-1">{children}</main>
    </div>
  );
}
