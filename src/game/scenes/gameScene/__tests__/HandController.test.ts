import * as PIXI from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import type { DrawEvent } from '../../../../store/gameStore';
import { runtimeCard } from '../../../../test/gameTestUtils';
import { VfxQueue } from '../../../systems/VfxQueue';
import { HandController } from '../HandController';
import type { Card } from '../../../../types/card';

function createDrawEvent(overrides: Partial<DrawEvent> = {}): DrawEvent {
  const drawn = overrides.drawnCards ?? [runtimeCard('action_001')];
  return {
    id: overrides.id ?? 1,
    countRequested: overrides.countRequested ?? drawn.length,
    drawnCards: drawn,
    reshuffled: overrides.reshuffled ?? false,
    deckBefore: overrides.deckBefore ?? 5,
    deckAfter: overrides.deckAfter ?? 4,
    discardBefore: overrides.discardBefore ?? 0,
    discardAfter: overrides.discardAfter ?? 0,
    handBefore: overrides.handBefore ?? 0,
    handAfter: overrides.handAfter ?? drawn.length,
    source: overrides.source ?? 'turn_start',
    sourceLabel: overrides.sourceLabel ?? '每日抽牌',
    sourceCardId: overrides.sourceCardId,
    sourceEntityId: overrides.sourceEntityId,
    sourceRow: overrides.sourceRow,
    sourceCol: overrides.sourceCol,
  };
}

function createController(state: { hand: Card[]; lastDrawEvent: DrawEvent | null }) {
  return new HandController({
    handContainer: new PIXI.Container(),
    fxLayer: new PIXI.Container(),
    rootContainer: new PIXI.Container(),
    vfxQueue: new VfxQueue(),
    getPetRenderer: () => null,
    getStoreState: () => state,
    isDragging: () => false,
    onStartDrag: () => {},
    showToast: () => {},
    setDeckDisplayOverrideCount: () => {},
  });
}

describe('HandController', () => {
  it('does not auto-queue draw events that are already prepared for manual playback', () => {
    const event = createDrawEvent();
    const state = {
      hand: [...event.drawnCards],
      lastDrawEvent: event,
    };
    const controller = createController(state);
    const queueSpy = vi
      .spyOn(controller as never as { queueDrawEvent: (event: DrawEvent) => void }, 'queueDrawEvent')
      .mockImplementation(() => {});

    controller.prepareManualDrawEvents([event]);
    controller.updateFromStore(state);

    expect(queueSpy).not.toHaveBeenCalled();
  });

  it('still auto-queues store-driven draw events that were not prepared manually', () => {
    const event = createDrawEvent();
    const state = {
      hand: [...event.drawnCards],
      lastDrawEvent: event,
    };
    const controller = createController(state);
    const queueSpy = vi
      .spyOn(controller as never as { queueDrawEvent: (event: DrawEvent) => void }, 'queueDrawEvent')
      .mockImplementation(() => {});

    controller.updateFromStore(state);

    expect(queueSpy).toHaveBeenCalledWith(event);
  });

  it('does not hide an older same-template card while a new matching card is pending manual draw', () => {
    const oldCard = runtimeCard('action_001');
    const newCard = { ...oldCard };
    const event = createDrawEvent({ drawnCards: [newCard] });
    const state = {
      hand: [oldCard, newCard],
      lastDrawEvent: null,
    };
    const controller = createController(state);
    const internals = controller as never as {
      prepareManualDrawEvents: (events: DrawEvent[]) => void;
      isManualPendingCard: (card: Card) => boolean;
      buildVisibleHand: (hand: readonly Card[]) => Card[];
    };

    internals.prepareManualDrawEvents([event]);

    expect(internals.isManualPendingCard(oldCard)).toBe(false);
    expect(internals.isManualPendingCard(newCard)).toBe(true);
    expect(internals.buildVisibleHand(state.hand)).toEqual([oldCard]);
  });

  it('positions newly synced hand cards directly at their slot instead of the default origin', () => {
    const card = runtimeCard('action_001');
    const state = {
      hand: [card],
      lastDrawEvent: null,
    };
    const controller = createController(state);
    const internals = controller as never as {
      updateFromStore: (state: { hand: Card[]; lastDrawEvent: DrawEvent | null }) => void;
      getCards: () => Array<{ x: number; y: number }>;
    };

    internals.updateFromStore(state);

    const [sprite] = internals.getCards();
    expect(sprite).toBeDefined();
    expect(sprite.x).not.toBe(0);
    expect(sprite.y).not.toBe(0);
  });
});
