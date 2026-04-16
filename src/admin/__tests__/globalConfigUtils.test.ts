import { describe, expect, it } from 'vitest';
import {
  STARTING_DECK_CONFIG_KEY,
  ensureStartingDeckConfigEntry,
  parseDeckConfigValue,
  serializeDeckConfigValue,
} from '../globalConfigUtils';

describe('globalConfigUtils', () => {
  it('parses and sanitizes deck config json', () => {
    const items = parseDeckConfigValue(
      JSON.stringify([
        { cardId: 'action_001', count: 2 },
        { cardId: 'action_002', count: 0 },
        { cardId: '', count: 3 },
      ])
    );

    expect(items).toEqual([{ cardId: 'action_001', count: 2 }]);
  });

  it('serializes valid deck config items', () => {
    const value = serializeDeckConfigValue([
      { cardId: 'action_001', count: 2 },
      { cardId: 'pet_001', count: 1 },
    ]);

    expect(JSON.parse(value)).toEqual([
      { cardId: 'action_001', count: 2 },
      { cardId: 'pet_001', count: 1 },
    ]);
  });

  it('ensures the starting deck config entry exists', () => {
    const next = ensureStartingDeckConfigEntry([
      {
        module: 'setup',
        key: 'TURN_DRAW_COUNT',
        value: '3',
        valueType: 'number',
        description: '每日抽牌数',
      },
    ]);

    expect(next.some(entry => entry.key === STARTING_DECK_CONFIG_KEY)).toBe(true);
  });
});
