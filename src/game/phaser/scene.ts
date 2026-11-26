"use client";

// مشهد لوحة اللعبة — Phaser 4 — كل الرسومات أصلية ومولّدة برمجيًا (Graphics/Text/Emoji)
import Phaser from "phaser";
import { BOARD_TILES, GROUP_COLORS, tileById, type BoardTile } from "@/game/board";
import { canBuild } from "@/game/rules";
import type { GameSnapshot, SnapshotPlayer } from "@/game/types";
import { play } from "@/lib/sound";

export const BOARD_SIZE = 660;
export const TILE = 60;

interface TokenView {
  emoji: Phaser.GameObjects.Text;
  ring: Phaser.GameObjects.Arc;
  seat: number;
  tilePos: number;
}

export interface SceneCallbacks {
  onSelectTile: (tileId: string) => void;
}

export class BoardScene extends Phaser.Scene {
  private tokens: Map<number, TokenView> = new Map();
  private tileLayers: Map<string, { ownerDot: Phaser.GameObjects.Arc; pips: Phaser.GameObjects.Graphics; mort: Phaser.GameObjects.Text; highlight?: Phaser.GameObjects.Rectangle }> = new Map();
  private diceTexts: Phaser.GameObjects.Text[] = [];
  private diceFrame!: Phaser.GameObjects.Graphics;
  private highlightRing?: Phaser.GameObjects.Arc;
  private lastDiceKey = "";
  private lastPositions = new Map<number, number>();
  private animating = false;
  private pendingSnapshot: GameSnapshot | null = null;
  private callbacks: SceneCallbacks;
  private reducedMotion = false;

  constructor(callbacks: SceneCallbacks) {
    super("board");
    this.callbacks = callbacks;
  }

  preload() {
    // لا أصول خارجية — كل شيء رسوم برمجية
  }

  create() {
    this.reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.cameras.main.setBackgroundColor("#0e2242");
    this.drawBoard();
    this.drawCenter();
    this.drawDice();

    for (const t of BOARD_TILES) {
      const zone = this.add
        .zone(t.grid_col * TILE + TILE / 2, t.grid_row * TILE + TILE / 2, TILE, TILE)
        .setInteractive({ useHandCursor: true });
      zone.on("pointerdown", () => this.callbacks.onSelectTile(t.id));
    }

    if (this.pendingSnapshot) {
      const snap = this.pendingSnapshot;
      this.pendingSnapshot = null;
      this.applySnapshot(snap);
    }
  }

  // ---------- رسم اللوحة ----------
  private drawBoard() {
    const g = this.add.graphics();
    g.fillStyle(0x0b1f3a, 1);
    g.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);

    for (const t of BOARD_TILES) {
      const x = t.grid_col * TILE;
      const y = t.grid_row * TILE;
      g.lineStyle(2, 0x3a5b7f, 1);
      g.strokeRect(x, y, TILE, TILE);

      const fillColor = this.tileFillColor(t);
      g.fillStyle(fillColor, t.kind === "property" || t.kind === "hub" || t.kind === "utility" ? 0.22 : 0.12);
      g.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);

      // شريط لون المجموعة (تمييز بالشكل أيضًا: مستطيل علوي للعقارات/دائرة للمحطات/معين للشركات)
      if (t.color_group && t.kind === "property") {
        g.fillStyle(Phaser.Display.Color.HexStringToColor(GROUP_COLORS[t.color_group]).color, 1);
        g.fillRect(x + 3, y + 3, TILE - 6, 8);
      }

      const icon = this.tileIcon(t);
      const isCorner = t.position % 10 === 0;
      const label = this.tileLabel(t);
      const color = "#e8eefc";

      if (icon) {
        this.add
          .text(x + TILE / 2, y + (isCorner ? 16 : 18), icon, { fontSize: isCorner ? "20px" : "16px" })
          .setOrigin(0.5);
      }
      this.add
        .text(x + TILE / 2, y + (isCorner ? 36 : 34), label, {
          fontSize: "9px",
          color,
          align: "center",
          wordWrap: { width: TILE - 6 },
        })
        .setOrigin(0.5);
      if (t.price) {
        this.add
          .text(x + TILE / 2, y + TILE - 9, String(t.price), { fontSize: "9px", color: "#f5c542" })
          .setOrigin(0.5);
      }

      // طبقات الحالة: نقطة المالك + المباني + الرهن
      const ownerDot = this.add.circle(x + TILE - 8, y + TILE - 8, 5, 0xffffff).setStrokeStyle(1.5, 0x000000, 0.4).setVisible(false);
      const pips = this.add.graphics();
      const mort = this.add.text(x + 5, y + TILE - 20, "🔒", { fontSize: "10px" }).setVisible(false);
      this.tileLayers.set(t.id, { ownerDot, pips, mort });
    }
  }

  private tileFillColor(t: BoardTile): number {
    switch (t.kind) {
      case "start": return 0x2fa46b;
      case "detention": return 0xe5484d;
      case "goto_detention": return 0xe5484d;
      case "rest": return 0x2f6f9f;
      case "surprise": return 0x8b5cf6;
      case "chest": return 0x14b8a6;
      case "tax": return 0xd97706;
      default: return 0x1c3355;
    }
  }

  private tileIcon(t: BoardTile): string | null {
    switch (t.kind) {
      case "start": return "🏁";
      case "detention": return "🚔";
      case "goto_detention": return "🚨";
      case "rest": return "🌴";
      case "surprise": return "❓";
      case "chest": return "🎁";
      case "tax": return "🧾";
      case "hub": return t.position === 25 ? "✈️" : t.position === 15 ? "⚓" : "🚉";
      case "utility": return t.position === 12 ? "⚡" : "💧";
      default: return null;
    }
  }

  private tileLabel(t: BoardTile): string {
    return t.name_ar.length > 9 ? t.name_ar.slice(0, 9) : t.name_ar;
  }

  private drawCenter() {
    const cx = BOARD_SIZE / 2;
    const cy = BOARD_SIZE / 2;
    const g = this.add.graphics();
    g.lineStyle(3, 0xf5c542, 0.9);
    g.strokeRoundedRect(cx - 200, cy - 200, 400, 400, 24);
    g.lineStyle(1, 0xf5c542, 0.35);
    g.strokeRoundedRect(cx - 192, cy - 192, 384, 384, 20);

    this.add.text(cx, cy - 60, "👑", { fontSize: "64px" }).setOrigin(0.5);
    this.add
      .text(cx, cy + 12, "ملوك العقارات", { fontSize: "34px", color: "#f5c542", fontStyle: "bold" })
      .setOrigin(0.5);
    this.add
      .text(cx, cy + 50, "Property Kings", { fontSize: "16px", color: "#7fa7d9" })
      .setOrigin(0.5);
    this.add
      .text(cx, cy + 110, "🎲 إرم النرد — 🏗️ بناء — 🔨 مزاد — 🤝 تداول", { fontSize: "13px", color: "#9db4d8" })
      .setOrigin(0.5);
  }

  private drawDice() {
    const cx = BOARD_SIZE / 2;
    const cy = BOARD_SIZE / 2 - 150;
    this.diceFrame = this.add.graphics();
    this.diceFrame.fillStyle(0x081729, 0.85);
    this.diceFrame.fillRoundedRect(cx - 62, cy - 26, 124, 52, 14);
    this.diceFrame.lineStyle(2, 0xf5c542, 0.8);
    this.diceFrame.strokeRoundedRect(cx - 62, cy - 26, 124, 52, 14);
    this.diceTexts = [
      this.add.text(cx - 32, cy, "1", { fontSize: "26px", color: "#ffffff", fontStyle: "bold" }).setOrigin(0.5),
      this.add.text(cx + 32, cy, "1", { fontSize: "26px", color: "#ffffff", fontStyle: "bold" }).setOrigin(0.5),
    ];
    this.add
      .text(cx, cy + 40, "", { fontSize: "12px", color: "#f5c542" })
      .setOrigin(0.5)
      .setName("diceLabel");
  }

  // ---------- المزامنة مع الحالة ----------
  applySnapshot(snapshot: GameSnapshot) {
    if (!this.scene.isActive()) {
      this.pendingSnapshot = snapshot;
      return;
    }
    this.syncTokens(snapshot.players);
    this.syncOwnership(snapshot);
    this.syncHighlights(snapshot);
    this.syncDice(snapshot);
    if (snapshot.game.status === "finished" && snapshot.game.winner_seat != null) {
      this.confetti();
    }
  }

  private syncTokens(players: SnapshotPlayer[]) {
    for (const p of players) {
      if (p.is_bankrupt) {
        const tok = this.tokens.get(p.seat);
        if (tok) {
          tok.emoji.setAlpha(0.35);
          tok.ring.setVisible(false);
        }
        continue;
      }
      const tok = this.tokens.get(p.seat);
      if (!tok) {
        const ring = this.add.circle(0, 0, 14, 0xffffff, 0).setStrokeStyle(3, Phaser.Display.Color.HexStringToColor(p.color).color);
        const emoji = this.add.text(0, 0, p.token, { fontSize: "18px" }).setOrigin(0.5, 0.42);
        this.tokens.set(p.seat, { emoji, ring, seat: p.seat, tilePos: p.position });
        const pos = this.tokenPoint(p.position, p.seat);
        ring.setPosition(pos.x, pos.y);
        emoji.setPosition(pos.x, pos.y);
        this.lastPositions.set(p.seat, p.position);
        continue;
      }
      const prev = this.lastPositions.get(p.seat) ?? p.position;
      if (prev !== p.position && !this.animating) {
        void this.animateMove(tok, prev, p.position);
      } else if (!this.animating && prev !== p.position) {
        // أثناء التحريك: طبّق فورًا بعد انتهائه
        this.pendingSnapshot = this.pendingSnapshot; // الاحتفاظ بآخر حالة قادمة
        setTimeout(() => {
          const point = this.tokenPoint(p.position, p.seat);
          tok.ring.setPosition(point.x, point.y);
          tok.emoji.setPosition(point.x, point.y);
          this.lastPositions.set(p.seat, p.position);
        }, 400);
      }
    }
  }

  private tokenPoint(position: number, seat: number): { x: number; y: number } {
    const t = tileAt2(position);
    const offsets = [
      { dx: -9, dy: -9 },
      { dx: 9, dy: -9 },
      { dx: -9, dy: 9 },
      { dx: 9, dy: 9 },
      { dx: 0, dy: -9 },
      { dx: 0, dy: 9 },
    ];
    const o = offsets[seat % offsets.length];
    return {
      x: t.grid_col * TILE + TILE / 2 + o.dx,
      y: t.grid_row * TILE + TILE / 2 + o.dy,
    };
  }

  private async animateMove(tok: TokenView, from: number, to: number) {
    this.animating = true;
    const steps: number[] = [];
    let cur = from;
    while (cur !== to && steps.length < 40) {
      cur = (cur + 1) % 40;
      steps.push(cur);
    }
    const duration = this.reducedMotion ? 0 : 120;
    for (const step of steps) {
      const point = this.tokenPoint(step, tok.seat);
      await new Promise<void>((resolve) => {
        if (duration === 0) {
          tok.ring.setPosition(point.x, point.y);
          tok.emoji.setPosition(point.x, point.y);
          resolve();
        } else {
          this.tweens.add({
            targets: [tok.ring, tok.emoji],
            x: point.x,
            y: point.y,
            duration,
            ease: "Sine.easeInOut",
            onComplete: () => resolve(),
          });
        }
      });
      if (duration > 0) play("move");
    }
    this.lastPositions.set(tok.seat, to);
    this.animating = false;
  }

  private syncOwnership(snapshot: GameSnapshot) {
    const byTile = new Map(snapshot.properties.map((p) => [p.tile_id, p]));
    const colorOf = new Map(snapshot.players.map((p) => [p.seat, p.color]));
    for (const [tileId, layer] of this.tileLayers) {
      const state = byTile.get(tileId);
      if (!state || state.owner_seat == null) {
        layer.ownerDot.setVisible(false);
        layer.pips.clear();
        layer.mort.setVisible(false);
        continue;
      }
      const hex = Phaser.Display.Color.HexStringToColor(colorOf.get(state.owner_seat) ?? "#ffffff").color;
      layer.ownerDot.setFillStyle(hex).setVisible(true);
      const t = tileById(tileId);
      const pips = layer.pips;
      pips.clear();
      const x0 = t ? t.grid_col * TILE : 0;
      const y0 = t ? t.grid_row * TILE : 0;
      if (t?.kind === "property") {
        for (let i = 0; i < Math.min(state.buildings, 4); i++) {
          pips.fillStyle(0x2fa46b, 1);
          pips.fillRect(x0 + 6 + i * 10, y0 + TILE - 20, 8, 8);
        }
        if (state.buildings >= 5) {
          pips.fillStyle(0xf5c542, 1);
          pips.fillTriangle(x0 + 8, y0 + TILE - 12, x0 + 34, y0 + TILE - 12, x0 + 21, y0 + TILE - 28);
        }
      }
      layer.mort.setVisible(state.is_mortgaged);
    }
  }

  private syncHighlights(snapshot: GameSnapshot) {
    const game = snapshot.game;
    this.highlightRing?.destroy();
    this.highlightRing = undefined;
    for (const [, layer] of this.tileLayers) {
      layer.highlight?.destroy();
      layer.highlight = undefined;
    }
    if (game.status !== "active") return;

    const meSeat = snapshot.me?.seat;
    const current = snapshot.players.find((p) => p.seat === game.current_seat);
    if (current && !current.is_bankrupt) {
      const t = tileAt2(current.position);
      this.highlightRing = this.add
        .circle(t.grid_col * TILE + TILE / 2, t.grid_row * TILE + TILE / 2, TILE * 0.62)
        .setStrokeStyle(3, 0xf5c542, 0.9);
      if (!this.reducedMotion) {
        this.tweens.add({ targets: this.highlightRing, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });
      }
    }

    // تمييز العقارات القابلة للبناء في دوري
    if (meSeat != null && game.current_seat === meSeat && game.turn_phase === "awaiting_end_turn") {
      for (const prop of snapshot.properties) {
        if (
          prop.owner_seat === meSeat &&
          canBuild(prop.tile_id, snapshot.properties, meSeat, game.settings)
        ) {
          const layer = this.tileLayers.get(prop.tile_id);
          const t = tileById(prop.tile_id);
          if (layer && t && !layer.highlight) {
            const h = this.add
              .rectangle(t.grid_col * TILE + TILE / 2, t.grid_row * TILE + TILE / 2, TILE - 4, TILE - 4)
              .setStrokeStyle(2.5, 0x2fa46b, 1)
              .setFillStyle(0x2fa46b, 0.12);
            layer.highlight = h;
            if (!this.reducedMotion) {
              this.tweens.add({ targets: h, alpha: 0.35, duration: 500, yoyo: true, repeat: -1 });
            }
          }
        }
      }
    }
  }

  private syncDice(snapshot: GameSnapshot) {
    const game = snapshot.game;
    if (game.dice_1 == null || game.dice_2 == null) return;
    const diceKey = `${game.turn_number}:${game.dice_1}:${game.dice_2}`;
    const [t1, t2] = this.diceTexts;
    if (diceKey === this.lastDiceKey) {
      t1.setText(String(game.dice_1));
      t2.setText(String(game.dice_2));
      return;
    }
    this.lastDiceKey = diceKey;
    const isDoubles = game.dice_1 === game.dice_2;
    const label = this.children.getByName("diceLabel") as Phaser.GameObjects.Text | undefined;
    if (label) {
      label.setText(isDoubles ? "زوجي! ⚡" : "");
    }
    if (this.reducedMotion) {
      t1.setText(String(game.dice_1));
      t2.setText(String(game.dice_2));
      return;
    }
    play("dice");
    let ticks = 0;
    const total = 8;
    const rollOnce = () => {
      t1.setText(String(1 + Math.floor(Math.random() * 6)));
      t2.setText(String(1 + Math.floor(Math.random() * 6)));
      ticks += 1;
      if (ticks < total) {
        this.time.delayedCall(70 + ticks * 15, rollOnce);
      } else {
        t1.setText(String(game.dice_1));
        t2.setText(String(game.dice_2));
        if (isDoubles) {
          this.tweens.add({ targets: [t1, t2], scale: 1.4, duration: 140, yoyo: true });
        }
      }
    };
    rollOnce();
  }

  private confetti() {
    if (this.reducedMotion) return;
    play("win");
    const colors = [0xf5c542, 0x2fa46b, 0x3a5bc7, 0xe5484d, 0x8b5cf6];
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * BOARD_SIZE;
      const rect = this.add.rectangle(x, -10 - Math.random() * 100, 6 + Math.random() * 6, 10, colors[i % colors.length]);
      this.tweens.add({
        targets: rect,
        y: BOARD_SIZE + 40,
        angle: 180 + Math.random() * 540,
        duration: 1600 + Math.random() * 1800,
        delay: Math.random() * 700,
        ease: "Sine.easeIn",
        onComplete: () => rect.destroy(),
      });
    }
  }
}

function tileAt2(position: number): BoardTile {
  const p = ((position % 40) + 40) % 40;
  return BOARD_TILES.find((t) => t.position === p) as BoardTile;
}
