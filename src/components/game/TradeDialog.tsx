"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/lib/i18n";
import { tileById } from "@/game/board";
import { formatMoney } from "@/lib/utils";
import { propertyValue } from "@/bots/brain";
import type { GameSnapshot } from "@/game/types";

/** نافذة التداول: إنشاء عروض + استقبال العروض الواردة */
export function TradeDialog({
  open, snapshot, onClose, onAction,
}: {
  open: boolean;
  snapshot: GameSnapshot;
  onClose: () => void;
  onAction: (name: string, args?: Record<string, unknown>) => Promise<string | null>;
}) {
  const { t, locale } = useI18n();
  const meSeat = snapshot.me?.seat ?? null;
  const [target, setTarget] = useState<number | null>(null);
  const [giveTiles, setGiveTiles] = useState<string[]>([]);
  const [requestTiles, setRequestTiles] = useState<string[]>([]);
  const [moneyGive, setMoneyGive] = useState(0);
  const [moneyAsk, setMoneyAsk] = useState(0);
  const [busy, setBusy] = useState(false);

  const me = snapshot.players.find((p) => p.seat === meSeat);
  const tradeable = (seat: number) =>
    snapshot.properties.filter((p) => p.owner_seat === seat && p.buildings === 0);

  const incoming = snapshot.my_trades.filter((o) => o.status === "pending" && o.to_seat === meSeat);
  const outgoing = snapshot.my_trades.filter((o) => o.status === "pending" && o.from_seat === meSeat);

  useEffect(() => {
    if (target != null && !snapshot.players.some((p) => p.seat === target && !p.is_bankrupt)) setTarget(null);
  }, [snapshot.players, target]);

  const approxValue = useMemo(() => {
    let v = moneyAsk;
    for (const id of requestTiles) v += propertyValue(id);
    return v - moneyGive - giveTiles.reduce((s, id) => s + propertyValue(id), 0);
  }, [moneyAsk, moneyGive, giveTiles, requestTiles]);

  if (meSeat == null || !me) return null;

  const toggle = (arr: string[], setArr: (v: string[]) => void, id: string) => {
    setArr(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  };

  const submit = async () => {
    if (target == null) return;
    setBusy(true);
    const err = await onAction("createTrade", {
      p_to_seat: target,
      p_money_from: moneyGive,
      p_money_to: moneyAsk,
      p_give_tiles: giveTiles,
      p_request_tiles: requestTiles,
    });
    setBusy(false);
    if (!err) {
      setGiveTiles([]);
      setRequestTiles([]);
      setMoneyGive(0);
      setMoneyAsk(0);
      setTarget(null);
    }
  };

  const tileName = (id: string) => tileById(id)?.name_ar ?? id;

  return (
    <Modal open={open} onClose={onClose} title={`🤝 ${t("game.trade")}`} maxWidth="max-w-2xl">
      <div className="flex flex-col gap-4 text-sm">
        {/* العروض الواردة */}
        {incoming.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="font-extrabold text-gold">{t("game.pending_offers")}</div>
            {incoming.map((o) => {
              const from = snapshot.players.find((p) => p.seat === o.from_seat);
              return (
                <div key={o.id} className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-2.5">
                  <div className="font-bold">
                    {t("game.offer_from")} {from?.name}{" "}
                    <span className="text-xs text-white/50">{t("game.expired_soon")}: {new Date(o.expires_at).toLocaleTimeString(locale)}</span>
                  </div>
                  <div className="mt-1 text-xs">
                    <span className="text-emerald-300">{t("game.offer_gives")}: </span>
                    {o.money_from > 0 && <span>{formatMoney(o.money_from, locale)} </span>}
                    {o.items.filter((i) => i.direction === "give").map((i) => (
                      <span key={i.tile_id} className="mx-1 rounded bg-white/10 px-1.5">{tileName(i.tile_id)}</span>
                    ))}
                  </div>
                  <div className="mt-1 text-xs">
                    <span className="text-rose-300">{t("game.offer_wants")}: </span>
                    {o.money_to > 0 && <span>{formatMoney(o.money_to, locale)} </span>}
                    {o.items.filter((i) => i.direction === "request").map((i) => (
                      <span key={i.tile_id} className="mx-1 rounded bg-white/10 px-1.5">{tileName(i.tile_id)}</span>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="success" disabled={busy} onClick={() => void onAction("acceptTrade", { offerId: o.id })}>
                      ✅ {t("game.accept")}
                    </Button>
                    <Button size="sm" variant="danger" disabled={busy} onClick={() => void onAction("rejectTrade", { offerId: o.id })}>
                      ❌ {t("game.reject")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {outgoing.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="font-extrabold text-white/80">{t("game.pending_offers")} (⏳)</div>
            {outgoing.map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded-xl border border-white/10 p-2 text-xs">
                <span>
                  → {snapshot.players.find((p) => p.seat === o.to_seat)?.name} ·{" "}
                  {o.money_from > 0 && `${formatMoney(o.money_from, locale)} ↓`} {o.money_to > 0 && `${formatMoney(o.money_to, locale)} ↑`}
                </span>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void onAction("cancelTrade", { offerId: o.id })}>
                  {t("cancel")}
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* إنشاء عرض جديد */}
        <div className="rounded-xl border border-white/10 p-3">
          <div className="mb-2 font-extrabold text-gold">{t("game.select_player")}</div>
          <div className="flex flex-wrap gap-2">
            {snapshot.players
              .filter((p) => p.seat !== meSeat && !p.is_bankrupt && !p.bot_level)
              .map((p) => (
                <button
                  key={p.seat}
                  onClick={() => setTarget(p.seat)}
                  className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 ${target === p.seat ? "border-gold bg-gold/10" : "border-white/15"}`}
                >
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: p.color }} />
                  {p.name}
                </button>
              ))}
          </div>

          {target != null && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <TradePicker
                title={`${t("game.you_give")}`}
                tiles={tradeable(meSeat)}
                selected={giveTiles}
                onToggle={(id) => toggle(giveTiles, setGiveTiles, id)}
                money={moneyGive}
                maxMoney={me.cash}
                setMoney={setMoneyGive}
                moneyLabel={t("game.money")}
              />
              <TradePicker
                title={`${t("game.you_receive")}`}
                tiles={tradeable(target)}
                selected={requestTiles}
                onToggle={(id) => toggle(requestTiles, setRequestTiles, id)}
                money={moneyAsk}
                maxMoney={snapshot.players.find((p) => p.seat === target)?.cash ?? 0}
                setMoney={setMoneyAsk}
                moneyLabel={t("game.money")}
              />
            </div>
          )}

          {target != null && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-white/60">
                {t("game.approx_value")}: <strong className={approxValue >= 0 ? "text-emerald-300" : "text-rose-300"}>{formatMoney(approxValue, locale)}</strong>
              </span>
              <Button disabled={busy || (giveTiles.length === 0 && requestTiles.length === 0 && moneyGive === 0 && moneyAsk === 0)} onClick={() => void submit()}>
                {t("game.create_offer")}
              </Button>
            </div>
          )}
          {tradeable(meSeat).length === 0 && (
            <p className="mt-2 text-xs text-white/50">{t("game.no_tradeable")}</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function TradePicker({
  title, tiles, selected, onToggle, money, maxMoney, setMoney, moneyLabel,
}: {
  title: string;
  tiles: { tile_id: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  money: number;
  maxMoney: number;
  setMoney: (v: number) => void;
  moneyLabel: string;
}) {
  const { locale } = useI18n();
  return (
    <div className="rounded-xl border border-white/10 p-2.5">
      <div className="mb-1.5 font-bold">{title}</div>
      <div className="flex max-h-32 flex-col gap-1 overflow-y-auto">
        {tiles.map((p) => {
          const tile = tileById(p.tile_id);
          return (
            <button
              key={p.tile_id}
              onClick={() => onToggle(p.tile_id)}
              className={`rounded-lg px-2 py-1 text-start text-xs ${selected.includes(p.tile_id) ? "bg-gold/20 border border-gold" : "bg-white/5 border border-transparent hover:bg-white/10"}`}
            >
              {tile?.name_ar} <span className="text-white/40">{formatMoney(tile?.price ?? 0, locale)}</span>
            </button>
          );
        })}
        {tiles.length === 0 && <span className="text-xs text-white/40">—</span>}
      </div>
      <label className="mt-2 flex items-center justify-between gap-2 text-xs">
        {moneyLabel}
        <input
          type="number"
          min={0}
          max={maxMoney}
          value={money}
          onChange={(e) => setMoney(Math.min(Math.max(0, Number(e.target.value)), maxMoney))}
          className="w-24 rounded-lg border border-white/20 bg-black/30 px-2 py-1"
        />
      </label>
    </div>
  );
}
