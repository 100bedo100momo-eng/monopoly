"use client";

import React from "react";
import { useI18n } from "@/lib/i18n";
import { useUIStore } from "@/stores/ui-store";

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  return (
    <button
      onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
      className="rounded-xl border border-white/15 px-3 py-1.5 text-sm font-bold hover:bg-white/10"
      aria-label={t("nav.language")}
      title={t("nav.language")}
    >
      {locale === "ar" ? "EN" : "ع"}
    </button>
  );
}

export function ThemeToggle() {
  const { t } = useI18n();
  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  return (
    <button
      onClick={toggleTheme}
      className="rounded-xl border border-white/15 px-3 py-1.5 text-sm hover:bg-white/10"
      aria-label={t("nav.theme")}
      title={t("nav.theme")}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}

export function SoundToggle() {
  const { t } = useI18n();
  const sound = useUIStore((s) => s.sound);
  const setSound = useUIStore((s) => s.setSound);
  return (
    <button
      onClick={() => setSound(!sound)}
      className="rounded-xl border border-white/15 px-3 py-1.5 text-sm hover:bg-white/10"
      aria-label={t("nav.sound")}
      title={t("nav.sound")}
      aria-pressed={!sound}
    >
      {sound ? "🔊" : "🔇"}
    </button>
  );
}
