"use client";

import React, { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useGameRoom } from "@/hooks/use-game-room";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { tileById } from "@/game/board";
import { formatMoney } from "@/lib/utils";
import { firstSupabaseError } from "@/lib/utils";

export default function ResultsPage() {
  const params = useParams<{ code: string }>();
  const code = (params?.code ?? "").toUpperCase();
  const { t, locale } = useI18n();
  const router = useRouter();
    const { snapshot, loading, error } = useGameRoom(code, true);

  const ranking = useMemo(() => {
    if (!snapshot) return [];
    const worth = (seat: number) => {
      const p = snapshot.players.find((x) => x.seat === seat);
      if (!p) return 0;
      return (
        p.cash +
        snapshot.properties
          .filter((pr) => pr.owner_seat === seat)
          .reduce((sum, pr) => {
            const tile = tileById(pr.tile_id);
            if (!tile?.price) return sum;
            return sum + (pr.is_mortgaged ? (tile.mortgage_value ?? 0) : tile.price + (tile.build_cost ?? 0) * pr.buildings);
          }, 0)
      );
    };
    return [...snapshot.players]
      .map((p) => ({ p, worth: worth(p.seat), props: snapshot.properties.filter((pr) => pr.owner_seat === p.seat) }))
      .sort((a, b) => (b.p.is_bankrupt ? -1 : 1) - (a.p.is_bankrupt ? -1 : 1) || b.worth - a.worth);
  }, [snapshot]);

  if (loading && !snapshot) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <Skeleton className="h-64 w-full" />
      </main>
    );
  }

  if (error || !snapshot) {
    return (
      <main className="mx-auto max-w-2xl p-6 text-center">
        <p className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-4 font-bold">{firstSupabaseError(error ?? "", t)}</p>
        <Button className="mt-4" onClick={() => router.push("/rooms")}>{t("nav.rooms")}</Button>
      </main>
    );
  }

  const winner = snapshot.players.find((p) => p.seat === snapshot.game.winner_seat);
  const finished = snapshot.game.status === "finished";
  const durationMinutes = snapshot.game.finished_at && snapshot.game.started_at
    ? Math.max(0, Math.round((new Date(snapshot.game.finished_at).getTime() - new Date(snapshot.game.started_at).getTime()) / 60000))
    : 0;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 p-4">
      <header className="text-center">
        <div className="text-6xl">{finished ? "🏆" : "⏳"}</div>
        <h1 className="mt-1 text-2xl font-extrabold text-gold">{t("results.title")}</h1>
        {winner && (
          <p className="mt-2 text-lg">
            {t("results.winner")}:{" "}
            <strong style={{ color: winner.color }}>{winner.token} {winner.name}</strong>
          </p>
        )}
        {!finished && <p className="mt-1 text-sm text-white/60">{t("app.loading")}</p>}
      </header>

      <section className="flex flex-col gap-2">
        {ranking.map((row, i) => (
          <div
            key={row.p.seat}
            className={`flex items-center gap-3 rounded-2xl border p-3 ${
              row.p.seat === snapshot.game.winner_seat ? "border-gold bg-gold/10" : "border-white/10 bg-surface"
            } ${row.p.is_bankrupt ? "opacity-60" : ""}`}
          >
            <span className="w-7 text-center text-lg font-extrabold text-white/60">{i + 1}</span>
            <span className="flex h-10 w-10 items-center justify-center rounded-full text-lg" style={{ backgroundColor: row.p.color }}>
              {row.p.token}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-extrabold">{row.p.name}{row.p.bot_level ? " 🤖" : ""}</div>
              <div className="text-xs text-white/60">
                {t("results.final_cash")}: {formatMoney(row.p.cash, locale)} · {t("results.properties_owned")}: {row.props.length}
              </div>
            </div>
            <div className="text-end">
              <div className="text-xs text-white/50">{t("results.net_worth")}</div>
              <div className="font-extrabold text-gold">{formatMoney(row.worth, locale)}</div>
            </div>
          </div>
        ))}
      </section>

      {finished && (
        <div className="grid grid-cols-2 gap-2 text-center text-sm">
          <div className="rounded-xl border border-white/10 bg-surface p-2">
            <div className="text-white/60">{t("results.duration")}</div>
            <div className="font-extrabold">{durationMinutes} {locale === "ar" ? "دقيقة" : "min"}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-surface p-2">
            <div className="text-white/60">{t("results.rounds")}</div>
            <div className="font-extrabold">{snapshot.game.round_number}</div>
          </div>
        </div>
      )}

      {snapshot.me?.is_host && finished && (
        <Button size="lg" onClick={() => router.push(`/rooms/${snapshot.room.code}`)}>
          🔁 {t("results.play_again")}
        </Button>
      )}
      <Button variant="secondary" onClick={() => router.push(`/rooms/${snapshot.room.code}`)}>
        🚪 {t("results.back_lobby")}
      </Button>
    </main>
  );
}
