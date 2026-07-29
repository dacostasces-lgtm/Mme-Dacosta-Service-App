"use client";

import { useEffect } from "react";

/**
 * Registers `public/sw.js`.
 *
 * Deferred to the load event on purpose: registration competes with the
 * page's own requests, and on a slow connection — the case the worker exists
 * for — doing it eagerly makes the first paint worse.
 *
 * Development is skipped: the worker would cache assets across rebuilds and
 * serve stale chunks after a hot reload.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
        // A failed registration costs nothing — the site works without it.
        console.error("Service worker non enregistré :", error);
      });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
