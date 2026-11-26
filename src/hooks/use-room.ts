"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { RoomSnapshotSchema, type ChatMessage, ChatMessageSchema, type RoomSnapshot } from "@/game/types";

interface UseRoomResult {
  snapshot: RoomSnapshot | null;
  loading: boolean;
  error: string | null;
  chat: ChatMessage[];
  presence: Record<string, { name: string; onlineAt: string }>;
  connection: "connected" | "reconnecting" | "offline";
  refresh: () => Promise<void>;
  sendChat: (body: string, kind?: "user" | "quick") => Promise<void>;
  act: (action: string, args?: Record<string, unknown>) => Promise<string | null>;
}

/** غرفة الانتظار: لقطة + Realtime (Postgres Changes) + Presence + نبضة */
export function useRoom(code: string): UseRoomResult {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [presence, setPresence] = useState<Record<string, { name: string; onlineAt: string }>>({});
  const [connection, setConnection] = useState<"connected" | "reconnecting" | "offline">("connected");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    const { data, error: rpcError } = await getSupabase().rpc("get_room_snapshot", { p_code: code });
    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }
    const parsed = RoomSnapshotSchema.safeParse(data);
    if (!parsed.success) {
      setError("BAD_SNAPSHOT");
      setLoading(false);
      return;
    }
    roomIdRef.current = parsed.data.room.id;
    setSnapshot(parsed.data);
    setError(null);
    setLoading(false);
  }, [code]);

  const reloadSoon = useCallback(() => {
    if (reloadTimer.current) return;
    reloadTimer.current = setTimeout(() => {
      reloadTimer.current = null;
      void refresh();
    }, 200);
  }, [refresh]);

  // اللقطة الأولى
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // الاشتراكات
  useEffect(() => {
    const supabase = getSupabase();
    let cancelled = false;

    const setup = async () => {
      // نجيب معرف الغرفة أولًا من اللقطة
      const { data } = await supabase.rpc("get_room_snapshot", { p_code: code });
      const roomId = (data as { room?: { id?: string } } | null)?.room?.id;
      if (!roomId || cancelled) return;

      const roomChannel = supabase
        .channel(`room-${roomId}`)
        .on("presence", { event: "sync" }, () => {
          const state = roomChannel.presenceState() as unknown as Record<string, Array<{ name?: string; online_at?: string }>>;
          const mapped: Record<string, { name: string; onlineAt: string }> = {};
          for (const [k, metas] of Object.entries(state)) {
            const meta = Array.isArray(metas) ? metas[0] : metas;
            if (meta?.name) mapped[k] = { name: meta.name, onlineAt: meta.online_at ?? new Date().toISOString() };
          }
          setPresence(mapped);
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` }, reloadSoon)
        .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` }, reloadSoon)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "chat_messages", filter: `room_id=eq.${roomId}` },
          (payload) => {
            const parsed = ChatMessageSchema.safeParse(payload.new);
            if (parsed.success) setChat((c) => [...c.filter((m) => m.id !== parsed.data.id), parsed.data]);
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") setConnection("connected");
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setConnection("offline");
          else setConnection("reconnecting");
        });

      // جلب الرسائل الأخيرة
      const { data: msgs } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: false })
        .limit(40);
      if (msgs) {
        setChat(msgs.map((m) => ChatMessageSchema.parse(m)).reverse());
      }

      // تتبع الحضور
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id ?? "guest";
      const myName =
        ((data as { players?: { name?: string; user_id?: string }[] } | null)?.players ?? []).find(
          (p) => p.user_id === userId,
        )?.name ?? "player";
      await roomChannel.track({ name: myName, online_at: new Date().toISOString() });

      // نبضة كل 20 ثانية
      const hb = setInterval(() => {
        void supabase.rpc("heartbeat", { p_room: roomId });
      }, 20_000);
      void supabase.rpc("heartbeat", { p_room: roomId });

      return () => {
        clearInterval(hb);
        void supabase.removeChannel(roomChannel);
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
  }, [code, reloadSoon]);

  const act = useCallback(
    async (action: string, args: Record<string, unknown> = {}): Promise<string | null> => {
      const { error: rpcError } = await getSupabase().rpc(action, args);
      if (rpcError) return rpcError.message;
      await refresh();
      return null;
    },
    [refresh],
  );

  const sendChat = useCallback(
    async (body: string, kind: "user" | "quick" = "user") => {
      const { error: rpcError } = await getSupabase().rpc("send_chat", {
        p_room: roomIdRef.current,
        p_body: body,
        p_kind: kind,
      });
      if (rpcError) throw new Error(rpcError.message);
    },
    [],
  );

  return { snapshot, loading, error, chat, presence, connection, refresh, sendChat, act };
}
