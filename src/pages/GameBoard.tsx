import { useEffect, useRef } from 'react';
import { bootstrapPixiGame } from '../game/bootstrap';
import type { GameEngine } from '../game/core/GameEngine';
import { useGameStore } from '../store/gameStore';

/**
 * 单节点：canvas。不得再包 div，避免多余布局 DOM。
 * 等牌库加载完成后再启动 Pixi，避免 GameScene 进場时手牌仍为空。
 */
export function GameBoard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const deckReady = useGameStore(s => s.deck.length > 0);

  useEffect(() => {
    if (!deckReady) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    let engine: GameEngine | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const instance = await bootstrapPixiGame(canvas);
        if (cancelled) {
          instance.destroy();
          return;
        }
        engine = instance;
      } catch (e) {
        console.error('Pixi 初始化失败', e);
      }
    })();

    return () => {
      cancelled = true;
      engine?.destroy();
    };
  }, [deckReady]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        position: 'absolute',
        inset: 0,
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: 0,
        verticalAlign: 'top',
      }}
    />
  );
}
