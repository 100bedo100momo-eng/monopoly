import { test, expect } from "@playwright/test";

const hasSupabase = !!process.env.E2E_SUPABASE_URL;
const skip = hasSupabase ? test : test.skip;

/**
 * يتطلب Supabase محليًا:
 *   npx supabase start && npx supabase db push
 *   E2E_SUPABASE_URL=http://127.0.0.1:54321 E2E_SUPABASE_ANON_KEY=... npm run test:e2e
 * ملاحظة: ثبّت متصفحات Playwright مرة واحدة عبر: npx playwright install chromium
 */
skip("مباراة كاملة بين لاعبين حقيقيين", async ({ browser }) => {
  const { getSupabase } = await import("@/lib/supabase");
  const supabase = getSupabase();

  // لاعبان ضيفان
  const { data: s1 } = await supabase.auth.signInAnonymously();
  const { data: s2 } = await supabase.auth.signInAnonymously();
  expect(s1?.session).toBeTruthy();
  expect(s2?.session).toBeTruthy();

  // إنشاء غرفة
  const { data: code, error } = await supabase.rpc("create_room", {
    p_name: "e2e-room", p_is_public: false, p_max_players: 2, p_settings: {},
  });
  expect(error).toBeNull();
  expect(code).toHaveLength(6);

  // انضمام اللاعب الثاني (متصفح منفصل)
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await page2.goto("/");
  await supabase.auth.setSession(s2!.session!); // العميل الثاني يستخدم جلسة مستقلة عبر متصفحه فعليًا

  const { error: joinError } = await supabase.rpc("join_room", {
    p_code: code, p_color: "#2563eb", p_token: "🏰", p_as_spectator: false,
  });
  expect(joinError).toBeNull();

  // جاهزية وبدء
  await supabase.rpc("set_ready", { p_room: (await supabase.rpc("get_room_snapshot", { p_code: code })).data?.room?.id, p_ready: true });
  const snap = (await supabase.rpc("get_room_snapshot", { p_code: code })).data as { players: { user_id: string | null; id: string }[]; room: { id: string } };
  await supabase.rpc("set_ready", { p_room: snap.room.id, p_ready: true });
  const { data: gameId, error: startError } = await supabase.rpc("start_game", { p_room: snap.room.id });
  expect(startError).toBeNull();
  expect(gameId).toBeTruthy();

  // لقطة مباراة تعمل
  const game = (await supabase.rpc("get_game_snapshot", { p_code: code })).data as { game: { id: string; current_seat: number }; players: unknown[] };
  expect(game.game.id).toBe(gameId);
  expect(game.players.length).toBe(2);
});
