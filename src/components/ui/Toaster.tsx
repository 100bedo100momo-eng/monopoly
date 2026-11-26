"use client";

import React from "react";
import { useUIStore } from "@/stores/ui-store";

export function Toaster() {
  const toasts = useUIStore((s) => s.toasts);
  const dismiss = useUIStore((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed bottom-4 start-1/2 z-[60] flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4 rtl:translate-x-1/2" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto rounded-xl px-4 py-2.5 text-sm font-bold shadow-xl border ${
            t.kind === "error" ? "bg-rose-950/90 border-rose-500/50 text-rose-100"
            : t.kind === "success" ? "bg-emerald-950/90 border-emerald-500/50 text-emerald-100"
            : "bg-navy-800/90 border-white/15 text-white"
          }`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
