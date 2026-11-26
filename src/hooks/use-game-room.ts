"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { ChatMessageSchema, GameSnapshotSchema, type ChatMessage, type GameSnapshot } from "@/game/types";
import { secondsUntil, serverSkewMs } from "@/lib/utils";

export interface GameActions {
  rollDice: () => Promise<string | null>;
  buyProperty: () => Promise<string | null>;
  declineProperty: () => Promise<string | null>;
  bid: (amount: number) => Promise<string | null>;
  finishAuction: () => Promise<string | null>;
  build: (tile: string) => Promise<string | null>;
  sellBuilding: (tile: string) => Promise<string | null>;
  mortgage: (tile: string) => Promise<string | null>;
  unmortgage: (tile: string) => Promise<string | null>;
  endTurn: () => Promise<string | null>;
  payToLeave: () => Promise<string | null>;
  useExitCard: () => Promise<string | null>;
  settleDebt: () => Promise<string | null>;
  declareBankruptcy: () => Promise<string | null>;
  leaveGame: () => Promise<string | null>;
  createTrade: (args: {
    p_to_seat: number;
    p_money_from: number;
    p_money_to: number;
    p_give_tiles: string[];
    p_request_tiles: string[];
  }) => Promise<string | null>;
  acceptTrade: (offerId: string) => Promise<string | null>;
  rejectTrade: (offerId: string) => Promise<string | null>;
  cancelTrade: (offerId: string) => Promise<string | null>;
  sendChat: (body: string, kind?: "user" | "quick") => Promise<void>;
  refresh: () => Promise<void>;
}

interface UseGameRoomResult {
  snapshot: GameSnapshot | null;
  loading: boolean;
  error: string | null;
  chat: ChatMessage[];
  connection: "connected" | "reconnecting" | "offline";
  skewMs: number;
  secondsLeft: number | null;
  actions: GameActions;
}

const EMPTY_ACTIONS: GameActions = {} as GameActions;

/** المباراة: لقطة + تغييرات Postgres + مراقبة المهلة + أجراءات بمفاتيح idempotency */
export function useGameRoom(code: string, enabled = true): UseGameRoomResult {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [connection, setConnection] = useState<"connected" | "reconnecting" | "offline">("connected");
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [skewMs, setSkewMs] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const timeoutHandledFor = useRef<string>("");
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshotRef = useRef<GameSnapshot | null>(null);
  useEffect(() => {
    snapshotRef.current = snapshot;
  });

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const { data, error: rpcError } = await getSupabase().rpc("get_game_snapshot", { p_code: code });
    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }
    const parsed = GameSnapshotSchema.safeParse(data);
    if (!parsed.success) {
      setError("BAD_SNAPSHOT");
      setLoading(false);
      return;
    }
    setSkewMs(serverSkewMs(parsed.data.server_now));
    setSnapshot(parsed.data);
    setError(null);
    setLoading(false);
  }, [code, enabled]);

  const reloadSoon = useCallback(() => {
    if (reloadTimer.current) return;
    reloadTimer.current = setTimeout(() => {
      reloadTimer.current = null;
      void refresh();
    }, 180);
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [refresh, enabled]);

  // الاشتراكات اللحظية
  useEffect(() => {
    if (!enabled) return;
    const supabase = getSupabase();
    let cancelled = false;

    const setup = async () => {
      const { data } = await supabase.rpc("get_game_snapshot", { p_code: code });
      const g = (data as { game?: { id?: string }; room?: { id?: string } } | null) ?? {};
      const gameId = g.game?.id;
      const roomId = g.room?.id;
      if (!gameId || !roomId || cancelled) return;

      const channel = supabase
        .channel(`game-${gameId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: `id=eq.${gameId}` }, reloadSoon)
        .on("postgres_changes", { event: "*", schema: "public", table: "game_players", filter: `game_id=eq.${gameId}` }, reloadSoon)
        .on("postgres_changes", { event: "*", schema: "public", table: "game_properties", filter: `game_id=eq.${gameId}` }, reloadSoon)
        .on("postgres_changes", { event: "*", schema: "public", table: "auctions", filter: `game_id=eq.${gameId}` }, reloadSoon)
        .on("postgres_changes", { event: "*", schema: "public", table: "trade_offers", filter: `game_id=eq.${gameId}` }, reloadSoon)
        .on("postgres_changes", { event: "*", schema: "public", table: "game_events", filter: `game_id=eq.${gameId}` }, reloadSoon)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "chat_messages", filter: `room_id=eq.${roomId}` },
          (payload) => {
            const parsed = ChatMessageSchema.safeParse(payload.new);
            if (parsed.success) setChat((c) => [...c.filter((m) => m.id !== parsed.data.id), parsed.data]);
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setConnection("connected");
            void refresh();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setConnection("offline");
          else setConnection("reconnecting");
        });

      const { data: msgs } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: false })
        .limit(40);
      if (msgs) setChat(msgs.map((m) => ChatMessageSchema.parse(m)).reverse());

      const hb = setInterval(() => void supabase.rpc("heartbeat", { p_room: roomId }), 20_000);
      void supabase.rpc("heartbeat", { p_room: roomId });

      return () => {
        clearInterval(hb);
        void supabase.removeChannel(channel);
      };
    };

    let cleanup: (() => void) | undefined;
    void setup().then((fn) => {
      cleanup = fn ?? undefined;
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [code, reloadSoon, refresh, enabled]);

  // عدّاد الوقت + استدعاء المهلة التلقائية
  useEffect(() => {
    if (!enabled) return;
    const int = setInterval(() => {
      const s = snapshotRef.current;
      if (!s || s.game.status !== "active") {
        setSecondsLeft(null);
        return;
      }
      const left = secondsUntil(s.game.turn_deadline_at, skewMs);
      setSecondsLeft(left);
      if (left <= 0 && timeoutHandledFor.current !== s.game.turn_started_at) {
        timeoutHandledFor.current = s.game.turn_started_at;
        void (async () => {
          try {
            await getSupabase().rpc("handle_turn_timeout", {
              p_game_id: s.game.id,
              p_key: `timeout-${s.game.turn_started_at}`,
            });
            reloadSoon();
          } catch {
            /* يعيد المحاولة في النبضة التالية */
          }
        })();
      }
    }, 1000);
    return () => clearInterval(int);
  }, [skewMs, enabled, reloadSoon]);

  const act = useCallback(
    async (action: string, args: Record<string, unknown> = {}): Promise<string | null> => {
      const { error: rpcError } = await getSupabase().rpc(action, args);
      if (rpcError) {
        setSecondsLeft((v) => v); // لا شيء
        return rpcError.message;
      }
      await refresh();
      return null;
    },
    [refresh],
  );

  const key = useCallback(() => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`, []);

  const gameId = () => snapshotRef.current?.game.id ?? "";

  const actions: GameActions = snapshot
    ? {
        rollDice: () => act("roll_dice", { p_game_id: gameId(), p_key: key() }),
        buyProperty: () => act("buy_property", { p_game_id: gameId(), p_key: key() }),
        declineProperty: () => act("decline_property", { p_game_id: gameId(), p_key: key() }),
        bid: (amount) => act("place_bid", { p_game_id: gameId(), p_amount: amount, p_key: key() }),
        finishAuction: () => act("finish_auction", { p_game_id: gameId(), p_key: key() }),
        build: (tile) => act("build_property", { p_game_id: gameId(), p_tile: tile, p_key: key() }),
        sellBuilding: (tile) => act("sell_building", { p_game_id: gameId(), p_tile: tile, p_key: key() }),
        mortgage: (tile) => act("mortgage_property", { p_game_id: gameId(), p_tile: tile, p_key: key() }),
        unmortgage: (tile) => act("unmortgage_property", { p_game_id: gameId(), p_tile: tile, p_key: key() }),
        endTurn: () => act("end_turn", { p_game_id: gameId(), p_key: key() }),
        payToLeave: () => act("pay_to_leave_detention", { p_game_id: gameId(), p_key: key() }),
        useExitCard: () => act("use_exit_card", { p_game_id: gameId(), p_key: key() }),
        settleDebt: () => act("settle_debt", { p_game_id: gameId(), p_key: key() }),
        declareBankruptcy: () => act("declare_bankruptcy", { p_game_id: gameId(), p_key: key() }),
        leaveGame: () => act("leave_game", { p_game_id: gameId() }),
        createTrade: (args) => act("create_trade_offer", { p_game_id: gameId(), p_key: key(), ...args }),
        acceptTrade: (offerId) => act("accept_trade_offer", { p_offer_id: offerId, p_key: key() }),
        rejectTrade: (offerId) => act("reject_trade_offer", { p_offer_id: offerId, p_key: key() }),
        cancelTrade: (offerId) => act("cancel_trade_offer", { p_offer_id: offerId, p_key: key() }),
        sendChat: async (body, kind = "user") => {
          const room = snapshotRef.current?.room.id;
          if (!room) return;
          const { error: chatError } = await getSupabase().rpc("send_chat", { p_room: room, p_body: body, p_kind: kind });
          if (chatError) throw new Error(chatError.message);
        },
        refresh,
      }
    : EMPTY_ACTIONS;

  return { snapshot, loading, error, chat, connection, skewMs, secondsLeft, actions };
}
