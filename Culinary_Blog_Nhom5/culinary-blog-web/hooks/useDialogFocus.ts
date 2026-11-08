"use client";

import { useRef } from "react";
import { canRestoreFocus, focusMainContent } from "@/lib/focus";

/** Radix still owns trapping; this also supports controlled dialogs without a Trigger. */
export function useDialogFocus() {
  const opener = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus() {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    },
    onCloseAutoFocus(event: Event) {
      event.preventDefault();
      if (canRestoreFocus(opener.current)) opener.current.focus();
      else focusMainContent();
    },
  };
}
