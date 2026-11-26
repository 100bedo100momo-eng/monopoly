-- ============================================================
-- بيانات Demo — تعمل عبر: npx supabase db reset
-- تعمل محليًا فقط (إدراج مستخدمين تجريبيين في auth.users)
-- ============================================================

do $$
declare
  v_demo1 uuid := '11111111-1111-4111-8111-111111111111';
  v_demo2 uuid := '22222222-2222-4222-8222-222222222222';
  v_room uuid;
begin
  -- حسابان تجريبيان (كلمة السر: demo1234)
  if not exists (select 1 from auth.users where id = v_demo1) then
    insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data, is_anonymous)
    values (v_demo1, 'demo1@propertykings.local', extensions.crypt('demo1234', extensions.gen_salt('bf')), now(), now(), now(), '{"username":"التاجر-أول"}'::jsonb, false);
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_demo1, 'email', 'email', jsonb_build_object('sub', v_demo1::text, 'email', 'demo1@propertykings.local'), now(), now(), now());
  end if;
  if not exists (select 1 from auth.users where id = v_demo2) then
    insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data, is_anonymous)
    values (v_demo2, 'demo2@propertykings.local', extensions.crypt('demo1234', extensions.gen_salt('bf')), now(), now(), now(), '{"username":"التاجر-الثاني"}'::jsonb, false);
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_demo2, 'email', 'email', jsonb_build_object('sub', v_demo2::text, 'email', 'demo2@propertykings.local'), now(), now(), now());
  end if;

  -- غرفة demo عامة
  if not exists (select 1 from public.rooms where code = 'DEMO77') then
    insert into public.rooms (code, name, is_public, host_id, max_players, settings)
    values ('DEMO77', 'غرفة التجارب', true, v_demo1, 6,
      '{"mode":"classic","starting_cash":1500,"turn_seconds":60,"auctions_enabled":true,"trading_enabled":true,"go_bonus":200,"buildings_max":4,"detention_fee":50,"unmortgage_interest_pct":10,"auction_min_increment":50,"auction_seconds":10,"round_limit":20,"time_limit_minutes":0,"win_condition":"last_standing","wealth_target":10000,"allow_bots":true,"trade_expiry_seconds":120,"seat_hold_seconds":120,"chat_filter_enabled":true}'::jsonb)
    returning id into v_room;

    insert into public.room_players (room_id, user_id, role, seat, color, token, is_ready)
    values (v_room, v_demo1, 'player', 0, '#e11d48', '👑', false),
           (v_room, v_demo2, 'player', 1, '#2563eb', '🏰', false);

    insert into public.chat_messages (room_id, sender_user_id, sender_name, kind, body)
    values (v_room, null, '', 'system', 'غرفة تجريبية للاختبار — الكود: DEMO77');
  end if;
exception when others then
  raise notice 'Demo seed skipped (expected on hosted Supabase): %', sqlerrm;
end $$;
