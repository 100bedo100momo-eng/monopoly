-- ============================================================
-- 0003: دوال المحرك الجوهرية (نرد، حركة، إيجار، كروت، أدوار، إفلاس، مهلات)
-- كل منطق مالي/ملكية/نرد ينفّذ هنا حصرًا — العميل لا يحدد أي نتيجة.
-- ============================================================

-- ---------- إعدادات jsonb ----------
create or replace function public.fn_s(p jsonb, k text, d int)
returns int language sql immutable as
$$ select coalesce((p->>k)::int, d) $$;

create or replace function public.fn_sb(p jsonb, k text, d boolean)
returns boolean language sql immutable as
$$ select coalesce((p->>k)::boolean, d) $$;

create or replace function public.fn_sanitize_settings(p jsonb)
returns jsonb language plpgsql immutable as $$
begin
  return jsonb_build_object(
    'mode', case when (p->>'mode') in ('classic','fast','custom') then p->>'mode' else 'classic' end,
    'starting_cash', least(greatest(coalesce((p->>'starting_cash')::int,1500),500),20000),
    'turn_seconds', least(greatest(coalesce((p->>'turn_seconds')::int,60),15),300),
    'auctions_enabled', coalesce((p->>'auctions_enabled')::boolean,true),
    'trading_enabled', coalesce((p->>'trading_enabled')::boolean,true),
    'go_bonus', least(greatest(coalesce((p->>'go_bonus')::int,200),50),1000),
    'buildings_max', least(greatest(coalesce((p->>'buildings_max')::int,4),1),4),
    'detention_fee', least(greatest(coalesce((p->>'detention_fee')::int,50),0),500),
    'unmortgage_interest_pct', least(greatest(coalesce((p->>'unmortgage_interest_pct')::int,10),0),50),
    'auction_min_increment', least(greatest(coalesce((p->>'auction_min_increment')::int,50),10),500),
    'auction_seconds', least(greatest(coalesce((p->>'auction_seconds')::int,10),5),60),
    'round_limit', least(greatest(coalesce((p->>'round_limit')::int,20),5),200),
    'time_limit_minutes', least(greatest(coalesce((p->>'time_limit_minutes')::int,0),0),240),
    'win_condition', case when (p->>'win_condition') in ('last_standing','round_limit','time_limit','wealth_target') then p->>'win_condition' else 'last_standing' end,
    'wealth_target', least(greatest(coalesce((p->>'wealth_target')::int,10000),1000),1000000),
    'allow_bots', coalesce((p->>'allow_bots')::boolean,true),
    'trade_expiry_seconds', least(greatest(coalesce((p->>'trade_expiry_seconds')::int,120),30),600),
    'seat_hold_seconds', least(greatest(coalesce((p->>'seat_hold_seconds')::int,120),30),1800),
    'chat_filter_enabled', coalesce((p->>'chat_filter_enabled')::boolean,true)
  );
end $$;

-- ---------- عشوائية آمنة (gen_random_bytes مع رفض التحيز) ----------
create or replace function public.fn_rand(p_max int)
returns int language plpgsql volatile as $$
declare v bytea; v_n int;
begin
  if p_max is null or p_max < 1 then return 1; end if;
  loop
    v := extensions.gen_random_bytes(1);
    v_n := get_byte(v, 0);
    exit when v_n < 252;
  end loop;
  return 1 + (v_n % p_max);
end $$;

-- ---------- سجل الأحداث ----------
create or replace function public.fn_log_event(
  p_game uuid, p_type text, p_seat int, p_msg_ar text, p_msg_en text, p_payload jsonb default null
) returns void language plpgsql volatile as $$
begin
  insert into public.game_events (game_id, type, seat, msg_ar, msg_en, payload)
  values (p_game, p_type, p_seat, coalesce(p_msg_ar,''), coalesce(p_msg_en,''), p_payload);
end $$;

-- ---------- المال ----------
create or replace function public.fn_add_cash(p_game uuid, p_seat int, p_amount int)
returns void language plpgsql volatile as $$
begin
  if p_amount <= 0 then return; end if;
  update public.game_players set cash = cash + p_amount
  where game_id = p_game and seat = p_seat;
  perform public.fn_try_auto_settle(p_game, p_seat);
end $$;

-- تحصيل مبلغ: يدفع إن استطاع، وإلا يسجَّل دين (لا رصيد سالب أبدًا خارج الإفلاس)
create or replace function public.fn_charge(
  p_game uuid, p_payer int, p_amount int, p_creditor_seat int,
  p_origin text default null, p_msg_ar text default '', p_msg_en text default ''
) returns boolean language plpgsql volatile as $$
declare v_cash int;
begin
  if p_amount <= 0 then return true; end if;
  select cash into v_cash from public.game_players
  where game_id = p_game and seat = p_payer for update;
  if v_cash >= p_amount then
    update public.game_players set cash = cash - p_amount
    where game_id = p_game and seat = p_payer;
    if p_creditor_seat is not null then
      update public.game_players set cash = cash + p_amount
      where game_id = p_game and seat = p_creditor_seat;
    end if;
    perform public.fn_log_event(p_game, 'payment', p_payer, p_msg_ar, p_msg_en,
      jsonb_build_object('amount', p_amount, 'creditor_seat', p_creditor_seat, 'origin', p_origin));
    if p_creditor_seat is not null then
      perform public.fn_try_auto_settle(p_game, p_creditor_seat);
    end if;
    return true;
  else
    update public.game_players
    set debt_amount = p_amount, debt_creditor_seat = p_creditor_seat, debt_origin = p_origin
    where game_id = p_game and seat = p_payer;
    perform public.fn_log_event(p_game, 'debt', p_payer, p_msg_ar || ' (دين معلق)', p_msg_en || ' (pending debt)',
      jsonb_build_object('amount', p_amount, 'creditor_seat', p_creditor_seat, 'origin', p_origin));
    return false;
  end if;
end $$;

-- ---------- الإيجار ----------
create or replace function public.fn_rent_for(p_game uuid, p_tile text, p_owner int, p_dice int)
returns int language plpgsql stable as $$
declare v_t public.board_tiles%rowtype;
        v_prop public.game_properties%rowtype;
        v_group_count int;
        v_group_size int;
begin
  select * into v_t from public.board_tiles where id = p_tile;
  select * into v_prop from public.game_properties where game_id = p_game and tile_id = p_tile;
  if v_prop.is_mortgaged then return 0; end if;
  select count(*)::int into v_group_count
  from public.game_properties gp join public.board_tiles bt on bt.id = gp.tile_id
  where gp.game_id = p_game and gp.owner_seat = p_owner and bt.color_group = v_t.color_group;
  select count(*)::int into v_group_size
  from public.board_tiles where color_group = v_t.color_group and kind = v_t.kind;
  if v_t.kind = 'property' then
    if v_prop.buildings > 0 then
      return v_t.rents[least(v_prop.buildings + 1, array_length(v_t.rents, 1))];
    end if;
    if v_group_count >= v_group_size then
      return v_t.rents[1] * 2;
    end if;
    return v_t.rents[1];
  elsif v_t.kind = 'hub' then
    if v_group_count >= 4 then return v_t.rents[1] * 2; end if;
    return v_t.rents[least(greatest(v_group_count, 1), 4)];
  elsif v_t.kind = 'utility' then
    return p_dice * (case when v_group_count >= 2 then 10 else 4 end);
  end if;
  return 0;
end $$;

-- ---------- صافي الثروة ----------
create or replace function public.fn_net_worth(p_game uuid, p_seat int)
returns int language sql stable as $$
  select coalesce(p.cash, 0)
       + coalesce(sum(
           case when gp.is_mortgaged then coalesce(bt.mortgage_value, 0)
                else coalesce(bt.price, 0) + coalesce(bt.build_cost, 0) * gp.buildings end
         ), 0)::int
  from public.game_players p
  left join public.game_properties gp on gp.game_id = p.game_id and gp.owner_seat = p.seat
  left join public.board_tiles bt on bt.id = gp.tile_id
  where p.game_id = p_game and p.seat = p_seat
  group by p.cash
$$;

-- ---------- التوقيف ----------
create or replace function public.fn_go_to_detention(p_game uuid, p_seat int)
returns void language plpgsql volatile as $$
begin
  update public.game_players
  set position = (select position from public.board_tiles where id = 'detention'),
      in_detention = true,
      detention_turns = 3
  where game_id = p_game and seat = p_seat;
  update public.games set doubles_count = 0, extra_turn = false where id = p_game;
  perform public.fn_log_event(p_game, 'detention', p_seat,
    '🚨 انتقل إلى التوقيف', '🚨 Sent to Detention', null);
end $$;

-- ---------- سحب بطاقة وتطبيق تأثيرها ----------
create or replace function public.fn_draw_card(p_game uuid, p_seat int, p_deck public.card_deck, p_depth int)
returns void language plpgsql volatile as $$
declare v_gc record;
        v_cd public.card_definitions%rowtype;
begin
  select * into v_gc from public.game_cards
  where game_id = p_game and deck = p_deck and drawn_at is null
  order by position limit 1;
  if not found then
    -- أعادة تدوير الـ deck عند نفادها
    update public.game_cards set drawn_at = null, drawn_by_seat = null
    where game_id = p_game and deck = p_deck;
    select * into v_gc from public.game_cards
    where game_id = p_game and deck = p_deck and drawn_at is null
    order by position limit 1;
  end if;
  update public.game_cards set drawn_at = now(), drawn_by_seat = p_seat where id = v_gc.id;
  select * into v_cd from public.card_definitions where id = v_gc.card_id;
  perform public.fn_log_event(p_game, 'card_drawn', p_seat,
    '🎴 ' || v_cd.title_ar || ' — ' || v_cd.description_ar,
    '🎴 ' || v_cd.title_en || ' — ' || v_cd.description_en,
    jsonb_build_object('card_id', v_cd.id, 'icon', v_cd.icon, 'deck', p_deck));
  perform public.fn_apply_card(p_game, p_seat, v_cd.id, p_depth);
end $$;

create or replace function public.fn_apply_card(p_game uuid, p_seat int, p_card_id text, p_depth int)
returns void language plpgsql volatile as $$
declare v_cd public.card_definitions%rowtype;
        v_pos int; v_target int; v_steps int; v_total int; v_each int; v_dice int; v_go int; r record;
begin
  select * into v_cd from public.card_definitions where id = p_card_id;
  select coalesce(dice_1, 1) + coalesce(dice_2, 1) into v_dice from public.games where id = p_game;

  if v_cd.effect_type = 'gain' then
    perform public.fn_add_cash(p_game, p_seat, v_cd.effect_value);

  elsif v_cd.effect_type = 'loss' then
    perform public.fn_charge(p_game, p_seat, v_cd.effect_value, null, 'card',
      'دفع ' || v_cd.effect_value || ' درهم', 'Paid ' || v_cd.effect_value || ' dirhams');

  elsif v_cd.effect_type = 'collect_from_each' then
    for r in select seat, cash from public.game_players
             where game_id = p_game and seat <> p_seat and not is_bankrupt loop
      v_each := least(r.cash, v_cd.effect_value);
      if v_each > 0 then
        update public.game_players set cash = cash - v_each where game_id = p_game and seat = r.seat;
        update public.game_players set cash = cash + v_each where game_id = p_game and seat = p_seat;
      end if;
    end loop;
    perform public.fn_add_cash(p_game, p_seat, 0); -- تفعيل السداد التلقائي إن وُجد دين
    perform public.fn_log_event(p_game, 'card_effect', p_seat,
      'حصل على ' || v_cd.effect_value || ' من كل لاعب',
      'Collected ' || v_cd.effect_value || ' from each player', null);

  elsif v_cd.effect_type = 'pay_each' then
    select count(*)::int into v_total from public.game_players
    where game_id = p_game and seat <> p_seat and not is_bankrupt;
    v_total := v_total * v_cd.effect_value;
    if public.fn_charge(p_game, p_seat, v_total, null, 'pay_each:' || v_cd.effect_value,
      'دفع ' || v_cd.effect_value || ' لكل لاعب (' || v_total || ')',
      'Paid ' || v_cd.effect_value || ' to each player (' || v_total || ')') then
      for r in select seat from public.game_players
               where game_id = p_game and seat <> p_seat and not is_bankrupt loop
        update public.game_players set cash = cash + v_cd.effect_value
        where game_id = p_game and seat = r.seat;
      end loop;
    end if;

  elsif v_cd.effect_type = 'move_to' then
    select position into v_target from public.board_tiles where id = v_cd.target_tile;
    select position into v_pos from public.game_players where game_id = p_game and seat = p_seat;
    if (select kind from public.board_tiles where id = v_cd.target_tile) = 'goto_detention' then
      perform public.fn_go_to_detention(p_game, p_seat);
    elsif v_depth <= 2 then
      v_steps := (v_target - v_pos + 40) % 40;
      if v_steps > 0 and v_pos + v_steps >= 40 then
        select public.fn_s(settings, 'go_bonus', 200) into v_go from public.games where id = p_game;
        perform public.fn_add_cash(p_game, p_seat, v_go);
        perform public.fn_log_event(p_game, 'go_bonus', p_seat,
          '🎉 مكافأة المرور بالبداية: ' || v_go, '🎉 Passed Start bonus: ' || v_go, null);
      end if;
      update public.game_players set position = v_target where game_id = p_game and seat = p_seat;
      perform public.fn_resolve_tile(p_game, p_seat, v_dice, p_depth + 1);
    else
      update public.game_players set position = v_target where game_id = p_game and seat = p_seat;
    end if;

  elsif v_cd.effect_type = 'move_back' then
    select position into v_pos from public.game_players where game_id = p_game and seat = p_seat;
    v_pos := (v_pos - v_cd.effect_value + 40) % 40;
    update public.game_players set position = v_pos where game_id = p_game and seat = p_seat;
    if v_depth <= 2 then
      perform public.fn_resolve_tile(p_game, p_seat, v_dice, p_depth + 1);
    end if;

  elsif v_cd.effect_type = 'move_to_nearest_hub' then
    select position into v_pos from public.game_players where game_id = p_game and seat = p_seat;
    for v_steps in 1..40 loop
      select position into v_target from public.board_tiles
      where position = (v_pos + v_steps) % 40 and kind = 'hub';
      exit when found;
    end loop;
    if v_target is not null then
      if v_pos + v_steps >= 40 then
        select public.fn_s(settings, 'go_bonus', 200) into v_go from public.games where id = p_game;
        perform public.fn_add_cash(p_game, p_seat, v_go);
        perform public.fn_log_event(p_game, 'go_bonus', p_seat,
          '🎉 مكافأة المرور بالبداية: ' || v_go, '🎉 Passed Start bonus: ' || v_go, null);
      end if;
      update public.game_players set position = v_target where game_id = p_game and seat = p_seat;
      if v_depth <= 2 then
        perform public.fn_resolve_tile(p_game, p_seat, v_dice, p_depth + 1);
      end if;
    end if;

  elsif v_cd.effect_type = 'pay_per_building' then
    select coalesce(sum(
      case when buildings <= 4 then buildings * v_cd.effect_value
           else buildings * v_cd.effect_value * 2 end
    ), 0)::int into v_total
    from public.game_properties
    where game_id = p_game and owner_seat = p_seat;
    if v_total > 0 then
      perform public.fn_charge(p_game, p_seat, v_total, null, 'card',
        'صيانة المباني: ' || v_total || ' درهم', 'Building maintenance: ' || v_total || ' dirhams');
    end if;

  elsif v_cd.effect_type = 'go_to_detention' then
    perform public.fn_go_to_detention(p_game, p_seat);

  elsif v_cd.effect_type = 'grant_exit_card' then
    update public.game_players set exit_cards = exit_cards + 1
    where game_id = p_game and seat = p_seat;
    perform public.fn_log_event(p_game, 'card_effect', p_seat,
      '🎟️ حصل على بطاقة خروج من التوقيف', '🎟️ Received a Detention exit card', null);
  end if;
end $$;

-- ---------- حلّ أثر الوقوف على خانة ----------
create or replace function public.fn_resolve_tile(p_game uuid, p_seat int, p_dice int, p_depth int default 0)
returns void language plpgsql volatile as $$
declare v_t public.board_tiles%rowtype;
        v_prop public.game_properties%rowtype;
        v_rent int;
        v_owner int;
begin
  select * into v_t from public.board_tiles
  where position = (select position from public.game_players where game_id = p_game and seat = p_seat);

  if v_t.kind in ('property','hub','utility') then
    select * into v_prop from public.game_properties where game_id = p_game and tile_id = v_t.id;
    v_owner := v_prop.owner_seat;
    if v_owner is null then
      update public.games set turn_phase = 'awaiting_property_decision' where id = p_game;
      perform public.fn_log_event(p_game, 'landed_unowned', p_seat,
        'وقف على ' || v_t.name_ar || ' (غير مملوكة)', 'Landed on ' || v_t.name_en || ' (unowned)', null);
    elsif v_owner = p_seat then
      perform public.fn_log_event(p_game, 'landed_own', p_seat,
        'وقف على ممتلكاته: ' || v_t.name_ar, 'Landed on own property: ' || v_t.name_en, null);
    elsif v_prop.is_mortgaged then
      perform public.fn_log_event(p_game, 'landed_mortgaged', p_seat,
        v_t.name_ar || ' مرهونة — لا إيجار', v_t.name_en || ' is mortgaged — no rent', null);
    else
      v_rent := public.fn_rent_for(p_game, v_t.id, v_owner, p_dice);
      if v_rent > 0 then
        perform public.fn_charge(p_game, p_seat, v_rent, v_owner, 'rent',
          'دفع إيجار ' || v_t.name_ar || ': ' || v_rent || ' درهم',
          'Paid rent for ' || v_t.name_en || ': ' || v_rent || ' dirhams');
      end if;
    end if;

  elsif v_t.kind = 'tax' then
    perform public.fn_charge(p_game, p_seat, v_t.tax_amount, null, 'tax',
      'دفع ' || v_t.name_ar || ': ' || v_t.tax_amount || ' درهم',
      'Paid ' || v_t.name_en || ': ' || v_t.tax_amount || ' dirhams');

  elsif v_t.kind = 'surprise' then
    perform public.fn_draw_card(p_game, p_seat, 'surprise', p_depth);

  elsif v_t.kind = 'chest' then
    perform public.fn_draw_card(p_game, p_seat, 'city_chest', p_depth);

  elsif v_t.kind = 'goto_detention' then
    perform public.fn_go_to_detention(p_game, p_seat);

  else
    perform public.fn_log_event(p_game, 'landed', p_seat,
      'وقف على ' || v_t.name_ar, 'Landed on ' || v_t.name_en, null);
  end if;
end $$;

-- ---------- تحريك خطوات مع مكافأة البداية ----------
create or replace function public.fn_move_steps(p_game uuid, p_seat int, p_steps int)
returns void language plpgsql volatile as $$
declare v_pos int; v_go int;
begin
  select position into v_pos from public.game_players where game_id = p_game and seat = p_seat;
  if p_steps > 0 and v_pos + p_steps >= 40 then
    select public.fn_s(settings, 'go_bonus', 200) into v_go from public.games where id = p_game;
    perform public.fn_add_cash(p_game, p_seat, v_go);
    perform public.fn_log_event(p_game, 'go_bonus', p_seat,
      '🎉 مرّ بنقطة البداية واستلم ' || v_go || ' درهم', '🎉 Passed Start and collected ' || v_go, null);
  end if;
  update public.game_players set position = (position + p_steps) % 40
  where game_id = p_game and seat = p_seat;
end $$;

-- ---------- إقرار الطور النهائي بعد أي حركة ----------
create or replace function public.fn_finalize(p_game uuid, p_seat int, p_extra boolean)
returns void language plpgsql volatile as $$
declare v_debt int;
begin
  update public.games set extra_turn = p_extra where id = p_game;
  select debt_amount into v_debt from public.game_players where game_id = p_game and seat = p_seat;
  if v_debt > 0 then
    update public.games set turn_phase = 'awaiting_debt' where id = p_game;
  elsif (select turn_phase from public.games where id = p_game) = 'awaiting_roll' then
    update public.games set turn_phase = 'awaiting_end_turn' where id = p_game;
  end if;
  -- awaiting_property_decision تُترك كما هي (تُضبط في resolve_tile)
end $$;

-- ---------- رمي النرد والمحاولة من التوقيف ----------
create or replace function public.fn_do_roll(p_game uuid, p_seat int, p_from_detention boolean)
returns void language plpgsql volatile as $$
declare v_g public.games%rowtype;
        d1 int; d2 int; v_doubles boolean; v_fee int;
begin
  select * into v_g from public.games where id = p_game for update;
  d1 := public.fn_rand(6);
  d2 := public.fn_rand(6);
  v_doubles := d1 = d2;
  update public.games set dice_1 = d1, dice_2 = d2 where id = p_game;

  if p_from_detention then
    perform public.fn_log_event(p_game, 'dice', p_seat,
      '🎲 حاول الخروج من التوقيف: ' || d1 || ' + ' || d2,
      '🎲 Detention attempt: ' || d1 || ' + ' || d2, jsonb_build_object('d1', d1, 'd2', d2));
    if v_doubles then
      update public.game_players set in_detention = false, detention_turns = 0
      where game_id = p_game and seat = p_seat;
      perform public.fn_move_steps(p_game, p_seat, d1 + d2);
      perform public.fn_resolve_tile(p_game, p_seat, d1 + d2, 0);
      perform public.fn_finalize(p_game, p_seat, false); -- زوجي الخروج لا يمنح دورًا إضافيًا
    else
      if (select detention_turns from public.game_players where game_id = p_game and seat = p_seat) - 1 > 0 then
        update public.game_players set detention_turns = detention_turns - 1
        where game_id = p_game and seat = p_seat;
        perform public.fn_log_event(p_game, 'detention_stay', p_seat,
          '⏳ فشل المحاولة — يبقى في التوقيف', '⏳ Failed attempt — stays in Detention', null);
        perform public.fn_advance_turn(p_game);
      else
        -- المحاولة الأخيرة فشلت: دفع إجباري ثم الحركة
        v_fee := public.fn_s(v_g.settings, 'detention_fee', 50);
        if public.fn_charge(p_game, p_seat, v_fee, null, 'detention',
          'أدى رسوم التوقيف: ' || v_fee || ' درهم',
          'Paid detention fee: ' || v_fee || ' dirhams') then
          update public.game_players set in_detention = false, detention_turns = 0
          where game_id = p_game and seat = p_seat;
          perform public.fn_move_steps(p_game, p_seat, d1 + d2);
          perform public.fn_resolve_tile(p_game, p_seat, d1 + d2, 0);
          perform public.fn_finalize(p_game, p_seat, false);
        else
          update public.game_players set detention_turns = 0
          where game_id = p_game and seat = p_seat;
          update public.games set pending_move_after_debt = true, turn_phase = 'awaiting_debt' where id = p_game;
        end if;
      end if;
    end if;
  else
    perform public.fn_log_event(p_game, 'dice', p_seat,
      '🎲 رمى النرد: ' || d1 || ' + ' || d2 || (case when v_doubles then ' (زوجي!)' else '' end),
      '🎲 Rolled ' || d1 || ' + ' || d2 || (case when v_doubles then ' (doubles!)' else '' end),
      jsonb_build_object('d1', d1, 'd2', d2, 'doubles', v_doubles));
    if v_doubles then
      update public.games set doubles_count = doubles_count + 1 where id = p_game;
      if v_g.doubles_count + 1 >= 3 then
        perform public.fn_log_event(p_game, 'speeding', p_seat,
          '🚨 ثلاثة زوجي متتالية — إلقاء القبض!', '🚨 Three doubles in a row — caught speeding!', null);
        perform public.fn_go_to_detention(p_game, p_seat);
        update public.games set doubles_count = 0 where id = p_game;
        perform public.fn_advance_turn(p_game);
        return;
      end if;
    end if;
    perform public.fn_move_steps(p_game, p_seat, d1 + d2);
    perform public.fn_resolve_tile(p_game, p_seat, d1 + d2, 0);
    perform public.fn_finalize(p_game, p_seat, v_doubles);
  end if;
end $$;

-- ---------- رمي وحركة بعد الدفع/البطاقة (بلا دور إضافي) ----------
create or replace function public.fn_do_move_roll(p_game uuid, p_seat int)
returns void language plpgsql volatile as $$
declare d1 int; d2 int;
begin
  d1 := public.fn_rand(6);
  d2 := public.fn_rand(6);
  update public.games set dice_1 = d1, dice_2 = d2 where id = p_game;
  perform public.fn_log_event(p_game, 'dice', p_seat,
    '🎲 حرّك بالنرد: ' || d1 || ' + ' || d2, '🎲 Moved with ' || d1 || ' + ' || d2,
    jsonb_build_object('d1', d1, 'd2', d2));
  perform public.fn_move_steps(p_game, p_seat, d1 + d2);
  perform public.fn_resolve_tile(p_game, p_seat, d1 + d2, 0);
  perform public.fn_finalize(p_game, p_seat, false);
end $$;

-- ---------- المزاد ----------
create or replace function public.fn_create_auction(p_game uuid, p_tile text)
returns uuid language plpgsql volatile as $$
declare v_g public.games%rowtype; v_id uuid; v_secs int; v_inc int; v_name text;
begin
  select * into v_g from public.games where id = p_game for update;
  v_secs := greatest(public.fn_s(v_g.settings, 'auction_seconds', 10), 5);
  v_inc := public.fn_s(v_g.settings, 'auction_min_increment', 50);
  select name_ar into v_name from public.board_tiles where id = p_tile;
  insert into public.auctions (game_id, tile_id, min_increment, ends_at)
  values (p_game, p_tile, v_inc, now() + make_interval(secs => v_secs))
  returning id into v_id;
  update public.games
  set turn_phase = 'auction_active',
      turn_deadline_at = now() + make_interval(secs => v_secs)
  where id = p_game;
  perform public.fn_log_event(p_game, 'auction_started', null,
    '🔨 بدأ مزاد ' || v_name || ' — أعلى مزايدة يحسمها خلال ' || v_secs || ' ثانية',
    '🔨 Auction started for ' || v_name || ' — closes in ' || v_secs || 's',
    jsonb_build_object('auction_id', v_id, 'tile_id', p_tile));
  return v_id;
end $$;

create or replace function public.fn_do_decline(p_game uuid, p_seat int)
returns void language plpgsql volatile as $$
declare v_g public.games%rowtype; v_tile text; v_name text;
begin
  select * into v_g from public.games where id = p_game for update;
  select bt.id into v_tile from public.board_tiles bt
  where bt.position = (select position from public.game_players where game_id = p_game and seat = p_seat);
  select name_ar into v_name from public.board_tiles where id = v_tile;
  perform public.fn_log_event(p_game, 'declined', p_seat,
    'رفض شراء ' || v_name, 'Declined buying ' || v_name, null);
  if public.fn_sb(v_g.settings, 'auctions_enabled', true) then
    perform public.fn_create_auction(p_game, v_tile);
  else
    update public.games set turn_phase = 'awaiting_end_turn' where id = p_game;
  end if;
end $$;

create or replace function public.fn_finish_auction_core(p_game uuid)
returns boolean language plpgsql volatile as $$
declare v_g public.games%rowtype;
        v_a public.auctions%rowtype;
        v_paid boolean;
        v_name text;
begin
  select * into v_g from public.games where id = p_game for update;
  if v_g.turn_phase <> 'auction_active' or v_g.status <> 'active' then return false; end if;
  select * into v_a from public.auctions
  where game_id = p_game and status = 'active'
  order by created_at desc limit 1 for update;
  if not found then
    update public.games set turn_phase = 'awaiting_end_turn' where id = p_game;
    return true;
  end if;
  if now() < v_a.ends_at then return false; end if;
  select name_ar into v_name from public.board_tiles where id = v_a.tile_id;
  if v_a.current_bidder_seat is null then
    update public.auctions set status = 'completed', updated_at = now() where id = v_a.id;
    perform public.fn_log_event(p_game, 'auction_closed', null,
      '🔨 انتهى مزاد ' || v_name || ' بلا مزايدات', '🔨 Auction for ' || v_name || ' closed with no bids', null);
  else
    v_paid := public.fn_charge(p_game, v_a.current_bidder_seat, v_a.current_bid, null, 'auction',
      'فاز بمزاد ' || v_name || ' بمبلغ ' || v_a.current_bid || ' درهم',
      'Won auction for ' || v_name || ' at ' || v_a.current_bid || ' dirhams');
    if v_paid then
      update public.auctions
      set status = 'completed', winner_seat = v_a.current_bidder_seat, final_price = v_a.current_bid, updated_at = now()
      where id = v_a.id;
      update public.game_properties set owner_seat = v_a.current_bidder_seat
      where game_id = p_game and tile_id = v_a.tile_id;
    else
      update public.auctions set status = 'cancelled', updated_at = now() where id = v_a.id;
      perform public.fn_log_event(p_game, 'auction_closed', null,
        'أُلغي مزاد ' || v_name || ' (تعذر الدفع)', 'Auction for ' || v_name || ' cancelled (payment failed)', null);
    end if;
  end if;
  update public.games
  set turn_phase = 'awaiting_end_turn',
      turn_deadline_at = now() + make_interval(secs => public.fn_s(v_g.settings, 'turn_seconds', 60))
  where id = p_game;
  return true;
end $$;

-- ---------- السداد التلقائي للديون ----------
create or replace function public.fn_settle_core(p_game uuid, p_seat int)
returns boolean language plpgsql volatile as $$
declare v_g public.games%rowtype;
        v_p public.game_players%rowtype;
        v_value int;
        v_each int;
        r record;
begin
  select * into v_g from public.games where id = p_game for update;
  if v_g.status <> 'active' then return false; end if;
  select * into v_p from public.game_players where game_id = p_game and seat = p_seat for update;
  if v_p.debt_amount = 0 then return false; end if;
  if v_p.cash < v_p.debt_amount then return false; end if;
  v_value := v_p.debt_amount;
  update public.game_players set cash = cash - v_value
  where game_id = p_game and seat = p_seat;
  if v_p.debt_creditor_seat is not null then
    update public.game_players set cash = cash + v_value
    where game_id = p_game and seat = v_p.debt_creditor_seat;
  end if;
  if v_p.debt_origin like 'pay_each:%' then
    v_each := split_part(v_p.debt_origin, ':', 2)::int;
    for r in select seat from public.game_players
             where game_id = p_game and seat <> p_seat and not is_bankrupt loop
      update public.game_players set cash = cash + v_each
      where game_id = p_game and seat = r.seat;
    end loop;
  end if;
  update public.game_players
  set debt_amount = 0, debt_creditor_seat = null, debt_origin = null
  where game_id = p_game and seat = p_seat;
  perform public.fn_log_event(p_game, 'debt_settled', p_seat,
    'سدّد دينًا بمبلغ ' || v_value || ' درهم', 'Settled a debt of ' || v_value || ' dirhams', null);
  if v_g.current_seat = p_seat then
    if v_g.pending_move_after_debt then
      update public.games set pending_move_after_debt = false where id = p_game;
      perform public.fn_do_move_roll(p_game, p_seat);
    else
      update public.games set turn_phase = 'awaiting_end_turn' where id = p_game and turn_phase = 'awaiting_debt';
    end if;
  end if;
  return true;
end $$;

create or replace function public.fn_try_auto_settle(p_game uuid, p_seat int)
returns boolean language plpgsql volatile as $$
begin
  return public.fn_settle_core(p_game, p_seat);
end $$;

-- ---------- التصفية القسرية (مهلة الدين) ----------
create or replace function public.fn_liquidate(p_game uuid, p_seat int, p_target int)
returns boolean language plpgsql volatile as $$
declare v_cash int; v_tile text; v_proceeds int; v_name text; r record;
begin
  for i in 1..200 loop
    select cash into v_cash from public.game_players where game_id = p_game and seat = p_seat;
    exit when v_cash >= p_target;
    -- بيع أعلى مبنى أولًا (يحافظ على التوازن)
    select gp.tile_id into v_tile
    from public.game_properties gp join public.board_tiles bt on bt.id = gp.tile_id
    where gp.game_id = p_game and gp.owner_seat = p_seat and gp.buildings > 0
    order by gp.buildings desc, bt.position limit 1;
    if found then
      select coalesce(floor(coalesce(build_cost, 0) / 2.0), 0)::int into v_proceeds
      from public.board_tiles where id = v_tile;
      select name_ar into v_name from public.board_tiles where id = v_tile;
      update public.game_properties set buildings = buildings - 1
      where game_id = p_game and tile_id = v_tile;
      update public.game_players set cash = cash + v_proceeds
      where game_id = p_game and seat = p_seat;
      perform public.fn_log_event(p_game, 'sold_building', p_seat,
        'باع مبنى في ' || v_name || ' بمبلغ ' || v_proceeds || ' (تصفية)',
        'Sold a building in ' || v_name || ' for ' || v_proceeds || ' (forced)', null);
      continue;
    end if;
    -- رهن أرخص عقار بلا مبانٍ في مجموعته
    select gp.tile_id into v_tile
    from public.game_properties gp
    join public.board_tiles bt on bt.id = gp.tile_id
    where gp.game_id = p_game and gp.owner_seat = p_seat
      and not gp.is_mortgaged and gp.buildings = 0
      and not exists (
        select 1 from public.game_properties gp2
        join public.board_tiles bt2 on bt2.id = gp2.tile_id
        where gp2.game_id = p_game and gp2.owner_seat = p_seat
          and bt2.color_group = bt.color_group and gp2.buildings > 0
      )
    order by bt.price asc, bt.position limit 1;
    if found then
      select mortgage_value, name_ar into v_proceeds, v_name from public.board_tiles where id = v_tile;
      update public.game_properties set is_mortgaged = true
      where game_id = p_game and tile_id = v_tile;
      update public.game_players set cash = cash + v_proceeds
      where game_id = p_game and seat = p_seat;
      perform public.fn_log_event(p_game, 'mortgaged', p_seat,
        'رهن ' || v_name || ' بمبلغ ' || v_proceeds || ' (تصفية)',
        'Mortgaged ' || v_name || ' for ' || v_proceeds || ' (forced)', null);
      continue;
    end if;
    exit;
  end loop;
  select cash into v_cash from public.game_players where game_id = p_game and seat = p_seat;
  return v_cash >= p_target;
end $$;

-- ---------- الإفلاس ----------
create or replace function public.fn_bankrupt(p_game uuid, p_debtor int, p_creditor int, p_reason text)
returns void language plpgsql volatile as $$
declare v_p public.game_players%rowtype;
        v_build_sale int := 0;
        v_total int;
        v_name text;
        r record;
begin
  select * into v_p from public.game_players where game_id = p_game and seat = p_debtor for update;
  if v_p.is_bankrupt then return; end if;

  select name_ar into v_name from public.board_tiles where position = v_p.position;

  for r in select gp.tile_id, gp.buildings, coalesce(bt.build_cost, 0) as build_cost
           from public.game_properties gp join public.board_tiles bt on bt.id = gp.tile_id
           where gp.game_id = p_game and gp.owner_seat = p_debtor and gp.buildings > 0 loop
    v_build_sale := v_build_sale + floor(r.build_cost / 2.0)::int * r.buildings;
    update public.game_properties set buildings = 0
    where game_id = p_game and tile_id = r.tile_id;
  end loop;
  update public.game_players set cash = cash + v_build_sale
  where game_id = p_game and seat = p_debtor;
  select cash into v_total from public.game_players where game_id = p_game and seat = p_debtor;

  if p_creditor is not null then
    update public.game_players set cash = cash + v_total
    where game_id = p_game and seat = p_creditor;
    update public.game_properties set owner_seat = p_creditor
    where game_id = p_game and owner_seat = p_debtor;
  else
    update public.game_properties
    set owner_seat = null, is_mortgaged = false, buildings = 0
    where game_id = p_game and owner_seat = p_debtor;
  end if;

  update public.game_players
  set is_bankrupt = true, cash = 0, exit_cards = 0,
      debt_amount = 0, debt_creditor_seat = null, debt_origin = null, in_detention = false
  where game_id = p_game and seat = p_debtor;

  perform public.fn_log_event(p_game, 'bankruptcy', p_debtor,
    '💀 أفلس اللاعب — انتقلت ممتلكاته ' || (case when p_creditor is not null then 'للدائن' else 'إلى بنك المدينة' end),
    '💀 Player went bankrupt — assets transferred ' || (case when p_creditor is not null then 'to creditor' else 'to the bank' end),
    jsonb_build_object('creditor_seat', p_creditor, 'reason', p_reason));

  if (select current_seat from public.games where id = p_game) = p_debtor then
    update public.games set pending_move_after_debt = false where id = p_game;
    perform public.fn_advance_turn(p_game);
  end if;
  perform public.fn_maybe_finish_game(p_game);
end $$;

-- ---------- تقدم الأدوار ----------
create or replace function public.fn_advance_turn(p_game uuid)
returns void language plpgsql volatile as $$
declare v_g public.games%rowtype;
        v_cur int; v_next int; v_secs int;
        v_next_detained boolean;
begin
  select * into v_g from public.games where id = p_game for update;
  if v_g.status <> 'active' then return; end if;
  v_cur := v_g.current_seat;
  v_secs := public.fn_s(v_g.settings, 'turn_seconds', 60);

  if v_g.extra_turn then
    update public.games
    set extra_turn = false,
        turn_phase = 'awaiting_roll',
        turn_number = turn_number + 1,
        turn_started_at = now(),
        turn_deadline_at = now() + make_interval(secs => v_secs)
    where id = p_game;
    perform public.fn_log_event(p_game, 'extra_turn', v_cur,
      '⚡ دور إضافي بفضل الزوجي', '⚡ Extra turn from doubles', null);
    return;
  end if;

  v_next := v_cur;
  for i in 1..6 loop
    v_next := (v_next + 1) % 6;
    exit when exists (
      select 1 from public.game_players
      where game_id = p_game and seat = v_next and not is_bankrupt
    );
  end loop;

  select coalesce(in_detention, false) into v_next_detained
  from public.game_players where game_id = p_game and seat = v_next;

  update public.games
  set current_seat = v_next,
      doubles_count = 0,
      extra_turn = false,
      turn_number = turn_number + 1,
      round_number = case when v_next <= v_cur then round_number + 1 else round_number end,
      turn_phase = case when v_next_detained then 'awaiting_detention_choice'::public.turn_phase else 'awaiting_roll'::public.turn_phase end,
      turn_started_at = now(),
      turn_deadline_at = now() + make_interval(secs => v_secs)
  where id = p_game;

  update public.trade_offers set status = 'expired', resolved_at = now()
  where game_id = p_game and status = 'pending' and expires_at < now();

  perform public.fn_maybe_finish_game(p_game);
end $$;

-- ---------- شروط الفوز وإنهاء المباراة ----------
create or replace function public.fn_maybe_finish_game(p_game uuid)
returns boolean language plpgsql volatile as $$
declare v_g public.games%rowtype;
        v_active int; v_winner int; v_cond text; v_target int; v_minutes int;
        r record;
begin
  select * into v_g from public.games where id = p_game for update;
  if v_g.status <> 'active' then return false; end if;
  v_winner := null;

  select count(*)::int into v_active from public.game_players
  where game_id = p_game and not is_bankrupt;

  if v_active <= 1 then
    select seat into v_winner from public.game_players
    where game_id = p_game and not is_bankrupt order by seat limit 1;
    if v_winner is null then
      select seat into v_winner from public.game_players
      where game_id = p_game
      order by public.fn_net_worth(p_game, seat) desc, seat asc limit 1;
    end if;
    perform public.fn_finish_game(p_game, v_winner);
    return true;
  end if;

  v_cond := coalesce(v_g.settings->>'win_condition',
    case v_g.mode when 'classic' then 'last_standing' else 'round_limit' end);

  if v_cond = 'wealth_target' then
    v_target := public.fn_s(v_g.settings, 'wealth_target', 10000);
    for r in select seat from public.game_players
             where game_id = p_game and not is_bankrupt loop
      if public.fn_net_worth(p_game, r.seat) >= v_target then
        v_winner := r.seat;
        exit;
      end if;
    end loop;
    if v_winner is not null then
      perform public.fn_finish_game(p_game, v_winner);
      return true;
    end if;
  elsif v_cond = 'round_limit' then
    if v_g.round_number > public.fn_s(v_g.settings, 'round_limit', 20) then
      select seat into v_winner from public.game_players
      where game_id = p_game and not is_bankrupt
      order by public.fn_net_worth(p_game, seat) desc, seat asc limit 1;
      perform public.fn_finish_game(p_game, v_winner);
      return true;
    end if;
  elsif v_cond = 'time_limit' then
    v_minutes := public.fn_s(v_g.settings, 'time_limit_minutes', 0);
    if v_minutes > 0 and now() > v_g.started_at + make_interval(mins => v_minutes) then
      select seat into v_winner from public.game_players
      where game_id = p_game and not is_bankrupt
      order by public.fn_net_worth(p_game, seat) desc, seat asc limit 1;
      perform public.fn_finish_game(p_game, v_winner);
      return true;
    end if;
  end if;

  if v_g.mode = 'fast' then
    v_minutes := public.fn_s(v_g.settings, 'time_limit_minutes', 30);
    if v_minutes > 0 and now() > v_g.started_at + make_interval(mins => v_minutes) then
      select seat into v_winner from public.game_players
      where game_id = p_game and not is_bankrupt
      order by public.fn_net_worth(p_game, seat) desc, seat asc limit 1;
      perform public.fn_finish_game(p_game, v_winner);
      return true;
    end if;
  end if;

  return false;
end $$;

create or replace function public.fn_finish_game(p_game uuid, p_winner int)
returns void language plpgsql volatile as $$
declare v_g public.games%rowtype;
        v_nw int;
        r record;
begin
  select * into v_g from public.games where id = p_game for update;
  if v_g.status = 'finished' then return; end if;
  update public.games set status = 'finished', winner_seat = p_winner, finished_at = now()
  where id = p_game;
  perform public.fn_log_event(p_game, 'game_finished', p_winner,
    '🏆 انتهت المباراة — الفائز محدد!', '🏆 Game over — winner decided!',
    jsonb_build_object('winner_seat', p_winner));

  for r in select * from public.game_players where game_id = p_game and user_id is not null loop
    v_nw := greatest(public.fn_net_worth(p_game, r.seat), 0);
    insert into public.player_statistics (user_id, matches, wins, losses, total_money_earned, last_game_at)
    values (r.user_id, 1, case when r.seat = p_winner then 1 else 0 end,
            case when r.seat = p_winner then 0 else 1 end, v_nw, now())
    on conflict (user_id) do update set
      matches = public.player_statistics.matches + 1,
      wins = public.player_statistics.wins + excluded.wins,
      losses = public.player_statistics.losses + excluded.losses,
      total_money_earned = public.player_statistics.total_money_earned + excluded.total_money_earned,
      last_game_at = excluded.last_game_at,
      win_rate = round(
        (public.player_statistics.wins + excluded.wins)::numeric
        / greatest(public.player_statistics.matches + 1, 1), 3);

    insert into public.player_achievements (user_id, achievement_id)
    select r.user_id, a.id from public.achievements a
    where (
      (a.id = 'first_win' and r.seat = p_winner)
      or (a.id = 'champion' and (select wins from public.player_statistics where user_id = r.user_id) >= 5)
      or (a.id = 'veteran' and (select matches from public.player_statistics where user_id = r.user_id) >= 10)
      or (a.id = 'tycoon' and v_nw >= 5000)
      or (a.id = 'full_set' and exists (
        select 1 from public.game_properties gp join public.board_tiles bt on bt.id = gp.tile_id
        where gp.game_id = p_game and gp.owner_seat = r.seat and bt.kind = 'property'
        group by bt.color_group
        having count(*) = (select count(*) from public.board_tiles b2
                           where b2.color_group = bt.color_group and b2.kind = 'property')
      ))
    )
    on conflict do nothing;
  end loop;

  update public.rooms set status = 'lobby', last_activity_at = now() where id = v_g.room_id;
  update public.room_players set is_ready = false where room_id = v_g.room_id;
end $$;

-- ---------- المهلة الزمنية ----------
create or replace function public.fn_apply_timeout(p_game uuid)
returns text language plpgsql volatile as $$
declare v_g public.games%rowtype;
        v_seat int;
        v_p public.game_players%rowtype;
        v_a public.auctions%rowtype;
        v_result text := 'noop';
begin
  select * into v_g from public.games where id = p_game for update;
  if v_g.status <> 'active' then return 'noop'; end if;
  if now() < v_g.turn_deadline_at then return 'noop'; end if;
  v_seat := v_g.current_seat;

  if v_g.turn_phase = 'awaiting_roll' then
    perform public.fn_do_roll(p_game, v_seat, false);
    v_result := 'rolled';
  elsif v_g.turn_phase = 'awaiting_property_decision' then
    perform public.fn_do_decline(p_game, v_seat);
    v_result := 'declined';
  elsif v_g.turn_phase = 'auction_active' then
    select * into v_a from public.auctions
    where game_id = p_game and status = 'active'
    order by created_at desc limit 1;
    if found and now() >= v_a.ends_at then
      perform public.fn_finish_auction_core(p_game);
      v_result := 'auction_finished';
    end if;
  elsif v_g.turn_phase = 'awaiting_detention_choice' then
    perform public.fn_do_roll(p_game, v_seat, true);
    v_result := 'detention_roll';
  elsif v_g.turn_phase = 'awaiting_debt' then
    select * into v_p from public.game_players where game_id = p_game and seat = v_seat;
    if public.fn_liquidate(p_game, v_seat, v_p.debt_amount) then
      perform public.fn_settle_core(p_game, v_seat);
      v_result := 'debt_settled';
    else
      perform public.fn_bankrupt(p_game, v_seat, v_p.debt_creditor_seat, 'timeout');
      v_result := 'bankrupt';
    end if;
  elsif v_g.turn_phase = 'awaiting_end_turn' then
    perform public.fn_advance_turn(p_game);
    v_result := 'turn_advanced';
  end if;

  if v_result <> 'noop' then
    perform public.fn_log_event(p_game, 'timeout', v_seat,
      '⏱️ انتهى وقت الدور — نُفّذ إجراء تلقائي آمن',
      '⏱️ Turn timed out — a safe automatic action was applied', null);
  end if;
  return v_result;
end $$;

-- نبضة عامة تعمل على السيرفر (pg_cron) لمعالجة المهلات والمزادات المنتهية
create or replace function public.fn_auto_tick()
returns int language plpgsql volatile as $$
declare v_count int := 0; r record;
begin
  for r in select id from public.games
           where status = 'active' and turn_deadline_at < now()
           limit 50 loop
    perform public.fn_apply_timeout(r.id);
    v_count := v_count + 1;
  end loop;

  for r in select g.id as gid from public.games g
           join public.auctions a on a.game_id = g.id
           where g.status = 'active' and a.status = 'active' and a.ends_at < now()
           limit 50 loop
    perform public.fn_finish_auction_core(r.gid);
    v_count := v_count + 1;
  end loop;

  update public.trade_offers set status = 'expired', resolved_at = now()
  where status = 'pending' and expires_at < now();

  return v_count;
end $$;

-- جدولة النبضة إن توفر pg_cron
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('property-kings-tick');
    exception when others then null;
    end;
    perform cron.schedule('property-kings-tick', '30 seconds', $$select public.fn_auto_tick()$$);
  else
    raise notice 'pg_cron unavailable — clients will drive timeouts via handle_turn_timeout';
  end if;
exception when others then
  raise notice 'cron setup skipped: %', sqlerrm;
end $$;
