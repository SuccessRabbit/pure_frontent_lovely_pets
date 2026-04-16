import { afterEach, describe, expect, it, vi } from 'vitest';
import { TurnResolutionController } from '../TurnResolutionController';
import { useGameStore } from '../../../../store/gameStore';
import { createEmptyGameState, runtimeCard } from '../../../../test/gameTestUtils';
import type { ResolutionStep } from '../../../rules/ResolutionEngine';

describe('TurnResolutionController', () => {
  afterEach(() => {
    vi.useRealTimers();
    useGameStore.setState(createEmptyGameState());
  });

  it('prepares future manual draw events before applying the first step state', async () => {
    const card = runtimeCard('action_001');
    const drawEvent = {
      id: 77,
      countRequested: 1,
      drawnCards: [card],
      reshuffled: false,
      deckBefore: 5,
      deckAfter: 4,
      discardBefore: 0,
      discardAfter: 0,
      handBefore: 0,
      handAfter: 1,
      source: 'skill' as const,
      sourceLabel: '永动机猫',
    };
    const firstState = createEmptyGameState({ hand: [card] });
    const steps: ResolutionStep[] = [
      {
        state: firstState,
        presentation: [
          {
            type: 'show_entity_cue',
            row: 0,
            col: 0,
            title: '永动机猫',
            subtitle: '回合开始抽牌',
            color: 0x7bdff2,
          },
        ],
      },
      {
        state: firstState,
        presentation: [{ type: 'play_draw_event', event: drawEvent }],
      },
    ];
    const order: string[] = [];
    const originalSetState = useGameStore.setState.bind(useGameStore);
    const setStateSpy = vi.spyOn(useGameStore, 'setState').mockImplementation((partial, replace) => {
      order.push('set-state');
      return originalSetState(partial as never, replace);
    });
    const controller = new TurnResolutionController({
      getRoundResolving: () => false,
      setRoundResolving: () => {},
      clearPendingActionPick: () => {},
      setEndTurnInteractable: () => {},
      showPhaseBanner: async () => {},
      showEntityCue: async () => {},
      spawnIncomeFloat: () => {},
      showToast: () => {},
      playSkillEffect: async () => {},
      spawnStatusBurst: () => {},
      syncGridFromStore: () => {},
      sync3DStressOverlays: () => {},
      pulseStressCell: () => {},
      playManualDrawEvent: async () => {},
      prepareManualDrawEvents: events => {
        order.push(`prepare:${events.map(event => event.id).join(',')}`);
      },
    });

    await controller.playSteps(steps);

    expect(order[0]).toBe('prepare:77');
    expect(order).toContain('set-state');
    expect(setStateSpy).toHaveBeenCalledTimes(2);
  });

  it('waits 0.5s after a skill draw animation before playing the next event', async () => {
    vi.useFakeTimers();

    const card = runtimeCard('action_001');
    const drawEvent = {
      id: 88,
      countRequested: 1,
      drawnCards: [card],
      reshuffled: false,
      deckBefore: 5,
      deckAfter: 4,
      discardBefore: 0,
      discardAfter: 0,
      handBefore: 0,
      handAfter: 1,
      source: 'skill' as const,
      sourceLabel: '永动机猫',
    };
    const state = createEmptyGameState({ hand: [card] });
    const order: string[] = [];
    const controller = new TurnResolutionController({
      getRoundResolving: () => false,
      setRoundResolving: () => {},
      clearPendingActionPick: () => {},
      setEndTurnInteractable: () => {},
      showPhaseBanner: async () => {},
      showEntityCue: async () => {},
      spawnIncomeFloat: () => {},
      showToast: message => {
        order.push(`toast:${message.text}`);
      },
      playSkillEffect: async () => {},
      spawnStatusBurst: () => {},
      syncGridFromStore: () => {},
      sync3DStressOverlays: () => {},
      pulseStressCell: () => {},
      playManualDrawEvent: async () => {
        order.push('draw');
      },
      prepareManualDrawEvents: () => {},
    });

    const promise = controller.playSteps([
      {
        state,
        presentation: [
          { type: 'play_draw_event', event: drawEvent },
          { type: 'spawn_hud_float', text: 'next', tone: 'info' },
        ],
      },
    ]);

    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual(['draw']);

    await vi.advanceTimersByTimeAsync(499);
    expect(order).toEqual(['draw']);

    await vi.advanceTimersByTimeAsync(1);
    expect(order).toContain('toast:next');

    await vi.advanceTimersByTimeAsync(360);
    await promise;
  });
});
