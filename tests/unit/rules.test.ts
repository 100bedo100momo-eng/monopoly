import { describe, it, expect } from "vitest";
import { BOARD_TILES, tileById } from "@/game/board";
import {
  canBuild, canMortgage, canSellBuilding, netWorth, nextHubFrom,
  rentFor, unmortgageCost, willPassGo, RULES,
} from "@/game/rules";

const settings = {
  starting_cash: 1500, go_bonus: 200, detention_fee: 50, unmortgage_interest_pct: 10,
  buildings_max: 4, auction_min_increment: 50,
};

const tile = (id: string) => tileById(id) as NonNullable<ReturnType<typeof tileById>>;

const state = (overrides: Record<string, Partial<{ owner_seat: number | null; buildings: number; is_mortgaged: boolean }>> = {}) =>
  BOARD_TILES.filter((t) => t.kind === "property" || t.kind === "hub" || t.kind === "utility").map((t) => ({
    tile_id: t.id,
    owner_seat: null,
    buildings: 0,
    is_mortgaged: false,
    ...overrides[t.id],
  }));

describe("حساب الإيجار", () => {
  it("الإيجار الأساسي لغير المالك = 0", () => {
    const s = state({ fayoum: { owner_seat: 0 } });
    expect(rentFor(tile("fayoum"), s, 1, 7, settings)).toBe(0);
  });

  it("مضاعفة الإيجار مع اكتمال المجموعة", () => {
    const s = state({ fayoum: { owner_seat: 0 }, jericho: { owner_seat: 0 } });
    expect(rentFor(tile("fayoum"), s, 0, 7, settings)).toBe(4); // 2 × 2
  });

  it("بدون مجموعة كاملة لا مضاعفة", () => {
    const s = state({ fayoum: { owner_seat: 0 } });
    expect(rentFor(tile("fayoum"), s, 0, 7, settings)).toBe(2);
  });

  it("الإيجار يتبع مستوى المباني", () => {
    const s = state({ fayoum: { owner_seat: 0, buildings: 2 }, jericho: { owner_seat: 0, buildings: 2 } });
    expect(rentFor(tile("fayoum"), s, 0, 7, settings)).toBe(30);
  });

  it("العقار المرهون لا يُحصَّل منه إيجار", () => {
    const s = state({ fayoum: { owner_seat: 0 }, jericho: { owner_seat: 0 }, "deir-ez-zor": { owner_seat: 1 } });
    const s2 = s.map((x) => (x.tile_id === "fayoum" ? { ...x, is_mortgaged: true } : x));
    expect(rentFor(tile("fayoum"), s2, 0, 7, settings)).toBe(0);
  });

  it("المحطات: 25/50/100/200 وتضاعف مع الأربع", () => {
    const hub = tile("hub-oasis");
    const one = state({ "hub-oasis": { owner_seat: 0 } });
    expect(rentFor(hub, one, 0, 7, settings)).toBe(25);
    const allIds = ["hub-oasis", "hub-pearl", "hub-sky", "hub-silver"];
    const all = allIds.map((id) => ({ tile_id: id, owner_seat: 0, buildings: 0, is_mortgaged: false }));
    expect(rentFor(hub, all, 0, 7, settings)).toBe(400); // 200 × 2
  });

  it("الشركات: النرد ×4 أو ×10", () => {
    const u = tile("utility-nile");
    const one = state({ "utility-nile": { owner_seat: 0 } });
    expect(rentFor(u, one, 0, 10, settings)).toBe(40);
    const bothCorrect = [
      { tile_id: "utility-nile", owner_seat: 0, buildings: 0, is_mortgaged: false },
      { tile_id: "utility-spring", owner_seat: 0, buildings: 0, is_mortgaged: false },
    ];
    expect(rentFor(u, bothCorrect, 0, 10, settings)).toBe(100);
  });
});

describe("البناء والبيع والرهن", () => {
  it("لا بناء دون امتلاك المجموعة كاملة", () => {
    const s = state({ fayoum: { owner_seat: 0 } });
    expect(canBuild("fayoum", s, 0, settings)).toBe(false);
  });

  it("بناء متوازن: يسمح بالأدنى في المجموعة", () => {
    const s = state({ fayoum: { owner_seat: 0, buildings: 1 }, jericho: { owner_seat: 0, buildings: 1 } });
    expect(canBuild("fayoum", s, 0, settings)).toBe(true);
  });

  it("قاعدة التوازن تمنع الفارق أكبر من مستوى", () => {
    const s = state({ fayoum: { owner_seat: 0, buildings: 2 }, jericho: { owner_seat: 0, buildings: 1 } });
    expect(canBuild("fayoum", s, 0, settings)).toBe(false);
    expect(canBuild("jericho", s, 0, settings)).toBe(true);
  });

  it("لا بناء على مرهون", () => {
    const s = state({ fayoum: { owner_seat: 0 }, jericho: { owner_seat: 0 } });
    const s2 = s.map((x) => (x.tile_id === "jericho" ? { ...x, is_mortgaged: true } : x));
    expect(canBuild("fayoum", s2, 0, settings)).toBe(false);
  });

  it("البيع المتوازن: من الأعلى مستوى فقط", () => {
    const s = state({ fayoum: { owner_seat: 0, buildings: 2 }, jericho: { owner_seat: 0, buildings: 1 } });
    expect(canSellBuilding("fayoum", s, 0, settings)).toBe(true);
    expect(canSellBuilding("jericho", s, 0, settings)).toBe(false);
  });

  it("الرهن يتطلب بلا مبانٍ في المجموعة كلها", () => {
    const s = state({ fayoum: { owner_seat: 0 }, jericho: { owner_seat: 0, buildings: 1 } });
    expect(canMortgage("fayoum", s, 0)).toBe(false);
    const s2 = state({ fayoum: { owner_seat: 0 }, jericho: { owner_seat: 0 } });
    expect(canMortgage("fayoum", s2, 0)).toBe(true);
  });

  it("تكلفة فك الرهن +10%", () => {
    expect(unmortgageCost(tile("fayoum"), settings)).toBe(33); // 30 × 1.1
  });
});

describe("صافي الثروة والنرد", () => {
  it("صافي الثروة = النقد + العقارات + المباني (المرهون بنصف السعر)", () => {
    const s = state({ fayoum: { owner_seat: 0, buildings: 1 }, jericho: { owner_seat: 0, is_mortgaged: true } });
    const player = { seat: 0, cash: 500, is_bankrupt: false };
    // 500 + (60 + 50×1) + (30 رهن)
    expect(netWorth(s, player)).toBe(640);
  });

  it("willPassGo وnextHubFrom", () => {
    expect(willPassGo(35, 7)).toBe(true);
    expect(willPassGo(10, 7)).toBe(false);
    const hub = nextHubFrom(0);
    expect(hub.tile.position).toBe(5);
    expect(hub.passedGo).toBe(false);
    expect(nextHubFrom(36).tile.position).toBe(5);
    expect(nextHubFrom(36).passedGo).toBe(true);
  });

  it("ثوابت القواعد الافتراضية", () => {
    expect(RULES.detentionTurns).toBe(3);
    expect(RULES.maxDoubles).toBe(3);
    expect(RULES.landmarkLevel).toBe(5);
    expect(RULES.detentionFee).toBe(50);
  });
});
