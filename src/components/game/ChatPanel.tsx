"use client";

import React, { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";
import { useUIStore } from "@/stores/ui-store";
import type { ChatMessage, GameSnapshot } from "@/game/types";

const QUICK = ["chat.quick1", "chat.quick2", "chat.quick3", "chat.quick4"] as const;

export function ChatPanel({
  messages, snapshot, onSend,
}: {
  messages: ChatMessage[];
  snapshot: GameSnapshot;
  onSend: (body: string, kind?: "user" | "quick") => Promise<void>;
}) {
  const { t } = useI18n();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutedUsers = useUIStore((s) => s.mutedUsers);
  const toggleMuteUser = useUIStore((s) => s.toggleMuteUser);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const send = async (text: string, kind: "user" | "quick" = "user") => {
    if (!text.trim()) return;
    setError(null);
    try {
      await onSend(text, kind);
      setBody("");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const visible = messages.filter((m) => !(m.sender_user_id && mutedUsers.includes(m.sender_user_id)));

  return (
    <div className="flex h-full flex-col gap-2" aria-label={t("chat.title")}>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2 text-sm" role="log" aria-live="polite">
        {visible.length === 0 && <p className="text-xs text-white/40">{t("chat.empty")}</p>}
        {visible.map((m) => (
          <div key={m.id} className={`mb-1.5 ${m.kind === "system" ? "text-center" : ""}`}>
            {m.kind === "system" ? (
              <span className="text-xs text-amber-300/90">— {m.body} —</span>
            ) : (
              <div className="group flex items-baseline gap-1.5">
                <span className="shrink-0 text-xs font-extrabold text-gold">{m.sender_name}:</span>
                <span className="min-w-0 break-words">{m.body}</span>
                {m.sender_user_id && m.sender_user_id !== snapshot.me?.user_id && (
                  <button
                    className="ms-auto hidden shrink-0 rounded px-1 text-[10px] text-white/50 hover:text-white group-hover:inline"
                    onClick={() => toggleMuteUser(m.sender_user_id as string)}
                    title={t("chat.mute")}
                  >
                    🔕
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1">
        {QUICK.map((q, i) => (
          <button
            key={q}
            onClick={() => void send(t(q), "quick")}
            className="rounded-full border border-white/15 px-2 py-0.5 text-xs hover:bg-white/10"
          >
            {["👍", "😄", "⏳", "😱"][i]}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(body);
        }}
        className="flex gap-2"
      >
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("chat.placeholder")}
          className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm"
          maxLength={300}
          aria-label={t("chat.placeholder")}
        />
        <Button size="sm" type="submit" disabled={!body.trim()}>
          {t("chat.send")}
        </Button>
      </form>
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}
