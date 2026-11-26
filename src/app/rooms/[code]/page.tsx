"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useRoom } from "@/hooks/use-room";
import { useAuth } from "@/hooks/use-auth";
import { useUIStore } from "@/stores/ui-store";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Modal } from "@/components/ui/Modal";
import { ChatPanel } from "@/components/game/ChatPanel";
import { ConnectionBadge } from "@/components/ui/StatusBadge";
import { LanguageToggle, SoundToggle, ThemeToggle } from "@/components/ui/Toggles";
import { PLAYER_COLORS, PLAYER_TOKENS, BOT_LEVELS, DEFAULT_SETTINGS, type RoomSettings } from "@/game/types";
import { firstSupabaseError } from "@/lib/utils";

const MODE_PRESETS: Record<"classic" | "fast" | "custom", Partial<RoomSettings>> = {
  classic: {},
  fast: { starting_cash: 2500, round_limit: 15, time_limit_minutes: 30, win_condition: "round_limit", go_bonus: 300, turn_seconds: 45 },
  custom: {},
};

export default function LobbyPage() {
  const params = useParams<{ code: string }>();
  const code = (params?.code ?? "").toUpperCase();
  const { t, locale } = useI18n();
  const router = useRouter();
  const auth = useAuth();
  const pushToast = useUIStore((s) => s.pushToast);
  const { snapshot, chat, connection, loading, error, act, sendChat } = useRoom(code);

  const [joinColor, setJoinColor] = useState<string | null>(null);
  const [joinToken, setJoinToken] = useState<string | null>(null);
  const [joinBusy, setJoinBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftSettings, setDraftSettings] = useState<RoomSettings>(DEFAULT_SETTINGS);
  const [copied, setCopied] = useState(false);

  // إعادة توجيه إلى المباراة عند بدئها
  useEffect(() => {
    if (snapshot?.room.status === "playing" && snapshot?.room.current_game_id) {
      router.push(`/game/${snapshot.room.code}`);
    }
  }, [snapshot?.room.status, snapshot?.room.current_game_id, snapshot?.room.code, router]);

  useEffect(() => {
    if (snapshot?.room.settings) setDraftSettings(snapshot.room.settings);
  }, [snapshot?.room.id, snapshot?.room.settings]);

  // اختيار أول لون/قطعة متاحة
  useEffect(() => {
    if (!snapshot || joinColor) return;
    const takenColors = new Set(snapshot.players.filter((p) => p.role === "player").map((p) => p.color));
    const takenTokens = new Set(snapshot.players.filter((p) => p.role === "player").map((p) => p.token));
    setJoinColor(PLAYER_COLORS.find((c) => !takenColors.has(c)) ?? null);
    setJoinToken(PLAYER_TOKENS.find((tok) => !takenTokens.has(tok)) ?? null);
  }, [snapshot, joinColor]);

  const join = async (asSpectator = false) => {
    setJoinBusy(true);
    const err = await act("join_room", {
      p_code: code,
      p_color: joinColor,
      p_token: joinToken,
      p_as_spectator: asSpectator,
    });
    setJoinBusy(false);
    if (err) pushToast("error", firstSupabaseError(err, t));
  };

  if (loading && !snapshot) {
    return (
      <main className="mx-auto max-w-3xl p-4"><Skeleton className="h-72 w-full" /></main>
    );
  }

  if (error || !snapshot) {
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <p className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-4 font-bold">{firstSupabaseError(error ?? "", t)}</p>
        <Button className="mt-4" onClick={() => router.push("/rooms")}>{t("nav.rooms")}</Button>
      </main>
    );
  }

  const room = snapshot.room;
  const me = snapshot.me;
  const players = snapshot.players.filter((p) => p.role === "player");
  const spectators = snapshot.players.filter((p) => p.role === "spectator");
  const allReady = players.every((p) => p.is_ready);
  const seatsFree = room.max_players - players.length;

  // شاشة الانضمام لغير الأعضاء
  if (!me) {
    const canPlay = room.status === "lobby" && seatsFree > 0;
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-4">
        <div className="rounded-2xl border border-white/10 bg-surface p-5 text-center">
          <div className="text-3xl">🏛️</div>
          <h1 className="mt-1 text-xl font-extrabold text-gold">{room.name}</h1>
          <p className="mt-1 text-sm text-white/60">
            {t("lobby.code")}: <strong className="text-gold tracking-widest">{room.code}</strong> · {players.length}/{room.max_players}
          </p>
          {canPlay && (
            <>
              <div className="mt-4 grid grid-cols-6 gap-2" role="group" aria-label="color">
                {PLAYER_COLORS.map((c) => {
                  const taken = players.some((p) => p.color === c);
                  return (
                    <button
                      key={c}
                      disabled={taken}
                      onClick={() => setJoinColor(c)}
                      aria-label={`color ${c}`}
                      aria-pressed={joinColor === c}
                      className={`h-8 w-8 rounded-full ${taken ? "opacity-25 grayscale" : ""} ${joinColor === c ? "ring-2 ring-white" : ""}`}
                      style={{ backgroundColor: c }}
                    />
                  );
                })}
              </div>
              <div className="mt-3 grid grid-cols-6 gap-2" role="group" aria-label="token">
                {PLAYER_TOKENS.map((tok) => {
                  const taken = players.some((p) => p.token === tok);
                  return (
                    <button
                      key={tok}
                      disabled={taken}
                      onClick={() => setJoinToken(tok)}
                      aria-label={`token ${tok}`}
                      aria-pressed={joinToken === tok}
                      className={`rounded-xl border p-1.5 text-xl ${taken ? "opacity-25 grayscale" : ""} ${joinToken === tok ? "border-gold bg-gold/10" : "border-white/15"}`}
                    >
                      {tok}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <div className="mt-5 flex flex-col gap-2">
            {canPlay && (
              <Button size="lg" disabled={joinBusy || !joinColor || !joinToken} onClick={() => void join(false)}>
                🎮 {t("rooms.join")}
              </Button>
            )}
            <Button variant="secondary" disabled={joinBusy} onClick={() => void join(true)}>
              👀 {t("lobby.spectate")}
            </Button>
          </div>
          {!auth.session && (
            <p className="mt-3 text-xs text-amber-300/80">{t("login.guest.hint")}</p>
          )}
        </div>
      </main>
    );
  }

  const isHost = me.is_host;

  const updateSetting = (patch: Partial<RoomSettings>) =>
    setDraftSettings((s) => ({ ...s, ...patch }));

  const saveSettings = async () => {
    const err = await act("update_room", {
      p_room: room.id,
      p_settings: draftSettings,
    });
    if (err) pushToast("error", firstSupabaseError(err, t));
    else {
      setSettingsOpen(false);
      pushToast("success", t("profile.saved"));
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-surface p-3">
        <div>
          <h1 className="text-lg font-extrabold text-gold">🏛️ {room.name}</h1>
          <div className="text-xs text-white/60">
            {t("lobby.code")}: <strong className="text-gold tracking-widest">{room.code}</strong> · {room.is_public ? t("lobby.public") : t("lobby.private")}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ConnectionBadge state={connection} label={connection === "connected" ? t("game.connected") : connection === "reconnecting" ? t("game.reconnecting") : t("game.offline")} />
          <LanguageToggle />
          <ThemeToggle />
          <SoundToggle />
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {/* المقاعد */}
        <section className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-surface p-3">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold text-gold">👥 {t("game.players")} ({players.length}/{room.max_players})</h2>
            <button
              className="rounded-lg border border-white/15 px-2 py-1 text-xs hover:bg-white/10"
              onClick={() => {
                void navigator.clipboard.writeText(`${window.location.origin}/rooms/${room.code}`);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? `✅ ${t("lobby.copied")}` : `🔗 ${t("lobby.copy_invite")}`}
            </button>
          </div>

          {players.map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-xl border border-white/10 p-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full text-lg" style={{ backgroundColor: p.color }}>
                {p.token}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-extrabold">
                  {p.name} {room.host_id === p.user_id && <span title="host">👑</span>}
                  {p.bot_level && <span className="ms-1 rounded bg-white/10 px-1 text-[10px]">🤖 {BOT_LEVELS.find((b) => b.value === p.bot_level)?.[locale === "ar" ? "label_ar" : "label_en"]}</span>}
                  {!p.user_id && <span className="ms-1 text-[10px] text-white/40">{t("seat")} {p.seat}</span>}
                </div>
                <div className="text-xs">
                  {p.is_ready ? <span className="text-emerald-300">✅ {t("lobby.ready")}</span> : <span className="text-amber-300">⏳ {t("lobby.not_ready")}</span>}
                </div>
              </div>
              {isHost && p.user_id !== auth.userId && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                    if (p.user_id) {
                      const err = await act("kick_player", { p_room: room.id, p_target_user: p.user_id });
                      if (err) pushToast("error", firstSupabaseError(err, t));
                    } else if (p.id) {
                      const err = await act("remove_bot", { p_room: room.id, p_bot_id: p.id });
                      if (err) pushToast("error", firstSupabaseError(err, t));
                    }
                  }}
                >
                  🚫 {t("lobby.kick")}
                </Button>
              )}
            </div>
          ))}

          {Array.from({ length: Math.max(0, seatsFree) }).map((_, i) => (
            <div key={i} className="flex items-center justify-center rounded-xl border border-dashed border-white/15 p-3 text-xs text-white/40">
              + {t("nav.join")}
            </div>
          ))}

          <div className="mt-1 flex flex-wrap gap-2">
            {isHost && room.settings.allow_bots && seatsFree > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {BOT_LEVELS.map((b) => (
                  <Button key={b.value} size="sm" variant="secondary" onClick={async () => {
                    const err = await act("add_bot", { p_room: room.id, p_level: b.value });
                    if (err) pushToast("error", firstSupabaseError(err, t));
                  }}>
                    {b.emoji} {t("lobby.add_bot")}: {locale === "ar" ? b.label_ar : b.label_en}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {spectators.length > 0 && (
            <p className="mt-1 text-xs text-white/50">
              👀 {t("lobby.spectators")}: {spectators.map((s) => s.name).join("، ")}
            </p>
          )}

          {/* الأزرار الرئيسية */}
          <div className="mt-2 flex flex-col gap-2">
            {me.role === "player" && (
              <Button
                variant={players.find((p) => p.user_id === auth.userId)?.is_ready ? "success" : "primary"}
                size="lg"
                onClick={async () => {
                  const current = players.find((p) => p.user_id === auth.userId)?.is_ready ?? false;
                  const err = await act("set_ready", { p_room: room.id, p_ready: !current });
                  if (err) pushToast("error", firstSupabaseError(err, t));
                }}
              >
                {players.find((p) => p.user_id === auth.userId)?.is_ready ? `✅ ${t("lobby.ready")}` : `⏳ ${t("lobby.not_ready")}`}
              </Button>
            )}
            {isHost && (
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  size="lg"
                  disabled={players.length < 2 || !allReady}
                  title={players.length < 2 ? t("lobby.needs_2") : !allReady ? t("lobby.all_ready") : ""}
                  onClick={async () => {
                    const err = await act("start_game", { p_room: room.id });
                    if (err) pushToast("error", firstSupabaseError(err, t));
                  }}
                >
                  🎮 {t("lobby.start")}
                </Button>
                <Button variant="secondary" onClick={() => setSettingsOpen(true)}>
                  ⚙️ {t("lobby.settings")}
                </Button>
              </div>
            )}
            <Button
              variant="ghost"
              onClick={async () => {
                const err = await act("leave_room", { p_room: room.id });
                if (!err) router.push("/");
              }}
            >
              🚪 {t("lobby.leave")}
            </Button>
          </div>
          {!isHost && <p className="text-center text-xs text-white/40">{t("lobby.waiting_host")}</p>}
        </section>

        {/* الدردشة + الملخص */}
        <section className="flex min-h-[380px] flex-col gap-3 rounded-2xl border border-white/10 bg-surface p-3">
          <div className="rounded-xl bg-black/20 p-2 text-xs">
            <div className="font-extrabold text-gold">{t("lobby.mode")}: {draftSettings.mode}</div>
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-white/70">
              <span>💰 {t("lobby.starting_cash")}: {draftSettings.starting_cash}</span>
              <span>⏱ {t("lobby.turn_seconds")}: {draftSettings.turn_seconds}</span>
              <span>🔨 {t("lobby.auctions")}: {draftSettings.auctions_enabled ? "✅" : "❌"}</span>
              <span>🤝 {t("lobby.trading")}: {draftSettings.trading_enabled ? "✅" : "❌"}</span>
              <span>🏁 {t("lobby.go_bonus")}: {draftSettings.go_bonus}</span>
              <span>🏆 {t("lobby.win_condition")}: {t(`lobby.win.${draftSettings.win_condition}` as Parameters<typeof t>[0])}</span>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <ChatPanel messages={chat} snapshot={{ me: null } as unknown as Parameters<typeof ChatPanel>[0]["snapshot"]} onSend={sendChat} />
          </div>
        </section>
      </div>

      {/* نافذة الإعدادات */}
      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title={`⚙️ ${t("lobby.settings")}`}
        maxWidth="max-w-xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSettingsOpen(false)}>{t("cancel")}</Button>
            <Button onClick={() => void saveSettings()}>{t("profile.save")}</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 text-sm">
          <label className="flex flex-col gap-1">
            {t("lobby.name")}
            <input
              className="rounded-lg border border-white/20 bg-black/30 px-2 py-1.5"
              defaultValue={snapshot.room.name}
              maxLength={40}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name && name !== snapshot.room.name) void act("update_room", { p_room: room.id, p_name: name });
              }}
            />
          </label>
          <label className="flex flex-col gap-1">
            {t("lobby.mode")}
            <select
              className="rounded-lg border border-white/20 bg-black/30 px-2 py-1.5"
              value={draftSettings.mode}
              onChange={(e) => {
                const mode = e.target.value as "classic" | "fast" | "custom";
                setDraftSettings((s) => ({ ...s, mode, ...(MODE_PRESETS[mode] ?? {}) }));
              }}
            >
              <option value="classic">{t("lobby.mode.classic")}</option>
              <option value="fast">{t("lobby.mode.fast")}</option>
              <option value="custom">{t("lobby.mode.custom")}</option>
            </select>
          </label>
          <NumField label={t("lobby.starting_cash")} value={draftSettings.starting_cash} min={500} max={20000} step={100} onChange={(v) => updateSetting({ starting_cash: v })} />
          <NumField label={t("lobby.turn_seconds")} value={draftSettings.turn_seconds} min={15} max={300} step={5} onChange={(v) => updateSetting({ turn_seconds: v })} />
          <NumField label={t("lobby.go_bonus")} value={draftSettings.go_bonus} min={50} max={1000} step={50} onChange={(v) => updateSetting({ go_bonus: v })} />
          <NumField label={t("lobby.detention_fee")} value={draftSettings.detention_fee} min={0} max={500} step={10} onChange={(v) => updateSetting({ detention_fee: v })} />
          <NumField label={t("lobby.buildings_max")} value={draftSettings.buildings_max} min={1} max={4} step={1} onChange={(v) => updateSetting({ buildings_max: v })} />
          <NumField label={t("lobby.auction_increment")} value={draftSettings.auction_min_increment} min={10} max={500} step={10} onChange={(v) => updateSetting({ auction_min_increment: v })} />
          <NumField label={t("lobby.auction_seconds")} value={draftSettings.auction_seconds} min={5} max={60} step={5} onChange={(v) => updateSetting({ auction_seconds: v })} />
          <NumField label={t("lobby.round_limit")} value={draftSettings.round_limit} min={5} max={200} step={5} onChange={(v) => updateSetting({ round_limit: v })} />
          <NumField label={t("lobby.time_limit")} value={draftSettings.time_limit_minutes} min={0} max={240} step={5} onChange={(v) => updateSetting({ time_limit_minutes: v })} />
          <NumField label={t("lobby.wealth_target")} value={draftSettings.wealth_target} min={1000} max={1000000} step={500} onChange={(v) => updateSetting({ wealth_target: v })} />
          <NumField label={t("lobby.unmortgage_interest")} value={draftSettings.unmortgage_interest_pct} min={0} max={50} step={5} onChange={(v) => updateSetting({ unmortgage_interest_pct: v })} />
          <NumField label={t("lobby.trade_expiry")} value={draftSettings.trade_expiry_seconds} min={30} max={600} step={30} onChange={(v) => updateSetting({ trade_expiry_seconds: v })} />
          <NumField label={t("lobby.seat_hold")} value={draftSettings.seat_hold_seconds} min={30} max={1800} step={30} onChange={(v) => updateSetting({ seat_hold_seconds: v })} />
          <label className="flex flex-col gap-1">
            {t("lobby.win_condition")}
            <select
              className="rounded-lg border border-white/20 bg-black/30 px-2 py-1.5"
              value={draftSettings.win_condition}
              onChange={(e) => updateSetting({ win_condition: e.target.value as RoomSettings["win_condition"] })}
            >
              <option value="last_standing">{t("lobby.win.last_standing")}</option>
              <option value="round_limit">{t("lobby.win.round_limit")}</option>
              <option value="time_limit">{t("lobby.win.time_limit")}</option>
              <option value="wealth_target">{t("lobby.win.wealth_target")}</option>
            </select>
          </label>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <CheckField label={t("lobby.auctions")} value={draftSettings.auctions_enabled} onChange={(v) => updateSetting({ auctions_enabled: v })} />
            <CheckField label={t("lobby.trading")} value={draftSettings.trading_enabled} onChange={(v) => updateSetting({ trading_enabled: v })} />
            <CheckField label={t("lobby.allow_bots")} value={draftSettings.allow_bots} onChange={(v) => updateSetting({ allow_bots: v })} />
            <CheckField label={t("lobby.chat_filter")} value={draftSettings.chat_filter_enabled} onChange={(v) => updateSetting({ chat_filter_enabled: v })} />
            <CheckField label={t("lobby.public")} value={room.is_public} onChange={(v) => void act("update_room", { p_room: room.id, p_is_public: v })} />
          </div>
        </div>
      </Modal>
    </main>
  );
}

function NumField({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-lg border border-white/20 bg-black/30 px-2 py-1.5 text-sm"
      />
    </label>
  );
}

function CheckField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-lg border border-white/10 px-2.5 py-1.5">
      <span>{label}</span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-gold" />
    </label>
  );
}
