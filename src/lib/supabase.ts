import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "public-anon-key-placeholder-not-configured";

export const IS_SUPABASE_CONFIGURED =
  !SUPABASE_URL.includes("localhost:54321") &&
  !SUPABASE_ANON_KEY.includes("placeholder");

let client: SupabaseClient | null = null;

/** عميل Supabase للمتصفح (Singleton) — المفتاح العام anon فقط */
export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      realtime: { params: { eventsPerSecond: 20 } },
    });
  }
  return client;
}

export function getSupabaseConfig() {
  return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, configured: IS_SUPABASE_CONFIGURED };
}
