"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase, IS_SUPABASE_CONFIGURED } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

export interface AuthProfile {
  id: string;
  username: string;
  avatar: string;
  locale: "ar" | "en";
  theme: "dark" | "light";
  is_guest: boolean;
  is_admin: boolean;
}

interface AuthState {
  session: Session | null;
  profile: AuthProfile | null;
  loading: boolean;
  userId: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ session: null, profile: null, loading: true, userId: null });

  useEffect(() => {
    if (!IS_SUPABASE_CONFIGURED) {
      setState({ session: null, profile: null, loading: false, userId: null });
      return;
    }
    const supabase = getSupabase();
    let alive = true;

    async function load(session: Session | null) {
      if (!alive) return;
      setState({ session, profile: null, loading: !!session, userId: session?.user.id ?? null });
      if (!session) return;
      const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      if (alive) {
        setState({
          session,
          profile: (data as AuthProfile) ?? null,
          loading: false,
          userId: session.user.id,
        });
      }
    }

    void supabase.auth.getSession().then(({ data }) => load(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void load(session);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    if (!IS_SUPABASE_CONFIGURED) return;
    await getSupabase().auth.signOut();
  }, []);

  return { ...state, signOut, configured: IS_SUPABASE_CONFIGURED };
}
