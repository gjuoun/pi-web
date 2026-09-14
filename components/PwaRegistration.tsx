"use client";

import { useEffect } from "react";

/** Cache prefix `public/sw.js` uses, so only our own caches are ever deleted. */
const CACHE_PREFIX = "pi-web-";
/** One reset per tab session, so a failed unregister cannot turn into a reload loop. */
const RESET_FLAG = "pi-web:service-worker-reset";

async function unregisterStaleWorker(): Promise<void> {
  const registrations = await navigator.serviceWorker.getRegistrations();
  if (registrations.length === 0) {
    // Nothing registered: clear the guard so a later production run can still reset.
    try {
      window.sessionStorage.removeItem(RESET_FLAG);
    } catch {
      // Storage can be blocked; the guard is best-effort.
    }
    return;
  }

  const wasControlled = Boolean(navigator.serviceWorker.controller);
  await Promise.all(registrations.map((registration) => registration.unregister()));
  if (typeof caches !== "undefined") {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => caches.delete(key)));
  }

  if (!wasControlled) return;
  try {
    if (window.sessionStorage.getItem(RESET_FLAG)) return;
    window.sessionStorage.setItem(RESET_FLAG, "1");
  } catch {
    return; // Without storage we cannot guarantee "once", so do not reload at all.
  }
  window.location.reload();
}

/**
 * Registers the service worker in production.
 *
 * Development needs the opposite: a worker left behind by a `npm start` run on the same origin keeps
 * controlling the dev server, and `public/sw.js` is cache-first for `/_next/static/*`, so the tab keeps
 * running an old bundle — new components against old CSS chunks, which reads as "the styling is gone"
 * and "the list is missing entries". Unregister, drop our caches, and reload once, and only when a
 * worker was actually in control of this page.
 */
export function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void unregisterStaleWorker().catch(() => {
        // Best effort: a blocked unregister must not break the app.
      });
      return;
    }

    const register = () => {
      const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
      const scriptUrl = `/sw.js?v=${encodeURIComponent(appVersion)}`;

      void navigator.serviceWorker.register(scriptUrl, {
        scope: "/",
        updateViaCache: "none",
      }).catch((error: unknown) => {
        console.error("Failed to register the Pi Web service worker:", error);
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
