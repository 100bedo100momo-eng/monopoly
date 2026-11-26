import { z } from "zod";

const botLevel = z.enum(["easy", "medium", "hard"]);
const roomRole = z.enum(["player", "spectator"]);

export const RoomSettingsSchema = z.object({
  mode: z.enum(["classic", "fast", "custom"]).default("classic"),
  starting_cash: z.number().int().min(500).max(20000).default(1500),
  turn_seconds: z.number().int().min(15).max(300).default(60),
  auctions_enabled: z.boolean().default(true),
  trading_enabled: z.boolean().default(true),
  go_bonus: z.number().int().min(50).max(1000).default(200),
  buildings_max: z.number().int().min(1).max(4).default(4),
  detention_fee: z.number().int().min(0).max(500).default(50),
  unmortgage_interest_pct: z.number().int().min(0).max(50).default(10),
  auction_min_increment: z.number().int().min(10).max(500).default(50),
  auction_seconds: z.number().int().min(5).max(60).default(10),
  round_limit: z.number().int().min(5).max(200).default(20),
  time_limit_minutes: z.number().int().min(0).max(240).default(0),
  win_condition: z.enum(["last_standing", "round_limit", "time_limit", "wealth_target"]).default("last_standing"),
  wealth_target: z.number().int().min(1000).max(1000000).default(10000),
  allow_bots: z.boolean().default(true),
  trade_expiry_seconds: z.number().int().min(30).max(600).default(120),
  seat_hold_seconds: z.number().int().min(30).max(1800).default(120),
  chat_filter_enabled: z.boolean().default(true),
});

export type RoomSettings = z.infer<typeof RoomSettingsSchema>;

export const DEFAULT_SETTINGS: RoomSettings = RoomSettingsSchema.parse({});

/** ألوان اللاعبين الستة + القطع (شكل مميز إضافي للتمييز دون الاعتماد على اللون وحده) */
export const PLAYER_COLORS = ["#e11d48", "#2563eb", "#059669", "#d97706", "#7c3aed", "#0891b2"] as const;
export const PLAYER_TOKENS = ["👑", "🏰", "🐪", "🦅", "🌴", "⚓"] as const;
export type PlayerColor = (typeof PLAYER_COLORS)[number];
export type PlayerToken = (typeof PLAYER_TOKENS)[number];

export const BOT_LEVELS: { value: "easy" | "medium" | "hard"; label_ar: string; label_en: string; emoji: string }[] = [
  { value: "easy", label_ar: "سهل", label_en: "Easy", emoji: "🐣" },
  { value: "medium", label_ar: "متوسط", label_en: "Medium", emoji: "🦊" },
  { value: "hard", label_ar: "صعب", label_en: "Hard", emoji: "🐉" },
];

// ---------- لقطات الحالة من السيرفر ----------
const botLevelNullable = z.union([botLevel, z.null()]);
const int = z.number().int();
const intOrNull = z.union([int, z.null()]);

export const SnapshotGameSchema = z.object({
  id: z.string().uuid(),
  room_id: z.string().uuid(),
  status: z.enum(["active", "finished", "aborted"]),
  mode: z.enum(["classic", "fast", "custom"]),
  settings: RoomSettingsSchema,
  current_seat: int,
  turn_phase: z.enum([
    "awaiting_roll",
    "awaiting_property_decision",
    "auction_active",
    "awaiting_detention_choice",
    "awaiting_debt",
    "awaiting_end_turn",
  ]),
  turn_number: int,
  round_number: int,
  dice_1: intOrNull,
  dice_2: intOrNull,
  doubles_count: int,
  extra_turn: z.boolean(),
  pending_move_after_debt: z.boolean(),
  turn_started_at: z.string(),
  turn_deadline_at: z.string(),
  winner_seat: intOrNull,
  started_at: z.string(),
  finished_at: z.string().nullable(),
});

export const SnapshotPlayerSchema = z.object({
  seat: int,
  user_id: z.string().uuid().nullable(),
  bot_level: botLevelNullable,
  name: z.string(),
  color: z.string(),
  token: z.string(),
  cash: int,
  position: int,
  in_detention: z.boolean(),
  detention_turns: int,
  exit_cards: int,
  is_bankrupt: z.boolean(),
  debt_amount: int,
  debt_creditor_seat: intOrNull,
});

export const SnapshotPropertySchema = z.object({
  tile_id: z.string(),
  owner_seat: intOrNull,
  buildings: int,
  is_mortgaged: z.boolean(),
});

export const SnapshotAuctionSchema = z.object({
  id: z.string().uuid(),
  tile_id: z.string(),
  status: z.enum(["active", "completed", "cancelled"]),
  current_bid: int,
  current_bidder_seat: intOrNull,
  min_increment: int,
  ends_at: z.string(),
});

export const SnapshotEventSchema = z.object({
  seq: int,
  type: z.string(),
  seat: intOrNull,
  msg_ar: z.string(),
  msg_en: z.string(),
  created_at: z.string(),
});

export const SnapshotTradeItemSchema = z.object({
  direction: z.enum(["give", "request"]),
  tile_id: z.string(),
});

export const SnapshotTradeSchema = z.object({
  id: z.string().uuid(),
  from_seat: int,
  to_seat: int,
  money_from: int,
  money_to: int,
  status: z.enum(["pending", "accepted", "rejected", "cancelled", "expired"]),
  expires_at: z.string(),
  items: z.array(SnapshotTradeItemSchema),
});

export const SnapshotRoomSchema = z.object({
  id: z.string().uuid(),
  code: z.string().length(6),
  name: z.string(),
  is_public: z.boolean(),
  host_id: z.string().uuid().nullable(),
  status: z.enum(["lobby", "playing", "closed"]),
  max_players: int,
  current_game_id: z.string().uuid().nullable(),
  settings: RoomSettingsSchema,
});

export const SnapshotMeSchema = z.object({
  user_id: z.string().uuid().nullable(),
  seat: intOrNull,
  role: roomRole,
  is_host: z.boolean(),
});

export const GameSnapshotSchema = z.object({
  room: SnapshotRoomSchema,
  game: SnapshotGameSchema,
  players: z.array(SnapshotPlayerSchema),
  properties: z.array(SnapshotPropertySchema),
  auction: SnapshotAuctionSchema.nullable(),
  events: z.array(SnapshotEventSchema),
  my_trades: z.array(SnapshotTradeSchema),
  me: SnapshotMeSchema.nullable(),
  server_now: z.string(),
});

export type GameSnapshot = z.infer<typeof GameSnapshotSchema>;
export type SnapshotPlayer = z.infer<typeof SnapshotPlayerSchema>;
export type SnapshotAuction = z.infer<typeof SnapshotAuctionSchema>;
export type SnapshotTrade = z.infer<typeof SnapshotTradeSchema>;
export type SnapshotEvent = z.infer<typeof SnapshotEventSchema>;

export const RoomSnapshotSchema = z.object({
  room: SnapshotRoomSchema,
  players: z.array(
    z.object({
      id: z.string().uuid(),
      seat: intOrNull,
      user_id: z.string().uuid().nullable(),
      bot_level: botLevelNullable,
      name: z.string(),
      color: z.string(),
      token: z.string(),
      is_ready: z.boolean(),
      role: roomRole,
    }),
  ),
  me: SnapshotMeSchema.nullable(),
  server_now: z.string(),
});

export type RoomSnapshot = z.infer<typeof RoomSnapshotSchema>;

export const PublicRoomSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  host_name: z.string().nullable(),
  mode: z.enum(["classic", "fast", "custom"]),
  players_count: int,
  max_players: int,
  status: z.enum(["lobby", "playing", "closed"]),
  created_at: z.string(),
});
export type PublicRoom = z.infer<typeof PublicRoomSchema>;

export const ChatMessageSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["user", "system", "quick"]),
  sender_name: z.string(),
  sender_user_id: z.string().uuid().nullable(),
  body: z.string(),
  created_at: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
