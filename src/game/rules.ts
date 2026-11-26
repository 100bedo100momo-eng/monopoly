import { BOARD_TILES, GROUP_MEMBERS, tileById, type BoardTile } from "./board";

/** ثوابت القواعد المعتمدة في الواجهة — النسخة المرجعية المطبّقة فعليًا في دوال SQL. */
export const RULES = {
  detentionFee: 50,
  detentionTurns: 3,
  maxDoubles: 3,
  unmortgageInterestPct: 10,
  buildingsPerProperty: 4, // قبل "المعلم المميز" (المستوى 5)
  landmarkLevel: 5,
  auctionSeconds: 10,
  auctionExtendSeconds: 5,
  auctionExtendThresholdSeconds: 5,
  minBid: 10,
} as const;

export interface OwnedPropertyState {
  tile_id: string;
  owner_seat: number | null;
  buildings: number;
  is_mortgaged: boolean;
}

export interface PlayerLike {
  seat: number;
  cash: number;
  is_bankrupt: boolean;
}

export interface GameSettings {
  starting_cash: number;
  go_bonus: number;
  detention_fee: number;
  unmortgage_interest_pct: number;
  buildings_max: number;
  auction_min_increment: number;
}

/** إيجار عقار (أو محطة/شركة) — نسخة الواجهة المرجعية لمنطق SQL */
export function rentFor(
  tile: BoardTile,
  owned: OwnedPropertyState[],
  ownerSeat: number,
  diceTotal: number,
  _settings: GameSettings,
): number {
  if (tile.kind !== "property" && tile.kind !== "hub" && tile.kind !== "utility") return 0;
  const mine = owned.find((o) => o.tile_id === tile.id);
  if (!mine || mine.owner_seat !== ownerSeat || mine.is_mortgaged) return 0;
  const groupIds = GROUP_MEMBERS[tile.color_group ?? ""] ?? [];
  const groupOwned = groupIds.filter((id) =>
    owned.some((o) => o.tile_id === id && o.owner_seat === ownerSeat),
  ).length;
  if (tile.kind === "property") {
    if (!tile.rents) return 0;
    if (mine.buildings > 0) {
      const idx = Math.min(mine.buildings, tile.rents.length - 1);
      return tile.rents[idx];
    }
    const fullSet = groupOwned === groupIds.length;
    return fullSet ? tile.rents[0] * 2 : tile.rents[0];
  }
  if (tile.kind === "hub") {
    if (!tile.rents) return 0;
    const rent = tile.rents[Math.min(groupOwned, 4) - 1] ?? tile.rents[0];
    return groupOwned >= 4 ? rent * 2 : rent;
  }
  // شركة خدمات: مضاعف النرد
  return diceTotal * (groupOwned >= 2 ? 10 : 4);
}

export function unmortgageCost(tile: BoardTile, settings: GameSettings): number {
  if (!tile.mortgage_value) return 0;
  return Math.ceil((tile.mortgage_value * (100 + settings.unmortgage_interest_pct)) / 100);
}

/** يمكن البناء على tile؟ (المجموعة كاملة + قاعدة البناء المتوازن + لا رهن) */
export function canBuild(
  tileId: string,
  owned: OwnedPropertyState[],
  mySeat: number,
  settings: GameSettings,
): boolean {
  const tile = tileById(tileId);
  if (!tile || tile.kind !== "property") return false;
  const mine = owned.find((o) => o.tile_id === tileId);
  if (!mine || mine.owner_seat !== mySeat || mine.is_mortgaged) return false;
  const groupIds = GROUP_MEMBERS[tile.color_group ?? ""] ?? [];
  const groupStates = groupIds.map((id) => owned.find((o) => o.tile_id === id));
  if (!groupStates.every((s) => s && s.owner_seat === mySeat)) return false;
  if (groupStates.some((s) => s?.is_mortgaged)) return false;
  const maxLevel = Math.min(settings.buildings_max + 1, RULES.landmarkLevel);
  if (mine.buildings >= maxLevel) return false;
  // البناء المتوازن: مستوى tile يجب أن يساوي الحد الأدنى في المجموعة
  const minBuildings = Math.min(...groupStates.map((s) => s?.buildings ?? 0));
  return mine.buildings === minBuildings;
}

/** بيع مبنى متاح؟ (قاعدة البيع المتوازن) */
export function canSellBuilding(
  tileId: string,
  owned: OwnedPropertyState[],
  mySeat: number,
  _settings: GameSettings,
): boolean {
  const tile = tileById(tileId);
  if (!tile || tile.kind !== "property") return false;
  const mine = owned.find((o) => o.tile_id === tileId);
  if (!mine || mine.owner_seat !== mySeat || mine.buildings <= 0) return false;
  const groupIds = GROUP_MEMBERS[tile.color_group ?? ""] ?? [];
  const groupStates = groupIds.map((id) => owned.find((o) => o.tile_id === id));
  if (!groupStates.every((s) => s && s.owner_seat === mySeat)) return false;
  const maxBuildings = Math.max(...groupStates.map((s) => s?.buildings ?? 0));
  return mine.buildings === maxBuildings && mine.buildings > 0;
}

/** رهن متاح؟ (بلا مبانٍ في المجموعة كلها) */
export function canMortgage(
  tileId: string,
  owned: OwnedPropertyState[],
  mySeat: number,
): boolean {
  const tile = tileById(tileId);
  if (!tile || tile.kind !== "property") return false;
  const mine = owned.find((o) => o.tile_id === tileId);
  if (!mine || mine.owner_seat !== mySeat || mine.is_mortgaged) return false;
  const groupIds = GROUP_MEMBERS[tile.color_group ?? ""] ?? [];
  return groupIds.every((id) => (owned.find((o) => o.tile_id === id)?.buildings ?? 0) === 0);
}

export function netWorth(owned: OwnedPropertyState[], player: PlayerLike): number {
  let total = player.cash;
  for (const o of owned) {
    if (o.owner_seat !== player.seat) continue;
    const tile = tileById(o.tile_id);
    if (!tile?.price) continue;
    if (o.is_mortgaged) {
      total += tile.mortgage_value ?? 0;
    } else {
      total += tile.price + (tile.kind === "property" ? (tile.build_cost ?? 0) * o.buildings : 0);
    }
  }
  return total;
}

/** هل يمر اللاعب بالبداية في هذه الحركة؟ */
export function willPassGo(from: number, steps: number): boolean {
  if (steps <= 0) return false;
  return from + steps >= 40;
}

/** أقرب محطة نقل أمام اللاعب */
export function nextHubFrom(position: number): { tile: BoardTile; passedGo: boolean } {
  const hubs = BOARD_TILES.filter((t) => t.kind === "hub");
  for (let step = 1; step <= 40; step++) {
    const p = (position + step) % 40;
    const hub = hubs.find((h) => h.position === p);
    if (hub) return { tile: hub, passedGo: position + step >= 40 };
  }
  // غير قابل للوصول نظريًا
  return { tile: hubs[0], passedGo: false };
}
