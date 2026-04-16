import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runGameCommand } from '../ResolutionEngine';
import { createEmptyGameState, entityFromCard, runtimeCard, withEntities } from '../../../test/gameTestUtils';

describe('ResolutionEngine', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
  });

  it('initializes a game and draws the setup hand', () => {
    const deck = [
      runtimeCard('pet_001'),
      runtimeCard('worker_001'),
      runtimeCard('action_001'),
      runtimeCard('action_007'),
      runtimeCard('action_003'),
    ];
    const state = createEmptyGameState({ deck });

    const result = runGameCommand(state, { type: 'init_game', initialDeck: deck });

    expect(result.success).toBe(true);
    expect(result.nextState.turn).toBe(1);
    expect(result.nextState.phase).toBe('preparation');
    expect(result.nextState.hand).toHaveLength(5);
    expect(result.nextState.deck).toHaveLength(0);
    expect(result.meta.drawEvent?.source).toBe('setup');
    expect(result.events.some(event => event.type === 'cards_drawn')).toBe(true);
  });

  it('places entities on valid cells and spends cans', () => {
    const card = runtimeCard('pet_001');
    const state = createEmptyGameState({ cans: 10 });

    const result = runGameCommand(state, { type: 'place_entity', card, row: 1, col: 2 });

    expect(result.success).toBe(true);
    expect(result.nextState.cans).toBe(8);
    expect(result.nextState.grid[1][2]?.cardId).toBe('pet_001');
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'entity_placed',
        row: 1,
        col: 2,
        cardId: 'pet_001',
      })
    );
  });

  it('rejects movement into occupied cells', () => {
    const source = entityFromCard('worker_001', 0, 0);
    const blocker = entityFromCard('pet_001', 0, 1);
    const state = withEntities(createEmptyGameState(), [source, blocker]);

    const result = runGameCommand(state, { type: 'move_entity', fromRow: 0, fromCol: 0, toRow: 0, toCol: 1 });

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe('target_occupied');
  });

  it('resolves meltdown loss when stress reaches the cap', () => {
    const stressed = entityFromCard('pet_001', 1, 1, { stress: 2, maxStress: 3 });
    const neighbor = entityFromCard('worker_001', 1, 2);
    const state = withEntities(createEmptyGameState(), [stressed, neighbor]);

    const result = runGameCommand(state, { type: 'add_stress', row: 1, col: 1, amount: 1 });

    expect(result.success).toBe(true);
    expect(result.meta.stressResult?.outcome).toBe('meltdown');
    expect(result.nextState.grid[1][1]).toBeNull();
    expect(result.nextState.cellDurability[1][1]).toBe(0);
    expect(result.nextState.cellDurability[1][2]).toBe(3);
    expect(result.nextState.playerHp).toBeLessThan(state.playerHp);
    expect(result.nextState.discardPile.some(card => card.id === 'pet_001')).toBe(true);
  });

  it('prevents meltdown for cards with the never meltdown template', () => {
    const stubborn = entityFromCard('pet_003', 0, 0, { stress: 4, maxStress: 5 });
    const state = withEntities(createEmptyGameState(), [stubborn]);

    const result = runGameCommand(state, { type: 'add_stress', row: 0, col: 0, amount: 1 });

    expect(result.success).toBe(true);
    expect(result.meta.stressResult?.outcome).toBe('applied');
    expect(result.nextState.grid[0][0]?.stress).toBe(5);
    expect(result.nextState.grid[0][0]).not.toBeNull();
    expect(result.nextState.cellDurability[0][0]).toBe(3);
    expect(result.events.some(event => event.type === 'meltdown_triggered')).toBe(false);
  });

  it('plays swap action cards against two targets', () => {
    const left = entityFromCard('worker_001', 0, 0);
    const right = entityFromCard('pet_001', 0, 2);
    const action = runtimeCard('action_003');
    const state = withEntities(
      createEmptyGameState({
        cans: 5,
        hand: [action],
      }),
      [left, right]
    );

    const result = runGameCommand(state, {
      type: 'play_card',
      cardIndex: 0,
      targetRow: 0,
      targetCol: 0,
      targetRow2: 0,
      targetCol2: 2,
    });

    expect(result.success).toBe(true);
    expect(result.nextState.grid[0][0]?.cardId).toBe('pet_001');
    expect(result.nextState.grid[0][2]?.cardId).toBe('worker_001');
    expect(result.nextState.hand).toHaveLength(0);
    expect(result.nextState.discardPile.some(card => card.id === 'action_003')).toBe(true);
  });

  it('applies income multiplier and queues resentment for next turn', () => {
    const worker = entityFromCard('worker_001', 0, 0);
    const action = runtimeCard('action_002');
    const state = withEntities(
      createEmptyGameState({
        cans: 8,
        hand: [action],
      }),
      [worker]
    );

    const played = runGameCommand(state, { type: 'play_card', cardIndex: 0 });

    expect(played.success).toBe(true);
    expect(played.nextState.workerIncomeMultiplierThisTurn).toBe(2);
    expect(played.nextState.pendingCardsNextTurnDiscard.map(card => card.id)).toContain('action_resentment');
    expect(played.nextState.globalStatuses.some(status => status.kind === 'queued_resentment')).toBe(true);

    const advanced = runGameCommand(
      {
        ...played.nextState,
        phase: 'end',
        hand: [],
      },
      { type: 'finish_hand_trim_and_advance_turn' }
    );

    expect(advanced.success).toBe(true);
    expect(advanced.nextState.turn).toBe(2);
    const allCardPools = [
      ...advanced.nextState.hand.map(card => card.id),
      ...advanced.nextState.deck.map(card => card.id),
      ...advanced.nextState.discardPile.map(card => card.id),
    ];
    expect(allCardPools).toContain('action_resentment');
    expect(advanced.nextState.globalStatuses.some(status => status.kind === 'queued_resentment')).toBe(false);
  });

  it('resolves a full turn sequence with income, stress, and next-turn draw', () => {
    const pet = entityFromCard('pet_001', 0, 0);
    const worker = entityFromCard('worker_001', 0, 1);
    const deck = [runtimeCard('action_007'), runtimeCard('action_001')];
    const state = withEntities(
      createEmptyGameState({
        phase: 'preparation',
        cans: 10,
        deck,
        hand: [],
      }),
      [pet, worker]
    );

    const result = runGameCommand(state, { type: 'resolve_turn_sequence' });

    expect(result.success).toBe(true);
    expect(result.nextState.turn).toBe(2);
    expect(result.nextState.phase).toBe('preparation');
    expect(result.nextState.cans).toBeGreaterThan(10);
    expect(result.nextState.hearts).toBeGreaterThan(0);
    expect(result.nextState.grid[0][0]?.stress).toBe(1);
    expect(result.nextState.grid[0][1]?.stress).toBe(1);
    expect(result.meta.drawEvent?.source).toBe('turn_start');
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'phase_started', phase: 'income' }));
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'turn_started', turn: 2 }));
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it('plays turn-start pet draw separately before the daily draw', () => {
    const pet = entityFromCard('pet_006', 0, 0);
    const deck = [
      runtimeCard('action_007'),
      runtimeCard('action_001'),
      runtimeCard('worker_001'),
      runtimeCard('pet_001'),
      runtimeCard('action_003'),
    ];
    const state = withEntities(
      createEmptyGameState({
        phase: 'preparation',
        hand: [],
        deck,
      }),
      [pet]
    );

    const result = runGameCommand(state, { type: 'resolve_turn_sequence' });
    const flattened = result.steps.flatMap(step => step.presentation);
    const bannerIndex = flattened.findIndex(
      event => event.type === 'show_phase_banner' && event.title === '第 2 回合 · 准备阶段'
    );
    const skillCueIndex = flattened.findIndex(
      event => event.type === 'show_entity_cue' && event.row === 0 && event.col === 0 && event.subtitle === '回合开始抽牌'
    );
    const skillDrawIndex = flattened.findIndex(
      event => event.type === 'play_draw_event' && event.event.source === 'skill'
    );
    const dailyDrawIndex = flattened.findIndex(
      event => event.type === 'play_draw_event' && event.event.source === 'turn_start'
    );

    expect(result.success).toBe(true);
    expect(bannerIndex).toBeGreaterThan(-1);
    expect(skillCueIndex).toBeGreaterThan(bannerIndex);
    expect(skillDrawIndex).toBeGreaterThan(skillCueIndex);
    expect(dailyDrawIndex).toBeGreaterThan(skillDrawIndex);
  });

  it('keeps skill draw separate from daily draw after hand trim advancement', () => {
    const pet = entityFromCard('pet_012', 0, 0);
    const deck = [
      runtimeCard('action_007'),
      runtimeCard('action_001'),
      runtimeCard('worker_001'),
      runtimeCard('pet_001'),
      runtimeCard('action_003'),
      runtimeCard('worker_002'),
    ];
    const state = withEntities(
      createEmptyGameState({
        turn: 3,
        phase: 'end',
        hand: [],
        deck,
        awaitingHandTrim: true,
      }),
      [pet]
    );

    const result = runGameCommand(state, {
      type: 'finish_hand_trim_and_advance_turn',
      drawMeta: {
        source: 'turn_start',
        sourceLabel: '每日抽牌',
        uiMode: 'manual',
      },
    });
    const drawEvents = result.steps
      .flatMap(step => step.presentation)
      .filter((event): event is Extract<(typeof result.steps)[number]['presentation'][number], { type: 'play_draw_event' }> =>
        event.type === 'play_draw_event'
      );

    expect(result.success).toBe(true);
    expect(drawEvents.map(event => event.event.source)).toEqual(['skill', 'turn_start']);
    expect(result.nextState.lastDrawEvent).toBeNull();
  });

  it('creates adjacent skill presentation steps for passive pressure skills', () => {
    const source = entityFromCard('pet_004', 1, 1);
    const target = entityFromCard('pet_001', 1, 2);
    const state = withEntities(
      createEmptyGameState({
        phase: 'preparation',
        hand: [],
        deck: [runtimeCard('action_001'), runtimeCard('action_003'), runtimeCard('worker_001')],
      }),
      [source, target]
    );

    const result = runGameCommand(state, { type: 'resolve_turn_sequence' });
    const flattened = result.steps.flatMap(step => step.presentation);

    expect(flattened).toContainEqual(
      expect.objectContaining({
        type: 'play_skill_effect',
        effect: 'link',
        sourceRow: 1,
        sourceCol: 1,
        targetRow: 1,
        targetCol: 2,
      })
    );
  });
});
