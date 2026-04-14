import type { Card } from '../types/card';
import { normalizeCard } from './cardNormalize';
import petsConfig from '../../config/pets.json';
import workersConfig from '../../config/workers.json';

const catalog = new Map<string, Card>();

function ensureBuilt() {
  if (catalog.size > 0) return;
  for (const raw of petsConfig as unknown as Card[]) {
    catalog.set(raw.id, normalizeCard(raw as Card));
  }
  for (const raw of workersConfig as unknown as Card[]) {
    catalog.set(raw.id, normalizeCard(raw as Card));
  }
}

/** 宠物/员工卡模板（副本），用于拆家回弃牌堆等 */
export function getEntityCardTemplate(cardId: string): Card | null {
  ensureBuilt();
  const t = catalog.get(cardId);
  return t ? { ...t } : null;
}
