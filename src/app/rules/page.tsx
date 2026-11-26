"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { LanguageToggle, ThemeToggle } from "@/components/ui/Toggles";
import { BOARD_TILES, GROUP_COLORS, GROUP_LABELS } from "@/game/board";
import { CARDS } from "@/game/cards";
import { formatMoney } from "@/lib/utils";

export default function RulesPage() {
  const { t, locale } = useI18n();
  const router = useRouter();

  const sections: { icon: string; title: Parameters<typeof t>[0]; text: Parameters<typeof t>[0] }[] = [
    { icon: "🎯", title: "rules.goal", text: "rules.goal_text" },
    { icon: "🎲", title: "rules.turn", text: "rules.turn_text" },
    { icon: "🏠", title: "rules.buy", text: "rules.buy_text" },
    { icon: "💰", title: "rules.rent", text: "rules.rent_text" },
    { icon: "🔒", title: "rules.mortgage", text: "rules.mortgage_text" },
    { icon: "🚔", title: "rules.detention", text: "rules.detention_text" },
    { icon: "🔨", title: "rules.auction", text: "rules.auction_text" },
    { icon: "🤝", title: "rules.trade", text: "rules.trade_text" },
    { icon: "💀", title: "rules.bankruptcy", text: "rules.bankruptcy_text" },
  ];

  const groups = Object.keys(GROUP_COLORS);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <button onClick={() => router.push("/")} className="rounded-xl border border-white/15 px-3 py-1.5 text-sm">← {t("back")}</button>
        <div className="flex gap-2">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      <h1 className="text-center text-2xl font-extrabold text-gold">📖 {t("rules.title")}</h1>

      <section className="grid gap-3 sm:grid-cols-2">
        {sections.map((s) => (
          <div key={s.title} className="card p-4">
            <div className="text-2xl">{s.icon}</div>
            <h2 className="mt-1 font-extrabold text-gold">{t(s.title)}</h2>
            <p className="mt-1 text-sm leading-relaxed text-white/70 dark:text-current">{t(s.text)}</p>
          </div>
        ))}
      </section>

      {/* المجموعات اللونية */}
      <section className="card p-4">
        <h2 className="mb-2 font-extrabold text-gold">🎨 {locale === "ar" ? "المجموعات اللونية والمدن" : "Color groups & cities"}</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {groups.map((g) => (
            <div key={g} className="flex items-center gap-2 rounded-xl border border-white/10 p-2 text-sm">
              <span className="h-5 w-5 rounded-md" style={{ backgroundColor: GROUP_COLORS[g] }} />
              <span className="font-bold">{GROUP_LABELS[g]?.[locale]}</span>
              <span className="text-xs text-white/60">
                {BOARD_TILES.filter((tl) => tl.color_group === g).map((tl) => (locale === "ar" ? tl.name_ar : tl.name_en)).join(" · ")}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* الكروت */}
      <section className="card p-4">
        <h2 className="mb-2 font-extrabold text-gold">🎴 {locale === "ar" ? "الكروت الأصلية (30)" : "Original cards (30)"}</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {CARDS.map((c) => (
            <div key={c.id} className="flex items-start gap-2 rounded-xl border border-white/10 p-2.5 text-sm">
              <span className="text-xl">{c.icon}</span>
              <div>
                <div className="font-bold">{locale === "ar" ? c.title_ar : c.title_en}</div>
                <div className="text-xs text-white/60">{locale === "ar" ? c.description_ar : c.description_en}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* أسعار سريعة */}
      <section className="card p-4">
        <h2 className="mb-2 font-extrabold text-gold">🧮 {locale === "ar" ? "ملخص الاقتصاد" : "Economy summary"}</h2>
        <ul className="list-inside list-disc text-sm text-white/70">
          <li>{locale === "ar" ? "رأس المال الافتراضي: 1500 د (قابل للتعديل)" : "Default starting cash: 1500 (adjustable)"}</li>
          <li>{locale === "ar" ? "مكافأة البداية: 200 د لكل دورة كاملة" : "Start bonus: 200 per full lap"}</li>
          <li>{locale === "ar" ? "الرهن: نصف السعر · فك الرهن: +10%" : "Mortgage: half price · unmortgage: +10%"}</li>
          <li>{locale === "ar" ? "رسوم التوقيف: 50 د" : "Detention fee: 50"}</li>
          <li>{locale === "ar" ? `أغلى عقار: دبي (${formatMoney(400, locale)})` : `Most expensive: Dubai (${formatMoney(400, locale)})`}</li>
        </ul>
      </section>
    </main>
  );
}
