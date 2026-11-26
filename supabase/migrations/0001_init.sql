-- ============================================================
-- 0001: الإضافات، الأنواع، الجداول، الفهارس، المشغلات
-- ملوك العقارات – Property Kings
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- pg_cron اختياري: لتشغيل المؤقّتات على السيرفر حتى لو غاب كل العملاء
do $$ begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron not available: %', sqlerrm;
end $$;

-- ---------- الأنواع ----------
create type public.room_status as enum ('lobby', 'playing', 'closed');
create type public.room_role as enum ('player', 'spectator');
create type public.bot_level as enum ('easy', 'medium', 'hard');
create type public.game_status as enum ('active', 'finished', 'aborted');
create type public.game_mode as enum ('classic', 'fast', 'custom');
create type public.turn_phase as enum (
  'awaiting_roll',
  'awaiting_property_decision',
  'auction_active',
  'awaiting_detention_choice',
  'awaiting_debt',
  'awaiting_end_turn'
);
create type public.trade_status as enum ('pending', 'accepted', 'rejected', 'cancelled', 'expired');
create type public.auction_status as enum ('active', 'completed', 'cancelled');
create type public.card_deck as enum ('surprise', 'city_chest');

-- ---------- دوال البنية التحتية ----------
create or replace function public.fn_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- اللوحة الثابتة ----------
create table public.board_tiles (
  id text primary key,
  kind text not null check (kind in (
    'start','property','hub','utility','tax','surprise','chest','rest','detention','goto_detention'
  )),
  name_ar text not null,
  name_en text not null,
  color_group text,
  price int check (price > 0),
  mortgage_value int check (mortgage_value >= 0),
  build_cost int check (build_cost >= 0),
  rents int[],
  tax_amount int check (tax_amount >= 0),
  position int not null unique check (position between 0 and 39),
  grid_row int not null check (grid_row between 0 and 10),
  grid_col int not null check (grid_col between 0 and 10),
  created_at timestamptz not null default now()
);

create table public.card_definitions (
  id text primary key,
  deck public.card_deck not null,
  title_ar text not null,
  title_en text not null,
  description_ar text not null,
  description_en text not null,
  effect_type text not null check (effect_type in (
    'gain','loss','collect_from_each','pay_each','move_to','move_back',
    'move_to_nearest_hub','pay_per_building','go_to_detention','grant_exit_card'
  )),
  effect_value int not null default 0 check (effect_value >= 0),
  target_tile text references public.board_tiles(id),
  icon text not null default '🎴',
  sort_order int not null,
  created_at timestamptz not null default now()
);

-- ---------- الملفات الشخصية والإحصاءات ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  avatar text not null default 'falcon',
  locale text not null default 'ar' check (locale in ('ar','en')),
  theme text not null default 'dark' check (theme in ('dark','light')),
  sound_enabled boolean not null default true,
  is_admin boolean not null default false,
  is_guest boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_len check (char_length(username) between 2 and 24),
  constraint profiles_username_safe check (username !~* '[<>''"\\;]')
);

create table public.player_statistics (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  matches int not null default 0 check (matches >= 0),
  wins int not null default 0 check (wins >= 0),
  losses int not null default 0 check (losses >= 0),
  win_rate numeric(5,3) not null default 0 check (win_rate >= 0 and win_rate <= 1),
  total_money_earned bigint not null default 0 check (total_money_earned >= 0),
  last_game_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stats_consistency check (wins + losses <= matches)
);

create table public.achievements (
  id text primary key,
  title_ar text not null,
  title_en text not null,
  description_ar text not null,
  description_en text not null,
  icon text not null default '🏅',
  created_at timestamptz not null default now()
);

create table public.player_achievements (
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id text not null references public.achievements(id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

-- ---------- الغرف ----------
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_public boolean not null default true,
  host_id uuid not null references public.profiles(id),
  status public.room_status not null default 'lobby',
  max_players int not null default 6 check (max_players between 2 and 6),
  settings jsonb not null default '{}'::jsonb,
  current_game_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  last_activity_at timestamptz not null default now(),
  constraint rooms_code_format check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  constraint rooms_name_len check (char_length(name) between 1 and 40)
);

create table public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  bot_level public.bot_level,
  role public.room_role not null default 'player',
  seat int check (seat between 0 and 5),
  color text check (color ~ '^#[0-9A-Fa-f]{6}$'),
  token text check (char_length(token) between 1 and 8),
  is_ready boolean not null default false,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint room_players_user_or_bot check ((user_id is not null) <> (bot_level is not null)),
  constraint room_players_seat_needs_player check ((role = 'player') = (seat is not null)),
  constraint room_players_one_per_user unique (room_id, user_id),
  constraint room_players_unique_seat unique (room_id, seat)
);
create index room_players_room_idx on public.room_players (room_id);
create index room_players_user_idx on public.room_players (user_id);

-- ---------- المباريات ----------
create table public.games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  status public.game_status not null default 'active',
  mode public.game_mode not null default 'classic',
  settings jsonb not null default '{}'::jsonb,
  current_seat int not null default 0 check (current_seat between 0 and 5),
  turn_phase public.turn_phase not null default 'awaiting_roll',
  turn_number int not null default 1 check (turn_number >= 1),
  round_number int not null default 1 check (round_number >= 1),
  dice_1 int check (dice_1 between 1 and 6),
  dice_2 int check (dice_2 between 1 and 6),
  doubles_count int not null default 0 check (doubles_count between 0 and 3),
  extra_turn boolean not null default false,
  pending_move_after_debt boolean not null default false,
  turn_started_at timestamptz not null default now(),
  turn_deadline_at timestamptz not null default now() + interval '60 seconds',
  winner_seat int check (winner_seat between 0 and 5),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index games_room_idx on public.games (room_id);
create index games_active_deadline_idx on public.games (turn_deadline_at) where status = 'active';

create table public.game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  bot_level public.bot_level,
  seat int not null check (seat between 0 and 5),
  name text not null,
  color text not null,
  token text not null,
  cash int not null default 1500 check (cash >= 0),
  position int not null default 0 check (position between 0 and 39),
  in_detention boolean not null default false,
  detention_turns int not null default 0 check (detention_turns between 0 and 3),
  exit_cards int not null default 0 check (exit_cards >= 0),
  is_bankrupt boolean not null default false,
  debt_amount int not null default 0 check (debt_amount >= 0),
  debt_creditor_seat int check (debt_creditor_seat between 0 and 5),
  debt_origin text,
  last_seen_at timestamptz not null default now(),
  constraint game_players_user_or_bot check ((user_id is not null) <> (bot_level is not null)),
  constraint game_players_unique_seat unique (game_id, seat),
  constraint game_players_unique_user unique (game_id, user_id)
);
create index game_players_game_idx on public.game_players (game_id);
create index game_players_user_idx on public.game_players (user_id);

create table public.game_properties (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  tile_id text not null references public.board_tiles(id),
  owner_seat int check (owner_seat between 0 and 5),
  buildings int not null default 0 check (buildings between 0 and 5),
  is_mortgaged boolean not null default false,
  constraint game_properties_unique_tile unique (game_id, tile_id)
);
create index game_properties_game_idx on public.game_properties (game_id);
create index game_properties_owner_idx on public.game_properties (game_id, owner_seat);

-- ---------- الكروت لكل مباراة (سري — لا تُقرأ من العملاء) ----------
create table public.game_cards (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  card_id text not null references public.card_definitions(id),
  deck public.card_deck not null,
  position int not null,
  drawn_at timestamptz,
  drawn_by_seat int check (drawn_by_seat between 0 and 5),
  constraint game_cards_unique_pos unique (game_id, deck, position)
);
create index game_cards_game_idx on public.game_cards (game_id, deck, position);

-- ---------- الأحداث والحركات ----------
create table public.game_events (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  game_id uuid not null references public.games(id) on delete cascade,
  type text not null,
  seat int check (seat between 0 and 5),
  msg_ar text not null default '',
  msg_en text not null default '',
  payload jsonb,
  created_at timestamptz not null default now()
);
create index game_events_game_seq_idx on public.game_events (game_id, seq desc);

create table public.game_actions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  seat int not null check (seat between 0 and 5),
  action text not null,
  idempotency_key text not null,
  payload jsonb,
  created_at timestamptz not null default now(),
  constraint game_actions_unique_key unique (game_id, idempotency_key),
  constraint game_actions_key_len check (char_length(idempotency_key) between 8 and 64)
);
create index game_actions_recent_idx on public.game_actions (game_id, seat, created_at);

-- ---------- التداول ----------
create table public.trade_offers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  from_seat int not null check (from_seat between 0 and 5),
  to_seat int not null check (to_seat between 0 and 5),
  money_from int not null default 0 check (money_from >= 0),
  money_to int not null default 0 check (money_to >= 0),
  status public.trade_status not null default 'pending',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint trade_no_self check (from_seat <> to_seat)
);
create index trade_offers_game_idx on public.trade_offers (game_id, status);

create table public.trade_offer_items (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.trade_offers(id) on delete cascade,
  direction text not null check (direction in ('give','request')),
  tile_id text not null references public.board_tiles(id),
  constraint trade_items_unique unique (offer_id, tile_id)
);
create index trade_items_offer_idx on public.trade_offer_items (offer_id);

-- ---------- المزادات ----------
create table public.auctions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  tile_id text not null references public.board_tiles(id),
  status public.auction_status not null default 'active',
  current_bid int not null default 0 check (current_bid >= 0),
  current_bidder_seat int check (current_bidder_seat between 0 and 5),
  min_increment int not null default 50 check (min_increment > 0),
  ends_at timestamptz not null,
  winner_seat int check (winner_seat between 0 and 5),
  final_price int check (final_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index auctions_game_active_idx on public.auctions (game_id) where status = 'active';

create table public.auction_bids (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions(id) on delete cascade,
  seat int not null check (seat between 0 and 5),
  amount int not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index auction_bids_auction_idx on public.auction_bids (auction_id, amount desc);

-- ---------- الدردشة والبلاغات ----------
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  game_id uuid references public.games(id) on delete set null,
  sender_user_id uuid references public.profiles(id) on delete set null,
  sender_name text not null default '',
  kind text not null check (kind in ('user','system','quick')),
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);
create index chat_room_idx on public.chat_messages (room_id, created_at desc);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid references public.profiles(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  reason text not null,
  status text not null default 'open' check (status in ('open','resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint reports_reason_len check (char_length(reason) between 1 and 500)
);
create index reports_status_idx on public.reports (status, created_at desc);

create table public.banned_words (
  id uuid primary key default gen_random_uuid(),
  word text not null unique,
  created_at timestamptz not null default now(),
  constraint banned_word_len check (char_length(word) between 2 and 40)
);

-- ---------- قيد الغرفة ↔ المباراة الحالية ----------
alter table public.rooms
  add constraint rooms_current_game_fk
  foreign key (current_game_id) references public.games(id) on delete set null;

-- ---------- مشغلات updated_at ----------
do $$
declare t text;
begin
  foreach t in array array['profiles','player_statistics','rooms','games','trade_offers','auctions']
  loop
    execute format('create trigger trg_touch_%s before update on public.%I for each row execute function public.fn_touch_updated_at()', t, t);
  end loop;
end $$;

-- ---------- إنشاء ملف شخصي تلقائيًا مع كل مستخدم جديد ----------
create or replace function public.fn_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- عند الترقية من ضيف إلى حساب دائم (أول بريد يُسجَّل)
  if TG_OP = 'UPDATE' then
    if OLD.email is null and NEW.email is not null then
      update public.profiles set is_guest = false where id = new.id;
    end if;
    return new;
  end if;

  insert into public.profiles (id, username, is_guest)
  values (
    new.id,
    case
      when new.raw_user_meta_data->>'username' is not null
        then left(new.raw_user_meta_data->>'username', 24)
      else 'trader_' || upper(substr(replace(new.id::text, '-', ''), 1, 6))
    end,
    coalesce(new.is_anonymous, false)
  )
  on conflict (id) do nothing;

  insert into public.player_statistics (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.fn_handle_new_user();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update on auth.users
  for each row execute function public.fn_handle_new_user();
