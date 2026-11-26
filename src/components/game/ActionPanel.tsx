"use client";

import React, { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";
import { formatMoney, formatTime } from "@/lib/utils";
import { tileAt } from "@/game/board";
import type { GameSnapshot } from "@/game/types";

interface Props {
  snapshot: GameSnapshot;
  secondsLeft: number | null;
  onAction: (name: string, args?: Record<string, unknown>) => Promise<string | null>;
  onOpenManage: () => void;
  onOpenTrade: () => void;
  onConfirm: (message: string, confirmLabel: string, danger: boolean, run: () => Promise<string | null>) => void;
}

/** شريط الإجراءات السياقي حسب طور الدور */
export function ActionPanel({ snapshot, secondsLeft, onAction, onOpenManage, onOpenTrade, onConfirm }: Props) {
  const { t, locale } = useI18n();
  const game = snapshot.game;
  const me = snapshot.players.find((p) => p.seat === snapshot.me?.seat);
  const isMyTurn = snapshot.me?.seat != null && game.current_seat === snapshot.me.seat && game.status === "active";
  const [bidAmount, setBidAmount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (snapshot.auction) {
      setBidAmount(snapshot.auction.current_bid + snapshot.auction.min_increment);
    } else {
      setBidAmount(null);
    }
  }, [snapshot.auction?.id, snapshot.auction?.current_bid, snapshot.auction]);

  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    const err = await fn();
    setBusy(false);
    return err;
  };

  const tile = tileAt(me?.position ?? 0);

  const timerWarning = secondsLeft != null && secondsLeft <= 10 && secondsLeft > 0;

  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-surface p-3" aria-label="actions">
      <div className="flex items-center justify-between text-sm">
        <span className="font-extrabold">
          {isMyTurn ? (
            <span className="text-gold">▶ {t("game.your_turn")}</span>
          ) : (
            <span>
              {t("game.current_turn")}:{" "}
              <strong className="text-gold">{snapshot.players.find((p) => p.seat === game.current_seat)?.name ?? "—"}</strong>
            </span>
          )}
        </span>
        <span
          className={`rounded-lg px-2 py-0.5 font-mono text-sm font-bold ${
            timerWarning ? "animate-pulse bg-rose-600/80 text-white" : "bg-white/10"
          }`}
          aria-live="off"
        >
          {secondsLeft != null ? formatTime(secondsLeft) : "—"}
        </span>
      </div>

      {isMyTurn && game.status === "active" && (
        <>
          {game.turn_phase === "awaiting_roll" && (
            <Button size="lg" disabled={busy} onClick={() => void run(() => onAction("rollDice"))}>
              🎲 {t("game.roll")}
            </Button>
          )}

          {game.turn_phase === "awaiting_property_decision" && (
            <div className="flex gap-2">
              <Button className="flex-1" disabled={busy} onClick={() => void run(() => onAction("buyProperty"))}>
                🏠 {t("game.buy")} ({formatMoney(tile.price ?? 0, locale)})
              </Button>
              <Button variant="secondary" className="flex-1" disabled={busy} onClick={() => void run(() => onAction("declineProperty"))}>
                ✋ {t("game.decline")}
              </Button>
            </div>
          )}

          {game.turn_phase === "awaiting_detention_choice" && (
            <div className="flex flex-col gap-2">
              <div className="rounded-xl bg-rose-950/50 border border-rose-500/40 p-2 text-sm font-bold text-rose-200">
                🚔 {t("game.detention_title")} — {me?.detention_turns} {t("game.detention_turns_left")}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={busy || (me?.cash ?? 0) < game.settings.detention_fee}
                  onClick={() => void run(() => onAction("payToLeave"))}>
                  💰 {t("game.detention_pay")} ({formatMoney(game.settings.detention_fee, locale)})
                </Button>
                <Button variant="secondary" disabled={busy || (me?.exit_cards ?? 0) < 1}
                  onClick={() => void run(() => onAction("useExitCard"))}>
                  🎟️ {t("game.detention_card")} ({me?.exit_cards ?? 0})
                </Button>
                <Button disabled={busy} onClick={() => void run(() => onAction("rollDice"))}>
                  🎲 {t("game.detention_roll")}
                </Button>
              </div>
            </div>
          )}

          {game.turn_phase === "auction_active" && snapshot.auction && (
            <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/20 p-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-bold">🔨 {t("game.auction_for")} {tile.name_ar}</span>
                <span>
                  {t("game.current_bid")}:{" "}
                  <strong className="text-gold">
                    {snapshot.auction.current_bidder_seat != null
                      ? formatMoney(snapshot.auction.current_bid, locale)
                      : t("game.no_bids")}
                  </strong>
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  className="w-28 rounded-lg border border-white/20 bg-black/30 px-2 py-1.5 text-sm"
                  value={bidAmount ?? ""}
                  min={snapshot.auction.current_bid + snapshot.auction.min_increment}
                  max={me?.cash ?? 0}
                  aria-label={t("game.bid")}
                  onChange={(e) => setBidAmount(Number(e.target.value))}
                />
                <Button
                  className="flex-1"
                  disabled={busy || !me || (me.debt_amount > 0) || (bidAmount ?? 0) > (me?.cash ?? 0)}
                  onClick={() => void run(() => onAction("bid", { amount: bidAmount ?? 0 })) as unknown as Promise<string | null>}
                >
                  🔨 {t("game.bid")}
                </Button>
              </div>
            </div>
          )}

          {game.turn_phase === "awaiting_debt" && me && (
            <div className="flex flex-col gap-2 rounded-xl border border-rose-500/40 bg-rose-950/40 p-2.5">
              <div className="text-sm font-extrabold text-rose-200">
                ⚠ {t("game.debt_title")} — {t("game.debt_amount")}: {formatMoney(me.debt_amount, locale)}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="success" disabled={busy || me.cash < me.debt_amount}
                  onClick={() => void run(() => onAction("settleDebt"))}>
                  ✅ {t("game.debt_settle")}
                </Button>
                <Button variant="secondary" onClick={onOpenManage}>
                  🏗️ {t("game.debt_manage")}
                </Button>
                <Button variant="danger"
                  onClick={() =>
                    onConfirm(t("game.confirm_bankruptcy"), t("game.declare_bankruptcy"), true, () =>
                      onAction("declareBankruptcy"),
                    )
                  }
                >
                  💀 {t("game.declare_bankruptcy")}
                </Button>
              </div>
            </div>
          )}

          {game.turn_phase === "awaiting_end_turn" && (
            <div className="flex flex-wrap gap-2">
              <Button className="flex-1" size="lg" disabled={busy} onClick={() => void run(() => onAction("endTurn"))}>
                ⏭ {t("game.end_turn")}
                {game.extra_turn && <span className="text-xs">⚡{t("game.doubles")}</span>}
              </Button>
              <Button variant="secondary" onClick={onOpenManage}>🏗️ {t("game.manage")}</Button>
              <Button variant="secondary" onClick={onOpenTrade}>🤝 {t("game.trade")}</Button>
            </div>
          )}

          {game.turn_phase === "awaiting_roll" && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={onOpenManage}>🏗️ {t("game.manage")}</Button>
              <Button variant="secondary" size="sm" onClick={onOpenTrade}>🤝 {t("game.trade")}</Button>
            </div>
          )}
        </>
      )}

      {snapshot.my_trades.some((o) => o.status === "pending" && o.to_seat === snapshot.me?.seat) && (
        <button onClick={onOpenTrade} className="animate-pulse rounded-xl border border-emerald-500/50 bg-emerald-900/40 px-3 py-2 text-sm font-bold text-emerald-100">
          🤝 {t("game.pending_offers")}!
        </button>
      )}
    </section>
  );
}
