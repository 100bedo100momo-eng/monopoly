"use client";

import { create } from "zustand";
import type { ChatMessage, GameSnapshot } from "@/game/types";

export type ConnectionState = "connected" | "reconnecting" | "offline";

interface GameStoreState {
  snapshot: GameSnapshot | null;
  chat: ChatMessage[];
  presence: Record<string, { name: string; onlineAt: string }>;
  connection: ConnectionState;
  lastActionError: string | null;
  setSnapshot: (s: GameSnapshot | null) => void;
  addChat: (m: ChatMessage) => void;
  setChat: (m: ChatMessage[]) => void;
  setPresence: (p: Record<string, { name: string; onlineAt: string }>) => void;
  setConnection: (c: ConnectionState) => void;
  setActionError: (e: string | null) => void;
  reset: () => void;
}

export const useGameStore = create<GameStoreState>((set) => ({
  snapshot: null,
  chat: [],
  presence: {},
  connection: "connected",
  lastActionError: null,
  setSnapshot: (s) => set({ snapshot: s }),
  addChat: (m) => set((st) => ({ chat: [...st.chat.filter((c) => c.id !== m.id), m] })),
  setChat: (m) => set({ chat: m }),
  setPresence: (p) => set({ presence: p }),
  setConnection: (c) => set({ connection: c }),
  setActionError: (e) => set({ lastActionError: e }),
  reset: () => set({ snapshot: null, chat: [], presence: {}, connection: "connected", lastActionError: null }),
}));
