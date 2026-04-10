import type { Card } from '../types/card';

/** 将配置 JSON 顶层 income/stressLimit 等并入 attributes，供放置实体与回手逻辑使用 */
export function normalizeCard(card: Card): Card {
  return {
    ...card,
    attributes: {
      income: card.income ?? card.attributes?.income ?? 0,
      maxStress: card.stressLimit ?? card.attributes?.maxStress ?? 100,
      health: card.attributes?.health ?? 100,
      attack: card.attributes?.attack ?? 0,
    },
  };
}
