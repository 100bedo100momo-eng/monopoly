"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { getSupabase, IS_SUPABASE_CONFIGURED } from "@/lib/supabase";
import { useUIStore } from "@/stores/ui-store";
import { Button } from "@/components/ui/Button";
import { LanguageToggle, ThemeToggle } from "@/components/ui/Toggles";
import { firstSupabaseError } from "@/lib/utils";

export default function LoginPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const auth = useAuth();
  const pushToast = useUIStore((s) => s.pushToast);
  const [email, setEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (auth.session) router.replace("/");
  }, [auth.session, router]);

  const signInGuest = async () => {
    setBusy(true);
    const { error } = await getSupabase().auth.signInAnonymously();
    setBusy(false);
    if (error) pushToast("error", firstSupabaseError("AUTH", t));
    else router.push("/");
  };

  const sendOtp = async () => {
    setBusy(true);
    const { error } = await getSupabase().auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) pushToast("error", firstSupabaseError("AUTH", t));
    else setOtpSent(true);
  };

  const verifyOtp = async () => {
    setBusy(true);
    const { error } = await getSupabase().auth.verifyOtp({
      email: email.trim(),
      token: otp.trim(),
      type: "email",
    });
    setBusy(false);
    if (error) pushToast("error", firstSupabaseError("AUTH", t));
    else router.push("/");
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.push("/")}>← {t("back")}</Button>
        <div className="flex gap-2">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </div>

      <section className="card flex flex-col gap-4 p-6">
        <div className="text-center text-4xl">🔑👑</div>
        <h1 className="text-center text-xl font-extrabold text-gold">{t("login.title")}</h1>

        {!IS_SUPABASE_CONFIGURED && (
          <p className="rounded-xl border border-amber-500/40 bg-amber-950/40 p-3 text-center text-xs font-bold text-amber-200">
            {t("login.not_configured")}
          </p>
        )}

        <Button size="lg" disabled={busy || !IS_SUPABASE_CONFIGURED} onClick={() => void signInGuest()}>
          🎭 {t("login.guest")}
        </Button>
        <p className="text-center text-xs text-white/50">{t("login.guest.hint")}</p>

        <div className="flex items-center gap-2 text-xs text-white/40">
          <span className="h-px flex-1 bg-white/15" />
          {locale === "ar" ? "أو بالبريد" : "or with email"}
          <span className="h-px flex-1 bg-white/15" />
        </div>

        {!otpSent ? (
          <>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("login.email")}
              className="rounded-xl border border-white/20 bg-black/20 px-3 py-2.5"
              aria-label={t("login.email")}
              dir="ltr"
            />
            <Button variant="secondary" disabled={busy || !email.includes("@") || !IS_SUPABASE_CONFIGURED} onClick={() => void sendOtp()}>
              ✉️ {t("login.send_otp")}
            </Button>
          </>
        ) : (
          <>
            <p className="text-center text-xs text-emerald-300">{t("login.otp_sent")}</p>
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="000000"
              className="rounded-xl border border-white/20 bg-black/20 px-3 py-2.5 text-center font-mono text-xl tracking-[0.5em]"
              aria-label="OTP"
              dir="ltr"
            />
            <div className="flex gap-2">
              <Button className="flex-1" disabled={busy || otp.length < 4} onClick={() => void verifyOtp()}>
                ✅ {t("login.verify")}
              </Button>
              <Button variant="ghost" onClick={() => setOtpSent(false)}>{t("login.resend")}</Button>
            </div>
            <p className="text-center text-xs text-white/40">{t("login.magic_hint")}</p>
          </>
        )}
      </section>
    </main>
  );
}
