"use client";

import React, { useState } from "react";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/lib/i18n";
import { GROUP_COLORS, GROUP_LABELS, tileById } from "@/game/board";
import { canBuild, canMortgage, canSellBuilding, unmortgageCost } from "@/game/rules";
import { formatMoney } from "@/lib/utils";
import type { GameSnapshot } from "@/game/types";

/** نافذة تفاصيل العقار مع الإجراءات السياقية للمالك */
export function PropertyModal({
  tileId, snapshot, onClose, onAction,
}: {
  tileId: string | null;
  snapshot: GameSnapshot;
  onClose: () => void;
  onAction: (name: string, args?: Record<string, unknown>) => Promise<string | null>;
}) {
  const { t, locale } = useI18n();
  const [confirmMortgage, setConfirmMortgage] = useState(false);
  const tile = tileId ? tileById(tileId) : null;
  if (!tile) return null;
  const prop = snapshot.properties.find((p) => p.tile_id === tile.id);
  const meSeat = snapshot.me?.seat ?? null;
  const owner = prop?.owner_seat != null ? snapshot.players.find((p) => p.seat === prop.owner_seat) : null;
  const isMine = prop?.owner_seat != null && prop.owner_seat === meSeat;
  const game = snapshot.game;
  const myTurn = game.status === "active" && game.current_seat === meSeat;

  const owned = snapshot.properties;

  return (
    <>
      <Modal open onClose={onClose} title={`${tile.name_ar} / ${tile.name_en}`}>
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex items-center gap-2">
            {tile.color_group && (
              <span
                className="rounded-lg px-2 py-1 text-xs font-bold"
                style={{ backgroundColor: GROUP_COLORS[tile.color_group], color: "#0b1f3a" }}
              >
                {GROUP_LABELS[tile.color_group]?.[locale] ?? tile.color_group}
              </span>
            )}
            <span className="rounded-lg bg-white/10 px-2 py-1 text-xs">{t("game.position")} {tile.position}</span>
            {prop?.is_mortgaged && (
              <span className="rounded-lg bg-rose-900/60 px-2 py-1 text-xs font-bold text-rose-200">🔒 {t("game.mortgaged_badge")}</span>
            )}
          </div>

          <div className="rounded-xl border border-white/10 p-3">
            <div className="mb-2 font-extrabold text-gold">{t("game.owner")}</div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                {owner ? (
                  <>
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: owner.color }} />
                    {owner.name}
                  </>
                ) : (
                  <span className="text-white/70">{t("game.unowned")}</span>
                )}
              </span>
              {tile.price && <span className="text-gold">{formatMoney(tile.price, locale)}</span>}
            </div>
          </div>

          {tile.kind === "property" && tile.rents && (
            <div className="rounded-xl border border-white/10 p-3">
              <div className="mb-2 font-extrabold text-gold">{t("game.rent_table")}</div>
              <table className="w-full text-xs">
                <tbody>
                  <tr className="border-b border-white/5">
                    <td className="py-1">{t("game.base_rent")}</td>
                    <td className="py-1 text-start">{formatMoney(tile.rents[0], locale)}</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-1">{t("game.full_set")}</td>
                    <td className="py-1 text-start">{formatMoney(tile.rents[0] * 2, locale)}</td>
                  </tr>
                  {[1, 2, 3, 4].map((lvl) => (
                    <tr key={lvl} className="border-b border-white/5">
                      <td className="py-1">{t("game.buildings")} {lvl}</td>
                      <td className="py-1 text-start">{formatMoney(tile.rents![lvl], locale)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-1">{t("game.landmark")} 🏰</td>
                    <td className="py-1 text-start">{formatMoney(tile.rents[5], locale)}</td>
                  </tr>
                </tbody>
              </table>
              <div className="mt-2 text-xs text-white/60">
                {t("game.buildings")}: {prop?.buildings ?? 0} · {t("game.build")}: {formatMoney(tile.build_cost ?? 0, locale)} ·
                رهن: {formatMoney(tile.mortgage_value ?? 0, locale)}
              </div>
            </div>
          )}

          {tile.kind === "hub" && tile.rents && (
            <div className="rounded-xl border border-white/10 p-3 text-xs">
              <div className="mb-1 font-extrabold text-gold">{t("game.hub_rents")}</div>
              <div>{tile.rents.map((r) => formatMoney(r, locale)).join(" · ")} — ×2 مع المجموعة الكاملة</div>
            </div>
          )}
          {tile.kind === "utility" && <div className="rounded-xl border border-white/10 p-3 text-xs">{t("game.utility_rule")}</div>}
          {tile.kind === "tax" && <div className="rounded-xl border border-white/10 p-3 text-xs">🧾 {formatMoney(tile.tax_amount ?? 0, locale)}</div>}

          {isMine && myTurn && game.turn_phase !== "auction_active" && (
            <div className="flex flex-wrap gap-2">
              {tile.kind === "property" && (
                <Button size="sm" disabled={!canBuild(tile.id, owned, meSeat!, game.settings)}
                  onClick={() => void onAction("build", { tile: tile.id })}>
                  🏗️ {t("game.build")} ({formatMoney(tile.build_cost ?? 0, locale)})
                </Button>
              )}
              {tile.kind === "property" && (prop?.buildings ?? 0) > 0 && (
                <Button size="sm" variant="secondary" disabled={!canSellBuilding(tile.id, owned, meSeat!, game.settings)}
                  onClick={() => void onAction("sellBuilding", { tile: tile.id })}>
                  📉 {t("game.sell_building")} ({formatMoney(Math.floor((tile.build_cost ?? 0) / 2), locale)})
                </Button>
              )}
              {!prop?.is_mortgaged && tile.kind === "property" && (
                <Button size="sm" variant="secondary" disabled={!canMortgage(tile.id, owned, meSeat!)}
                  onClick={() => setConfirmMortgage(true)}>
                  🔒 {t("game.mortgage")} ({formatMoney(tile.mortgage_value ?? 0, locale)})
                </Button>
              )}
              {prop?.is_mortgaged && (
                <Button size="sm" variant="secondary"
                  onClick={() => void onAction("unmortgage", { tile: tile.id })}>
                  🔓 {t("game.unmortgage")} ({formatMoney(unmortgageCost(tile, game.settings), locale)})
                </Button>
              )}
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmMortgage}
        title={t("game.mortgage")}
        message={`${tile.name_ar}: ${t("game.mortgaged_badge")} — ${formatMoney(tile.mortgage_value ?? 0, locale)}`}
        confirmLabel={t("game.mortgage")}
        danger={false}
        onCancel={() => setConfirmMortgage(false)}
        onConfirm={() => {
          setConfirmMortgage(false);
          void onAction("mortgage", { tile: tile.id });
        }}
      />
    </>
  );
}
