"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChefHat, Search, LayoutDashboard, Menu, X, ArrowRight, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setMobileMenuOpen(false);
  }

  // Handle Cmd+K / Ctrl+K keyboard shortcut to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        router.push("/search");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  const isCategoriesActive = pathname === "/categories" || pathname.startsWith("/categories/");
  const isRecipesActive = pathname === "/recipes" || pathname.startsWith("/recipes/");
  const isDashboardActive = pathname.startsWith("/dashboard");

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md transition-all">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Brand Logo & Desktop Navigation */}
        <div className="flex items-center gap-6 md:gap-8">
          <Link href="/" className="flex items-center gap-2.5 group">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft transition-transform group-hover:scale-105">
              <ChefHat className="size-5" />
            </span>
            <span className="font-display text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
              Culinary Blog
            </span>
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden items-center gap-1 md:flex">
            <Link
              href="/recipes"
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                isRecipesActive
                  ? "bg-accent text-accent-foreground font-semibold"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              }`}
            >
              All Recipes
            </Link>

            <Link
              href="/categories"
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                isCategoriesActive
                  ? "bg-accent text-accent-foreground font-semibold"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              }`}
            >
              Categories
            </Link>

            <Link
              href="/categories/pasta"
              className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
            >
              Pasta
            </Link>

            <Link
              href="/categories/mains"
              className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
            >
              Mains
            </Link>

            <Link
              href="/categories/baking"
              className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
            >
              Baking
            </Link>
          </nav>
        </div>

        {/* Right Controls: Search, Admin, Sign In & Mobile Menu Toggle */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-9 gap-2 rounded-full px-3.5 text-muted-foreground hover:text-foreground shadow-2xs"
          >
            <Link href="/search">
              <Search className="size-4 text-primary" />
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums sm:inline">
                ⌘K
              </kbd>
            </Link>
          </Button>

          <Button
            asChild
            variant={isDashboardActive ? "secondary" : "ghost"}
            size="sm"
            className="rounded-full gap-1.5 text-xs hidden sm:inline-flex"
          >
            <Link href="/dashboard/categories">
              <LayoutDashboard className="size-3.5" />
              <span>Admin</span>
            </Link>
          </Button>

          <Button asChild size="sm" className="rounded-full px-4 h-9 shadow-soft hidden xs:inline-flex">
            <Link href="/auth/login">
              Sign In
            </Link>
          </Button>

          {/* Mobile Menu Hamburger Toggle */}
          <Button
            size="icon"
            variant="ghost"
            className="size-9 rounded-xl md:hidden text-foreground"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div className="border-b border-border bg-card px-4 py-6 md:hidden shadow-lift animate-in slide-in-from-top-2 duration-200">
          <div className="space-y-4">
            <Link
              href="/search"
              className="flex items-center justify-between rounded-xl bg-muted/60 p-3 text-sm font-medium text-foreground"
            >
              <span className="inline-flex items-center gap-2">
                <Search className="size-4 text-primary" />
                Quick recipe search...
              </span>
              <ArrowRight className="size-4 text-muted-foreground" />
            </Link>

            <nav className="flex flex-col space-y-1">
              <Link
                href="/recipes"
                className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium ${
                  isRecipesActive ? "bg-accent text-accent-foreground font-semibold" : "text-muted-foreground"
                }`}
              >
                <span>All Recipes</span>
                <Utensils className="size-4" />
              </Link>

              <Link
                href="/categories"
                className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium ${
                  isCategoriesActive ? "bg-accent text-accent-foreground font-semibold" : "text-muted-foreground"
                }`}
              >
                <span>Categories</span>
                <span className="text-xs text-muted-foreground">View all</span>
              </Link>

              <div className="pl-3 py-1 flex flex-wrap gap-1.5 border-l-2 border-primary/20 ml-3">
                <Link
                  href="/categories/pasta"
                  className="rounded-lg bg-background px-3 py-1 text-xs font-medium text-muted-foreground"
                >
                  Pasta
                </Link>
                <Link
                  href="/categories/mains"
                  className="rounded-lg bg-background px-3 py-1 text-xs font-medium text-muted-foreground"
                >
                  Mains
                </Link>
                <Link
                  href="/categories/baking"
                  className="rounded-lg bg-background px-3 py-1 text-xs font-medium text-muted-foreground"
                >
                  Baking
                </Link>
                <Link
                  href="/categories/salads"
                  className="rounded-lg bg-background px-3 py-1 text-xs font-medium text-muted-foreground"
                >
                  Salads
                </Link>
              </div>

              <div className="pt-3 border-t border-border flex flex-col gap-2">
                <Link
                  href="/dashboard/categories"
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  <LayoutDashboard className="size-4 text-primary" />
                  <span>Admin Dashboard</span>
                </Link>

                <Button asChild className="w-full rounded-full h-10 mt-1 shadow-soft">
                  <Link href="/auth/login">
                    Sign In to Culinary Blog
                  </Link>
                </Button>
              </div>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
