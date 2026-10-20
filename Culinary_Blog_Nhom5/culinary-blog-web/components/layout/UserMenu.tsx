"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut, UserRound } from "lucide-react";

export function UserMenu({ name, image, email }: {
  name: string; image?: string | null; email?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const initialItem = useRef(0);
  const signingOutRef = useRef(false);
  const typeahead = useRef({ value: "", at: 0 });
  const id = useId();
  const pathname = usePathname();
  const [previousPath, setPreviousPath] = useState(pathname);
  if (previousPath !== pathname) { setPreviousPath(pathname); setOpen(false); }
  const initials = name.trim().split(/\s+/).slice(0, 2)
    .map(part => Array.from(part)[0]).join("").toLocaleUpperCase("vi") || "A";
  const items = () => Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  useEffect(() => {
    if (!open) return;
    typeahead.current = { value: "", at: 0 };
    const entries = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    entries[initialItem.current === -1 ? entries.length - 1 : 0]?.focus();
    function outside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation(); setOpen(false); triggerRef.current?.focus(); return;
    }
    if (event.key === "Tab") {
      // Native Tab continues from the trigger; this popup is not a modal trap.
      triggerRef.current?.focus(); setOpen(false); return;
    }
    const entries = items();
    const index = entries.indexOf(document.activeElement as HTMLElement);
    let next: number | undefined;
    if (event.key === "ArrowDown") next = (index + 1) % entries.length;
    if (event.key === "ArrowUp") next = (index - 1 + entries.length) % entries.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = entries.length - 1;
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && event.key !== " ") {
      const now = Date.now();
      typeahead.current = { value: (now - typeahead.current.at < 600 ? typeahead.current.value : "") + event.key.toLocaleLowerCase("vi"), at: now };
      next = entries.findIndex(entry => entry.textContent?.trim().toLocaleLowerCase("vi").startsWith(typeahead.current.value));
    }
    if (next !== undefined && next >= 0) { event.preventDefault(); entries[next]?.focus(); }
    if (event.key === " " && document.activeElement?.tagName === "A") {
      event.preventDefault(); (document.activeElement as HTMLElement).click();
    }
  }

  async function handleSignOut() {
    if (signingOutRef.current) return;
    signingOutRef.current = true; setSigningOut(true); setLogoutError(false);
    try { await signOut({ redirectTo: "/" }); }
    catch { setLogoutError(true); }
    finally { signingOutRef.current = false; setSigningOut(false); }
  }

  return <div ref={rootRef} className="relative shrink-0" onKeyDown={keyboard}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={triggerRef} id={id + "-trigger"} type="button"
      aria-label={`Menu tài khoản ${name}`} aria-haspopup="menu" aria-expanded={open} aria-controls={id}
      onClick={() => { initialItem.current = 0; setOpen(value => !value); }}
      onKeyDown={event => {
        if (!open && ["ArrowDown", "ArrowUp"].includes(event.key)) {
          event.preventDefault(); initialItem.current = event.key === "ArrowUp" ? -1 : 0; setOpen(true);
        }
      }}
      className="flex size-10 items-center justify-center overflow-hidden rounded-full border border-border bg-primary/10 text-sm font-semibold text-primary shadow-soft hover:border-primary">
      {image && image !== failedImage ? <Image src={image} alt="" width={40} height={40} unoptimized className="size-full object-cover" onError={() => setFailedImage(image)} /> : <span aria-hidden="true">{initials}</span>}
    </button>
    <div hidden={!open} className="absolute right-0 top-full z-60 mt-2 w-60 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card p-2 text-foreground shadow-lift">
      <div className="border-b border-border px-3 py-2"><p className="truncate text-sm font-semibold">{name}</p>{email && <p className="truncate text-xs text-muted-foreground">{email}</p>}</div>
      <div id={id} role="menu" aria-labelledby={id + "-trigger"}>
        <Link tabIndex={-1} role="menuitem" href="/profile" onClick={() => setOpen(false)} className="mt-1 flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-accent focus:bg-accent">
          <UserRound className="size-4" aria-hidden="true" /> Hồ sơ
        </Link>
        <button tabIndex={-1} role="menuitem" type="button" aria-disabled={signingOut} onClick={() => void handleSignOut()} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-accent focus:bg-accent aria-disabled:opacity-50">
          <LogOut className="size-4" aria-hidden="true" /> {signingOut ? "Đang đăng xuất…" : "Đăng xuất"}
        </button>
      </div>
      <p role="status" className="sr-only">{signingOut ? "Đang đăng xuất…" : ""}</p>
      {logoutError && <p role="alert" className="px-3 py-2 text-sm">Chưa thể đăng xuất. Vui lòng thử lại.</p>}
    </div>
  </div>;
}
