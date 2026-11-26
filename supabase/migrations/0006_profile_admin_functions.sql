-- ============================================================
-- 0006: الملف الشخصي + الإحصاءات + لوحة الأدمن
-- ============================================================

-- ---------- تحديث الملف الشخصي ----------
create or replace function public.update_profile(
  p_username text default null, p_avatar text default null,
  p_locale text default null, p_theme text default null, p_sound_enabled boolean default null
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
        v_username text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_username is not null then
    v_username := btrim(p_username);
    if char_length(v_username) < 2 or char_length(v_username) > 24 then
      raise exception 'INVALID_USERNAME';
    end if;
    if v_username ~* '[<>''"\\;]' then raise exception 'INVALID_USERNAME'; end if;
    begin
      update public.profiles set username = v_username where id = v_uid;
    exception when unique_violation then
      raise exception 'USERNAME_TAKEN';
    end;
  end if;
  if p_avatar is not null then
    if p_avatar not in ('crown','castle','camel','eagle','palm','anchor','key','coin') then
      raise exception 'INVALID_AVATAR';
    end if;
    update public.profiles set avatar = p_avatar where id = v_uid;
  end if;
  if p_locale is not null then
    if p_locale not in ('ar','en') then raise exception 'INVALID_LOCALE'; end if;
    update public.profiles set locale = p_locale where id = v_uid;
  end if;
  if p_theme is not null then
    if p_theme not in ('dark','light') then raise exception 'INVALID_THEME'; end if;
    update public.profiles set theme = p_theme where id = v_uid;
  end if;
  if p_sound_enabled is not null then
    update public.profiles set sound_enabled = p_sound_enabled where id = v_uid;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- ملف شخصي كامل + إحصاءات + سجل مباريات ----------
create or replace function public.get_profile(p_user uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := coalesce(p_user, auth.uid());
        v_profile record;
        v_stats record;
        v_achievements jsonb;
        v_history jsonb;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_profile from public.profiles where id = v_uid;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  select * into v_stats from public.player_statistics where user_id = v_uid;
  v_achievements := coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'title_ar', a.title_ar, 'title_en', a.title_en,
      'description_ar', a.description_ar, 'description_en', a.description_en,
      'icon', a.icon, 'earned_at', pa.earned_at
    ) order by pa.earned_at desc)
    from public.player_achievements pa join public.achievements a on a.id = pa.achievement_id
    where pa.user_id = v_uid
  ), '[]'::jsonb);

  v_history := coalesce((
    select jsonb_agg(jsonb_build_object(
      'game_id', gp.game_id,
      'room_code', r.code,
      'room_name', r.name,
      'finished_at', g.finished_at,
      'mode', g.mode,
      'winner_seat', g.winner_seat,
      'my_seat', gp.seat,
      'won', gp.seat = g.winner_seat,
      'my_cash', gp.cash,
      'my_net_worth', public.fn_net_worth(gp.game_id, gp.seat)
    ) order by g.finished_at desc nulls last)
    from (
      select gp.*, g.status from public.game_players gp
      join public.games g on g.id = gp.game_id
      where gp.user_id = v_uid and g.status = 'finished'
      order by g.finished_at desc nulls last
      limit 10
    ) gp2
    join public.games g on g.id = gp2.game_id
    join public.rooms r on r.id = g.room_id
  ), '[]'::jsonb);

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_profile.id, 'username', v_profile.username, 'avatar', v_profile.avatar,
      'locale', v_profile.locale, 'theme', v_profile.theme,
      'sound_enabled', v_profile.sound_enabled, 'is_guest', v_profile.is_guest,
      'created_at', v_profile.created_at
    ),
    'stats', case when v_stats is null then null else jsonb_build_object(
      'matches', v_stats.matches, 'wins', v_stats.wins, 'losses', v_stats.losses,
      'win_rate', v_stats.win_rate, 'total_money_earned', v_stats.total_money_earned,
      'last_game_at', v_stats.last_game_at
    ) end,
    'achievements', v_achievements,
    'history', v_history
  );
end $$;

-- ============================================================
-- الأدمن (كل الدوال تتطلب is_admin)
-- ============================================================

create or replace function public.admin_overview()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.fn_is_admin(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'users', (select count(*)::int from public.profiles),
    'guests', (select count(*)::int from public.profiles where is_guest),
    'rooms', (select count(*)::int from public.rooms where status <> 'closed'),
    'lobby_rooms', (select count(*)::int from public.rooms where status = 'lobby'),
    'active_games', (select count(*)::int from public.games where status = 'active'),
    'finished_games', (select count(*)::int from public.games where status = 'finished'),
    'open_reports', (select count(*)::int from public.reports where status = 'open'),
    'banned_words', (select count(*)::int from public.banned_words)
  );
end $$;

create or replace function public.admin_list_users(p_search text default null, p_limit int default 50)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.fn_is_admin(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'username', p.username, 'avatar', p.avatar, 'is_guest', p.is_guest,
      'is_admin', p.is_admin, 'created_at', p.created_at,
      'matches', s.matches, 'wins', s.wins
    ) order by p.created_at desc)
    from public.profiles p
    left join public.player_statistics s on s.user_id = p.id
    where p_search is null or p.username ilike '%' || p_search || '%'
    limit least(coalesce(p_limit, 50), 200)
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_list_rooms(p_status text default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.fn_is_admin(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'code', r.code, 'name', r.name, 'is_public', r.is_public,
      'status', r.status, 'host_name', hp.username, 'max_players', r.max_players,
      'players_count', (select count(*)::int from public.room_players rp where rp.room_id = r.id),
      'created_at', r.created_at, 'last_activity_at', r.last_activity_at
    ) order by r.last_activity_at desc)
    from public.rooms r
    left join public.profiles hp on hp.id = r.host_id
    where p_status is null or r.status::text = p_status
    limit 100
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_list_games(p_status text default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.fn_is_admin(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', g.id, 'room_code', r.code, 'status', g.status, 'mode', g.mode,
      'current_seat', g.current_seat, 'turn_phase', g.turn_phase,
      'turn_number', g.turn_number, 'players_count',
      (select count(*)::int from public.game_players gp where gp.game_id = g.id),
      'started_at', g.started_at, 'finished_at', g.finished_at
    ) order by g.created_at desc)
    from public.games g join public.rooms r on r.id = g.room_id
    where p_status is null or g.status::text = p_status
    limit 100
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_list_reports(p_status text default 'open')
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.fn_is_admin(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', rp.id, 'reason', rp.reason, 'status', rp.status, 'created_at', rp.created_at,
      'reporter', hp1.username, 'target', hp2.username, 'room_code', r.code
    ) order by rp.created_at desc)
    from public.reports rp
    left join public.profiles hp1 on hp1.id = rp.reporter_id
    left join public.profiles hp2 on hp2.id = rp.target_user_id
    left join public.rooms r on r.id = rp.room_id
    where p_status is null or rp.status = p_status
    limit 100
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_resolve_report(p_report uuid)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.fn_is_admin(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  update public.reports set status = 'resolved', resolved_at = now() where id = p_report;
  if not found then raise exception 'REPORT_NOT_FOUND'; end if;
end $$;

create or replace function public.admin_add_banned_word(p_word text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_word text;
begin
  if not public.fn_is_admin(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  v_word := lower(btrim(p_word));
  if char_length(v_word) < 2 or char_length(v_word) > 40 then raise exception 'INVALID_WORD'; end if;
  -- منع رموز التعبير النمطي (الفلتر يستخدم regexp_replace بأمان)
  if v_word ~ '[\^\$\.\|\?\*\+\(\)\[\]{}\\]' then raise exception 'INVALID_WORD'; end if;
  insert into public.banned_words (word) values (v_word) on conflict (word) do nothing;
end $$;

create or replace function public.admin_remove_banned_word(p_word text)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.fn_is_admin(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  delete from public.banned_words where word = lower(btrim(p_word));
end $$;

create or replace function public.admin_get_banned_words()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(word order by word), '[]'::jsonb) from public.banned_words
$$;
-- ملاحظة: قراءة القائمة مسموحة لأي مصادق لأن الفلتر نفسه غير سري بطبيعته،
-- لكن الإضافة/الحذف للأدمن فقط.

create or replace function public.admin_close_room(p_room uuid)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.fn_is_admin(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  update public.rooms set status = 'closed', closed_at = now() where id = p_room;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
end $$;

create or replace function public.admin_grant_admin(p_user uuid)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.fn_is_admin(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  update public.profiles set is_admin = true where id = p_user;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
end $$;
