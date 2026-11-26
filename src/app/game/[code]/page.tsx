"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useGameRoom } from "@/hooks/use-game-room";
import { useUIStore } from "@/stores/ui-store";
import BoardCanvas from "@/components/game/BoardCanvas";
import { PlayersPanel } from "@/components/game/PlayersPanel";
import { ActionPanel } from "@/components/game/ActionPanel";
import { PropertyModal } from "@/components/game/PropertyModal";
import { ManageDialog } from "@/components/game/ManageDialog";
import { TradeDialog } from "@/components/game/TradeDialog";
import { ChatPanel } from "@/components/game/ChatPanel";
import { EventLog } from "@/components/game/EventLog";
import { ConnectionBadge } from "@/components/ui/StatusBadge";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { LanguageToggle, SoundToggle, ThemeToggle } from "@/components/ui/Toggles";
import { firstSupabaseError } from "@/lib/utils";
import { startBotDriver, stopBotDriver } from "@/bots/driver";
import type { GameSnapshot } from "@/game/types";

type PanelTab = "events" | "chat";

export default function GamePage() {
  const params = useParams<{ code: string }>();
  const code = (params?.code ?? "").toUpperCase();
  const { t } = useI18n();
  const router = useRouter();
    const pushToast = useUIStore((s) => s.pushToast);

  const { snapshot, error, chat, connection, secondsLeft, actions } = useGameRoom(code);

  const [selectedTile, setSelectedTile] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [tab, setTab] = useState<PanelTab>("events");
  const [confirmState, setConfirmState] = useState<{ message: string; label: string; run: () => Promise<string | null> } | null>(null);

  const isHost = !!snapshot?.me?.is_host;

  // مشغّل البوتات يعمل لدى المضيف فقط
  const snapshotRef = useRef<GameSnapshot | null>(null);
  useEffect(() => {
    snapshotRef.current = snapshot;
  });

  useEffect(() => {
    if (!snapshot || !isHost) return;
    startBotDriver({
      snapshot: () => snapshotRef.current,
      isHost: () => true,
      onActionError: (c) => pushToast("error", firstSupabaseError(c, t)),
    }, 1800);
    return () => stopBotDriver();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, snapshot?.game.id]);

  // توجيه إلى النتائج عند انتهاء المباراة
  useEffect(() => {
    if (snapshot?.game.status === "finished") {
      const timer = setTimeout(() => router.push(`/results/${code}`), 1800);
      return () => clearTimeout(timer);
    }
  }, [snapshot?.game.status, router, code]);

  const handleAction = useCallback(
    async (name: string, args: Record<string, unknown> = {}): Promise<string | null> => {
      const fn = (actions as unknown as Record<string, (a?: Record<string, unknown>) => Promise<string | null>>)[name];
      if (!fn) return null;
      const err = await fn(args);
      if (err) pushToast("error", firstSupabaseError(err, t));
      return err;
    },
    [actions, pushToast, t],
  );

  const leaveGame = useCallback(() => {
    setConfirmState({
      message: t("game.confirm_leave"),
      label: t("game.leave_game"),
      run: async () => {
        const err = await handleAction("leaveGame");
        if (!err) router.push(`/rooms/${code}`);
        return err;
      },
    });
  }, [handleAction, router, code, t]);

  if (!snapshot) {
    return (
      <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-4">
        {error ? (
          <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-4 text-center text-sm font-bold">
            {firstSupabaseError(error, t)}
            <div className="mt-3"><Button onClick={() => router.push("/rooms")}>{t("nav.rooms")}</Button></div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="mx-auto aspect-square w-full max-w-[660px]" />
            <div className="grid gap-4 lg:grid-cols-3">
              <Skeleton className="h-40" />
              <Skeleton className="h-40" />
              <Skeleton className="h-40" />
            </div>
          </div>
        )}
      </main>
    );
  }

  const current = snapshot.players.find((p) => p.seat === snapshot.game.current_seat);

  return (
    <main className="mx-auto flex min-h-screen max-w-[1500px] flex-col gap-3 p-3">
      {/* الترويسة */}
      <header className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-surface px-3 py-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={leaveGame}>🚪</Button>
          <div>
            <div className="text-sm font-extrabold text-gold">{snapshot.room.name}</div>
            <div className="text-xs text-white/60">
              {t("game.round")} {snapshot.game.round_number} · {t("game.turn_no")} {snapshot.game.turn_number}
              {snapshot.game.extra_turn && <span className="ms-1 text-emerald-300">⚡{t("game.doubles")}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ConnectionBadge
            state={connection}
            label={connection === "connected" ? t("game.connected") : connection === "reconnecting" ? t("game.reconnecting") : t("game.offline")}
          />
          <LanguageToggle />
          <ThemeToggle />
          <SoundToggle />
        </div>
      </header>

      <div className="grid gap-3 lg:grid-cols-[280px_1fr_320px]">
        {/* يسار: اللاعبون */}
        <aside className="order-2 flex flex-col gap-3 lg:order-1">
          <h2 className="text-sm font-extrabold text-gold">{t("game.players")}</h2>
          <PlayersPanel snapshot={snapshot} />
        </aside>

        {/* الوسط: اللوحة + الإجراءات */}
        <section className="order-1 flex flex-col gap-3 lg:order-2">
          <BoardCanvas snapshot={snapshot} onSelectTile={(id) => setSelectedTile(id)} />
          <ActionPanel
            snapshot={snapshot}
            secondsLeft={secondsLeft}
            onAction={handleAction}
            onOpenManage={() => setManageOpen(true)}
            onOpenTrade={() => setTradeOpen(true)}
            onConfirm={(message, label, _danger, run) => setConfirmState({ message, label, run })}
          />
          {snapshot.me?.seat != null && snapshot.game.current_seat === snapshot.me.seat && snapshot.game.status === "active" && (
            <p className="text-center text-xs text-white/50">💡 {t("game.your_turn_hint")}</p>
          )}
        </section>

        {/* يمين: السجل والدردشة */}
        <aside className="order-3 flex min-h-[320px] flex-col gap-2 lg:min-h-0">
          <div className="flex gap-2" role="tablist">
            <button
              role="tab"
              aria-selected={tab === "events"}
              onClick={() => setTab("events")}
              className={`rounded-xl px-3 py-1.5 text-sm font-bold ${tab === "events" ? "bg-gold text-navy-900" : "bg-white/5"}`}
            >
              📜 {t("game.events")}
            </button>
            <button
              role="tab"
              aria-selected={tab === "chat"}
              onClick={() => setTab("chat")}
              className={`rounded-xl px-3 py-1.5 text-sm font-bold ${tab === "chat" ? "bg-gold text-navy-900" : "bg-white/5"}`}
            >
              💬 {t("chat.title")}
            </button>
          </div>
          <div className="min-h-[280px] flex-1 lg:min-h-0">
            {tab === "events" ? <EventLog snapshot={snapshot} /> : <ChatPanel messages={chat} snapshot={snapshot} onSend={actions.sendChat} />}
          </div>
        </aside>
      </div>

      {/* الجوال: تبويبات سفلية */}
      <div className="grid grid-cols-2 gap-3 lg:hidden">
        <button
          onClick={() => setTab("events")}
          className="rounded-xl border border-white/15 px-3 py-2 text-sm font-bold lg:hidden"
        >
          📜 {t("game.events")}
        </button>
        <button
          onClick={() => setTab("chat")}
          className="rounded-xl border border-white/15 px-3 py-2 text-sm font-bold lg:hidden"
        >
          💬 {t("chat.title")}
        </button>
      </div>

      {/* النوافذ */}
      {selectedTile && (
        <PropertyModal tileId={selectedTile} snapshot={snapshot} onClose={() => setSelectedTile(null)} onAction={handleAction} />
      )}
      {manageOpen && <ManageDialog open snapshot={snapshot} onClose={() => setManageOpen(false)} onAction={handleAction} />}
      {tradeOpen && <TradeDialog open snapshot={snapshot} onClose={() => setTradeOpen(false)} onAction={handleAction} />}
      <ConfirmDialog
        open={confirmState != null}
        title={t("confirm")}
        message={confirmState?.message ?? ""}
        confirmLabel={confirmState?.label ?? ""}
        danger
        onCancel={() => setConfirmState(null)}
        onConfirm={() => {
          const run = confirmState?.run;
          setConfirmState(null);
          if (run) void run().then((err) => err && pushToast("error", firstSupabaseError(err, t)));
        }}
      />
      {current && snapshot.game.status === "finished" && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
          <div className="rounded-2xl border border-gold/40 bg-surface p-8 text-center">
            <div className="text-5xl">🏆</div>
            <div className="mt-2 text-xl font-extrabold text-gold">{t("results.title")}</div>
          </div>
        </div>
      )}
    </main>
  );
}
