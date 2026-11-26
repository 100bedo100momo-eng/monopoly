"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { getSupabase, IS_SUPABASE_CONFIGURED } from "@/lib/supabase";
import { useUIStore } from "@/stores/ui-store";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { AvatarIcon, AvatarPicker } from "@/components/ui/Avatar";
import { formatMoney } from "@/lib/utils";
import { firstSupabaseError } from "@/lib/utils";

interface ProfilePayload {
  profile: { id: string; username: string; avatar: string; is_guest: boolean; created_at: string };
  stats: { matches: number; wins: number; losses: number; win_rate: number; total_money_earned: number } | null;
  achievements: { id: string; title_ar: string; title_en: string; icon: string; earned_at: string }[];
  history: { game_id: string; room_code: string; room_name: string; finished_at: string; won: boolean; my_net_worth: number }[];
}

export default function ProfilePage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const auth = useAuth();
  const pushToast = useUIStore((s) => s.pushToast);
  const [data, setData] = useState<ProfilePayload | null>(null);
  const [username, setUsername] = useState("");
  const [avatar, setAvatar] = useState("crown");
  const [upgradeEmail, setUpgradeEmail] = useState("");
  const [upgradeSent, setUpgradeSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!auth.userId) return;
    const { data: payload, error } = await getSupabase().rpc("get_profile", { p_user: auth.userId });
    if (error) {
      pushToast("error", firstSupabaseError(error.message, t));
      return;
    }
    setData(payload as ProfilePayload);
    const p = (payload as ProfilePayload)?.profile;
    if (p) {
      setUsername(p.username);
      setAvatar(p.avatar);
    }
  }, [auth.userId, pushToast, t]);

  useEffect(() => {
    if (!auth.session && !auth.loading) router.push("/login");
    else void load();
  }, [auth.session, auth.loading, router, load]);

  const save = async () => {
    setBusy(true);
    const { error } = await getSupabase().rpc("update_profile", {
      p_username: username.trim(),
      p_avatar: avatar,
      p_locale: locale,
    });
    setBusy(false);
    if (error) pushToast("error", firstSupabaseError(error.message, t));
    else {
      pushToast("success", t("profile.saved"));
      void load();
    }
  };

  const upgrade = async () => {
    setBusy(true);
    const { error } = await getSupabase().auth.updateUser({ email: upgradeEmail.trim() });
    setBusy(false);
    if (error) pushToast("error", firstSupabaseError("AUTH", t));
    else setUpgradeSent(true);
  };

  if (!auth.session) {
    return <main className="mx-auto max-w-md p-6"><Skeleton className="h-64" /></main>;
  }

  const stats = data?.stats;
  const winRatePct = stats ? Math.round(stats.win_rate * 100) : 0;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.push("/")}>← {t("back")}</Button>
        <h1 className="text-lg font-extrabold text-gold">👤 {t("profile.title")}</h1>
        <span />
      </header>

      <section className="card flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <AvatarIcon id={avatar} size={52} />
          <div>
            <div className="font-extrabold">{data?.profile.username ?? auth.profile?.username ?? "…"}</div>
            {data?.profile.is_guest && <span className="rounded bg-amber-900/50 px-2 py-0.5 text-xs text-amber-200">🎭 {t("profile.guest")}</span>}
          </div>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          {t("profile.username")}
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="rounded-xl border border-white/20 bg-black/20 px-3 py-2"
            maxLength={24}
          />
        </label>
        <div>
          <div className="mb-1 text-sm">{t("profile.avatar")}</div>
          <AvatarPicker value={avatar} onChange={setAvatar} />
        </div>
        <Button disabled={busy || !username.trim()} onClick={() => void save()}>{t("profile.save")}</Button>
      </section>

      {/* ترقية الضيف */}
      {data?.profile.is_guest && (
        <section className="card flex flex-col gap-2 p-4 text-sm">
          <div className="font-extrabold text-gold">⬆️ {t("profile.upgrade")}</div>
          <p className="text-xs text-white/60">{t("profile.upgrade_hint")}</p>
          {!upgradeSent ? (
            <div className="flex gap-2">
              <input
                type="email"
                value={upgradeEmail}
                onChange={(e) => setUpgradeEmail(e.target.value)}
                placeholder={t("login.email")}
                className="min-w-0 flex-1 rounded-xl border border-white/20 bg-black/20 px-3 py-2"
                dir="ltr"
              />
              <Button disabled={busy || !upgradeEmail.includes("@") || !IS_SUPABASE_CONFIGURED} onClick={() => void upgrade()}>
                ✉️
              </Button>
            </div>
          ) : (
            <p className="text-xs text-emerald-300">✅ {t("profile.upgrade_sent")}</p>
          )}
        </section>
      )}

      {/* الإحصاءات */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label={t("profile.matches")} value={stats?.matches ?? 0} />
        <Stat label={t("profile.wins")} value={stats?.wins ?? 0} accent />
        <Stat label={t("profile.losses")} value={stats?.losses ?? 0} />
        <Stat label={t("profile.win_rate")} value={`${winRatePct}%`} accent />
        <Stat label={t("profile.total_money")} value={formatMoney(stats?.total_money_earned ?? 0, locale)} />
      </section>

      {/* الإنجازات */}
      <section className="card p-4">
        <h2 className="mb-2 font-extrabold text-gold">🏅 {t("profile.achievements")}</h2>
        <div className="flex flex-wrap gap-2">
          {data && data.achievements.length > 0 ? (
            data.achievements.map((a) => (
              <span key={a.id} className="flex items-center gap-1.5 rounded-xl border border-gold/40 bg-gold/10 px-3 py-1.5 text-sm font-bold">
                {a.icon} {locale === "ar" ? a.title_ar : a.title_en}
              </span>
            ))
          ) : (
            <span className="text-sm text-white/50">—</span>
          )}
        </div>
      </section>

      {/* سجل المباريات */}
      <section className="card p-4">
        <h2 className="mb-2 font-extrabold text-gold">📜 {t("profile.history")}</h2>
        {data && data.history.length > 0 ? (
          <ul className="flex flex-col gap-1.5 text-sm">
            {data.history.map((h) => (
              <li key={h.game_id} className="flex items-center justify-between rounded-xl border border-white/10 px-3 py-2">
                <span className="min-w-0 truncate">
                  {h.room_name} <span className="text-xs text-white/40">({h.room_code})</span>
                </span>
                <span className="flex items-center gap-2 text-xs">
                  <span className="text-white/60">≈{formatMoney(h.my_net_worth, locale)}</span>
                  <span className={h.won ? "font-bold text-emerald-300" : "text-rose-300"}>
                    {h.won ? "🏆" : "✖"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-white/50">{t("profile.no_history")}</p>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="card p-3 text-center">
      <div className="text-xs text-white/60">{label}</div>
      <div className={`text-lg font-extrabold ${accent ? "text-gold" : ""}`}>{value}</div>
    </div>
  );
}
