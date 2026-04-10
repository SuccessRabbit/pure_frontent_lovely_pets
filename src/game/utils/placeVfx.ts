import * as PIXI from 'pixi.js';
import type { Card } from '../../types/card';
import { CardSprite } from '../entities/CardSprite';
import { Tween, Easing } from './Tween';
import {
  burstParticlesAtGlobal,
  PET_BURST_COLORS,
  ACTION_BURST_COLORS,
  SHARD_BURST_COLORS,
} from './cardFx';

function tweenTo(
  target: object,
  endValues: Record<string, number>,
  durationMs: number,
  easing: (t: number) => number,
  onComplete?: () => void
): Promise<void> {
  return new Promise(resolve => {
    Tween.to(target as object, endValues, durationMs, easing, () => {
      onComplete?.();
      resolve();
    });
  });
}

/**
 * 临时飞入格子的卡牌表现（挂在 fxLayer，与手牌精灵解耦）
 */
export function runEntityPlaceVfx(
  fxLayer: PIXI.Container,
  cardData: Card,
  fromGlobal: PIXI.PointData,
  cellGlobalX: number,
  cellGlobalY: number,
  onLand?: () => void
): Promise<void> {
  const card = new CardSprite(cardData);
  card.isDragging = false;
  card.isResolving = true;
  card.eventMode = 'none';
  card.cursor = 'default';
  card.zIndex = 2600;
  fxLayer.sortableChildren = true;
  fxLayer.addChild(card);

  const lpFrom = fxLayer.toLocal(fromGlobal);
  const lpTo = fxLayer.toLocal({ x: cellGlobalX, y: cellGlobalY });
  card.position.set(lpFrom.x, lpFrom.y);
  card.rotation = 0;
  card.alpha = 1;
  card.scale.set(0.88, 0.88);

  Tween.killTarget(card);
  Tween.killTarget(card.scale);

  return Promise.all([
    tweenTo(card, { x: lpTo.x, y: lpTo.y, rotation: 0 }, 440, Easing.easeOutCubic),
    tweenTo(card.scale, { x: 0.88, y: 0.88 }, 440, Easing.easeOutCubic),
  ])
    .then(() => {
      burstParticlesAtGlobal(fxLayer, cellGlobalX, cellGlobalY, {
        count: 42,
        colors: PET_BURST_COLORS,
        spread: 130,
        durationMin: 520,
        durationMax: 820,
      });
      const gp = new PIXI.Point();
      card.getGlobalPosition(gp);
      burstParticlesAtGlobal(fxLayer, gp.x, gp.y, {
        count: 16,
        colors: SHARD_BURST_COLORS,
        spread: 55,
        durationMin: 380,
        durationMax: 560,
      });
      onLand?.();
      return Promise.all([
        tweenTo(card.scale, { x: 0.78, y: 0.78 }, 400, Easing.easeInCubic),
        tweenTo(card, { alpha: 0 }, 400, Easing.easeInCubic),
      ]);
    })
    .then(() => undefined)
    .finally(() => {
      Tween.killTarget(card);
      Tween.killTarget(card.scale);
      card.destroy({ children: true });
    });
}

/**
 * 行动牌在释放区触发的表现
 */
export function runActionTriggerVfx(
  fxLayer: PIXI.Container,
  cardData: Card,
  fromGlobal: PIXI.PointData,
  zoneGlobalX: number,
  zoneGlobalY: number
): Promise<void> {
  const card = new CardSprite(cardData);
  card.isDragging = false;
  card.isResolving = true;
  card.eventMode = 'none';
  card.cursor = 'default';
  card.zIndex = 2600;
  fxLayer.sortableChildren = true;
  fxLayer.addChild(card);

  const lpFrom = fxLayer.toLocal(fromGlobal);
  const lpTo = fxLayer.toLocal({ x: zoneGlobalX, y: zoneGlobalY });
  card.position.set(lpFrom.x, lpFrom.y);
  card.rotation = 0;
  card.alpha = 1;
  card.scale.set(1.07, 1.07);

  Tween.killTarget(card);
  Tween.killTarget(card.scale);

  return tweenTo(
    card,
    { x: lpTo.x, y: lpTo.y, rotation: 0 },
    260,
    Easing.easeOutCubic,
    () => {
      burstParticlesAtGlobal(fxLayer, zoneGlobalX, zoneGlobalY, {
        count: 48,
        colors: ACTION_BURST_COLORS,
        spread: 140,
        durationMin: 450,
        durationMax: 780,
      });
      const gp = new PIXI.Point();
      card.getGlobalPosition(gp);
      burstParticlesAtGlobal(fxLayer, gp.x, gp.y, {
        count: 20,
        colors: SHARD_BURST_COLORS,
        spread: 48,
        durationMin: 320,
        durationMax: 500,
      });
    }
  )
    .then(() =>
      Promise.all([
        tweenTo(card.scale, { x: card.scale.x * 1.08, y: card.scale.y * 1.08 }, 360, Easing.easeOutQuad),
        tweenTo(card, { alpha: 0 }, 360, Easing.easeInCubic),
      ])
    )
    .then(() => undefined)
    .finally(() => {
      Tween.killTarget(card);
      Tween.killTarget(card.scale);
      card.destroy({ children: true });
    });
}
