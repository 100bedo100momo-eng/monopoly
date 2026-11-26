-- ============================================================
-- 0004: دوال الغرف والـ Lobby والدردشة والبلاغات ولقطات الحالة
-- ============================================================

alter table public.room_players add column if not exists bot_name text;

-- ---------- ثوابت ----------
create or replace function public.fn_player_colors()
returns text[] language sql immutable as
$$ select array['#e11d48','#2563eb','#059669','#d97706','#7c3aed','#0891b2'] $$;

create or replace function public.fn_player_tokens()
returns text[] language sql immutable as
$$ select array['👑','🏰','🐪','🦅','🌴','⚓'] $$;

-- ---------- البحث عن غرفة ----------
create or replace function public.fn_get_room_by_code(p_code text)
returns public.rooms language plpgsql stable security definer set search_path = public as $$
declare v_room public.rooms;
begin
  select * into v_room from public.rooms where upper(code) = upper(trim(p_code));
  if not found then
    raise exception 'ROOM_NOT_FOUND' using errcode = 'P0002';
  end if;
  return v_room;
end $$;

-- ---------- إنشاء غرفة ----------
create or replace function public.create_room(
  p_name text, p_is_public boolean default true, p_max_players int default 6, p_settings jsonb default '{}'::jsonb
) returns text
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
        v_code text;
        v_room uuid;
        v_settings jsonb := public.fn_sanitize_settings(p_settings);
        v_attempts int := 0;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_name is null or char_length(btrim(p_name)) < 1 or char_length(btrim(p_name)) > 40 then
    raise exception 'INVALID_ROOM_NAME';
  end if;

  loop
    v_attempts := v_attempts + 1;
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', public.fn_rand(32), 1);
    end loop;
    begin
      insert into public.rooms (code, name, is_public, host_id, max_players, settings)
      values (v_code, btrim(p_name), coalesce(p_is_public, true), v_uid, coalesce(p_max_players, 6), v_settings)
      returning id into v_room;
      exit;
    exception when unique_violation then
      if v_attempts > 20 then raise exception 'CODE_GENERATION_FAILED'; end if;
    end;
  end loop;

  insert into public.room_players (room_id, user_id, role, seat, color, token, is_ready)
  values (v_room, v_uid, 'player', 0, (public.fn_player_colors())[1], (public.fn_player_tokens())[1], false);

  insert into public.chat_messages (room_id, sender_user_id, sender_name, kind, body)
  values (v_room, null, '', 'system', 'أنشأ المضيف الغرفة — بانتظار اللاعبين');

  return v_code;
end $$;

-- ---------- الانضمام ----------
create or replace function public.join_room(
  p_code text, p_color text default null, p_token text default null, p_as_spectator boolean default false
) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
        v_room public.rooms;
        v_existing record;
        v_count int;
        v_seat int;
        v_color text;
        v_token text;
        v_hold int;
        v_name text;
        v_is_new boolean := false;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_room from public.fn_get_room_by_code(p_code);
  if v_room.status = 'closed' then raise exception 'ROOM_CLOSED'; end if;

  select coalesce(p.username, 'trader') into v_name from public.profiles p where p.id = v_uid;

  select * into v_existing from public.room_players
  where room_id = v_room.id and user_id = v_uid;
  if found then
    -- موجود مسبقًا: تحديث نبضة وإرجاع الغرفة (إعادة اتصال)
    update public.room_players set last_seen_at = now() where id = v_existing.id;
    return v_room.id;
  end if;

  if v_room.status <> 'lobby' and not p_as_spectator then
    raise exception 'GAME_IN_PROGRESS';
  end if;

  if not p_as_spectator and v_room.status = 'lobby' then
    v_hold := public.fn_s(v_room.settings, 'seat_hold_seconds', 120);
    -- إزالة اللاعبين المتغيبين (غير الجاهزين وغير المضيف) بعد مدة حفظ المقعد
    delete from public.room_players rp
    where rp.room_id = v_room.id and rp.role = 'player' and rp.user_id is not null
      and rp.user_id <> v_room.host_id and not rp.is_ready
      and rp.last_seen_at < now() - make_interval(secs => v_hold);

    select count(*)::int into v_count from public.room_players
    where room_id = v_room.id and role = 'player';
    if v_count >= v_room.max_players then raise exception 'ROOM_FULL'; end if;
  end if;

  v_color := coalesce(p_color, '');
  v_token := coalesce(p_token, '');

  if p_as_spectator then
    insert into public.room_players (room_id, user_id, role, seat, color, token, is_ready)
    values (v_room.id, v_uid, 'spectator', null, null, null, false);
    v_is_new := true;
  else
    if v_color not in (select unnest(public.fn_player_colors())) or v_token not in (select unnest(public.fn_player_tokens())) then
      raise exception 'INVALID_CHOICE';
    end if;
    if exists (
      select 1 from public.room_players
      where room_id = v_room.id and role = 'player' and (color = v_color or token = v_token)
    ) then
      raise exception 'CHOICE_TAKEN';
    end if;
    if v_color is null or v_token is null then
      raise exception 'INVALID_CHOICE';
    end if;

    select min(s) into v_seat from generate_series(0, v_room.max_players - 1) s
    where not exists (select 1 from public.room_players rp where rp.room_id = v_room.id and rp.seat = s);
    insert into public.room_players (room_id, user_id, role, seat, color, token, is_ready)
    values (v_room.id, v_uid, 'player', v_seat, v_color, v_token, false);
    v_is_new := true;
  end if;

  if v_is_new then
    insert into public.chat_messages (room_id, sender_user_id, sender_name, kind, body)
    values (v_room.id, null, '', 'system',
      case when p_as_spectator then v_name || ' انضم كمشاهد' else v_name || ' انضم إلى الغرفة' end);
  end if;

  update public.rooms set last_activity_at = now() where id = v_room.id;
  return v_room.id;
end $$;

-- ---------- الخروج من الغرفة ----------
create or replace function public.leave_room(p_room uuid)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
        v_rp record;
        v_room public.rooms;
        v_name text;
        v_was_host boolean;
        v_next_host uuid;
        v_active_game uuid;
        v_seat int;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_room from public.rooms where id = p_room for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  select * into v_rp from public.room_players where room_id = p_room and user_id = v_uid;
  if not found then raise exception 'NOT_IN_ROOM'; end if;
  select coalesce(p.username, 'trader') into v_name from public.profiles p where p.id = v_uid;
  v_was_host := v_room.host_id = v_uid;

  if v_room.status = 'playing' and v_rp.role = 'player' and v_rp.seat is not null then
    select g.id into v_active_game from public.games g
    where g.room_id = p_room and g.status = 'active'
    order by g.created_at desc limit 1;
    if v_active_game is not null then
      select gp.seat into v_seat from public.game_players gp
      where gp.game_id = v_active_game and gp.user_id = v_uid;
      if v_seat is not null and not (select is_bankrupt from public.game_players where game_id = v_active_game and seat = v_seat) then
        perform public.fn_bankrupt(v_active_game, v_seat, null, 'left_game');
        perform public.fn_log_event(v_active_game, 'left', v_seat,
          '🚪 غادر اللاعب المباراة', '🚪 Player left the game', null);
      end if;
    end if;
  end if;

  delete from public.room_players where id = v_rp.id;
  insert into public.chat_messages (room_id, sender_user_id, sender_name, kind, body)
  values (p_room, null, '', 'system', v_name || ' غادر الغرفة');

  if v_was_host then
    select rp.user_id into v_next_host
    from public.room_players rp
    where rp.room_id = p_room and rp.user_id is not null
    order by (rp.role = 'player') desc, rp.joined_at asc
    limit 1;
    if v_next_host is not null then
      update public.rooms set host_id = v_next_host where id = p_room;
      insert into public.chat_messages (room_id, sender_user_id, sender_name, kind, body)
      values (p_room, null, '', 'system',
        (select coalesce(username, 'trader') from public.profiles where id = v_next_host) || ' أصبح المضيف الجديد');
    else
      update public.rooms set status = 'closed', closed_at = now() where id = p_room;
    end if;
  elsif not exists (select 1 from public.room_players where room_id = p_room) then
    update public.rooms set status = 'closed', closed_at = now() where id = p_room;
  end if;
end $$;

-- ---------- جاهزية ----------
create or replace function public.set_ready(p_room uuid, p_ready boolean)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  update public.room_players
  set is_ready = coalesce(p_ready, not is_ready), last_seen_at = now()
  where room_id = p_room and user_id = v_uid and role = 'player';
  if not found then raise exception 'NOT_IN_ROOM'; end if;
end $$;

-- ---------- طرد لاعب (قبل بدء المباراة فقط) ----------
create or replace function public.kick_player(p_room uuid, p_target_user uuid)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_room public.rooms; v_name text;
begin
  select * into v_room from public.rooms where id = p_room for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.host_id <> auth.uid() then raise exception 'NOT_HOST'; end if;
  if v_room.status <> 'lobby' then raise exception 'GAME_IN_PROGRESS'; end if;
  if p_target_user = auth.uid() then raise exception 'CANNOT_KICK_SELF'; end if;
  select coalesce(p.username, 'trader') into v_name from public.profiles p where p.id = p_target_user;
  delete from public.room_players where room_id = p_room and user_id = p_target_user;
  insert into public.chat_messages (room_id, sender_user_id, sender_name, kind, body)
  values (p_room, null, '', 'system', 'طُرد ' || v_name || ' من الغرفة');
end $$;

-- ---------- إدارة البوتات ----------
create or replace function public.add_bot(p_room uuid, p_level text default 'medium')
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare v_room public.rooms;
        v_count int;
        v_seat int;
        v_color text; v_token text; c text; t text;
        v_name text;
        v_bot_id uuid;
        v_level public.bot_level;
        v_pool text[];
begin
  select * into v_room from public.rooms where id = p_room for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.host_id <> auth.uid() then raise exception 'NOT_HOST'; end if;
  if v_room.status <> 'lobby' then raise exception 'GAME_IN_PROGRESS'; end if;
  if not public.fn_sb(v_room.settings, 'allow_bots', true) then raise exception 'BOTS_DISABLED'; end if;
  if p_level not in ('easy','medium','hard') then raise exception 'INVALID_BOT_LEVEL'; end if;
  v_level := p_level::public.bot_level;

  select count(*)::int into v_count from public.room_players
  where room_id = p_room and role = 'player';
  if v_count >= v_room.max_players then raise exception 'ROOM_FULL'; end if;

  for c in select unnest(public.fn_player_colors()) loop
    if not exists (select 1 from public.room_players where room_id = p_room and color = c and role = 'player') then
      v_color := c; exit;
    end if;
  end loop;
  for t in select unnest(public.fn_player_tokens()) loop
    if not exists (select 1 from public.room_players where room_id = p_room and token = t and role = 'player') then
      v_token := t; exit;
    end if;
  end loop;
  if v_color is null or v_token is null then raise exception 'NO_CHOICES_LEFT'; end if;

  select min(s) into v_seat from generate_series(0, v_room.max_players - 1) s
  where not exists (select 1 from public.room_players rp where rp.room_id = p_room and rp.seat = s);

  v_pool := case v_level
    when 'easy' then array['وديع','هادي','سلوم','النديم']
    when 'medium' then array['فطن','جريء','ماجد','العقلاء']
    else array['المخطط','الثعلب','الأسطورة','العقّاد']
  end;
  v_name := '🤖 ' || v_pool[public.fn_rand(array_length(v_pool, 1))];

  insert into public.room_players (room_id, user_id, bot_level, bot_name, role, seat, color, token, is_ready)
  values (p_room, null, v_level, v_name, 'player', v_seat, v_color, v_token, true)
  returning id into v_bot_id;

  insert into public.chat_messages (room_id, sender_user_id, sender_name, kind, body)
  values (p_room, null, '', 'system', v_name || ' انضم كبوت (' || p_level || ')');
  return v_bot_id;
end $$;

create or replace function public.remove_bot(p_room uuid, p_bot_id uuid)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not exists (select 1 from public.rooms where id = p_room and host_id = auth.uid()) then
    raise exception 'NOT_HOST';
  end if;
  delete from public.room_players where id = p_bot_id and room_id = p_room and user_id is null;
  if not found then raise exception 'BOT_NOT_FOUND'; end if;
end $$;

-- ---------- تعديل إعدادات الغرفة ----------
create or replace function public.update_room(
  p_room uuid, p_name text default null, p_is_public boolean default null,
  p_max_players int default null, p_settings jsonb default null
) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_room public.rooms; v_count int;
begin
  select * into v_room from public.rooms where id = p_room for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.host_id <> auth.uid() then raise exception 'NOT_HOST'; end if;
  if v_room.status <> 'lobby' then raise exception 'GAME_IN_PROGRESS'; end if;
  if p_name is not null then
    if char_length(btrim(p_name)) < 1 or char_length(btrim(p_name)) > 40 then raise exception 'INVALID_ROOM_NAME'; end if;
    update public.rooms set name = btrim(p_name) where id = p_room;
  end if;
  if p_is_public is not null then
    update public.rooms set is_public = p_is_public where id = p_room;
  end if;
  if p_max_players is not null then
    if p_max_players < 2 or p_max_players > 6 then raise exception 'INVALID_MAX_PLAYERS'; end if;
    select count(*)::int into v_count from public.room_players where room_id = p_room and role = 'player';
    if v_count > p_max_players then raise exception 'TOO_MANY_PLAYERS'; end if;
    update public.rooms set max_players = p_max_players where id = p_room;
  end if;
  if p_settings is not null then
    update public.rooms set settings = public.fn_sanitize_settings(p_settings) where id = p_room;
  end if;
end $$;

-- ---------- بدء المباراة ----------
create or replace function public.start_game(p_room uuid)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
        v_room public.rooms;
        v_settings jsonb;
        v_count int;
        v_unready int;
        v_game uuid;
        v_start_seat int;
        v_first_name text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_room from public.rooms where id = p_room for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.host_id <> v_uid then raise exception 'NOT_HOST'; end if;
  if v_room.status <> 'lobby' then raise exception 'GAME_IN_PROGRESS'; end if;

  select count(*)::int into v_count from public.room_players
  where room_id = p_room and role = 'player';
  if v_count < 2 then raise exception 'NOT_ENOUGH_PLAYERS'; end if;

  select count(*)::int into v_unready from public.room_players
  where room_id = p_room and role = 'player' and not is_ready;
  if v_unready > 0 then raise exception 'PLAYERS_NOT_READY'; end if;

  v_settings := public.fn_sanitize_settings(v_room.settings);

  insert into public.games (room_id, settings, mode, turn_deadline_at)
  values (p_room, v_settings,
          (v_settings->>'mode')::public.game_mode,
          now() + make_interval(secs => public.fn_s(v_settings, 'turn_seconds', 60)))
  returning id into v_game;

  insert into public.game_players (game_id, user_id, bot_level, seat, name, color, token, cash)
  select v_game, rp.user_id, rp.bot_level, rp.seat,
         coalesce(rp.bot_name, coalesce(p.username, 'trader')),
         rp.color, rp.token,
         public.fn_s(v_settings, 'starting_cash', 1500)
  from public.room_players rp
  left join public.profiles p on p.id = rp.user_id
  where rp.room_id = p_room and rp.role = 'player';

  insert into public.game_properties (game_id, tile_id)
  select v_game, bt.id from public.board_tiles bt
  where bt.kind in ('property','hub','utility');

  insert into public.game_cards (game_id, card_id, deck, position)
  select v_game, cd.id, cd.deck,
         row_number() over (partition by cd.deck order by random())::int
  from public.card_definitions cd;

  select seat into v_start_seat from public.game_players
  where game_id = v_game order by random() limit 1;
  update public.games set current_seat = v_start_seat where id = v_game;

  select name into v_first_name from public.game_players where game_id = v_game and seat = v_start_seat;

  perform public.fn_log_event(v_game, 'game_started', null,
    '🎮 بدأت المباراة! يبدأ ' || v_first_name || ' (حدّد السيرفر الترتيب عشوائيًا)',
    '🎮 Game started! ' || v_first_name || ' plays first (server-random order)', null);

  update public.rooms
  set status = 'playing', current_game_id = v_game, last_activity_at = now()
  where id = p_room;

  return v_game;
end $$;

-- ---------- إعادة المباراة (إعادة تعيين الغرفة) ----------
create or replace function public.reset_room(p_room uuid)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_room public.rooms;
begin
  select * into v_room from public.rooms where id = p_room for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.host_id <> auth.uid() then raise exception 'NOT_HOST'; end if;
  if v_room.status <> 'playing' then raise exception 'NO_ACTIVE_GAME'; end if;
  update public.rooms set status = 'lobby', last_activity_at = now() where id = p_room;
  update public.room_players set is_ready = false where room_id = p_room;
  insert into public.chat_messages (room_id, sender_user_id, sender_name, kind, body)
  values (p_room, null, '', 'system', '🔁 المضيف أعاد المباراة — عادوا إلى غرفة الانتظار');
end $$;

-- ---------- الدردشة ----------
create or replace function public.fn_normalize_chat(p_body text)
returns text language sql immutable as $$
  select regexp_replace(
    translate(p_body, 'أإآٱىةؤئ', 'اااييهويي'),
    '[' || chr(1611) || '-' || chr(1642) || chr(1600) || chr(8206) || chr(8207) || ']',
    '', 'g'
  );
$$;

create or replace function public.send_chat(p_room uuid, p_body text, p_kind text default 'user')
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
        v_room public.rooms;
        v_rp record;
        v_body text;
        v_name text;
        v_recent int;
        v_last timestamptz;
        v_id uuid;
        r record;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_kind not in ('user','quick') then raise exception 'INVALID_CHAT_KIND'; end if;
  select * into v_room from public.rooms where id = p_room;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  select * into v_rp from public.room_players where room_id = p_room and user_id = v_uid;
  if not found then raise exception 'NOT_IN_ROOM'; end if;
  select coalesce(p.username, 'trader') into v_name from public.profiles p where p.id = v_uid;

  -- حدود الإرسال
  select count(*)::int into v_recent from public.chat_messages
  where sender_user_id = v_uid and created_at > now() - interval '10 seconds';
  if v_recent >= 6 then raise exception 'CHAT_RATE_LIMITED'; end if;
  select max(created_at) into v_last from public.chat_messages
  where sender_user_id = v_uid and kind in ('user','quick');
  if v_last is not null and v_last > now() - interval '1200 milliseconds' then
    raise exception 'CHAT_RATE_LIMITED';
  end if;

  -- تنظيف المدخلات (XSS): إزالة الوسوم وتوحيد الفراغات
  v_body := regexp_replace(trim(p_body), '<[^>]*>', '', 'g');
  v_body := regexp_replace(v_body, '\s+', ' ', 'g');
  v_body := public.fn_normalize_chat(v_body);
  if char_length(v_body) < 1 then raise exception 'EMPTY_MESSAGE'; end if;
  if char_length(v_body) > 300 then v_body := left(v_body, 300); end if;

  -- فلتر الكلمات المحظورة
  if public.fn_sb(v_room.settings, 'chat_filter_enabled', true) then
    for r in select word from public.banned_words loop
      begin
        v_body := regexp_replace(v_body, r.word, '***', 'gi');
      exception when invalid_regular_expression then
        v_body := replace(v_body, r.word, '***');
      end;
    end loop;
  end if;

  insert into public.chat_messages (room_id, game_id, sender_user_id, sender_name, kind, body)
  values (p_room, v_room.current_game_id, v_uid, v_name, p_kind, v_body)
  returning id into v_id;
  return v_id;
end $$;

-- ---------- نبضة الاتصال ----------
create or replace function public.heartbeat(p_room uuid)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  update public.room_players set last_seen_at = now()
  where room_id = p_room and user_id = v_uid;
  update public.game_players gp set last_seen_at = now()
  from public.games g
  where g.id = gp.game_id and g.room_id = p_room and gp.user_id = v_uid;
end $$;

-- ---------- بلاغ ----------
create or replace function public.report_user(p_target uuid, p_reason text, p_room uuid default null)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
        v_recent int;
        v_id uuid;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 1 or char_length(btrim(p_reason)) > 500 then
    raise exception 'INVALID_REASON';
  end if;
  select count(*)::int into v_recent from public.reports
  where reporter_id = v_uid and created_at > now() - interval '1 hour';
  if v_recent >= 5 then raise exception 'REPORT_RATE_LIMITED'; end if;
  insert into public.reports (reporter_id, target_user_id, room_id, reason)
  values (v_uid, p_target, p_room, btrim(p_reason)) returning id into v_id;
  return v_id;
end $$;

-- ---------- لقطة الغرفة ----------
create or replace function public.get_room_snapshot(p_code text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
        v_room public.rooms;
        v_me record;
begin
  select * into v_room from public.fn_get_room_by_code(p_code);
  if not (v_room.is_public or public.fn_is_room_member(v_room.id, v_uid) or public.fn_is_admin(v_uid)) then
    raise exception 'ROOM_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into v_me from public.room_players where room_id = v_room.id and user_id = v_uid;

  return jsonb_build_object(
    'room', jsonb_build_object(
      'id', v_room.id, 'code', v_room.code, 'name', v_room.name,
      'is_public', v_room.is_public, 'host_id', v_room.host_id, 'status', v_room.status,
      'max_players', v_room.max_players, 'current_game_id', v_room.current_game_id,
      'settings', public.fn_sanitize_settings(v_room.settings)
    ),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', rp.id, 'seat', rp.seat, 'user_id', rp.user_id, 'bot_level', rp.bot_level,
          'name', coalesce(rp.bot_name, p.username, 'trader'),
          'color', rp.color, 'token', rp.token, 'is_ready', rp.is_ready, 'role', rp.role
        ) order by rp.seat nulls last, rp.joined_at)
      from public.room_players rp
      left join public.profiles p on p.id = rp.user_id
      where rp.room_id = v_room.id
    ), '[]'::jsonb),
    'me', case when v_me is null then null else jsonb_build_object(
      'user_id', v_uid, 'seat', v_me.seat, 'role', v_me.role,
      'is_host', v_room.host_id = v_uid
    ) end,
    'server_now', now()::text
  );
end $$;

-- ---------- قائمة الغرف العامة ----------
create or replace function public.get_public_rooms()
returns table (
  id uuid, code text, name text, host_name text,
  mode text, players_count int, max_players int,
  status public.room_status, created_at timestamptz
)
language sql stable security invoker as $$
  select r.id, r.code, r.name, hp.username as host_name,
         coalesce(r.settings->>'mode', 'classic') as mode,
         (select count(*)::int from public.room_players rp where rp.room_id = r.id and rp.role = 'player') as players_count,
         r.max_players, r.status, r.created_at
  from public.rooms r
  left join public.profiles hp on hp.id = r.host_id
  where r.is_public and r.status <> 'closed' and r.closed_at is null
  order by r.created_at desc
  limit 60
$$;
