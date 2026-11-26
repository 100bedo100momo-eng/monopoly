"use client";

// مشغّل البوتات — يعمل داخل متصفح المضيف فقط، ويستدعي دوال RPC نفسها التي يستخدمها البشر.
// السيرفر يفرض أن التصرف نيابة عن بوت يتطلب صلاحية المضيف، والنرد/الأموال تُحسم حصرًا في SQL.

import type { GameSnapshot } from "@/game/types";
import { evaluateTrade, decide, type BotContext } from "./brain";
import { getSupabase } from "@/lib/supabase";

export interface DriverDeps {
  snapshot: () => GameSnapshot | null;
  isHost: () => boolean;
  onActionError?: (code: string) => void;
}

let running = false;
let inFlight = false;
let timer: ReturnType<typeof setInterval> | null = null;

function botContext(snapshot: GameSnapshot, seat: number): BotContext | null {
  const me = snapshot.players.find((p) => p.seat === seat);
  if (!me || !me.bot_level) return null;
  return { level: me.bot_level, me, game: snapshot.game, players: snapshot.players, properties: snapshot.properties };
}

async function rpcGame(action: string, gameId: string, args: Record<string, unknown>) {
  const { error } = await getSupabase().rpc(action, { p_game_id: gameId, ...args });
  if (error) throw error;
  return true;
}

function key(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

async function tick(deps: DriverDeps) {
  const snapshot = deps.snapshot();
  if (!snapshot || !deps.isHost() || snapshot.game.status !== "active") return;
  if (inFlight) return;
  inFlight = true;
  try {
    const game = snapshot.game;
    const seat = game.current_seat;
    const ctx = botContext(snapshot, seat);

    // 1) قرار البوت صاحب الدور
    if (ctx && !ctx.me.is_bankrupt) {
      const action = decide(ctx, {
        auction: snapshot.auction
          ? { currentBid: snapshot.auction.current_bid, minIncrement: snapshot.auction.min_increment }
          : null,
      });
      if (action) {
        const ok = await dispatchBotAction(ctx, action, snapshot.game.id);
        if (ok) return;
      }
    }

    // 2) مزايدة البوتات الآخرين أثناء المزاد
    if (game.turn_phase === "auction_active" && snapshot.auction) {
      const seats = snapshot.players
        .filter((p) => p.bot_level && !p.is_bankrupt && p.debt_amount === 0 && p.seat !== snapshot.auction?.current_bidder_seat)
        .map((p) => p.seat);
      for (const s of seats) {
        const bctx = botContext(snapshot, s);
        if (!bctx) continue;
        const action = decide(bctx, {
          auction: { currentBid: snapshot.auction.current_bid, minIncrement: snapshot.auction.min_increment },
        });
        if (action && action.type === "bid") {
          const ok = await rpcGame("place_bid", snapshot.game.id, { p_amount: action.amount, p_key: key(), p_seat: s }).catch(() => false);
          if (ok) return;
        }
      }
    }

    // 3) عروض التداول الموجهة للبوتات
    for (const offer of snapshot.my_trades) {
      if (offer.status !== "pending") continue;
      const bctx = botContext(snapshot, offer.to_seat);
      if (!bctx) continue;
      const decision = evaluateTrade(bctx, offer);
      const rpcName = decision === "accept" ? "accept_trade_offer" : "reject_trade_offer";
      let ok = false;
      try {
        await getSupabase().rpc(rpcName, { p_offer_id: offer.id, p_key: key(), p_seat: offer.to_seat });
        ok = true;
      } catch {
        ok = false;
      }
      if (ok) return;
    }
  } catch (e) {
    const code = (e as { message?: string }).message ?? "";
    if (!/NOT_YOUR_TURN|WRONG_PHASE|DUPLICATE_ACTION/.test(code)) {
      deps.onActionError?.(code);
    }
  } finally {
    inFlight = false;
  }
}

async function dispatchBotAction(ctx: BotContext, action: ReturnType<typeof decide>, gameId: string): Promise<boolean> {
  if (!action) return false;
  const seat = ctx.me.seat;
  try {
    switch (action.type) {
      case "roll":
        return await rpcGame("roll_dice", gameId, { p_key: key(), p_seat: seat });
      case "buy":
        return await rpcGame("buy_property", gameId, { p_key: key(), p_seat: seat });
      case "decline":
        return await rpcGame("decline_property", gameId, { p_key: key(), p_seat: seat });
      case "bid":
        return await rpcGame("place_bid", gameId, { p_amount: action.amount, p_key: key(), p_seat: seat });
      case "build":
        return await rpcGame("build_property", gameId, { p_tile: action.tile, p_key: key(), p_seat: seat });
      case "sell_building":
        return await rpcGame("sell_building", gameId, { p_tile: action.tile, p_key: key(), p_seat: seat });
      case "mortgage":
        return await rpcGame("mortgage_property", gameId, { p_tile: action.tile, p_key: key(), p_seat: seat });
      case "unmortgage":
        return await rpcGame("unmortgage_property", gameId, { p_tile: action.tile, p_key: key(), p_seat: seat });
      case "end_turn":
        return await rpcGame("end_turn", gameId, { p_key: key(), p_seat: seat });
      case "pay_leave":
        return await rpcGame("pay_to_leave_detention", gameId, { p_key: key(), p_seat: seat });
      case "use_card":
        return await rpcGame("use_exit_card", gameId, { p_key: key(), p_seat: seat });
      case "settle_debt":
        return await rpcGame("settle_debt", gameId, { p_key: key(), p_seat: seat });
      case "bankrupt":
        return await rpcGame("declare_bankruptcy", gameId, { p_key: key(), p_seat: seat });
    }
  } catch {
    return false;
  }
  return false;
}

/** بدء/إيقاف المشغّل (يُستدعى من صفحة المباراة عند توفر صلاحية المضيف) */
export function startBotDriver(deps: DriverDeps, intervalMs = 1800) {
  if (running) stopBotDriver();
  running = true;
  timer = setInterval(() => void tick(deps), intervalMs);
}

export function stopBotDriver() {
  running = false;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function isDriverRunning() {
  return running;
}
