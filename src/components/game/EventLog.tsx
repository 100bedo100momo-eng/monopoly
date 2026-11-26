"use client";

import React from "react";
import { useI18n } from "@/lib/i18n";
import type { GameSnapshot } from "@/game/types";

export function EventLog({ snapshot }: { snapshot: GameSnapshot }) {
  const { locale } = useI18n();
  const events = [...snapshot.events].sort((a, b) => a.seq - b.seq);
  return (
    <div className="flex h-full flex-col gap-1 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2 text-xs" aria-label="events" role="log">
      {events.map((e) => (
        <div key={e.seq} className="flex items-start gap-1.5 border-b border-white/5 pb-1">
          <span className="shrink-0 text-white/35">{new Date(e.created_at).toLocaleTimeString(locale === "ar" ? "ar-EG" : "en-US", { hour: "2-digit", minute: "2-digit" })}</span>
          <span className="min-w-0 break-words">{locale === "ar" ? e.msg_ar : e.msg_en}</span>
        </div>
      ))}
    </div>
  );
}
