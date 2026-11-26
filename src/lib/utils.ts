export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function formatMoney(n: number, locale: "ar" | "en" = "ar"): string {
  const formatted = new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US", {
    maximumFractionDigits: 0,
  }).format(n);
  return locale === "ar" ? `${formatted} د` : `${formatted} DM`;
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `pk-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** حساب فروق التوقيت بين العميل والسيرفر */
export function serverSkewMs(serverNowIso: string): number {
  return Date.now() - new Date(serverNowIso + (serverNowIso.endsWith("Z") ? "" : "Z")).getTime();
}

export function secondsUntil(iso: string, skewMs = 0): number {
  return (new Date(iso.endsWith("Z") ? iso : iso + "Z").getTime() - (Date.now() - skewMs)) / 1000;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function firstSupabaseError(code: string, t: (k: string, params?: Record<string, string | number>) => string): string {
  const normalized = (code || "").replace(/[^A-Z_]/g, "").toUpperCase();
  const key = `error.${normalized}`;
  const translated = t(key);
  if (translated !== key) return translated;
  return t("error.generic");
}
