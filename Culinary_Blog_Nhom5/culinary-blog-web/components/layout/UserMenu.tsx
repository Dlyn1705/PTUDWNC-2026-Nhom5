"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { LogOut, UserRound } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";

export function UserMenu({ name, image, email }: {
  name: string;
  image?: string | null;
  email?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const initials = name.trim().split(/\s+/).slice(0, 2)
    .map((part) => Array.from(part)[0]).join("").toLocaleUpperCase("vi") || "A";

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        rootRef.current?.querySelector("button")?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function handleSignOut() {
    setSigningOut(true);
    useAuthStore.getState().clear();
    try {
      await signOut({ redirectTo: "/" });
    } catch {
      setSigningOut(false);
    }
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button type="button" aria-label={`Mở menu tài khoản ${name}`} aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex size-10 items-center justify-center overflow-hidden rounded-full border border-border bg-primary/10 text-sm font-semibold text-primary shadow-soft hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        {image && image !== failedImage ? (
          <Image src={image} alt="" width={40} height={40} unoptimized className="size-full object-cover" onError={() => setFailedImage(image)} />
        ) : <span aria-hidden="true">{initials}</span>}
      </button>
      {open && (
        <div role="menu" aria-label="Tài khoản" className="absolute right-0 top-full z-60 mt-2 w-60 rounded-2xl border border-border bg-card p-2 text-foreground shadow-lift">
          <div className="border-b border-border px-3 py-2">
            <p className="truncate text-sm font-semibold">{name}</p>
            {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
          </div>
          <Link role="menuitem" href="/profile" onClick={() => setOpen(false)} className="mt-1 flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-accent focus:bg-accent focus:outline-none">
            <UserRound className="size-4" /> Hồ sơ
          </Link>
          <button role="menuitem" type="button" disabled={signingOut} onClick={handleSignOut} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none disabled:opacity-50">
            <LogOut className="size-4" /> {signingOut ? "Đang đăng xuất..." : "Đăng xuất"}
          </button>
        </div>
      )}
    </div>
  );
}
