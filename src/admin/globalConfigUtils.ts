import type { CardRow, GlobalConfigRow } from './types';

export interface DeckConfigItem {
  cardId: string;
  count: number;
}

export const STARTING_DECK_CONFIG_KEY = 'STARTING_DECK_CONFIG';

export function sanitizeDeckConfigItems(value: unknown): DeckConfigItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => {
      if (!item || typeof item !== 'object') return null;
      const cardId = String((item as { cardId?: unknown }).cardId ?? '').trim();
      const rawCount = Number((item as { count?: unknown }).count ?? 0);
      const count = Number.isFinite(rawCount) ? Math.max(0, Math.floor(rawCount)) : 0;
      if (!cardId || count <= 0) return null;
      return { cardId, count };
    })
    .filter((item): item is DeckConfigItem => Boolean(item));
}

export function parseDeckConfigValue(rawValue: string): DeckConfigItem[] {
  if (!rawValue.trim()) return [];
  try {
    return sanitizeDeckConfigItems(JSON.parse(rawValue));
  } catch {
    return [];
  }
}

export function serializeDeckConfigValue(items: DeckConfigItem[]) {
  return JSON.stringify(
    items
      .filter(item => item.cardId.trim() && item.count > 0)
      .map(item => ({ cardId: item.cardId.trim(), count: Math.max(1, Math.floor(item.count)) })),
    null,
    2
  );
}

export function ensureStartingDeckConfigEntry(globalConfig: GlobalConfigRow[]) {
  if (globalConfig.some(entry => entry.key === STARTING_DECK_CONFIG_KEY)) {
    return globalConfig;
  }

  return [
    ...globalConfig,
    {
      module: 'setup',
      key: STARTING_DECK_CONFIG_KEY,
      value: '[]',
      valueType: 'json',
      description: '自定义起始牌堆卡牌与数量；留空时回退到默认全卡各 2 张。',
    },
  ];
}

export function buildDeckSummary(items: DeckConfigItem[], cards: CardRow[]) {
  const cardsById = new Map(cards.map(card => [card.id, card]));
  const summary = {
    totalCards: 0,
    uniqueCards: items.length,
    missingCards: 0,
    byType: {} as Record<string, number>,
  };

  for (const item of items) {
    summary.totalCards += item.count;
    const card = cardsById.get(item.cardId);
    if (!card) {
      summary.missingCards += 1;
      continue;
    }
    summary.byType[card.type] = (summary.byType[card.type] ?? 0) + item.count;
  }

  return summary;
}
