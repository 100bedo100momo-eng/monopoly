"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Locale } from "@/lib/i18n";
import { setMuted } from "@/lib/sound";

export interface Toast {
  id: string;
  kind: "success" | "error" | "info";
  message: string;
}

interface UIState {
  theme: "dark" | "light";
  sound: boolean;
  localeHint: Locale | null;
  mutedUsers: string[];
  toasts: Toast[];
  toggleTheme: () => void;
  setTheme: (t: "dark" | "light") => void;
  setSound: (s: boolean) => void;
  toggleMuteUser: (id: string) => void;
  pushToast: (kind: Toast["kind"], message: string) => void;
  dismissToast: (id: string) => void;
}

function applyTheme(theme: "dark" | "light") {
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.dataset.theme = theme;
  }
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      sound: true,
      localeHint: null,
      mutedUsers: [],
      toasts: [],
      toggleTheme: () => {
        const next = get().theme === "dark" ? "light" : "dark";
        set({ theme: next });
        applyTheme(next);
      },
      setTheme: (t) => {
        set({ theme: t });
        applyTheme(t);
      },
      setSound: (s) => {
        set({ sound: s });
        setMuted(!s);
      },
      toggleMuteUser: (id) =>
        set((st) => ({
          mutedUsers: st.mutedUsers.includes(id)
            ? st.mutedUsers.filter((u) => u !== id)
            : [...st.mutedUsers, id],
        })),
      pushToast: (kind, message) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        set((st) => ({ toasts: [...st.toasts.slice(-4), { id, kind, message }] }));
        window.setTimeout(() => get().dismissToast(id), 4200);
      },
      dismissToast: (id) => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })),
    }),
    {
      name: "pk-ui",
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyTheme(state.theme);
          setMuted(!state.sound);
        }
      },
    },
  ),
);
