"use client";

import React from "react";
import { cn } from "@/lib/utils";

export function ConnectionBadge({ state, label }: { state: "connected" | "reconnecting" | "offline"; label: string }) {
  const dot =
    state === "connected" ? "bg-emerald-400" : state === "reconnecting" ? "bg-amber-400 animate-pulse" : "bg-rose-500";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-xs font-bold")} role="status">
      <span className={cn("inline-block h-2 w-2 rounded-full", dot)} />
      {label}
    </span>
  );
}
