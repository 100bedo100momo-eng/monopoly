-- ============================================================
-- 0005: دوال المباراة العامة (RPCs) — التحقق من الهوية والدور والحالة
-- كل دالة: تتحقق من المستخدم → من انتمائه → من دوره → من الحالة → تنفّذ داخل قفل صف المباراة
-- ============================================================

-- ---------- مساعدات التحقق ----------
create or replace function public.fn_assert_game_access(p_game uuid)
returns void language plpgsql stable security definer set search_path = public as $$
declare v_room uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select room_id into v_room from public.games where id = p_game;
  if not found then raise exception 'GAME_NOT_FOUND' using errcode = 'P0002'; end if;
  if not (public.fn_is_room_member(v_room, auth.uid()) or public.fn_is_admin(auth.uid())) then
    raise exception 'NOT_IN_GAME';
  end if;
end $$;

create or replace function public.fn_resolve_actor(p_game uuid, p_seat int default null)
returns int language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
        v_own int;
        v_host uuid;
        v_is_bot boolean;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_seat is null then
    select seat into v_own from public.game_players where game_id = p_game and user_id = v_uid;
    if v_own is null then raise exception 'NOT_IN_GAME'; end if;
    return v_own;
  end if;
  -- التصرف نيابة عن بوت: مسموح للمضيف فقط
  select (gp.bot_level is not null) into v_is_bot
  from public.game_players gp where gp.game_id = p_game and gp.seat = p_seat;
  if not found or not v_is_bot then raise exception 'SEAT_NOT_BOT'; end if;
  select r.host_id into v_host from public.games g join public.rooms r on r.id = g.room_id where g.id = p_game;
  if v_host <> v_uid then raise exception 'NOT_HOST'; end if;
  return p_seat;
end $$;

create or replace function public.fn_lock_game(p_game uuid)
returns public.games language plpgsql volatile security definer set search_path = public as $$
declare v_g public.games;
begin
  perform public.fn_assert_game_access(p_game);
  select * into v_g from public.games where id = p_game for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  return v_g;
end $$;

-- مفتاح منع التكرار + حد معدل الحركات
create or replace function public.fn_begin_action(p_game uuid, p_seat int, p_action text, p_key text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_recent int;
begin
  if p_key is null or char_length(p_key) < 8 or char_length(p_key) > 64 then
    raise exception 'INVALID_ACTION_KEY';
  end if;
  insert into public.game_actions (game_id, seat, action, idempotency_key)
  values (p_game, p_seat, p_action, p_key)
  on conflict (game_id, idempotency_key) do nothing;
  if not found then raise exception 'DUPLICATE_ACTION'; end if;
  select count(*)::int into v_recent from public.game_actions
  where game_id = p_game and seat = p_seat and created_at > now() - interval '5 seconds';
  if v_recent > 40 then raise exception 'RATE_LIMITED'; end if;
end $$;

-- ---------- رمي النرد ----------
create or replace function public.roll_dice(p_game uuid, p_key text, p_seat int default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_g public.games; v_seat int; v_p record;
begin
  v_g := public.fn_lock_game(p_game);
  v_seat := public.fn_resolve_actor(p_game, p_seat);
  perform public.fn_begin_action(p_game, v_seat, 'roll_dice', p_key);
  select * into v_p from public.game_players where game_id = p_game and seat = v_seat;
  if v_p.is_bankrupt then raise exception 'PLAYER_BANKRUPT'; end if;

  if v_g.turn_phase = 'awaiting_roll' then
    if v_g.current_seat <> v_seat then raise exception 'NOT_YOUR_TURN'; end if;
    perform public.fn_do_roll(p_game, v_seat, false);
  elsif v_g.turn_phase = 'awaiting_detention_choice' then
    if v_g.current_seat <> v_seat then raise exception 'NOT_YOUR_TURN'; end if;
    if not v_p.in_detention then raise exception 'NOT_DETAINED'; end if;
    perform public.fn_do_roll(p_game, v_seat, true);
  else
    raise exception 'WRONG_PHASE';
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- شراء عقار ----------
create or replace function public.buy_property(p_game uuid, p_key text, p_seat int default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_g public.games; v_seat int; v_p record;
        v_prop public.game_properties%rowtype; v_t public.board_tiles%rowtype; v_price int;
begin
  v_g := public.fn_lock_game(p_game);
  v_seat := public.fn_resolve_actor(p_game, p_seat);
  perform public.fn_begin_action(p_game, v_seat, 'buy_property', p_key);
  if v_g.status <> 'active' or v_g.turn_phase <> 'awaiting_property_decision' or v_g.current_seat <> v_seat then
    raise exception 'WRONG_PHASE';
  end if;
  select * into v_p from public.game_players where game_id = p_game and seat = v_seat;
  if v_p.is_bankrupt then raise exception 'PLAYER_BANKRUPT'; end if;
  select * into v_t from public.board_tiles
  where position = v_p.position and kind in ('property','hub','utility');
  if not found then raise exception 'NOT_A_PROPERTY'; end if;
  select * into v_prop from public.game_properties where game_id = p_game and tile_id = v_t.id;
  if v_prop.owner_seat is not null then raise exception 'ALREADY_OWNED'; end if;
  v_price := v_t.price;
  if v_p.cash < v_price then raise exception 'INSUFFICIENT_FUNDS'; end if;

  update public.game_players set cash = cash - v_price where game_id = p_game and seat = v_seat;
  update public.game_properties set owner_seat = v_seat, buildings = 0, is_mortgaged = false
  where game_id = p_game and tile_id = v_t.id;
  update public.games set turn_phase = 'awaiting_end_turn' where id = p_game;
  perform public.fn_log_event(p_game, 'bought', v_seat,
    '🏠 اشترى ' || v_t.name_ar || ' بمبلغ ' || v_price || ' درهم',
    '🏠 Bought ' || v_t.name_en || ' for ' || v_price || ' dirhams',
    jsonb_build_object('tile_id', v_t.id, 'price', v_price));
  return jsonb_build_object('ok', true);
end $$;

-- ---------- رفض الشراء (يفتح المزاد إن كانت المزادات مفعلة) ----------
create or replace function public.decline_property(p_game uuid, p_key text, p_seat int default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_g public.games; v_seat int;
begin
  v_g := public.fn_lock_game(p_game);
  v_seat := public.fn_resolve_actor(p_game, p_seat);
  perform public.fn_begin_action(p_game, v_seat, 'decline_property', p_key);
  if v_g.status <> 'active' or v_g.turn_phase <> 'awaiting_property_decision' or v_g.current_seat <> v_seat then
    raise exception 'WRONG_PHASE';
  end if;
  perform public.fn_do_decline(p_game, v_seat);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- المزادات ----------
create or replace function public.place_bid(p_game uuid, p_amount int, p_key text, p_seat int default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_g public.games; v_seat int; v_p record;
        v_a public.auctions%rowtype; v_min int;
begin
  v_g := public.fn_lock_game(p_game);
  v_seat := public.fn_resolve_actor(p_game, p_seat);
  perform public.fn_begin_action(p_game, v_seat, 'place_bid', p_key);
  if v_g.status <> 'active' or v_g.turn_phase <> 'auction_active' then raise exception 'WRONG_PHASE'; end if;
  select * into v_p from public.game_players where game_id = p_game and seat = v_seat;
  if v_p.is_bankrupt then raise exception 'PLAYER_BANKRUPT'; end if;
  if v_p.debt_amount > 0 then raise exception 'HAS_DEBT'; end if;
  select * into v_a from public.auctions
  where game_id = p_game and status = 'active'
  order by created_at desc limit 1 for update;
  if not found then raise exception 'NO_ACTIVE_AUCTION'; end if;
  if now() >= v_a.ends_at then raise exception 'AUCTION_ENDED'; end if;

  v_min := case when v_a.current_bidder_seat is null then v_a.min_increment
                else v_a.current_bid + v_a.min_increment end;
  if p_amount < v_min then raise exception 'BID_TOO_LOW'; end if;
  if p_amount > v_p.cash then raise exception 'INSUFFICIENT_FUNDS'; end if;

  update public.auctions
  set current_bid = p_amount, current_bidder_seat = v_seat, updated_at = now()
  where id = v_a.id;
  insert into public.auction_bids (auction_id, seat, amount) values (v_a.id, v_seat, p_amount);

  -- تمديد العداد إذا جاءت المزايدة في اللحظات الأخيرة
  if now() > v_a.ends_at - interval '5 seconds' then
    update public.auctions
    set ends_at = now() + make_interval(secs => public.fn_s(v_g.settings, 'auction_seconds', 10) / 2)
    where id = v_a.id;
    update public.games
    set turn_deadline_at = (select ends_at from public.auctions where id = v_a.id)
    where id = p_game;
  end if;

  select name_ar into v_min from public.board_tiles where id = v_a.tile_id;
  perform public.fn_log_event(p_game, 'bid', v_seat,
    '🔨 زايد ' || p_amount || ' درهم على ' || v_min,
    '🔨 Bid ' || p_amount || ' dirhams on ' || v_min,
    jsonb_build_object('auction_id', v_a.id, 'amount', p_amount));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.finish_auction(p_game uuid, p_key text, p_seat int default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_seat int; v_done boolean;
begin
  perform public.fn_assert_game_access(p_game);
  v_seat := public.fn_resolve_actor(p_game, p_seat);
  perform public.fn_begin_action(p_game, v_seat, 'finish_auction', p_key);
  v_done := public.fn_finish_auction_core(p_game);
  if not v_done then raise exception 'AUCTION_NOT_READY'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- مزاد يدوي اختياري يفتحه صاحب الدور على أي عقار غير مملوك
create or replace function public.start_auction(p_game uuid, p_tile text, p_key text, p_seat int default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_g public.games; v_seat int; v_prop record;
begin
  v_g := public.fn_lock_game(p_game);
  v_seat := public.fn_resolve_actor(p_game, p_seat);
  perform public.fn_begin_action(p_game, v_seat, 'start_auction', p_key);
  if v_g.status <> 'active' or v_g.turn_phase not in ('awaiting_roll','awaiting_end_turn')
     or v_g.current_seat <> v_seat then
    raise exception 'WRONG_PHASE';
  end if;
  select * into v_prop from public.game_properties
  where game_id = p_game and tile_id = p_tile;
  if not found then raise exception 'NOT_A_PROPERTY'; end if;
  if v_prop.owner_seat is not null then raise exception 'ALREADY_OWNED'; end if;
  perform public.fn_create_auction(p_game, p_tile);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- البناء والبيع والرهن ----------
create or replace function public.build_property(p_game uuid, p_tile text, p_key text, p_seat int default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_g public.games; v_seat int; v_p record;
        v_prop public.game_properties%rowtype; v_t public.board_tiles%rowtype;
        v_group text; v_group_ids text[]; v_cost int; v_label text;
begin
  v_g := public.fn_lock_game(p_game);
  v_seat := public.fn_resolve_actor(p_game, p_seat);
  perform public.fn_begin_action(p_game, v_seat, 'build_property', p_key);
  if v_g.status <> 'active' or v_g.turn_phase not in ('awaiting_roll','awaiting_end_turn')
     or v_g.current_seat <> v_seat then
    raise exception 'WRONG_PHASE';
  end if;
  select * into v_p from public.game_players where game_id = p_game and seat = v_seat;
  if v_p.is_bankrupt then raise exception 'PLAYER_BANKRUPT'; end if;
  select * into v_prop from public.game_properties where game_id = p_game and tile_id = p_tile for update;
  if not found then raise exception 'NOT_A_PROPERTY'; end if;
  select * into v_t from public.board_tiles where id = p_tile;
  if v_t.kind <> 'property' then raise exception 'CANNOT_BUILD_HERE'; end if;
  if v_prop.owner_seat <> v_seat then raise exception 'NOT_OWNER'; end if;
  if v_prop.is_mortgaged then raise exception 'MORTGAGED'; end if;

  v_group := v_t.color_group;
  select array_agg(id) into v_group_ids from public.board_tiles where color_group = v_group and kind = 'property';
  if not exists (
    select 1 from public.game_properties gp
    where gp.game_id = p_game and gp.tile_id = any(v_group_ids)
      and gp.owner_seat = v_seat and not gp.is_mortgaged
    having count(*) = array_length(v_group_ids, 1)
  ) then
    raise exception 'NEED_FULL_GROUP';
  end if;
  if exists (
    select 1 from public.game_properties gp
    where gp.game_id = p_game and gp.tile_id = any(v_group_ids) and gp.is_mortgaged
  ) then
    raise exception 'GROUP_HAS_MORTGAGE';
  end if;

  -- قاعدة البناء المتوازن + حد المستويات
  if v_prop.buildings >= least(public.fn_s(v_g.settings, 'buildings_max', 4) + 1, 5) then
    raise exception 'MAX_LEVEL_REACHED';
  end if;
  if v_prop.buildings <> (
    select min(gp.buildings) from public.game_properties gp
    where gp.game_id = p_game and gp.tile_id = any(v_group_ids) and gp.owner_seat = v_seat
  ) then
    raise exception 'UNEVEN_BUILD';
  end if;

  v_cost := v_t.build_cost;
  if v_p.cash < v_cost then raise exception 'INSUFFICIENT_FUNDS'; end if;

  update public.game_players set cash = cash - v_cost where game_id = p_game and seat = v_seat;
  update public.game_properties set buildings = buildings + 1 where game_id = p_game and tile_id = p_tile;
  v_label := case when v_prop.buildings + 1 >= 5 then 'المعلم المميز 🏰' else 'مبنى رقم ' || (v_prop.buildings + 1) end;
  perform public.fn_log_event(p_game, 'built', v_seat,
    '🏗️ بنى ' || v_label || ' في ' || v_t.name_ar || ' (' || v_cost || ' درهم)',
    '🏗️ Built ' || v_label || ' in ' || v_t.name_en || ' (' || v_cost || ' dirhams)',
    jsonb_build_object('tile_id', p_tile, 'level', v_prop.buildings + 1, 'cost', v_cost));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.sell_building(p_game uuid, p_tile text, p_key text, p_seat int default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_g public.games; v_seat int; v_p record;
        v_prop public.game_properties%rowtype; v_t public.board_tiles%rowtype;
        v_group_ids text[]; v_proceeds int;
begin
  v_g := public.fn_lock_game(p_game);
  v_seat := public.fn_resolve_actor(p_game, p_seat);
  perform public.fn_begin_action(p_game, v_seat, 'sell_building', p_key);
  if v_g.status <> 'active' or v_g.turn_phase not in ('awaiting_roll','awaiting_end_turn','awaiting_debt')
     or v_g.current_seat <> v_seat then
    raise exception 'WRONG_PHASE';
  end if;
  select * into v_p from public.game_players where game_id = p_game and seat = v_seat;
  if v_p.is_bankrupt then raise exception 'PLAYER_BANKRUPT'; end if;
  select * into v_prop from public.game_properties where game_id = p_game and tile_id = p_tile for update;
  if not found or v_prop.owner_seat <> v_seat then raise exception 'NOT_OWNER'; end if;
  if v_prop.buildings <= 0 then raise exception 'NO_BUILDINGS'; end if;
  select * into v_t from public.board_tiles where id = p_tile;
  if v_t.kind <> 'property' then raise exception 'CANNOT_SELL_HERE'; end if;

  select array_agg(id) into v_group_ids from public.board_tiles where color_group = v_t.color_group and kind = 'property';
  if v_prop.buildings <> (
    select max(gp.buildings) from public.game_properties gp
    where gp.game_id = p_game and gp.tile_id = any(v_group_ids) and gp.owner_seat = v_seat
  ) then
    raise exception 'UNEVEN_SELL';
  end if;

  v_proceeds := floor(coalesce(v_t.build_cost, 0) / 2.0)::int;
  update public.game_players set cash = cash + v_proceeds where game_id = p_game and seat = v_seat;
  update public.game_properties set buildings = buildings - 1 where game_id = p_game and tile_id = p_tile;
  perform public.fn_log_event(p_game, 'sold_building', v_seat,
    '📉 باع مبنى في ' || v_t.name_ar || ' بمبلغ ' || v_proceeds || ' درهم',
    '📉 Sold a building in ' || v_t.name_en || ' for ' || v_proceeds || ' dirhams',
    jsonb_build_object('tile_id', p_tile, 'proceeds', v_proceeds));
  perform public.fn_try_auto_settle(p_game, v_seat);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.mortgage_property(p_game uuid, p_tile text, p_key text, p_seat int default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_g public.games; v_seat int; v_p record;
        v_prop public.game_properties%rowtype; v_t public.board_tiles%rowtype;
        v_group_ids text[]; v_value int;
begin
  v_g := public.fn_lock_game(p_game);
  v_seat := public.fn_resolve_actor(p_game, p_seat);
  perform public.fn_begin_action(p_game, v_seat, 'mortgage_property', p_key);
  if v_g.status <> 'active' or v_g.turn_phase not in ('awaiting_roll','awaiting_end_turn','awaiting_debt')
     or v_g.current_seat <> v_seat then
    raise exception 'WRONG_PHASE';
  end if;
  select * into v_p from public.game_players where game_id = p_game and seat = v_seat;
  if v_p.is_bankrupt then raise exception 'PLAYER_BANKRUPT'; end if;
  select * into v_prop from public.game_properties where game_id = p_game and tile_id = p_tile for update;
  if not found or v_prop.owner_seat <> v_seat then raise exception 'NOT_OWNER'; end if;
  if v_prop.is_mortgaged then raise exception 'ALREADY_MORTGAGED'; end if;
  select * into v_t from public.board_tiles where id = p_tile;
  if v_t.kind <> 'property' then raise exception 'CANNOT_MORTGAGE_HERE'; end if;

  select array_agg(id) into v_group_ids from public.board_tiles where color_group = v_t.color_group and kind = 'property';
  if exists (
    select 1 from public.game_properties gp
    where gp.game_id = p_game and gp.tile_id = any(v_group_ids) and gp.buildings > 0
  ) then
    raise exception 'GROUP_HAS_BUILDINGS';
  end if;

  v_value := v_t.mortgage_value;
  update public.game_players set cash = cash + v_value where game_id = p_game and seat = v_seat;
  update public.game_properties set is_mortgaged = true where game_id = p_game and tile_id = p_tile;
  perform public.fn_log_event(p_game, 'mortgaged', v_seat,
    '🏦 رهن ' || v_t.name_ar || ' وحصل على ' || v_value || ' درهم',
    '🏦 Mortgaged ' || v_t.name_en || ' for ' || v_value || ' dirhams',
    jsonb_build_object('tile_id', p_tile, 'value', v_value));
  perform public.fn_try_auto_settle(p_game, v_seat);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.unmortgage_property(p_game uuid, p_tile text, p_key text, p_seat int default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_g public.games; v_seat int; v_p record;
        v_prop public.game_properties%rowtype; v_t public.board_tiles%rowtype;
        v_cost int;
begin
  v_g := public.fn_lock_game(p_game);
  v_seat := public.fn_resolve_actor(p_game, p_seat);
  perform public.fn_begin_action(p_game, v_seat, 'unmortgage_property', p_key);
  if v_g.status <> 'active' or v_g.turn_phase not in ('awaiting_roll','awaiting_end_turn')
     or v_g.current_seat <> v_seat then
    raise exception 'WRONG_PHASE';
  end if;
  select * into v_p from public.game_players where game_id = p_game and seat = v_seat;
  if v_p.is_bankrupt then raise exception 'PLAYER_BANKRUPT'; end if;
  select * into v_prop from public.game_properties where game_id = p_game and tile_id = p_tile for update;
  if not found or v_prop.owner_seat <> v_seat then raise exception 'NOT_OWNER'; end if;
  if not v_prop.is_mortgaged then raise exception 'NOT_MORTGAGED'; end if;
  select * into v_t from public.board_tiles where id = p_tile;
  v_cost := ceil(v_t.mortgage_value * (100 + public.fn_s(v_g.settings, 'unmortgage_interest_pct', 10)) / 100.0)::int;
  if v_p.cash < v_cost then raise exception 'INSUFFICIENT_FUNDS'; end if;

  update public.game_players set cash = cash - v_cost where game_id = p_game and seat = v_seat;
  update public.game_properties set is_mortgaged = false where game_id = p_game and tile_id = p_tile;
  perform public.fn_log_event(p_game, 'unmortgaged', v_seat,
    '💵 فك رهن ' || v_t.name_ar || ' مقابل ' || v_cost || ' درهم',
    '💵 Unmortgaged ' || v_t.name_en || ' for ' || v_cost || ' dirhams',
    jsonb_build_object('tile_id', p_tile, 'cost', v_cost));
  return jsonb_build_object('ok', true);
end $$;

-- ---------- التداول ----------
create or replace function public.create_trade_offer(
  p_game uuid, p_to_seat int, p_money_from int default 0, p_money_to int default 0,
  p_give_tiles text[] default array[]::text[], p_request_tiles text[] default array[]::text[],
  p_key text default null, p_seat int default null
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_g public.games; v_seat int; v_p record; v_target record;
        v_offer uuid; v_expiry int; t text; r record;
begin
  v_g := public.fn_lock_game(p_game);
  v_seat := public.fn_resolve_actor(p_game, p_seat);
  if p_key is null or char_length(p_key) < 8 then raise exception 'INVALID_ACTION_KEY'; end if;
  perform public.fn_begin_action(p_game, v_seat, 'create_trade_offer', p_key);
  if v_g.status <> 'active' or v_g.turn_phase in ('auction_active') then raise exception 'WRONG_PHASE'; end if;
  if not public.fn_sb(v_g.settings, 'trading_enabled', true) then raise exception 'TRADING_DISABLED'; end if;

  select * into v_p from public.game_players where game_id = p_game and seat = v_seat;
  if v_p.is_bankrupt then raise exception 'PLAYER_BANKRUPT'; end if;
  select * into v_target from public.game_players where game_id = p_game and seat = p_to_seat;
  if not found then raise exception 'TARGET_NOT_FOUND'; end if;
  if v_target.is_bankrupt then raise exception 'TARGET_BANKRUPT'; end if;
  if p_to_seat = v_seat then raise exception 'TRADE_WITH_SELF'; end if;

  if p_money_from < 0 or p_money_to < 0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_money_from > v_p.cash then raise exception 'INSUFFICIENT_FUNDS'; end if;
  if p_money_from = 0 and p_money_to = 0 and array_length(p_give_tiles, 1) is null and array_length(p_request_tiles, 1) is null then
    raise exception 'EMPTY_TRADE';
  end if;

  foreach t in array coalesce(p_give_tiles, array[]::text[]) loop
    if exists (select 1 from public.game_properties gp where gp.game_id = p_game and gp.tile_id = t and gp.buildings > 0) then
      raise exception 'TILE_HAS_BUILDINGS';
    end if;
    if not exists (
      select 1 from public.game_properties gp
      where gp.game_id = p_game and gp.tile_id = t and gp.owner_seat = v_seat
    ) then
      raise exception 'NOT_OWNER';
    end if;
  end loop;
  foreach t in array coalesce(p_request_tiles, array[]::text[]) loop
    if not exists (
      select 1 from public.game_properties gp
      where gp.game_id = p_game and gp.tile_id = t and gp.owner_seat = p_to_seat
    ) then
      raise exception 'TARGET_NOT_OWNER';
    end if;
    if exists (select 1 from public.game_properties gp where gp.game_id = p_game and gp.tile_id = t and gp.buildings > 0) then
      raise exception 'TILE_HAS_BUILDINGS';
    end if;
  end loop;

  -- منع حجز نفس العقار في أكثر من عرض معلق
  if exists (
    select 1 from public.trade_offer_items i
    join public.trade_offers t2 on t2.id = i.offer_id
    where t2.game_id = p_game and t2.status = 'pending' and t2.expires_at > now()
      and i.tile_id = any(coalesce(p_give_tiles, array[]::text[]) || coalesce(p_request_tiles, array[]::text[]))
  ) then
    raise exception 'TILE_IN_PENDING_OFFER';
  end if;

  v_expiry := public.fn_s(v_g.settings, 'trade_expiry_seconds', 120);
  insert into public.trade_offers (game_id, from_seat, to_seat, money_from, money_to, expires_at)
  values (p_game, v_seat, p_to_seat, p_money_from, p_money_to, now() + make_interval(secs => v_expiry))
  returning id into v_offer;

  foreach t in array coalesce(p_give_tiles, array[]::text[]) loop
    insert into public.trade_offer_items (offer_id, direction, tile_id) values (v_offer, 'give', t);
  end loop;
  foreach t in array coalesce(p_request_tiles, array[]::text[]) loop
    insert into public.trade_offer_items (offer_id, direction, tile_id) values (v_offer, 'request', t);
  end loop;

  perform public.fn_log_event(p_game, 'trade_created', v_seat,
    '🤝 أرسل عرض تداول للاعب رقم ' || p_to_seat,
    '🤝 Sent a trade offer to seat ' || p_to_seat,
    jsonb_build_object('offer_id', v_offer, 'money_from', p_money_from, 'money_to', p_money_to,
      'give', to_jsonb(p_give_tiles), 'request', to_jsonb(p_request_tiles)));
  return jsonb_build_object('ok', true, 'offer_id', v_offer);
end $$;

create or replace function public.accept_trade_offer(p_offer_id uuid, p_key text, p_seat int default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_g public.games; v_offer public.trade_offers%rowtype;
        v_actor int; v_from record; v_to record;
        i record; v_needed int;
begin
  select * into v_offer from public.trade_offers where id = p_offer_id;
  if not found then raise exception 'OFFER_NOT_FOUND'; end if;
  select * into v_g from public.games where id = v_offer.game_id for update;
  v_actor := public.fn_resolve_actor(v_offer.game_id, p_seat);
  if p_key is null or char_length(p_key) < 8 then raise exception 'INVALID_ACTION_KEY'; end if;
  perform public.fn_begin_action(v_offer.game_id, v_actor, 'accept_trade_offer:' || v_offer.id, p_key);
  if v_g.status <> 'active' or v_g.turn_phase = 'auction_active' then raise exception 'WRONG_PHASE'; end if;
  if v_offer.status <> 'pending' then raise exception 'OFFER_NOT_PENDING'; end if;
  if v_offer.expires_at < now() then
    update public.trade_offers set status = 'expired', resolved_at = now() where id = p_offer_id;
    raise exception 'OFFER_EXPIRED';
  end if;
  if v_offer.to_seat <> v_actor then raise exception 'NOT_OFFER_TARGET'; end if;

  select * into v_from from public.game_players where game_id = v_offer.game_id and seat = v_offer.from_seat for update;
  select * into v_to from public.game_players where game_id = v_offer.game_id and seat = v_offer.to_seat for update;
  if v_from.is_bankrupt or v_to.is_bankrupt then raise exception 'PLAYER_BANKRUPT'; end if;

  -- إعادة التحقق من الملكية والسيولة وقت القبول
  if v_from.cash < v_offer.money_from then raise exception 'INSUFFICIENT_FUNDS'; end if;
  if v_to.cash < v_offer.money_to then raise exception 'INSUFFICIENT_FUNDS'; end if;
  for i in select * from public.trade_offer_items where offer_id = p_offer_id loop
    if i.direction = 'give' then
      if not exists (
        select 1 from public.game_properties gp
        where gp.game_id = v_offer.game_id and gp.tile_id = i.tile_id
          and gp.owner_seat = v_offer.from_seat and gp.buildings = 0
      ) then
        raise exception 'OWNERSHIP_CHANGED';
      end if;
    else
      if not exists (
        select 1 from public.game_properties gp
        where gp.game_id = v_offer.game_id and gp.tile_id = i.tile_id
          and gp.owner_seat = v_offer.to_seat and gp.buildings = 0
      ) then
        raise exception 'OWNERSHIP_CHANGED';
      end if;
    end if;
  end loop;

  -- تنفيذ التبادل داخل نفس المعاملة
  if v_offer.money_from > 0 then
    update public.game_players set cash = cash - v_offer.money_from
    where game_id = v_offer.game_id and seat = v_offer.from_seat;
    update public.game_players set cash = cash + v_offer.money_from
    where game_id = v_offer.game_id and seat = v_offer.to_seat;
  end if;
  if v_offer.money_to > 0 then
    update public.game_players set cash = cash - v_offer.money_to
    where game_id = v_offer.game_id and seat = v_offer.to_seat;
    update public.game_players set cash = cash + v_offer.money_to
    where game_id = v_offer.game_id and seat = v_offer.from_seat;
  end if;
  for i in select * from public.trade_offer_items where offer_id = p_offer_id loop
    if i.direction = 'give' then
      update public.game_properties set owner_seat = v_offer.to_seat
      where game_id = v_offer.game_id and tile_id = i.tile_id;
    else
      update public.game_properties set owner_seat = v_offer.from_seat
      where game_id = v_offer.game_id and tile_id = i.tile_id;
    end if;
  end loop;

  update public.trade_offers set status = 'accepted', resolved_at = now() where id = p_offer_id;
  perform public.fn_log_event(v_offer.game_id, 'trade_accepted', v_actor,
    '🤝 تم قبول عرض التداول', '🤝 Trade offer accepted',
    jsonb_build_object('offer_id', p_offer_id));
  perform public.fn_try_auto_settle(v_offer.game_id, v_offer.from_seat);
  perform public.fn_try_auto_settle(v_offer.game_id, v_offer.to_seat);
  perform public.fn_maybe_finish_game(v_offer.game_id);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.reject_trade_offer(p_offer_id uuid, p_key text, p_seat int default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_offer public.trade_offers%rowtype; v_actor int;
begin
  select * into v_offer from public.trade_offers where id = p_offer_id;
  if not found then raise exception 'OFFER_NOT_FOUND'; end if;
  v_actor := public.fn_resolve_actor(v_offer.game_id, p_seat);
  if p_key is null or char_length(p_key) < 8 then raise exception 'INVALID_ACTION_KEY'; end if;
  perform public.fn_begin_action(v_offer.game_id, v_actor, 'reject_trade_offer:' || v_offer.id, p_key);
  if v_offer.status <> 'pending' then raise exception 'OFFER_NOT_PENDING'; end if;
  if v_offer.to_seat <> v_actor then raise exception 'NOT_OFFER_TARGET'; end if;
  update public.trade_offers set status = 'rejected', resolved_at = now() where id = p_offer_id;
  perform public.fn_log_event(v_offer.game_id, 'trade_rejected', v_actor,
    '❌ رُفض عرض التداول', '❌ Trade offer rejected', jsonb_build_object('offer_id', p_offer_id));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.cancel_trade_offer(p_offer_id uuid, p_key text, p_seat int default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_offer public.trade_offers%rowtype; v_actor int;
begin
  select * into v_offer from public.trade_offers where id = p_offer_id;
  if not found then raise exception 'OFFER_NOT_FOUND'; end if;
  v_actor := public.fn_resolve_actor(v_offer.game_id, p_seat);
  if p_key is null or char_length(p_key) < 8 then raise exception 'INVALID_ACTION_KEY'; end if;
  perform public.fn_begin_action(v_offer.game_id, v_actor, 'cancel_trade_offer:' || v_offer.id, p_key);
  if v_offer.status <> 'pending' then raise exception 'OFFER_NOT_PENDING'; end if;
  if v_offer.from_seat <> v_actor then raise exception 'NOT_OFFER_SENDER'; end if;
  update public.trade_offers set status = 'cancelled', resolved_at = now() where id = p_offer_id;
  perform public.fn_log_event(v_offer.game_id, 'trade_cancelled', v_actor,
    '🚫 أُلغي عرض التداول', '🚫 Trade offer cancelled', jsonb_build_object('offer_id', p_offer_id));
  return jsonb_build_object('ok', true);
end $$;

-- ---------- التوقيف ----------
create or replace function public.pay_to_leave_detention(p_game uuid, p_key text, p_seat int default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_g public.games; v_seat int; v_p record; v_fee int;
begin
  v_g := public.fn_lock_game(p_game);
  v_seat := public.fn_resolve_actor(p_game, p_seat);
  perform public.fn_begin_action(p_game, v_seat, 'pay_to_leave_detention', p_key);
  if v_g.status <> 'active' or v_g.turn_phase <> 'awaiting_detention_choice' or v_g.current_seat <> v_seat then
    raise exception 'WRONG_PHASE';
  end if;
  select * into v_p from public.game_players where game_id = p_game and seat = v_seat;
  if v_p.is_bankrupt then raise exception 'PLAYER_BANKRUPT'; end if;
  if not v_p.in_detention then raise exception 'NOT_DETAINED'; end if;
  v_fee := public.fn_s(v_g.settings, 'detention_fee', 50);
  if v_p.cash < v_fee then raise exception 'INSUFFICIENT_FUNDS'; end if;

  perform public.fn_charge(p_game, v_seat, v_fee, null, 'detention',
    'دفع رسوم الخروج من التوقيف: ' || v_fee || ' درهم',
    'Paid detention exit fee: ' || v_fee || ' dirhams');
  update public.game_players set in_detention = false, detention_turns = 0
  where game_id = p_game and seat = v_seat;
  perform public.fn_log_event(p_game, 'left_detention', v_seat,
    '🔓 خرج من التوقيف بعد الدفع', '🔓 Left Detention after paying', null);
  perform public.fn_do_move_roll(p_game, v_seat);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.use_exit_card(p_game uuid, p_key text, p_seat int default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_g public.games; v_seat int; v_p record;
begin
  v_g := public.fn_lock_game(p_game);
  v_seat := public.fn_resolve_actor(p_game, p_seat);
  perform public.fn_begin_action(p_game, v_seat, 'use_exit_card', p_key);
  if v_g.status <> 'active' or v_g.turn_phase <> 'awaiting_detention_choice' or v_g.current_seat <> v_seat then
    raise exception 'WRONG_PHASE';
  end if;
  select * into v_p from public.game_players where game_id = p_game and seat = v_seat;
  if v_p.is_bankrupt then raise exception 'PLAYER_BANKRUPT'; end if;
  if not v_p.in_detention then raise exception 'NOT_DETAINED'; end if;
  if v_p.exit_cards < 1 then raise exception 'NO_EXIT_CARD'; end if;

  update public.game_players set exit_cards = exit_cards - 1, in_detention = false, detention_turns = 0
  where game_id = p_game and seat = v_seat;
  perform public.fn_log_event(p_game, 'left_detention', v_seat,
    '🎟️ استخدم بطاقة الخروج من التوقيف', '🎟️ Used a Detention exit card', null);
  perform public.fn_do_move_roll(p_game, v_seat);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- إنهاء الدور ----------
create or replace function public.end_turn(p_game uuid, p_key text, p_seat int default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_g public.games; v_seat int;
begin
  v_g := public.fn_lock_game(p_game);
  v_seat := public.fn_resolve_actor(p_game, p_seat);
  perform public.fn_begin_action(p_game, v_seat, 'end_turn', p_key);
  if v_g.status <> 'active' or v_g.turn_phase <> 'awaiting_end_turn' or v_g.current_seat <> v_seat then
    raise exception 'WRONG_PHASE';
  end if;
  perform public.fn_advance_turn(p_game);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- سداد الدين / الإفلاس ----------
create or replace function public.settle_debt(p_game uuid, p_key text, p_seat int default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_g public.games; v_seat int; v_p record; v_done boolean;
begin
  v_g := public.fn_lock_game(p_game);
  v_seat := public.fn_resolve_actor(p_game, p_seat);
  perform public.fn_begin_action(p_game, v_seat, 'settle_debt', p_key);
  if v_g.status <> 'active' or v_g.turn_phase <> 'awaiting_debt' or v_g.current_seat <> v_seat then
    raise exception 'WRONG_PHASE';
  end if;
  select * into v_p from public.game_players where game_id = p_game and seat = v_seat;
  if v_p.debt_amount = 0 then raise exception 'NO_DEBT'; end if;
  if v_p.cash < v_p.debt_amount then raise exception 'INSUFFICIENT_FUNDS'; end if;
  v_done := public.fn_settle_core(p_game, v_seat);
  if not v_done then raise exception 'SETTLE_FAILED'; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.declare_bankruptcy(p_game uuid, p_key text, p_seat int default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_g public.games; v_seat int; v_p record;
begin
  v_g := public.fn_lock_game(p_game);
  v_seat := public.fn_resolve_actor(p_game, p_seat);
  perform public.fn_begin_action(p_game, v_seat, 'declare_bankruptcy', p_key);
  if v_g.status <> 'active' or v_g.turn_phase <> 'awaiting_debt' or v_g.current_seat <> v_seat then
    raise exception 'WRONG_PHASE';
  end if;
  select * into v_p from public.game_players where game_id = p_game and seat = v_seat;
  if v_p.debt_amount = 0 then raise exception 'NO_DEBT'; end if;
  perform public.fn_bankrupt(p_game, v_seat, v_p.debt_creditor_seat, 'declared');
  return jsonb_build_object('ok', true);
end $$;

-- ---------- المهلة ----------
create or replace function public.handle_turn_timeout(p_game uuid, p_key text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_result text;
begin
  perform public.fn_assert_game_access(p_game);
  if p_key is null or char_length(p_key) < 8 then raise exception 'INVALID_ACTION_KEY'; end if;
  v_result := public.fn_apply_timeout(p_game);
  return jsonb_build_object('ok', true, 'result', v_result);
end $$;

-- ---------- مغادرة المباراة أثناء اللعب ----------
create or replace function public.leave_game(p_game uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_g public.games; v_seat int; v_p record;
begin
  v_g := public.fn_lock_game(p_game);
  v_seat := public.fn_resolve_actor(p_game, null);
  if v_g.status = 'active' then
    select * into v_p from public.game_players where game_id = p_game and seat = v_seat;
    if not v_p.is_bankrupt then
      perform public.fn_bankrupt(p_game, v_seat, null, 'left_game');
      perform public.fn_log_event(p_game, 'left', v_seat,
        '🚪 غادر اللاعب المباراة', '🚪 Player left the game', null);
    end if;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- لقطة المباراة الكاملة ----------
create or replace function public.get_game_snapshot(p_code text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
        v_room public.rooms;
        v_game public.games%rowtype;
        v_rp record;
        v_me jsonb;
        v_trades jsonb;
begin
  select * into v_room from public.fn_get_room_by_code(p_code);
  if v_room.current_game_id is not null then
    select * into v_game from public.games where id = v_room.current_game_id;
  end if;
  if not found then
    select * into v_game from public.games where room_id = v_room.id order by created_at desc limit 1;
  end if;
  if not found then raise exception 'NO_GAME' using errcode = 'P0002'; end if;

  select * into v_rp from public.room_players where room_id = v_room.id and user_id = v_uid;
  if not (public.fn_is_room_member(v_room.id, v_uid) or public.fn_is_admin(v_uid)
          or (v_room.is_public and v_game.status = 'finished')) then
    raise exception 'GAME_NOT_ACCESSIBLE';
  end if;

  if v_rp is not null and v_rp.seat is not null then
    v_me := jsonb_build_object(
      'user_id', v_uid, 'seat', v_rp.seat, 'role', v_rp.role, 'is_host', v_room.host_id = v_uid
    );
    v_trades := coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'from_seat', t.from_seat, 'to_seat', t.to_seat,
        'money_from', t.money_from, 'money_to', t.money_to,
        'status', t.status, 'expires_at', t.expires_at,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object('direction', i.direction, 'tile_id', i.tile_id))
          from public.trade_offer_items i where i.offer_id = t.id
        ), '[]'::jsonb)
      ))
      from public.trade_offers t
      where t.game_id = v_game.id and t.status = 'pending'
        and (t.from_seat = v_rp.seat or t.to_seat = v_rp.seat)
        and t.expires_at > now()
    ), '[]'::jsonb);
  else
    v_me := null;
    v_trades := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'room', jsonb_build_object(
      'id', v_room.id, 'code', v_room.code, 'name', v_room.name,
      'is_public', v_room.is_public, 'host_id', v_room.host_id, 'status', v_room.status,
      'max_players', v_room.max_players, 'current_game_id', v_room.current_game_id,
      'settings', public.fn_sanitize_settings(v_room.settings)
    ),
    'game', to_jsonb(v_game),
    'players', coalesce((
      select jsonb_agg(to_jsonb(gp) order by gp.seat)
      from public.game_players gp where gp.game_id = v_game.id
    ), '[]'::jsonb),
    'properties', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tile_id', gp.tile_id, 'owner_seat', gp.owner_seat,
        'buildings', gp.buildings, 'is_mortgaged', gp.is_mortgaged
      ))
      from public.game_properties gp where gp.game_id = v_game.id
    ), '[]'::jsonb),
    'auction', (
      select to_jsonb(a) from public.auctions a
      where a.game_id = v_game.id and a.status = 'active'
      order by a.created_at desc limit 1
    ),
    'events', coalesce((
      select jsonb_agg(ev order by ev.seq)
      from (
        select * from public.game_events
        where game_id = v_game.id
        order by seq desc limit 60
      ) ev
    ), '[]'::jsonb),
    'my_trades', v_trades,
    'me', v_me,
    'server_now', now()::text
  );
end $$;
