"use client";

// صور رمزية أصلية بالكامل (SVG) — 8 تصاميم
import React from "react";

export const AVATAR_IDS = ["crown", "castle", "camel", "eagle", "palm", "anchor", "key", "coin"] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];

const STROKES: Record<AvatarId, string> = {
  crown: "#f5c542", castle: "#8ea2c6", camel: "#d97706", eagle: "#e5484d",
  palm: "#2fa46b", anchor: "#3a5bc7", key: "#c084fc", coin: "#facc15",
};

export function AvatarIcon({ id, size = 28 }: { id: string; size?: number }) {
  const c = STROKES[(id as AvatarId) in STROKES ? (id as AvatarId) : "crown"];
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label={id}>
      <circle cx="16" cy="16" r="15" fill="#0b1f3a" stroke={c} strokeWidth="1.6" />
      <g stroke={c} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {id === "crown" && <path d="M7 20 L7 13 L11 16 L16 10 L21 16 L25 13 L25 20 Z M7 22 h18" />}
        {id === "castle" && <path d="M9 24 V12 h3 v3 h2 v-3 h4 v3 h2 v-3 h3 v12 Z M14 24 v-5 h4 v5" />}
        {id === "camel" && <path d="M6 22 c2-6 5-6 7-2 c2-6 6-6 8-2 c1-2 3-3 5-2 M24 22 v4 M10 22 v4 M16 12 v-4 M15 8 h3" />}
        {id === "eagle" && <path d="M16 8 l-8 9 8-3 8 3 Z M16 14 v10 M12 24 h8" />}
        {id === "palm" && <path d="M16 26 v-9 M16 17 c-4-4-8-3-9 0 c2-1 5 0 9 0 c4 0 7-1 9 0 c-1-3-5-4-9 0 Z M16 26 h6" />}
        {id === "anchor" && <path d="M16 10 v12 M12 13 h8 M8 18 c0 5 4 7 8 7 c4 0 8-2 8-7 M16 22 v4 M12 26 h8" />}
        {id === "key" && (<><circle cx="12" cy="12" r="4" /><path d="M15 15 L24 24 M21 21 l3-3 M18 24 l3-3" /></>)}
        {id === "coin" && (<><circle cx="16" cy="16" r="8" /><path d="M16 10 v12 M13 12 h5 c1.5 0 1.5 2.5 0 2.5 h-4 c-1.5 0-1.5 2.5 0 2.5 h5" /></>)}
      </g>
    </svg>
  );
}

export function AvatarPicker({ value, onChange }: { value: string; onChange: (id: AvatarId) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="avatar">
      {AVATAR_IDS.map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className={`rounded-xl p-1.5 transition ${value === id ? "ring-2 ring-gold bg-gold/10" : "hover:bg-white/5"}`}
        >
          <AvatarIcon id={id} size={30} />
        </button>
      ))}
    </div>
  );
}
