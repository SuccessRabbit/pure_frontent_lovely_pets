import type { Card } from '../types/card';
import { normalizeCard } from './cardNormalize';
import petsConfig from '../../config/pets.json';
import workersConfig from '../../config/workers.json';
import actionsConfig from '../../config/actions.json';

/** 与 useCardLoader 一致：全部卡 normalize 后各 2 份再洗牌 */
export function buildShuffledStartingDeck(): Card[] {
  const allCards: Card[] = [
    ...(petsConfig as Card[]),
    ...(workersConfig as Card[]),
    ...(actionsConfig as Card[]),
  ].map(card => normalizeCard(card as Card));

  const initialDeck: Card[] = [];
  allCards.forEach(card => {
    for (let i = 0; i < 2; i++) {
      initialDeck.push({ ...card });
    }
  });

  return initialDeck.sort(() => Math.random() - 0.5);
}
