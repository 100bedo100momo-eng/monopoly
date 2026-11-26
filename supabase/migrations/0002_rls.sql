-- ============================================================
-- 0002: تفعيل RLS على كل الجداول + السياسات + Realtime
-- ============================================================

-- ---------- دوال مساعدة للسياسات ----------
create or replace function public.fn_is_room_member(p_room uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_players rp
    where rp.room_id = p_room and rp.user_id = p_user
  );
$$;

create or replace function public.fn_is_admin(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = p_user), false);
$$;

-- ---------- تفعيل RLS ----------
alter table public.profiles enable row level security;
alter table public.player_statistics enable row level security;
alter table public.achievements enable row level security;
alter table public.player_achievements enable row level security;
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.game_properties enable row level security;
alter table public.board_tiles enable row level security;
alter table public.card_definitions enable row level security;
alter table public.game_cards enable row level security;
alter table public.game_events enable row level security;
alter table public.game_actions enable row level security;
alter table public.trade_offers enable row level security;
alter table public.trade_offer_items enable row level security;
alter table public.auctions enable row level security;
alter table public.auction_bids enable row level security;
alter table public.chat_messages enable row level security;
alter table public.reports enable row level security;
alter table public.banned_words enable row level security;

-- ---------- السياسات ----------
-- الملف الشخصي: قراءة لكل مصادق، بدون أي كتابة مباشرة (عبر دوال فقط)
create policy profiles_select on public.profiles
  for select to authenticated using (true);

create policy stats_select on public.player_statistics
  for select to authenticated using (true);

create policy achievements_select on public.achievements
  for select to authenticated using (true);

create policy player_achievements_select on public.player_achievements
  for select to authenticated using (true);

-- اللوحة والكروت الثابتة: بيانات عامة
create policy board_tiles_select on public.board_tiles
  for select to authenticated using (true);

create policy card_definitions_select on public.card_definitions
  for select to authenticated using (true);

-- الغرف: العامة أو التي ينتمي إليها المستخدم أو للأدمن
create policy rooms_select on public.rooms
  for select to authenticated using (
    is_public
    or public.fn_is_room_member(id, auth.uid())
    or public.fn_is_admin(auth.uid())
  );

-- أعضاء الغرفة: يُرون لأعضاء الغرفة نفسها أو للغرف العامة (لعرض القائمة)
create policy room_players_select on public.room_players
  for select to authenticated using (
    exists (
      select 1 from public.rooms r
      where r.id = room_id
        and (r.is_public or public.fn_is_room_member(r.id, auth.uid()) or public.fn_is_admin(auth.uid()))
    )
  );

-- بيانات المباراة: لأعضاء الغرفة فقط أو الأدمن
create policy games_select on public.games
  for select to authenticated using (
    exists (
      select 1 from public.rooms r
      where r.id = room_id
        and (public.fn_is_room_member(r.id, auth.uid()) or public.fn_is_admin(auth.uid()))
    )
  );

create policy game_players_select on public.game_players
  for select to authenticated using (
    exists (
      select 1 from public.games g join public.rooms r on r.id = g.room_id
      where g.id = game_id
        and (public.fn_is_room_member(r.id, auth.uid()) or public.fn_is_admin(auth.uid()))
    )
  );

create policy game_properties_select on public.game_properties
  for select to authenticated using (
    exists (
      select 1 from public.games g join public.rooms r on r.id = g.room_id
      where g.id = game_id
        and (public.fn_is_room_member(r.id, auth.uid()) or public.fn_is_admin(auth.uid()))
    )
  );

-- ملاحظة أمنية: game_cards (ترتيب الـ deck) بلا أي سياسة — مخفي تمامًا عن العملاء.
-- القراءة تتم داخل الدوال فقط.

create policy game_events_select on public.game_events
  for select to authenticated using (
    exists (
      select 1 from public.games g join public.rooms r on r.id = g.room_id
      where g.id = game_id
        and (public.fn_is_room_member(r.id, auth.uid()) or public.fn_is_admin(auth.uid()))
    )
  );

-- سجل الحركات: للأدمن فقط عبر الواجهة (تشخيص)
create policy game_actions_select on public.game_actions
  for select to authenticated using (
    exists (
      select 1 from public.games g join public.rooms r on r.id = g.room_id
      where g.id = game_id and public.fn_is_admin(auth.uid())
    )
  );

create policy trade_offers_select on public.trade_offers
  for select to authenticated using (
    exists (
      select 1 from public.games g join public.rooms r on r.id = g.room_id
      where g.id = game_id
        and (public.fn_is_room_member(r.id, auth.uid()) or public.fn_is_admin(auth.uid()))
    )
  );

create policy trade_offer_items_select on public.trade_offer_items
  for select to authenticated using (
    exists (
      select 1 from public.trade_offers t join public.games g on g.id = t.game_id
        join public.rooms r on r.id = g.room_id
      where t.id = offer_id
        and (public.fn_is_room_member(r.id, auth.uid()) or public.fn_is_admin(auth.uid()))
    )
  );

create policy auctions_select on public.auctions
  for select to authenticated using (
    exists (
      select 1 from public.games g join public.rooms r on r.id = g.room_id
      where g.id = game_id
        and (public.fn_is_room_member(r.id, auth.uid()) or public.fn_is_admin(auth.uid()))
    )
  );

create policy auction_bids_select on public.auction_bids
  for select to authenticated using (
    exists (
      select 1 from public.auctions a join public.games g on g.id = a.game_id
        join public.rooms r on r.id = g.room_id
      where a.id = auction_id
        and (public.fn_is_room_member(r.id, auth.uid()) or public.fn_is_admin(auth.uid()))
    )
  );

create policy chat_messages_select on public.chat_messages
  for select to authenticated using (
    exists (
      select 1 from public.rooms r
      where r.id = room_id
        and (public.fn_is_room_member(r.id, auth.uid()) or public.fn_is_admin(auth.uid()))
    )
  );

create policy reports_select on public.reports
  for select to authenticated using (
    reporter_id = auth.uid() or public.fn_is_admin(auth.uid())
  );

-- banned_words: بلا سياسة قراءة — لا يراها العملاء (تُدار عبر دوال الأدمن وتُطبَّق في send_chat)

-- ---------- Realtime ----------
do $$
declare t text;
begin
  foreach t in array array[
    'rooms','room_players','games','game_players','game_properties',
    'auctions','trade_offers','game_events','chat_messages'
  ] loop
    begin
      execute format('alter table public.%I replica identity full', t);
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then
      null; -- الجدول منشور مسبقًا
    when undefined_object then
      raise notice 'publication supabase_realtime missing';
    end;
  end loop;
end $$;
