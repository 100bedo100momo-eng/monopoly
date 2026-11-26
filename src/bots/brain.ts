// عقل البوتات — دوال نقية تعتمد على المعلومات العامة فقط (لقطات الحالة المسموحة).
// لا يعرف ترتيب الكروت ولا أي معلومات مخفية، ولا ينفّذ شيئًا بنفسه: يُرجع "قرارًا" ينفّذه
// المشغّل عبر دوال RPC المحمية على السيرفر.

import { BOARD_TILES, GROUP_MEMBERS, tileById } from "@/game/board";
import { canBuild, canMortgage, canSellBuilding, rentFor } from "@/game/rules";
import type { GameSnapshot, SnapshotPlayer } from "@/game/types";

export type BotLevel = "easy" | "medium" | "hard";

export type BotAction =
  | { type: "roll" }
  | { type: "buy" }
  | { type: "decline" }
  | { type: "bid"; amount: number }
  | { type: "build"; tile: string }
  | { type: "sell_building"; tile: string }
  | { type: "mortgage"; tile: string }
  | { type: "unmortgage"; tile: string }
  | { type: "end_turn" }
  | { type: "pay_leave" }
  | { type: "use_card" }
  | { type: "settle_debt" }
  | { type: "bankrupt" };

export interface BotContext {
  level: BotLevel;
  me: SnapshotPlayer;
  game: GameSnapshot["game"];
  players: SnapshotPlayer[];
  properties: GameSnapshot["properties"];
}

/** نسبة السيولة التي يحاول البوت الاحتفاظ بها قبل المخاطرة */
function liquidityTarget(level: BotLevel): number {
  switch (level) {
    case "easy": return 0.1;
    case "medium": return 0.25;
    case "hard": return 0.35;
  }
}

export function ownedBy(ctx: BotContext, seat: number) {
  return ctx.properties.filter((p) => p.owner_seat === seat);
}

/** القيمة التقديرية لعقار: السعر + إيجار مرجعي */
export function propertyValue(tileId: string): number {
  const t = tileById(tileId);
  if (!t?.price) return 0;
  const base = t.price;
  const rent = t.kind === "property" ? (t.rents?.[1] ?? 0) : (t.rents?.[0] ?? 0);
  return base + rent * 8;
}

/** هل يمتلك seat المجموعة كاملة لهذا العقار؟ */
function hasFullGroup(ctx: BotContext, tileId: string, seat: number): boolean {
  const t = tileById(tileId);
  if (!t?.color_group) return false;
  const group = GROUP_MEMBERS[t.color_group] ?? [];
  return group.every((id) => ctx.properties.some((p) => p.tile_id === id && p.owner_seat === seat));
}

function missingForGroup(ctx: BotContext, tileId: string, seat: number): string[] {
  const t = tileById(tileId);
  if (!t?.color_group) return [];
  const group = GROUP_MEMBERS[t.color_group] ?? [];
  return group.filter(
    (id) => !ctx.properties.some((p) => p.tile_id === id && p.owner_seat === seat),
  );
}

function liquidity(ctx: BotContext): number {
  const totalWorth = ctx.players
    .filter((p) => p.seat === ctx.me.seat)
    .reduce((sum, p) => sum + p.cash, 0);
  const mortgagedValue = ownedBy(ctx, ctx.me.seat)
    .filter((p) => !p.is_mortgaged)
    .reduce((sum, p) => sum + (tileById(p.tile_id)?.mortgage_value ?? 0), 0);
  return totalWorth + mortgagedValue;
}

// ---------- قرار شراء/رفض ----------
export function decideBuy(ctx: BotContext): "buy" | "decline" {
  const t = tileById(currentTileId(ctx));
  const price = t?.price ?? 0;
  const value = propertyValue(t?.id ?? "");
  const completesSet = missingForGroup(ctx, t?.id ?? "", ctx.me.seat).length === 0
    && (GROUP_MEMBERS[t?.color_group ?? ""]?.length ?? 0) > 1;
  const completesMostly = missingForGroup(ctx, t?.id ?? "", ctx.me.seat).length <= 1;

  const reserve = liquidity(ctx) * liquidityTarget(ctx.level);
  let score = value - price;
  if (completesSet) score += price * 0.8;
  else if (completesMostly && ctx.level !== "easy") score += price * 0.35;

  if (ctx.level === "easy") {
    return ctx.me.cash - price > ctx.me.cash * 0.4 ? "buy" : "decline";
  }
  return ctx.me.cash - price >= reserve && score > 0 ? "buy" : "decline";
}

function currentTileId(ctx: BotContext): string {
  return BOARD_TILES.find((t) => t.position === ctx.me.position)?.id ?? "";
}

// ---------- قرار المزايدة ----------
export function decideBid(ctx: BotContext, currentBid: number, minIncrement: number): number | null {
  const t = tileById(auctionTileId(ctx));
  if (!t) return null;
  const value = propertyValue(t.id);
  const completesSet = (GROUP_MEMBERS[t.color_group ?? ""]?.length ?? 0) > 1
    && missingForGroup(ctx, t.id, ctx.me.seat).length === 0;
  const cap = Math.floor(
    Math.min(ctx.me.cash, completesSet ? value * 1.15 : value * (ctx.level === "easy" ? 0.75 : 0.95)),
  );
  const next = (currentBid === 0 ? minIncrement : currentBid + minIncrement);
  if (next > cap) return null;
  if (ctx.level === "easy" && Math.random() < 0.4) return null;
  return next;
}

function auctionTileId(ctx: BotContext): string {
  return ctx.game.turn_phase === "auction_active" ? currentTileId(ctx) : "";
}

// ---------- القرار الرئيسي ----------
export function decide(ctx: BotContext, opts: { auction?: { currentBid: number; minIncrement: number } | null } = {}): BotAction | null {
  if (ctx.game.status !== "active") return null;
  if (ctx.me.is_bankrupt) return null;

  // الدين أولوية قصوى
  if (ctx.me.debt_amount > 0) {
    if (ctx.me.cash >= ctx.me.debt_amount) return { type: "settle_debt" };
    const sellable = ownedBy(ctx, ctx.me.seat).find((p) => canSellBuilding(p.tile_id, ctx.properties, ctx.me.seat, ctx.game.settings));
    if (sellable) return { type: "sell_building", tile: sellable.tile_id };
    const mortgageable = ownedBy(ctx, ctx.me.seat)
      .filter((p) => canMortgage(p.tile_id, ctx.properties, ctx.me.seat))
      .sort((a, b) => propertyValue(a.tile_id) - propertyValue(b.tile_id));
    if (mortgageable.length) return { type: "mortgage", tile: mortgageable[0].tile_id };
    return { type: "bankrupt" };
  }

  switch (ctx.game.turn_phase) {
    case "awaiting_roll":
      return { type: "roll" };

    case "awaiting_detention_choice": {
      if (ctx.me.exit_cards > 0) return { type: "use_card" };
      const fee = ctx.game.settings.detention_fee;
      // المستويات العليا تدفع إذا كانت السباقة مهمة (منتصف اللوحة)
      const preferPay = ctx.level !== "easy" && ctx.me.cash > fee * 6 && ctx.me.detention_turns <= 1;
      if (preferPay) return { type: "pay_leave" };
      return { type: "roll" };
    }

    case "awaiting_property_decision":
      return decideBuy(ctx) === "buy" ? { type: "buy" } : { type: "decline" };

    case "auction_active": {
      if (opts.auction) {
        const bid = decideBid(ctx, opts.auction.currentBid, opts.auction.minIncrement);
        return bid ? { type: "bid", amount: bid } : null;
      }
      return null;
    }

    case "awaiting_end_turn": {
      // بناء إن أمكن (للمستويات المتوسطة والصعبة)
      if (ctx.level !== "easy") {
        const buildable = ownedBy(ctx, ctx.me.seat).find(
          (p) =>
            !p.is_mortgaged &&
            canBuild(p.tile_id, ctx.properties, ctx.me.seat, ctx.game.settings) &&
            ctx.me.cash > (tileById(p.tile_id)?.build_cost ?? 0) + ctx.me.cash * liquidityTarget(ctx.level) &&
            (hasFullGroup(ctx, p.tile_id, ctx.me.seat)),
        );
        if (buildable) return { type: "build", tile: buildable.tile_id };
        // فك رهن إذا كان اليدوفيرة جيدة
        if (ctx.level === "hard" && ctx.me.cash > ctx.game.settings.starting_cash * 0.8) {
          const mortgaged = ownedBy(ctx, ctx.me.seat).find((p) => p.is_mortgaged);
          if (mortgaged) {
            const t = tileById(mortgaged.tile_id);
            const cost = Math.ceil((t?.mortgage_value ?? 0) * (1 + ctx.game.settings.unmortgage_interest_pct / 100));
            if (ctx.me.cash - cost > ctx.me.cash * liquidityTarget(ctx.level)) {
              return { type: "unmortgage", tile: mortgaged.tile_id };
            }
          }
        }
      }
      return { type: "end_turn" };
    }
  }
  return null;
}

// ---------- تقييم عروض التداول الموجهة للبوت ----------
export type TradeDecision = "accept" | "reject";

export function evaluateTrade(
  ctx: BotContext,
  offer: { from_seat: number; money_from: number; money_to: number; items: { direction: "give" | "request"; tile_id: string }[] },
): TradeDecision {
  let incoming = offer.money_from;
  let outgoing = offer.money_to;
  let incomingScore = 0;
  let outgoingScore = 0;

  for (const item of offer.items) {
    const value = propertyValue(item.tile_id);
    if (item.direction === "give") {
      incoming += value;
      // قيمة استراتيجية: تكميل مجموعة للبوت
      if (GROUP_MEMBERS[tileById(item.tile_id)?.color_group ?? ""]?.length > 1
        && missingForGroup(ctx, item.tile_id, ctx.me.seat).filter((id) => id !== item.tile_id).length === 0) {
        incomingScore += value * 0.5;
      }
    } else {
      outgoing += value;
      // خطر: اللاعب يكمل مجموعته على حسابنا
      if (GROUP_MEMBERS[tileById(item.tile_id)?.color_group ?? ""]?.length > 1) {
        const othersInGroup = GROUP_MEMBERS[tileById(item.tile_id)?.color_group ?? ""]
          .filter((id) => id !== item.tile_id);
        const ownerHasOthers = othersInGroup.every((id) =>
          ctx.properties.some((p) => p.tile_id === id && p.owner_seat === offer.from_seat));
        if (ownerHasOthers) outgoingScore += value * 0.7;
      }
    }
  }
  const net = incoming + incomingScore - (outgoing + outgoingScore);
  if (ctx.level === "easy") return net >= 0 ? "accept" : "reject";
  const buffer = ctx.level === "hard" ? ctx.me.cash * 0.1 : 0;
  return net - buffer > 0 ? "accept" : "reject";
}

// ---------- حساب إيجار مرجعي للعرض (نسخة واجهة فقط) ----------
export function referenceRent(
  ctx: BotContext,
  tileId: string,
  ownerSeat: number,
): number {
  const t = tileById(tileId);
  if (!t || t.kind === "tax") return 0;
  if (t.kind === "surprise" || t.kind === "chest") return 0;
  const state = ctx.properties;
  if (t.kind === "utility") {
    return state.filter((p) => p.owner_seat === ownerSeat).filter((p) => tileById(p.tile_id)?.kind === "utility").length >= 2 ? 70 : 28;
  }
  return rentFor(t, state, ownerSeat, 7, ctx.game.settings);
}
