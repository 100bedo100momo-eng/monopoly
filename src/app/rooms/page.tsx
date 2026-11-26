"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { getSupabase, IS_SUPABASE_CONFIGURED } from "@/lib/supabase";
import { PublicRoomSchema, type PublicRoom } from "@/game/types";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

export default function RoomsListPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [rooms, setRooms] = useState<PublicRoom[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: rpcError } = await getSupabase().rpc("get_public_rooms");
    if (rpcError) {
      setError(rpcError.message);
      setRooms([]);
      return;
    }
    setRooms((data ?? []).map((r: unknown) => PublicRoomSchema.parse(r)));
  }, []);

  useEffect(() => {
    if (!IS_SUPABASE_CONFIGURED) {
      setError("NOT_CONFIGURED");
      setRooms([]);
      return;
    }
    void load();
    const int = setInterval(() => void load(), 10_000);
    return () => clearInterval(int);
  }, [load]);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-gold">🏛️ {t("rooms.title")}</h1>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => void load()}>{t("rooms.refresh")}</Button>
          <Button size="sm" onClick={() => router.push("/")}>+ {t("nav.create")}</Button>
        </div>
      </header>

      {error === "NOT_CONFIGURED" && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/40 p-4 text-sm font-bold text-amber-200">
          {t("login.not_configured")}
        </div>
      )}
      {error && error !== "NOT_CONFIGURED" && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-4 text-sm">{t("error.generic")} ({error})</div>
      )}

      {rooms === null ? (
        <div className="flex flex-col gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : rooms.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-surface p-6 text-center text-sm text-white/70">{t("rooms.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rooms.map((room) => (
            <li key={room.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-surface p-3">
              <div>
                <div className="font-extrabold">{room.name}</div>
                <div className="text-xs text-white/60">
                  {t("rooms.host")}: {room.host_name ?? "—"} · {t("lobby.code")}: <strong className="text-gold">{room.code}</strong>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${room.status === "playing" ? "bg-emerald-900/60 text-emerald-200" : "bg-white/10"}`}>
                  {room.status === "playing" ? t("rooms.in_game") : t("rooms.in_lobby")}
                </span>
                <span className="text-xs">👥 {room.players_count}/{room.max_players}</span>
                <span className="rounded bg-white/10 px-2 py-1 text-xs">{room.mode}</span>
                <Button
                  size="sm"
                  variant={room.status === "playing" ? "secondary" : "primary"}
                  onClick={() => router.push(`/rooms/${room.code}`)}
                >
                  {room.status === "playing" ? t("rooms.watch") : t("rooms.join")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
