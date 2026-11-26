"use client";

import React from "react";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/utils";
import { useGameStore } from "@/stores/game-store";
import type { GameSnapshot, SnapshotPlayer } from "@/game/types";
import { tileById } from "@/game/board";

export function PlayersPanel({ snapshot }: { snapshot: GameSnapshot }) {
  const { t, locale } = useI18n();
  const presence = useGameStore((s) => s.presence);

  return (
    <div className="flex flex-col gap-2" aria-label={t("game.players")}>
      {snapshot.players.map((p) => (
        <PlayerCard
          key={p.seat}
          p={p}
          isCurrent={snapshot.game.current_seat === p.seat && snapshot.game.status === "active"}
          isMe={snapshot.me?.seat === p.seat}
          isHost={snapshot.room.host_id === p.user_id}
          online={p.user_id ? !!presence[p.user_id] : true}
          netWorth={p.cash + snapshot.properties
            .filter((pr) => pr.owner_seat === p.seat)
            .reduce((sum, pr) => {
              const tile = tileById(pr.tile_id);
              if (!tile?.price) return sum;
              return sum + (pr.is_mortgaged ? (tile.mortgage_value ?? 0) : tile.price + (tile.build_cost ?? 0) * pr.buildings);
            }, 0)}
          debt={p.debt_amount}
          locale={locale}
        />
      ))}
    </div>
  );
}

function PlayerCard({
  p, isCurrent, isMe, isHost, online, netWorth, debt, locale,
}: {
  p: SnapshotPlayer;
  isCurrent: boolean;
  isMe: boolean;
  isHost: boolean;
  online: boolean;
  netWorth: number;
  debt: number;
  locale: "ar" | "en";
}) {
  const { t } = useI18n();
  return (
    <div
      className={`rounded-xl border p-2.5 transition ${
        isCurrent ? "border-gold bg-gold/10 shadow-[0_0_14px_rgba(245,197,66,0.25)]" : "border-white/10 bg-surface"
      } ${p.is_bankrupt ? "opacity-50 grayscale" : ""}`}
      aria-current={isCurrent ? "true" : undefined}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base"
          style={{ backgroundColor: p.color, boxShadow: isCurrent ? "0 0 0 2px #f5c542" : undefined }}
          aria-label={p.name}
        >
          {p.token}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 truncate text-sm font-extrabold">
            {p.name}
            {isMe && <span className="text-[10px] text-gold">({t("nav.profile")})</span>}
            {isHost && <span title="host">👑</span>}
            {p.bot_level && (
              <span className="rounded bg-white/10 px-1 text-[10px]">🤖 {p.bot_level}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-white/70">
            <span>{formatMoney(p.cash, locale)}</span>
            <span aria-hidden>·</span>
            <span title={t("game.net_worth")}>≈{formatMoney(netWorth, locale)}</span>
            {p.exit_cards > 0 && <span title={t("game.exit_cards")}>🎟️×{p.exit_cards}</span>}
            {p.in_detention && <span className="text-rose-400" title={t("game.in_detention")}>🚔</span>}
            {p.is_bankrupt && <span className="text-rose-400">{t("game.bankrupt")}</span>}
            {!online && !p.is_bankrupt && <span className="text-amber-400">⚠</span>}
            {debt > 0 && <span className="font-bold text-rose-400">{formatMoney(debt, locale)} ⚠</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
