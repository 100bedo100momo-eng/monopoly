"use client";

// تحميل Phaser داخل Client Component فقط (تجنب SSR) عبر dynamic import
import React, { useEffect, useRef } from "react";
import type { GameSnapshot } from "@/game/types";
import type { BoardScene } from "@/game/phaser/scene";

interface PhaserGameLike {
  destroy: (removeCanvas: boolean, noReturn?: boolean) => void;
}

interface Props {
  snapshot: GameSnapshot | null;
  onSelectTile: (tileId: string) => void;
}

export default function BoardCanvas({ snapshot, onSelectTile }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<PhaserGameLike | null>(null);
  const sceneRef = useRef<BoardScene | null>(null);
  const onSelectRef = useRef(onSelectTile);
  useEffect(() => {
    onSelectRef.current = onSelectTile;
  });

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    (async () => {
      const Phaser = (await import("phaser")).default;
      if (cancelled || !containerRef.current) return;

      const { BOARD_SIZE, BoardScene } = await import("@/game/phaser/scene");

      const scene = new BoardScene({
        onSelectTile: (id) => onSelectRef.current(id),
      });
      sceneRef.current = scene;

      gameRef.current = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current,
        width: BOARD_SIZE,
        height: BOARD_SIZE,
        backgroundColor: "#0e2242",
        scene: [scene],
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        render: { antialias: true, roundPixels: true },
      });

      unsubscribe = () => {
        gameRef.current?.destroy(true);
        gameRef.current = null;
        sceneRef.current = null;
      };
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (snapshot && sceneRef.current) {
      sceneRef.current.applySnapshot(snapshot);
    }
  }, [snapshot]);

  return (
    <div
      ref={containerRef}
      className="mx-auto aspect-square w-full max-w-[min(92vw,660px)] touch-manipulation select-none"
      aria-label="board"
      role="img"
    />
  );
}
