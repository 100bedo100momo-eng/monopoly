"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { getSupabase, IS_SUPABASE_CONFIGURED } from "@/lib/supabase";
import { useUIStore } from "@/stores/ui-store";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { LanguageToggle, ThemeToggle } from "@/components/ui/Toggles";
import { firstSupabaseError } from "@/lib/utils";

type Tab = "overview" | "users" | "rooms" | "games" | "reports" | "words";

export default function AdminPage() {
  const { t } = useI18n();
  const router = useRouter();
  const auth = useAuth();
  const pushToast = useUIStore((s) => s.pushToast);
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<Record<string, number> | null>(null);
  const [users, setUsers] = useState<Record<string, unknown>[] | null>(null);
  const [rooms, setRooms] = useState<Record<string, unknown>[] | null>(null);
  const [games, setGames] = useState<Record<string, unknown>[] | null>(null);
  const [reports, setReports] = useState<Record<string, unknown>[] | null>(null);
  const [words, setWords] = useState<string[]>([]);
  const [newWord, setNewWord] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const isAdmin = auth.profile?.is_admin === true;

  const load = useCallback(async () => {
    if (!isAdmin || !IS_SUPABASE_CONFIGURED) return;
    setBusy(true);
    const supabase = getSupabase();
    if (tab === "overview") {
      const { data } = await supabase.rpc("admin_overview");
      setOverview((data as Record<string, number>) ?? null);
    } else if (tab === "users") {
      const { data } = await supabase.rpc("admin_list_users", { p_search: search || null });
      setUsers((data as Record<string, unknown>[]) ?? []);
    } else if (tab === "rooms") {
      const { data } = await supabase.rpc("admin_list_rooms", { p_status: null });
      setRooms((data as Record<string, unknown>[]) ?? []);
    } else if (tab === "games") {
      const { data } = await supabase.rpc("admin_list_games", { p_status: null });
      setGames((data as Record<string, unknown>[]) ?? []);
    } else if (tab === "reports") {
      const { data } = await supabase.rpc("admin_list_reports", { p_status: "open" });
      setReports((data as Record<string, unknown>[]) ?? []);
    } else {
      const { data } = await supabase.rpc("admin_get_banned_words");
      setWords((data as string[]) ?? []);
    }
    setBusy(false);
  }, [tab, isAdmin, search]);

  useEffect(() => {
    if (!auth.loading && auth.session && !isAdmin) return;
    void load();
  }, [load, isAdmin, auth.loading, auth.session]);

  if (auth.loading) {
    return <main className="mx-auto max-w-3xl p-6"><Skeleton className="h-64" /></main>;
  }
  if (!auth.session) {
    void router.push("/login");
    return null;
  }
  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <p className="card p-6 text-sm font-bold">🛡️ {t("admin.forbidden")}</p>
        <p className="mt-2 text-xs text-white/50">{t("admin.become_admin_hint")}</p>
        <Button className="mt-4" variant="secondary" onClick={() => router.push("/")}>{t("back")}</Button>
      </main>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: `📊 ${t("admin.overview")}` },
    { id: "users", label: `👤 ${t("admin.users")}` },
    { id: "rooms", label: `🏛️ ${t("admin.rooms")}` },
    { id: "games", label: `🎮 ${t("admin.games")}` },
    { id: "reports", label: `🚩 ${t("admin.reports")}` },
    { id: "words", label: `🚫 ${t("admin.banned_words")}` },
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.push("/")}>← {t("back")}</Button>
        <h1 className="text-lg font-extrabold text-gold">🛡️ {t("admin.title")}</h1>
        <div className="flex gap-2"><LanguageToggle /><ThemeToggle /></div>
      </header>

      <nav className="flex flex-wrap gap-2" role="tablist">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            role="tab"
            aria-selected={tab === tb.id}
            onClick={() => setTab(tb.id)}
            className={`rounded-xl px-3 py-1.5 text-sm font-bold ${tab === tb.id ? "bg-gold text-navy-900" : "bg-white/5 hover:bg-white/10"}`}
          >
            {tb.label}
          </button>
        ))}
      </nav>

      {busy && <Skeleton className="h-10 w-full" />}

      {tab === "overview" && overview && (
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Object.entries(overview).map(([k, v]) => (
            <div key={k} className="card p-3 text-center">
              <div className="text-xs text-white/60">{k}</div>
              <div className="text-xl font-extrabold text-gold">{v}</div>
            </div>
          ))}
        </section>
      )}

      {tab === "users" && (
        <section className="flex flex-col gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("admin.users")}
            className="rounded-xl border border-white/20 bg-black/20 px-3 py-2 text-sm"
            onKeyDown={(e) => e.key === "Enter" && void load()}
          />
          <Table
            rows={users ?? []}
            columns={["username", "is_guest", "is_admin", "matches", "wins", "created_at"]}
            actions={(row) => !row.is_admin && (
              <Button size="sm" variant="secondary" onClick={async () => {
                const { error } = await getSupabase().rpc("admin_grant_admin", { p_user: row.id as string });
                if (error) pushToast("error", firstSupabaseError(error.message, t));
                else void load();
              }}>
                🛡️
              </Button>
            )}
          />
        </section>
      )}

      {tab === "rooms" && (
        <Table
          rows={rooms ?? []}
          columns={["code", "name", "host_name", "players_count", "status", "last_activity_at"]}
          actions={(row) => row.status !== "closed" && (
            <Button size="sm" variant="danger" onClick={async () => {
              const { error } = await getSupabase().rpc("admin_close_room", { p_room: row.id as string });
              if (error) pushToast("error", firstSupabaseError(error.message, t));
              else void load();
            }}>
              {t("admin.close_room")}
            </Button>
          )}
        />
      )}

      {tab === "games" && (
        <Table rows={games ?? []} columns={["room_code", "status", "mode", "turn_phase", "turn_number", "players_count", "started_at"]} />
      )}

      {tab === "reports" && (
        <Table
          rows={reports ?? []}
          columns={["reporter", "target", "room_code", "reason", "created_at"]}
          actions={(row) => (
            <Button size="sm" variant="success" onClick={async () => {
              const { error } = await getSupabase().rpc("admin_resolve_report", { p_report: row.id as string });
              if (error) pushToast("error", firstSupabaseError(error.message, t));
              else void load();
            }}>
              ✅ {t("admin.resolve")}
            </Button>
          )}
        />
      )}

      {tab === "words" && (
        <section className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              value={newWord}
              onChange={(e) => setNewWord(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-white/20 bg-black/20 px-3 py-2 text-sm"
              placeholder="word…"
              dir="ltr"
            />
            <Button disabled={!newWord.trim()} onClick={async () => {
              const { error } = await getSupabase().rpc("admin_add_banned_word", { p_word: newWord.trim() });
              if (error) pushToast("error", firstSupabaseError(error.message, t));
              else {
                setNewWord("");
                void load();
              }
            }}>
              ➕ {t("admin.add_word")}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {words.map((w) => (
              <span key={w} className="flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-950/40 px-3 py-1.5 text-sm">
                {w}
                <button
                  className="text-rose-300 hover:text-white"
                  aria-label={t("admin.remove")}
                  onClick={async () => {
                    const { error } = await getSupabase().rpc("admin_remove_banned_word", { p_word: w });
                    if (error) pushToast("error", firstSupabaseError(error.message, t));
                    else void load();
                  }}
                >
                  ✕
                </button>
              </span>
            ))}
            {words.length === 0 && <span className="text-sm text-white/40">—</span>}
          </div>
        </section>
      )}
    </main>
  );
}

function Table({
  rows, columns, actions,
}: {
  rows: Record<string, unknown>[];
  columns: string[];
  actions?: (row: Record<string, unknown>) => React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-white/5">
            {columns.map((c) => (
              <th key={c} className="px-3 py-2 text-start text-xs font-bold text-white/60">{c}</th>
            ))}
            {actions && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={String(row.id ?? i)} className="border-t border-white/5">
              {columns.map((c) => (
                <td key={c} className="max-w-[200px] truncate px-3 py-2">
                  {String(row[c] ?? "—").slice(0, 60)}
                </td>
              ))}
              {actions && <td className="px-3 py-2">{actions(row)}</td>}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={columns.length + 1} className="px-3 py-4 text-center text-white/40">—</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
