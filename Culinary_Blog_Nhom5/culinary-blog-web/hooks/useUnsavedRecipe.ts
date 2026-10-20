"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

const message = "Bạn có thay đổi chưa lưu. Rời đi và bỏ các thay đổi này?";
type HistoryPosition = { index: number };
type WindowWithNavigation = Window & { navigation?: { currentEntry: HistoryPosition | null } };
let activeHistoryGuard: ((event: PopStateEvent) => void) | undefined;

/** Mount once in the root layout, before Next.js installs its history listener. */
export function RecipeNavigationGuard() {
  useLayoutEffect(() => {
    const popState = (event: PopStateEvent) => activeHistoryGuard?.(event);
    window.addEventListener("popstate", popState, true);
    return () => window.removeEventListener("popstate", popState, true);
  }, []);
  return null;
}

/** Guard ordinary links and document unloads without patching Next.js history. */
export function useUnsavedRecipe(dirty: boolean) {
  const blocked = useRef(dirty);
  useLayoutEffect(() => { blocked.current = dirty; }, [dirty]);
  const confirmDiscard = useCallback(() => !blocked.current || window.confirm(message), []);
  const allowNavigation = useCallback(() => { blocked.current = false; }, []);

  useLayoutEffect(() => {
    const navigation = (window as WindowWithNavigation).navigation;
    let position = navigation?.currentEntry?.index;
    let currentUrl = window.location.href;
    let restoring = false;
    const popState = (event: PopStateEvent) => {
      const next = navigation?.currentEntry?.index;
      if (restoring) {
        restoring = false;
        event.stopImmediatePropagation();
        return;
      }
      const destination = new URL(window.location.href);
      const source = new URL(currentUrl);
      const leaving = destination.pathname !== source.pathname || destination.search !== source.search;
      if (leaving && blocked.current && position !== undefined && next !== undefined && !confirmDiscard()) {
        // popstate cannot be canceled. Restore its position before Next.js handles
        // the event, preserving both the mounted form and the forward history.
        event.stopImmediatePropagation();
        restoring = true;
        window.history.go(position - next);
      } else {
        position = next;
        currentUrl = window.location.href;
      }
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!blocked.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const click = (event: MouseEvent) => {
      if (!blocked.current || event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.download ||
        (link.target && link.target !== "_self")) return;
      const destination = new URL(link.href, window.location.href);
      if (!["http:", "https:"].includes(destination.protocol)) return;
      if (destination.origin === window.location.origin && destination.pathname === window.location.pathname &&
        destination.search === window.location.search) return;
      if (!confirmDiscard()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      } else {
        // A full document navigation should not prompt a second time. Restore protection
        // if a later handler cancels the click or the user remains on this page.
        blocked.current = false;
        window.setTimeout(() => { blocked.current = dirty; }, 0);
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    activeHistoryGuard = popState;
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      if (activeHistoryGuard === popState) activeHistoryGuard = undefined;
      document.removeEventListener("click", click, true);
    };
  }, [confirmDiscard, dirty]);

  return { confirmDiscard, allowNavigation };
}
