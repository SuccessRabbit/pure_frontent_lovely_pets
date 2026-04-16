import type { Card } from '../types/card';
import { normalizeCard } from './cardNormalize';
import { getRuntimeConfig } from './runtimeConfig';
import petsConfig from '../../config/pets.json';
import workersConfig from '../../config/workers.json';
import actionsConfig from '../../config/actions.json';

/** 与 useCardLoader 一致：全部卡 normalize 后各 2 份再洗牌 */
export function buildShuffledStartingDeck(): Card[] {
  const allCards: Card[] = [
    ...(petsConfig as unknown as Card[]),
    ...(workersConfig as unknown as Card[]),
    ...(actionsConfig as unknown as Card[]),
  ].map(card => normalizeCard(card as Card));

  const runtime = getRuntimeConfig();
  const configuredDeck = Array.isArray(runtime.globalConfigMap.STARTING_DECK_CONFIG)
    ? runtime.globalConfigMap.STARTING_DECK_CONFIG
    : null;

  if (configuredDeck && configuredDeck.length > 0) {
    const cardsById = new Map(allCards.map(card => [card.id, card]));
    const initialDeck: Card[] = [];

    for (const item of configuredDeck) {
      if (!item || typeof item !== 'object') continue;
      const cardId = String((item as { cardId?: unknown }).cardId ?? '').trim();
      const rawCount = Number((item as { count?: unknown }).count ?? 0);
      const count = Number.isFinite(rawCount) ? Math.max(0, Math.floor(rawCount)) : 0;
      const card = cardsById.get(cardId);
      if (!card || count <= 0) continue;
      for (let i = 0; i < count; i += 1) {
        initialDeck.push({ ...card });
      }
    }

    if (initialDeck.length > 0) {
      return initialDeck.sort(() => Math.random() - 0.5);
    }
  }

  const initialDeck: Card[] = [];
  allCards.forEach(card => {
    for (let i = 0; i < 2; i++) {
      initialDeck.push({ ...card });
    }
  });

  return initialDeck.sort(() => Math.random() - 0.5);
}
