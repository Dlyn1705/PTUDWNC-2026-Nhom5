"use client";

import { useEffect, useRef } from "react";
import { useUIStore } from "@/store/useUIStore";

export function UIStoreHydrator() {
  const didHydrate = useRef(false);

  useEffect(() => {
    if (didHydrate.current) return;
    didHydrate.current = true;
    void useUIStore.persist.rehydrate();
  }, []);

  return null;
}
