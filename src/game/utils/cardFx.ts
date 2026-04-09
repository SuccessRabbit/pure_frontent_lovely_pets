import * as PIXI from 'pixi.js';
import { Tween, Easing } from './Tween';

export interface BurstOptions {
  count?: number;
  colors?: number[];
  spread?: number;
  durationMin?: number;
  durationMax?: number;
}

/**
 * 在屏幕坐标 (globalX, globalY) 处爆发粒子，父级为 fxLayer（通常为最顶层容器）
 */
export function burstParticlesAtGlobal(
  fxLayer: PIXI.Container,
  globalX: number,
  globalY: number,
  opts?: BurstOptions
): void {
  const lp = fxLayer.toLocal({ x: globalX, y: globalY });
  const count = opts?.count ?? 24;
  const colors = opts?.colors ?? [0xff9ff3, 0xfeca57, 0xff6b9d, 0x48dbfb];
  const spread = opts?.spread ?? 100;
  const dMin = opts?.durationMin ?? 480;
  const dMax = opts?.durationMax ?? 720;

  for (let i = 0; i < count; i++) {
    const g = new PIXI.Graphics();
    const r = 2.5 + Math.random() * 5;
    g.beginFill(colors[i % colors.length]!, 0.9);
    g.drawCircle(0, 0, r);
    g.endFill();
    g.x = lp.x;
    g.y = lp.y;
    fxLayer.addChild(g);

    const ang = Math.random() * Math.PI * 2;
    const dist = 35 + Math.random() * spread;
    const tx = lp.x + Math.cos(ang) * dist;
    const ty = lp.y + Math.sin(ang) * dist - 25 * Math.random();
    const dur = dMin + Math.random() * (dMax - dMin);

    Tween.to(g, { x: tx, y: ty, alpha: 0 }, dur, Easing.easeOutQuad, () => {
      g.destroy();
    });
  }
}

/** 宠物上场：偏绿金暖色 */
export const PET_BURST_COLORS = [0x58d68d, 0xabebc6, 0xf9e79f, 0xfef9e7, 0xffc2d4];

/** 行动牌触发：偏魔法亮色 */
export const ACTION_BURST_COLORS = [0xbb86fc, 0x03dac6, 0xff6b9d, 0xfff176, 0x74b9ff];

/** 卡牌溶解时的碎屑 */
export const SHARD_BURST_COLORS = [0xffffff, 0xf5f5f5, 0xe8daef, 0xd7bde2];
