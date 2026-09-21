"use client";
import { useEffect } from "react";

// Registers /sw.js — the app-shell cache (A-1). Nothing else about offline exists.
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* a failed registration only means no shell cache; the app still works online */
    });
  }, []);
  return null;
}
