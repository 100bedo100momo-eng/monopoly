"use client";

import React, { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/lib/i18n";
import { tileById } from "@/game/board";
import { canBuild, canMortgage, canSellBuilding, unmortgageCost } from "@/game/rules";
import { formatMoney } from "@/lib/utils";
import type { GameSnapshot } from "@/game/types";

/** إدارة الممتلكات: بناء/بيع مبانٍ/رهن/فك رهن */
export function ManageDialog({
  open, snapshot, onClose, onAction,
}: {
  open: boolean;
  snapshot: GameSnapshot;
  onClose: () => void;
  onAction: (name: string, args?: Record<string, unknown>) => Promise<string | null>;
}) {
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState(false);
  const meSeat = snapshot.me?.seat ?? null;
  const myProps = useMemo(
    () => snapshot.properties.filter((p) => p.owner_seat != null && p.owner_seat === meSeat),
    [snapshot.properties, meSeat],
  );

  if (meSeat == null) return null;

  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={`🏗️ ${t("game.manage")}`} maxWidth="max-w-xl">
      <div className="flex flex-col gap-2">
        {myProps.length === 0 && <p className="text-sm text-white/70">{t("game.unowned")}</p>}
        {myProps.map((prop) => {
          const tile = tileById(prop.tile_id);
          if (!tile) return null;
          const settings = snapshot.game.settings;
          const canB = tile.kind === "property" && canBuild(tile.id, snapshot.properties, meSeat, settings);
          const canS = tile.kind === "property" && canSellBuilding(tile.id, snapshot.properties, meSeat, settings);
          const canM = tile.kind === "property" && canMortgage(tile.id, snapshot.properties, meSeat);
          const canU = !!prop.is_mortgaged;
          return (
            <div key={prop.tile_id} className="rounded-xl border border-white/10 p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-extrabold">
                    {tile.name_ar} <span className="text-xs text-white/50">{tile.name_en}</span>
                  </div>
                  <div className="text-xs text-white/70">
                    {t("game.buildings")}: {prop.buildings}/5{" "}
                    {prop.is_mortgaged && <span className="text-rose-300">· 🔒 {t("game.mortgaged_badge")}</span>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tile.kind === "property" && (
                    <Button size="sm" disabled={busy || !canB} onClick={() => void run(() => onAction("build", { tile: tile.id }))}>
                      🏗️ {formatMoney(tile.build_cost ?? 0, locale)}
                    </Button>
                  )}
                  {tile.kind === "property" && prop.buildings > 0 && (
                    <Button size="sm" variant="secondary" disabled={busy || !canS} onClick={() => void run(() => onAction("sellBuilding", { tile: tile.id }))}>
                      📉 {formatMoney(Math.floor((tile.build_cost ?? 0) / 2), locale)}
                    </Button>
                  )}
                  {!prop.is_mortgaged && tile.kind === "property" && (
                    <Button size="sm" variant="secondary" disabled={busy || !canM} onClick={() => void run(() => onAction("mortgage", { tile: tile.id }))}>
                      🔒 {formatMoney(tile.mortgage_value ?? 0, locale)}
                    </Button>
                  )}
                  {canU && (
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(() => onAction("unmortgage", { tile: tile.id }))}>
                      🔓 {formatMoney(unmortgageCost(tile, settings), locale)}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
