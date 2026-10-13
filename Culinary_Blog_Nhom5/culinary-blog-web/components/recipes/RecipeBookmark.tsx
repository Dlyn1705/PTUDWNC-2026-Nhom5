"use client";

import { useSyncExternalStore } from "react";
import { Bookmark } from "lucide-react";

const sessionBookmarks = new Map<string, boolean>();

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("culinary-bookmark-change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("culinary-bookmark-change", onChange);
  };
}

export function RecipeBookmark({ slug }: { slug: string }) {
  const storageKey = `culinary-bookmark:${slug}`;
  const saved = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(storageKey) === "true";
      } catch {
        return sessionBookmarks.get(storageKey) ?? false;
      }
    },
    () => false,
  );

  function toggleBookmark() {
    const nextSaved = !saved;
    sessionBookmarks.set(storageKey, nextSaved);
    try {
      if (nextSaved) localStorage.setItem(storageKey, "true");
      else localStorage.removeItem(storageKey);
    } catch {
      // Keep the in-memory state when the browser blocks storage.
    }
    window.dispatchEvent(new Event("culinary-bookmark-change"));
  }

  return (
    <button
      type="button"
      aria-label={saved ? "Remove recipe bookmark" : "Bookmark recipe on this device"}
      aria-pressed={saved}
      onClick={toggleBookmark}
      className="flex size-11 items-center justify-center rounded-full bg-[#f5f0e9] text-[#302c29] transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
    >
      <Bookmark className="size-[18px]" fill={saved ? "currentColor" : "none"} />
    </button>
  );
}
