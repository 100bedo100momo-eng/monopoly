import { describe, it, expect } from "vitest";
import { decide, decideBid, evaluateTrade, type BotContext } from "@/bots/brain";
import { BOARD_TILES } from "@/game/board";
import { DEFAULT_SETTINGS } from "@/game/types";

function makeContext(level: "easy" | "medium" | "hard", overrides: Partial<BotContext> = {}): BotContext {
  return {
    level,
    me: {
      seat: 0, user_id: null, bot_level: level, name: "bot", color: "#000", token: "👑",
      cash: 1000, position: 6, in_detention: false, detention_turns: 0, exit_cards: 0,
      is_bankrupt: false, debt_amount: 0, debt_creditor_seat: null,
    },
    game: {
      id: "g", room_id: "r", status: "active", mode: "classic",
      settings: DEFAULT_SETTINGS,
      current_seat: 0, turn_phase: "awaiting_roll", turn_number: 1, round_number: 1,
      dice_1: null, dice_2: null, doubles_count: 0, extra_turn: false,
      pending_move_after_debt: false, turn_started_at: new Date().toISOString(),
      turn_deadline_at: new Date().toISOString(), winner_seat: null,
      started_at: new Date().toISOString(), finished_at: null,
    },
    players: [],
    properties: [],
    ...overrides,
  };
}

describe("قرارات البوت", () => {
  it("يرمي النرد في طور الانتظار", () => {
    expect(decide(makeContext("easy"))).toEqual({ type: "roll" });
  });

  it("يشتري البوت الغني العقار الرخيص", () => {
    const ctx = makeContext("medium", {
      game: { ...makeContext("medium").game, turn_phase: "awaiting_property_decision" },
      me: { ...makeContext("medium").me, position: 1, cash: 1000 },
    });
    expect(decide(ctx)).toEqual({ type: "buy" });
  });

  it("يرفض البوت الفقير العقار الغالي", () => {
    const ctx = makeContext("medium", {
      game: { ...makeContext("medium").game, turn_phase: "awaiting_property_decision" },
      me: { ...makeContext("medium").me, position: 39, cash: 120 },
    });
    expect(decide(ctx)).toEqual({ type: "decline" });
  });

  it("يستخدم بطاقة الخروج من التوقيف أولًا", () => {
    const ctx = makeContext("hard", {
      game: { ...makeContext("hard").game, turn_phase: "awaiting_detention_choice" },
      me: { ...makeContext("hard").me, in_detention: true, exit_cards: 2 },
    });
    expect(decide(ctx)).toEqual({ type: "use_card" });
  });

  it("يحاول الزوجي إن لم توجد بطاقة", () => {
    const ctx = makeContext("easy", {
      game: { ...makeContext("easy").game, turn_phase: "awaiting_detention_choice" },
      me: { ...makeContext("easy").me, in_detention: true, exit_cards: 0 },
    });
    expect(decide(ctx)).toEqual({ type: "roll" });
  });

  it("يسدد الدين عندما يكفي الرصيد", () => {
    const ctx = makeContext("medium", {
      game: { ...makeContext("medium").game, turn_phase: "awaiting_debt" },
      me: { ...makeContext("medium").me, debt_amount: 200, cash: 300 },
    });
    expect(decide(ctx)).toEqual({ type: "settle_debt" });
  });

  it("يرهن قبل الإفلاس عندما ينقص الرصيد", () => {
    const props = BOARD_TILES.filter((t) => t.kind === "property").slice(0, 2).map((t) => ({
      tile_id: t.id, owner_seat: 0, buildings: 0, is_mortgaged: false,
    }));
    const ctx = makeContext("medium", {
      game: { ...makeContext("medium").game, turn_phase: "awaiting_debt" },
      me: { ...makeContext("medium").me, debt_amount: 500, cash: 100 },
      properties: props,
    });
    expect(decide(ctx)).toEqual({ type: "mortgage", tile: props[0].tile_id });
  });

  it("يبيع مبنى قبل الرهن عند وجود مبانٍ", () => {
    const props = [
      { tile_id: "fayoum", owner_seat: 0, buildings: 2, is_mortgaged: false },
      { tile_id: "jericho", owner_seat: 0, buildings: 2, is_mortgaged: false },
    ];
    const ctx = makeContext("medium", {
      game: { ...makeContext("medium").game, turn_phase: "awaiting_debt" },
      me: { ...makeContext("medium").me, debt_amount: 500, cash: 0 },
      properties: props,
    });
    expect(decide(ctx)).toEqual({ type: "sell_building", tile: "fayoum" });
  });

  it("يعلن الإفلاس إذا لم يوجد ما يبيعه", () => {
    const ctx = makeContext("medium", {
      game: { ...makeContext("medium").game, turn_phase: "awaiting_debt" },
      me: { ...makeContext("medium").me, debt_amount: 9999, cash: 10 },
    });
    expect(decide(ctx)).toEqual({ type: "bankrupt" });
  });

  it("ينهي الدور في نهايته", () => {
    const ctx = makeContext("easy", {
      game: { ...makeContext("easy").game, turn_phase: "awaiting_end_turn" },
    });
    expect(decide(ctx)).toEqual({ type: "end_turn" });
  });

  it("لا يزايد فوق رصيده", () => {
    const ctx = makeContext("medium", { me: { ...makeContext("medium").me, cash: 100 } });
    expect(decideBid(ctx, 500, 50)).toBeNull();
  });

  it("المزايدة الأولى تساوي الحد الأدنى", () => {
    const ctx = makeContext("medium", {
      game: { ...makeContext("medium").game, turn_phase: "auction_active" },
      me: { ...makeContext("medium").me, cash: 2000, position: 5 },
    });
    expect(decideBid(ctx, 0, 50)).toBe(50);
  });

  it("تقييم صفقة رابحة يقبلها", () => {
    const ctx = makeContext("medium");
    const d = evaluateTrade(ctx, { from_seat: 1, money_from: 500, money_to: 0, items: [] });
    expect(d).toBe("accept");
  });

  it("تقييم صفقة خاسرة يرفضها", () => {
    const ctx = makeContext("hard", {
      properties: [{ tile_id: "dubai", owner_seat: 0, buildings: 0, is_mortgaged: false }],
    });
    const d = evaluateTrade(ctx, { from_seat: 1, money_from: 0, money_to: 0, items: [{ direction: "request", tile_id: "dubai" }] });
    expect(d).toBe("reject");
  });
});
