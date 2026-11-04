"use client";

import { useEffect, useRef, useState } from "react";

/** Defer focus until the mutation's disabled fieldset has been enabled again. */
export function useCollectionFocus(busy: boolean) {
  const root = useRef<HTMLElement>(null);
  const [pending, setPending] = useState<{ index: number; message: string; origin: Element | null } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    if (busy || !pending) return;
    const frame = requestAnimationFrame(() => {
      const rows = root.current?.querySelectorAll<HTMLElement>("[data-collection-row]");
      const row = rows?.[Math.min(pending.index, rows.length - 1)];
      const target = row?.querySelector<HTMLElement>("input:not(:disabled), textarea:not(:disabled), button:not(:disabled)")
        ?? root.current?.querySelector<HTMLElement>("[data-collection-add]");
      const active = document.activeElement;
      // Do not override a later user focus choice while waiting for React/RAF or an API.
      // A removed/disabled trigger leaves focus on body; an unchanged button is still
      // the operation's trigger. Both may safely hand focus to the resulting row.
      if (active === document.body || active === pending.origin && active instanceof HTMLButtonElement)
        target?.focus();
      setAnnouncement(pending.message);
      setPending(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [busy, pending]);
  return { root, announcement, focusRow: (index: number, message: string) => {
    setAnnouncement("");
    setPending({ index, message, origin: document.activeElement });
  } };
}
