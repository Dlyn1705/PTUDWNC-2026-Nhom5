"use client";

import React, { useState, useEffect, useRef, useId } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { ChefHat, Search, LayoutDashboard, Menu, X, ArrowRight, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserNav } from "@/components/layout/UserNav";
import { navigationItemIsActive, primaryNavigation } from "@/components/layout/navigation";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated" && !!session?.user && !session.error;
  const isAdmin = isAuthenticated &&
    (session?.user.role === "Admin" || session?.user.roles?.includes("Admin"));
  const canManage = isAdmin || (isAuthenticated && (session?.user.role === "Author" || session?.user.roles?.includes("Author")));
  const accountName = session?.user.name || session?.user.email || "Tài khoản";
  const mobileId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const brandRef = useRef<HTMLAnchorElement>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setMobileMenuOpen(false);
  }

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const resize = () => {
      if (!desktop.matches) return;
      // Some browsers move focus to body as soon as CSS hides the mobile panel,
      // before the media-query listener runs. Restore focus in that case too.
      if (panelRef.current?.contains(document.activeElement) || document.activeElement === triggerRef.current ||
        (mobileMenuOpen && document.activeElement === document.body)) brandRef.current?.focus();
      setMobileMenuOpen(false);
    };
    desktop.addEventListener("change", resize);
    return () => desktop.removeEventListener("change", resize);
  }, [mobileMenuOpen]);

  // Handle Cmd+K / Ctrl+K keyboard shortcut to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (e.defaultPrevented || e.isComposing || target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
        || document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        router.push("/search");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  return (
    <header onKeyDown={event => {
      if (event.key === "Escape" && mobileMenuOpen && !event.defaultPrevented) {
        event.preventDefault(); setMobileMenuOpen(false); triggerRef.current?.focus();
      }
    }} className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md transition-all">
      <div className="page-container flex h-16 items-center justify-between gap-2">
        {/* Brand Logo & Desktop Navigation */}
        <div className="flex items-center gap-6 md:gap-8">
          <Link ref={brandRef} aria-label="Culinary Blog — Trang chủ" href="/" className="flex items-center gap-2.5 group">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft transition-transform group-hover:scale-105">
              <ChefHat aria-hidden="true" className="size-5" />
            </span>
            <span className="hidden min-[400px]:inline font-display text-base sm:text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
              Culinary Blog
            </span>
          </Link>

          {/* Desktop Nav Links */}
          <nav aria-label="Điều hướng chính" className="hidden items-center gap-1 md:flex">
            {primaryNavigation.map(item => {
              const active = navigationItemIsActive(pathname, item.href);
              return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${active
                  ? "bg-accent text-accent-foreground font-semibold"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"}`}>
                {item.label}
              </Link>;
            })}
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
            <Link href="/search" aria-label="Tìm kiếm công thức">
              <Search aria-hidden="true" className="size-4 text-primary" />
              <span className="hidden sm:inline">Tìm kiếm</span>

            </Link>
          </Button>

          {status === "loading" ? (
            <span className="size-10 animate-pulse motion-reduce:animate-none rounded-full bg-muted" role="status" aria-label="Đang tải tài khoản" />
          ) : isAuthenticated ? <UserNav name={accountName} image={session?.user.image} email={session?.user.email} /> : <Button
            asChild
            size="sm"
            className="rounded-full px-4 h-9 shadow-soft gap-1.5 inline-flex"
          >
            <Link href="/auth/register">
              <UserPlus aria-hidden="true" className="size-3.5" />
              <span>Đăng ký</span>
            </Link>
          </Button>}

          {/* Mobile Menu Hamburger Toggle */}
          <Button
            ref={triggerRef}
            type="button"
            size="icon"
            variant="ghost"
            className="size-9 rounded-xl md:hidden text-foreground"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Đóng menu điều hướng" : "Mở menu điều hướng"}
            aria-expanded={mobileMenuOpen}
            aria-controls={mobileId}
          >
            {mobileMenuOpen ? <X aria-hidden="true" className="size-5" /> : <Menu aria-hidden="true" className="size-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Menu Drawer */}
      <div id={mobileId} ref={panelRef} hidden={!mobileMenuOpen}
        onClick={event => {
          const link = (event.target as Element).closest("a");
          if (!link) return;
          setMobileMenuOpen(false);
          if (new URL(link.href).pathname === pathname) triggerRef.current?.focus();
        }} className="border-b border-border bg-card px-4 py-6 md:hidden shadow-lift motion-reduce:animate-none animate-in slide-in-from-top-2 duration-200">
          <div className="space-y-4">
            <Link
              href="/search"
              className="flex items-center justify-between rounded-xl bg-muted/60 p-3 text-sm font-medium text-foreground"
            >
              <span className="inline-flex items-center gap-2">
                <Search aria-hidden="true" className="size-4 text-primary" />
                Tìm kiếm công thức…
              </span>
              <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground" />
            </Link>

            <nav aria-label="Điều hướng di động" className="flex flex-col space-y-1">
              {primaryNavigation.map(item => {
                const active = navigationItemIsActive(pathname, item.href);
                return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
                  className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium ${active
                    ? "bg-accent text-accent-foreground font-semibold" : "text-muted-foreground"}`}>
                  <span>{item.label}</span>
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>;
              })}

              <div className="pt-3 border-t border-border flex flex-col gap-2">
                {canManage && (
                  <Link
                    href="/dashboard"
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <LayoutDashboard aria-hidden="true" className="size-4 text-primary" />
                    <span>{isAdmin ? "Bảng điều khiển Admin" : "Bảng điều khiển tác giả"}</span>
                  </Link>
                )}

                {!isAuthenticated && status !== "loading" && <Button asChild className="w-full rounded-full h-10 shadow-soft gap-2 mt-1">
                  <Link href="/auth/register">
                    <UserPlus aria-hidden="true" className="size-4" />
                    <span>Đăng ký tài khoản</span>
                  </Link>
                </Button>}
              </div>
            </nav>
          </div>
        </div>
    </header>
  );
}
