"use client";

import React, { useEffect } from "react";
import { useUIStore } from "@/stores/ui-store";

/** تهيئة الثيم/الصوت/Service Worker بعد أول رسم */
export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const theme = useUIStore.getState().theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
    if ("serviceWorker" in navigator && window.location.protocol === "https:") {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);
  return <>{children}</>;
}
