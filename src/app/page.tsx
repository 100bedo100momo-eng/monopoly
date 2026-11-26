"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { getSupabase, IS_SUPABASE_CONFIGURED } from "@/lib/supabase";
import { useUIStore } from "@/stores/ui-store";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { LanguageToggle, SoundToggle, ThemeToggle } from "@/components/ui/Toggles";
import { DEFAULT_SETTINGS } from "@/game/types";
import { firstSupabaseError } from "@/lib/utils";

export default function HomePage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const auth = useAuth();
  const pushToast = useUIStore((s) => s.pushToast);

  const [joinCode, setJoinCode] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [roomName, setRoomName] = useState(locale === "ar" ? "غرفة الملوك" : "Kings Room");
  const [isPublic, setIsPublic] = useState(true);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [busy, setBusy] = useState(false);

  const createRoom = async () => {
    setBusy(true);
    const { data, error } = await getSupabase().rpc("create_room", {
      p_name: roomName,
      p_is_public: isPublic,
      p_max_players: maxPlayers,
      p_settings: DEFAULT_SETTINGS,
    });
    setBusy(false);
    if (error) {
      pushToast("error", firstSupabaseError(error.message, t));
      return;
    }
    setCreateOpen(false);
    if (data) router.push(`/rooms/${data as string}`);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-4">
      <header className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="logo" className="h-11 w-11 rounded-xl" />
          <span className="text-lg font-extrabold text-gold">{t("app.name")}</span>
        </div>
        <div className="flex items-center gap-2">
          {auth.session ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => router.push("/profile")}>👤 {auth.profile?.username ?? t("nav.profile")}</Button>
              <Button variant="ghost" size="sm" onClick={() => void auth.signOut()}>{t("nav.logout")}</Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => router.push("/login")}>🔑 {t("nav.login")}</Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => router.push("/rules")}>📖 {t("nav.rules")}</Button>
          {auth.profile?.is_admin && (
            <Button variant="ghost" size="sm" onClick={() => router.push("/admin")}>🛡️</Button>
          )}
          <LanguageToggle />
          <ThemeToggle />
          <SoundToggle />
        </div>
      </header>

      {/* البطل */}
      <section className="card flex flex-col items-center gap-3 p-8 text-center">
        <div className="text-6xl">👑🏙️</div>
        <h1 className="text-3xl font-extrabold text-gold sm:text-4xl">{t("home.hero.title")}</h1>
        <p className="max-w-xl text-sm leading-relaxed text-white/70 dark:text-current">{t("home.hero.sub")}</p>
        {!IS_SUPABASE_CONFIGURED && (
          <p className="rounded-xl border border-amber-500/40 bg-amber-950/40 p-3 text-xs font-bold text-amber-200">
            {t("login.not_configured")}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <Button size="lg" onClick={() => router.push("/rooms")} disabled={!IS_SUPABASE_CONFIGURED}>
            🎮 {t("nav.play")}
          </Button>
          <Button size="lg" variant="secondary" onClick={() => setCreateOpen(true)} disabled={!IS_SUPABASE_CONFIGURED || !auth.session}>
            ➕ {t("nav.create")}
          </Button>
        </div>
        {!auth.session && IS_SUPABASE_CONFIGURED && (
          <p className="text-xs text-white/50">{t("login.guest.hint")}</p>
        )}
      </section>

      {/* الانضمام بكود */}
      <section className="card p-4">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (joinCode.trim().length === 6) router.push(`/rooms/${joinCode.trim().toUpperCase()}`);
          }}
        >
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
            placeholder={t("home.join_code")}
            className="min-w-0 flex-1 rounded-xl border border-white/20 bg-black/20 px-3 py-2 text-center font-mono text-lg tracking-[0.4em]"
            aria-label={t("home.join_code")}
            maxLength={6}
          />
          <Button type="submit" disabled={joinCode.length !== 6}>→ {t("home.join")}</Button>
        </form>
      </section>

      {/* الميزات */}
      <section className="grid gap-3 sm:grid-cols-3">
        <FeatureCard icon="🎲" text={t("home.feature1")} />
        <FeatureCard icon="🔨" text={t("home.feature2")} />
        <FeatureCard icon="🏆" text={t("home.feature3")} />
      </section>

      <footer className="pb-6 text-center text-xs text-white/40">
        {t("home.pwa")} · Property Kings © 2026 · MIT
      </footer>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={`➕ ${t("nav.create")}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>{t("cancel")}</Button>
            <Button disabled={busy || !roomName.trim()} onClick={() => void createRoom()}>
              {busy ? "…" : t("confirm")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-sm">
          <label className="flex flex-col gap-1">
            {t("lobby.name")}
            <input
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="rounded-xl border border-white/20 bg-black/20 px-3 py-2"
              maxLength={40}
            />
          </label>
          <label className="flex items-center justify-between rounded-xl border border-white/10 px-3 py-2">
            {t("lobby.public")}
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="h-4 w-4 accent-gold" />
          </label>
          <label className="flex flex-col gap-1">
            {t("lobby.max_players")}: {maxPlayers}
            <input
              type="range"
              min={2}
              max={6}
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
              className="accent-gold"
            />
          </label>
          <p className="text-xs text-white/50">⚙️ {t("lobby.settings")} → {t("lobby.mode.classic")}</p>
        </div>
      </Modal>
    </main>
  );
}

function FeatureCard({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="card p-4 text-center text-sm">
      <div className="text-3xl">{icon}</div>
      <p className="mt-2 leading-relaxed text-white/70 dark:text-current">{text}</p>
    </div>
  );
}
