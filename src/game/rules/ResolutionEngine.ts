import actionsConfig from '../../../config/actions.json';
import {
  CELL_DURABILITY_MAX,
  HAND_SIZE_MAX,
  HEARTS_ENTITY_INCOME_MULTIPLIER,
  MELTDOWN_HP_LOSS,
  PLAYER_HP_START,
  RUINS_REBUILD_COST,
  SETUP_DRAW_COUNT,
  STARTING_CANS,
  TURN_DRAW_COUNT,
  VICTORY_DAYS,
  VICTORY_HEARTS,
} from '@config/gameRules';
import type {
  DrawCardsMeta,
  DrawEvent,
  GamePhase,
  GameState,
  GridEntity,
  IncomeBreakdown,
  StressResolutionResult,
} from '../../store/gameStore';
import type { Card } from '../../types/card';
import { buildShuffledStartingDeck } from '../../utils/deckFactory';
import { getEntityCardTemplate } from '../../utils/cardCatalog';
import { normalizeCard } from '../../utils/cardNormalize';
import { getRuntimeCardDefinition } from '../../utils/runtimeConfig';
import type { GameCommand } from './commands';
import type { DomainEvent } from './events';
import type { PresentationEvent } from './presentation';

const MELTDOWN_ADJ4: readonly [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

type ActionTargetMode = 'none' | 'pet' | 'worker' | 'swap';

interface ResolutionMeta {
  drawEvent: DrawEvent | null;
  stressResult: StressResolutionResult | null;
}

export interface ResolutionStep {
  state: GameState;
  presentation: PresentationEvent[];
}

export interface ResolutionResult {
  success: boolean;
  nextState: GameState;
  events: DomainEvent[];
  presentation: PresentationEvent[];
  steps: ResolutionStep[];
  meta: ResolutionMeta;
  failureReason?: string;
}

interface ResolutionContext {
  draft: GameState;
  events: DomainEvent[];
  presentation: PresentationEvent[];
  steps: ResolutionStep[];
  meta: ResolutionMeta;
}

interface ResolutionUnit {
  row: number;
  col: number;
  entityId: string;
}

function cloneGridEntity(entity: GridEntity | null): GridEntity | null {
  if (!entity) return null;
  return {
    ...entity,
    position: { ...entity.position },
    tags: [...entity.tags],
  };
}

function cloneDrawEvent(event: DrawEvent | null): DrawEvent | null {
  if (!event) return null;
  return {
    ...event,
    drawnCards: [...event.drawnCards],
  };
}

function cloneState(state: GameState): GameState {
  return {
    turn: state.turn,
    phase: state.phase,
    cans: state.cans,
    interest: state.interest,
    winStreak: state.winStreak,
    loseStreak: state.loseStreak,
    hearts: state.hearts,
    playerHp: state.playerHp,
    maxPlayerHp: state.maxPlayerHp,
    cellDurability: state.cellDurability.map(row => [...row]),
    gameStatus: state.gameStatus,
    endReason: state.endReason,
    grid: state.grid.map(row => row.map(entity => cloneGridEntity(entity))),
    hand: [...state.hand],
    deck: [...state.deck],
    discardPile: [...state.discardPile],
    globalStress: state.globalStress,
    meltdownHistory: state.meltdownHistory.map(entry => ({ ...entry })),
    petIncomeMultiplierThisTurn: state.petIncomeMultiplierThisTurn,
    workerIncomeMultiplierThisTurn: state.workerIncomeMultiplierThisTurn,
    pendingCardsNextTurnDiscard: [...state.pendingCardsNextTurnDiscard],
    awaitingHandTrim: state.awaitingHandTrim,
    lastDrawEvent: cloneDrawEvent(state.lastDrawEvent),
    nextDrawEventId: state.nextDrawEventId,
  };
}

function createEmptyGrid(): (GridEntity | null)[][] {
  return Array(3)
    .fill(null)
    .map(() => Array(6).fill(null));
}

function createFullDurability(): number[][] {
  return Array(3)
    .fill(null)
    .map(() => Array(6).fill(CELL_DURABILITY_MAX));
}

function createBaseState(initialDeck: Card[] = []): GameState {
  return {
    turn: 1,
    phase: 'preparation',
    cans: STARTING_CANS,
    interest: 0,
    winStreak: 0,
    loseStreak: 0,
    hearts: 0,
    playerHp: PLAYER_HP_START,
    maxPlayerHp: PLAYER_HP_START,
    cellDurability: createFullDurability(),
    gameStatus: 'playing',
    endReason: null,
    grid: createEmptyGrid(),
    hand: [],
    deck: initialDeck,
    discardPile: [],
    globalStress: 0,
    meltdownHistory: [],
    petIncomeMultiplierThisTurn: 1,
    workerIncomeMultiplierThisTurn: 1,
    pendingCardsNextTurnDiscard: [],
    awaitingHandTrim: false,
    lastDrawEvent: null,
    nextDrawEventId: 1,
  };
}

function createFailure(state: GameState, failureReason: string): ResolutionResult {
  return {
    success: false,
    nextState: cloneState(state),
    events: [],
    presentation: [],
    steps: [],
    meta: {
      drawEvent: null,
      stressResult: null,
    },
    failureReason,
  };
}

function getActionTargetMode(cardId: string): ActionTargetMode {
  switch (cardId) {
    case 'action_001':
    case 'action_008':
      return 'pet';
    case 'action_006':
      return 'worker';
    case 'action_003':
      return 'swap';
    default:
      return 'none';
  }
}

function defaultSourceLabel(source: NonNullable<DrawCardsMeta['source']>): string {
  if (source === 'setup') return '初始抽牌';
  if (source === 'turn_start') return '每日抽牌';
  if (source === 'action') return '行动牌抽牌';
  if (source === 'skill') return '技能抽牌';
  return '抽牌';
}

function allCellsRuins(cellDurability: number[][]): boolean {
  return cellDurability.every(row => row.every(d => d <= 0));
}

function addEvent(ctx: ResolutionContext, event: DomainEvent): void {
  ctx.events.push(event);
}

function addPresentation(ctx: ResolutionContext, ...events: PresentationEvent[]): void {
  ctx.presentation.push(...events);
}

function pushStep(
  ctx: ResolutionContext,
  state: GameState,
  presentation: PresentationEvent[]
): void {
  ctx.steps.push({
    state: cloneState(state),
    presentation,
  });
  addPresentation(ctx, ...presentation);
}

function makeContext(state: GameState): ResolutionContext {
  return {
    draft: cloneState(state),
    events: [],
    presentation: [],
    steps: [],
    meta: {
      drawEvent: null,
      stressResult: null,
    },
  };
}

function spendCans(state: GameState, amount: number): boolean {
  if (amount <= 0) return true;
  if (state.cans < amount) return false;
  state.cans -= amount;
  return true;
}

function addCans(state: GameState, amount: number): void {
  if (amount <= 0) return;
  state.cans += amount;
}

function addHearts(state: GameState, amount: number): void {
  if (amount <= 0) return;
  state.hearts += amount;
  if (state.hearts >= VICTORY_HEARTS) {
    state.gameStatus = 'won';
    state.endReason = null;
  }
}

function removeHandCardAfterPlay(state: GameState, cardIndex: number): Card | null {
  if (cardIndex < 0 || cardIndex >= state.hand.length) return null;
  const [card] = state.hand.splice(cardIndex, 1);
  if (card) {
    state.discardPile.push(card);
  }
  return card ?? null;
}

function resentmentCard(): Card | null {
  const list = actionsConfig as Card[];
  const raw = list.find(c => c.id === 'action_resentment');
  return raw ? normalizeCard(raw as Card) : null;
}

function cellDurabilityOk(state: GameState, row: number, col: number): boolean {
  return (state.cellDurability[row]?.[col] ?? 0) > 0;
}

function getResolutionOrderSnapshot(state: GameState): ResolutionUnit[] {
  const order: ResolutionUnit[] = [];
  state.grid.forEach((row, rowIndex) => {
    row.forEach((entity, colIndex) => {
      if (!entity) return;
      order.push({
        row: rowIndex,
        col: colIndex,
        entityId: entity.id,
      });
    });
  });
  return order;
}

function calculateInterest(state: GameState): number {
  state.interest = Math.floor(state.cans / 10);
  return state.interest;
}

function getIncomeBreakdown(state: GameState): IncomeBreakdown {
  const petM = Math.max(1, state.petIncomeMultiplierThisTurn);
  const workerM = Math.max(1, state.workerIncomeMultiplierThisTurn);
  const entities: IncomeBreakdown['entities'] = [];
  let total = 0;

  state.grid.forEach((row, i) => {
    row.forEach((entity, j) => {
      if (!entity || entity.income <= 0) return;
      let income = entity.income;
      if (entity.type === 'pet') income = Math.floor(income * petM);
      else if (entity.type === 'worker') income = Math.floor(income * workerM);
      entities.push({
        row: i,
        col: j,
        income,
        name: entity.name,
      });
      total += income;
    });
  });

  total += state.interest;
  const streakBonus = state.winStreak > 0 ? state.winStreak : 0;
  total += streakBonus;

  return {
    entities,
    interest: state.interest,
    streakBonus,
    total,
  };
}

function drawCardsInState(
  ctx: ResolutionContext,
  count: number,
  meta?: DrawCardsMeta
): DrawEvent | null {
  if (count <= 0) return null;
  const state = ctx.draft;
  let newDeck = [...state.deck];
  let newHand = [...state.hand];
  let newDiscard = [...state.discardPile];
  const drawnCards: Card[] = [];
  let reshuffled = false;
  const deckBefore = newDeck.length;
  const discardBefore = newDiscard.length;
  const handBefore = newHand.length;

  for (let i = 0; i < count; i++) {
    if (newDeck.length === 0) {
      newDeck = [...newDiscard].sort(() => Math.random() - 0.5);
      newDiscard = [];
      reshuffled = true;
    }
    if (newDeck.length === 0) break;
    const card = newDeck.pop()!;
    newHand.push(card);
    drawnCards.push(card);
  }

  state.deck = newDeck;
  state.hand = newHand;
  state.discardPile = newDiscard;

  if (drawnCards.length === 0) return null;

  const source = meta?.source ?? 'system';
  const sourceLabel = meta?.sourceLabel ?? defaultSourceLabel(source);
  const event: DrawEvent = {
    id: state.nextDrawEventId,
    countRequested: count,
    drawnCards,
    reshuffled,
    deckBefore,
    deckAfter: newDeck.length,
    discardBefore,
    discardAfter: newDiscard.length,
    handBefore,
    handAfter: newHand.length,
    source,
    sourceLabel,
    sourceCardId: meta?.sourceCardId,
    sourceEntityId: meta?.sourceEntityId,
    sourceRow: meta?.sourceRow,
    sourceCol: meta?.sourceCol,
  };

  state.nextDrawEventId = event.id + 1;
  if ((meta?.uiMode ?? 'store_event') === 'manual') {
    ctx.meta.drawEvent = event;
  } else {
    state.lastDrawEvent = event;
    ctx.meta.drawEvent = event;
  }

  addEvent(ctx, { type: 'cards_drawn', event });
  return event;
}

function maybeEndGameByVictoryWindow(state: GameState, ctx: ResolutionContext): void {
  if (state.gameStatus !== 'playing') return;
  if (state.turn <= VICTORY_DAYS) return;
  if (state.hearts >= VICTORY_HEARTS) {
    state.gameStatus = 'won';
    state.endReason = null;
    addEvent(ctx, { type: 'game_ended', status: 'won', reason: null });
    return;
  }
  state.gameStatus = 'lost';
  state.endReason = 'hearts';
  addEvent(ctx, { type: 'game_ended', status: 'lost', reason: 'hearts' });
}

function advanceTurnAfterTrim(
  ctx: ResolutionContext,
  drawMeta?: DrawCardsMeta
): DrawEvent | null {
  const state = ctx.draft;
  if (state.gameStatus !== 'playing') return null;
  if (state.hand.length > HAND_SIZE_MAX) return null;

  if (state.awaitingHandTrim) {
    state.awaitingHandTrim = false;
  }

  const inject = [...state.pendingCardsNextTurnDiscard];
  state.turn += 1;
  state.phase = 'preparation';
  state.grid = state.grid.map(row =>
    row.map(entity => (entity ? { ...entity, isExhausted: false } : null))
  );
  state.petIncomeMultiplierThisTurn = 1;
  state.workerIncomeMultiplierThisTurn = 1;
  state.pendingCardsNextTurnDiscard = [];
  state.discardPile = [...state.discardPile, ...inject];
  addEvent(ctx, { type: 'turn_started', turn: state.turn });

  maybeEndGameByVictoryWindow(state, ctx);
  if (state.gameStatus !== 'playing') return null;

  return drawCardsInState(ctx, TURN_DRAW_COUNT, {
    source: 'turn_start',
    sourceLabel: '每日抽牌',
    uiMode: drawMeta?.uiMode ?? 'store_event',
  });
}

function triggerMeltdownInState(
  ctx: ResolutionContext,
  row: number,
  col: number
): StressResolutionResult | null {
  const state = ctx.draft;
  if (state.gameStatus !== 'playing') return null;
  const entity = state.grid[row]?.[col];
  if (!entity) return null;

  const success = Math.random() < 0.5;
  state.meltdownHistory.push({
    turn: state.turn,
    entityId: entity.id,
    success,
  });
  addEvent(ctx, {
    type: 'meltdown_triggered',
    row,
    col,
    entityId: entity.id,
    cardId: entity.cardId,
    success,
  });

  if (success) {
    const bonusIncome = entity.income * 5;
    addCans(state, bonusIncome);
    state.grid[row][col] = { ...entity, stress: 0 };
    const result: StressResolutionResult = {
      outcome: 'black_red',
      row,
      col,
      entityId: entity.id,
      entityName: entity.name,
      stress: 0,
      maxStress: entity.maxStress,
      bonusIncome,
    };
    ctx.meta.stressResult = result;
    return result;
  }

  const cardTpl = getEntityCardTemplate(entity.cardId);
  if (cardTpl) {
    state.discardPile.push(cardTpl);
  }

  state.grid[row][col] = null;
  state.cellDurability[row][col] = 0;
  addEvent(ctx, {
    type: 'entity_removed',
    row,
    col,
    entityId: entity.id,
    cardId: entity.cardId,
    reason: 'meltdown',
  });

  for (const [dr, dc] of MELTDOWN_ADJ4) {
    const nr = row + dr;
    const nc = col + dc;
    if (nr < 0 || nr >= 3 || nc < 0 || nc >= 6) continue;
    state.cellDurability[nr][nc] -= 1;
    if (state.cellDurability[nr][nc] <= 0) {
      state.cellDurability[nr][nc] = 0;
      const destroyed = state.grid[nr][nc];
      if (destroyed) {
        addEvent(ctx, {
          type: 'entity_removed',
          row: nr,
          col: nc,
          entityId: destroyed.id,
          cardId: destroyed.cardId,
          reason: 'meltdown',
        });
      }
      state.grid[nr][nc] = null;
    }
  }

  state.playerHp -= MELTDOWN_HP_LOSS;
  if (state.playerHp <= 0) {
    state.gameStatus = 'lost';
    state.endReason = 'hp';
    addEvent(ctx, { type: 'game_ended', status: 'lost', reason: 'hp' });
  } else if (allCellsRuins(state.cellDurability)) {
    state.gameStatus = 'lost';
    state.endReason = 'grid';
    addEvent(ctx, { type: 'game_ended', status: 'lost', reason: 'grid' });
  }

  const result: StressResolutionResult = {
    outcome: 'meltdown',
    row,
    col,
    entityId: entity.id,
    entityName: entity.name,
    stress: entity.maxStress,
    maxStress: entity.maxStress,
  };
  ctx.meta.stressResult = result;
  return result;
}

function addStressInState(
  ctx: ResolutionContext,
  row: number,
  col: number,
  amount: number
): StressResolutionResult | null {
  const state = ctx.draft;
  if (state.gameStatus !== 'playing') return null;
  const entity = state.grid[row]?.[col];
  if (!entity) return null;

  const newStress = Math.min(entity.stress + amount, entity.maxStress);
  if (newStress >= entity.maxStress) {
    addEvent(ctx, {
      type: 'stress_capped',
      row,
      col,
      entityId: entity.id,
      cardId: entity.cardId,
    });
    return triggerMeltdownInState(ctx, row, col);
  }

  state.grid[row][col] = { ...entity, stress: newStress };
  addEvent(ctx, {
    type: 'stress_applied',
    row,
    col,
    entityId: entity.id,
    cardId: entity.cardId,
    stress: newStress,
    maxStress: entity.maxStress,
  });

  const result: StressResolutionResult = {
    outcome: 'applied',
    row,
    col,
    entityId: entity.id,
    entityName: entity.name,
    stress: newStress,
    maxStress: entity.maxStress,
  };
  ctx.meta.stressResult = result;
  return result;
}

function resolveConfiguredActionCardEffect(
  ctx: ResolutionContext,
  card: Card,
  targetRow?: number,
  targetCol?: number,
  targetRow2?: number,
  targetCol2?: number
): boolean {
  const state = ctx.draft;
  const definition = getRuntimeCardDefinition(card.id);
  const skills = definition?.skills?.filter(skill => skill.trigger === 'on_play') ?? [];
  if (skills.length === 0) return false;

  for (const skill of skills) {
    const params = skill.params ?? {};

    if (skill.effectKind === 'set_stress_value') {
      if (targetRow === undefined || targetCol === undefined) return false;
      if (!cellDurabilityOk(state, targetRow, targetCol)) return false;
      const entity = state.grid[targetRow][targetCol];
      if (!entity || entity.type !== 'pet') return false;
      state.grid[targetRow][targetCol] = {
        ...entity,
        stress: Number(params.value ?? 0),
      };
      continue;
    }

    if (skill.effectKind === 'income_multiplier_turn') {
      const entityType = String(params.entityType ?? '');
      const multiplier = Math.max(1, Number(params.multiplier ?? 1));
      if (entityType === 'pet') {
        state.petIncomeMultiplierThisTurn *= multiplier;
        continue;
      }
      if (entityType === 'worker') {
        state.workerIncomeMultiplierThisTurn *= multiplier;
        continue;
      }
      return false;
    }

    if (skill.effectKind === 'queue_card_next_turn') {
      const queuedId = String(params.cardId ?? '');
      const queuedRaw =
        queuedId === 'action_resentment'
          ? null
          : (actionsConfig as Card[]).find(item => item.id === queuedId) ?? null;
      const next = queuedId === 'action_resentment' ? resentmentCard() : queuedRaw ? normalizeCard(queuedRaw as Card) : null;
      if (!next) return false;
      state.pendingCardsNextTurnDiscard = [...state.pendingCardsNextTurnDiscard, next];
      continue;
    }

    if (skill.effectKind === 'swap_positions') {
      if (
        targetRow === undefined ||
        targetCol === undefined ||
        targetRow2 === undefined ||
        targetCol2 === undefined
      ) {
        return false;
      }
      if (!cellDurabilityOk(state, targetRow, targetCol) || !cellDurabilityOk(state, targetRow2, targetCol2)) {
        return false;
      }
      const first = state.grid[targetRow][targetCol];
      const second = state.grid[targetRow2][targetCol2];
      if (!first || !second) return false;
      if (targetRow === targetRow2 && targetCol === targetCol2) return false;

      state.grid[targetRow][targetCol] = { ...second, position: { row: targetRow, col: targetCol } };
      state.grid[targetRow2][targetCol2] = { ...first, position: { row: targetRow2, col: targetCol2 } };
      addEvent(ctx, {
        type: 'entity_moved',
        fromRow: targetRow,
        fromCol: targetCol,
        toRow: targetRow2,
        toCol: targetCol2,
        entityId: first.id,
      });
      addEvent(ctx, {
        type: 'entity_moved',
        fromRow: targetRow2,
        fromCol: targetCol2,
        toRow: targetRow,
        toCol: targetCol,
        entityId: second.id,
      });
      continue;
    }

    if (skill.effectKind === 'adjust_stress_all') {
      const entityType = String(params.entityType ?? '');
      const amount = Number(params.amount ?? 0);
      const cells: Array<{ row: number; col: number }> = [];
      state.grid.forEach((row, rowIndex) => {
        row.forEach((entity, colIndex) => {
          if (entity?.type === entityType) {
            cells.push({ row: rowIndex, col: colIndex });
          }
        });
      });
      cells.forEach(cell => {
        if (amount >= 0) addStressInState(ctx, cell.row, cell.col, amount);
        else {
          const entity = state.grid[cell.row][cell.col];
          if (!entity) return;
          state.grid[cell.row][cell.col] = {
            ...entity,
            stress: Math.max(0, entity.stress + amount),
          };
        }
      });
      continue;
    }

    if (skill.effectKind === 'sacrifice_worker_reduce_adjacent_pet_stress') {
      if (targetRow === undefined || targetCol === undefined) return false;
      if (!cellDurabilityOk(state, targetRow, targetCol)) return false;
      const victim = state.grid[targetRow][targetCol];
      if (!victim || victim.type !== 'worker') return false;
      state.grid[targetRow][targetCol] = null;
      addEvent(ctx, {
        type: 'entity_removed',
        row: targetRow,
        col: targetCol,
        entityId: victim.id,
        cardId: victim.cardId,
        reason: 'action',
      });

      const amount = Math.max(0, Number(params.amount ?? 0));
      for (const [dr, dc] of MELTDOWN_ADJ4) {
        const r = targetRow + dr;
        const c = targetCol + dc;
        if (r < 0 || r >= 3 || c < 0 || c >= 6) continue;
        const entity = state.grid[r][c];
        if (!entity || entity.type !== 'pet') continue;
        state.grid[r][c] = {
          ...entity,
          stress: Math.max(0, entity.stress - amount),
        };
      }
      continue;
    }

    if (skill.effectKind === 'draw_cards') {
      drawCardsInState(ctx, Number(params.count ?? 0), {
        source: 'action',
        sourceCardId: card.id,
        sourceLabel: card.name,
      });
      continue;
    }

    if (skill.effectKind === 'return_pet_to_hand') {
      if (targetRow === undefined || targetCol === undefined) return false;
      if (!cellDurabilityOk(state, targetRow, targetCol)) return false;
      const entity = state.grid[targetRow][targetCol];
      if (!entity || entity.type !== 'pet') return false;
      const petCard = getEntityCardTemplate(entity.cardId);
      if (!petCard) return false;
      state.grid[targetRow][targetCol] = null;
      state.hand = [...state.hand, petCard];
      addEvent(ctx, {
        type: 'entity_removed',
        row: targetRow,
        col: targetCol,
        entityId: entity.id,
        cardId: entity.cardId,
        reason: 'action',
      });
      continue;
    }

    return false;
  }

  return true;
}

function resolveActionCardEffect(
  ctx: ResolutionContext,
  card: Card,
  targetRow?: number,
  targetCol?: number,
  targetRow2?: number,
  targetCol2?: number
): boolean {
  if (resolveConfiguredActionCardEffect(ctx, card, targetRow, targetCol, targetRow2, targetCol2)) {
    return true;
  }
  return false;
}

function runPlayCardCommand(
  state: GameState,
  cardIndex: number,
  targetRow?: number,
  targetCol?: number,
  targetRow2?: number,
  targetCol2?: number
): ResolutionResult {
  if (state.gameStatus !== 'playing') return createFailure(state, 'game_not_playing');
  if (cardIndex < 0 || cardIndex >= state.hand.length) {
    return createFailure(state, 'invalid_card_index');
  }

  const ctx = makeContext(state);
  const card = ctx.draft.hand[cardIndex];
  addEvent(ctx, {
    type: 'card_played',
    cardId: card.id,
    cardType: card.type,
    cardIndex,
    targetRow,
    targetCol,
    targetRow2,
    targetCol2,
  });

  if (card.type.includes('pet') || card.type.includes('worker')) {
    if (targetRow === undefined || targetCol === undefined) {
      return createFailure(state, 'missing_target');
    }
    if (targetRow < 0 || targetRow >= 3 || targetCol < 0 || targetCol >= 6) {
      return createFailure(state, 'invalid_target');
    }
    if (!cellDurabilityOk(ctx.draft, targetRow, targetCol)) {
      return createFailure(state, 'target_ruins');
    }
    if (ctx.draft.grid[targetRow][targetCol] !== null) {
      return createFailure(state, 'target_occupied');
    }
    if (!spendCans(ctx.draft, card.cost)) {
      return createFailure(state, 'insufficient_cans');
    }

    const entity: GridEntity = {
      id: `${card.id}_${Date.now()}`,
      cardId: card.id,
      type: card.type.includes('pet') ? 'pet' : 'worker',
      name: card.name,
      health: card.attributes.health || 0,
      maxHealth: card.attributes.health || 0,
      attack: card.attributes.attack || 0,
      income: card.attributes.income || 0,
      stress: 0,
      maxStress: card.attributes.maxStress || 100,
      tags: card.tags,
      position: { row: targetRow, col: targetCol },
      isExhausted: false,
    };
    ctx.draft.grid[targetRow][targetCol] = entity;
    addEvent(ctx, {
      type: 'entity_placed',
      row: targetRow,
      col: targetCol,
      entityId: entity.id,
      cardId: entity.cardId,
    });
    removeHandCardAfterPlay(ctx.draft, cardIndex);
    return {
      success: true,
      nextState: ctx.draft,
      events: ctx.events,
      presentation: ctx.presentation,
      steps: ctx.steps,
      meta: ctx.meta,
    };
  }

  if (card.type.includes('action')) {
    const mode = getActionTargetMode(card.id);
    if ((mode === 'pet' || mode === 'worker') && (targetRow === undefined || targetCol === undefined)) {
      return createFailure(state, 'missing_target');
    }
    if (
      mode === 'swap' &&
      (targetRow === undefined ||
        targetCol === undefined ||
        targetRow2 === undefined ||
        targetCol2 === undefined)
    ) {
      return createFailure(state, 'missing_swap_targets');
    }
    if (!spendCans(ctx.draft, card.cost)) {
      return createFailure(state, 'insufficient_cans');
    }
    const ok = resolveActionCardEffect(ctx, card, targetRow, targetCol, targetRow2, targetCol2);
    if (!ok) {
      return createFailure(state, 'action_effect_failed');
    }
    removeHandCardAfterPlay(ctx.draft, cardIndex);
    return {
      success: true,
      nextState: ctx.draft,
      events: ctx.events,
      presentation: ctx.presentation,
      steps: ctx.steps,
      meta: ctx.meta,
    };
  }

  return createFailure(state, 'unsupported_card_type');
}

function runDrawCardsCommand(
  state: GameState,
  count: number,
  meta?: DrawCardsMeta
): ResolutionResult {
  const ctx = makeContext(state);
  addEvent(ctx, { type: 'cards_draw_requested', count, meta });
  drawCardsInState(ctx, count, meta);
  return {
    success: true,
    nextState: ctx.draft,
    events: ctx.events,
    presentation: ctx.presentation,
    steps: ctx.steps,
    meta: ctx.meta,
  };
}

function runNextPhaseCommand(state: GameState): ResolutionResult {
  if (state.gameStatus !== 'playing') return createFailure(state, 'game_not_playing');
  const ctx = makeContext(state);
  const phaseOrder: GamePhase[] = ['preparation', 'action', 'income', 'end'];
  const currentIndex = phaseOrder.indexOf(ctx.draft.phase);
  const nextPhase = phaseOrder[(currentIndex + 1) % phaseOrder.length];

  if (nextPhase === 'preparation') {
    return runGameCommand(ctx.draft, { type: 'end_turn' });
  }

  ctx.draft.phase = nextPhase;
  addEvent(ctx, { type: 'phase_started', phase: nextPhase });
  if (nextPhase === 'income') {
    calculateInterest(ctx.draft);
    const breakdown = getIncomeBreakdown(ctx.draft);
    const entitySum = breakdown.entities.reduce((sum, entry) => sum + entry.income, 0);
    addCans(ctx.draft, breakdown.total);
    addHearts(ctx.draft, Math.floor(entitySum * HEARTS_ENTITY_INCOME_MULTIPLIER));
  }
  return {
    success: true,
    nextState: ctx.draft,
    events: ctx.events,
    presentation: ctx.presentation,
    steps: ctx.steps,
    meta: ctx.meta,
  };
}

function runEndTurnCommand(state: GameState): ResolutionResult {
  if (state.gameStatus !== 'playing') return createFailure(state, 'game_not_playing');
  const ctx = makeContext(state);
  if (ctx.draft.hand.length > HAND_SIZE_MAX) {
    ctx.draft.awaitingHandTrim = true;
    return {
      success: true,
      nextState: ctx.draft,
      events: ctx.events,
      presentation: ctx.presentation,
      steps: ctx.steps,
      meta: ctx.meta,
    };
  }
  advanceTurnAfterTrim(ctx);
  return {
    success: true,
    nextState: ctx.draft,
    events: ctx.events,
    presentation: ctx.presentation,
    steps: ctx.steps,
    meta: ctx.meta,
  };
}

function runFinishHandTrimCommand(
  state: GameState,
  drawMeta?: DrawCardsMeta
): ResolutionResult {
  if (state.gameStatus !== 'playing') return createFailure(state, 'game_not_playing');
  if (state.hand.length > HAND_SIZE_MAX) return createFailure(state, 'hand_above_limit');
  const ctx = makeContext(state);
  advanceTurnAfterTrim(ctx, drawMeta);
  return {
    success: true,
    nextState: ctx.draft,
    events: ctx.events,
    presentation: ctx.presentation,
    steps: ctx.steps,
    meta: ctx.meta,
  };
}

function runDiscardHandTrimCommand(state: GameState, cardIndex: number): ResolutionResult {
  if (state.gameStatus !== 'playing') return createFailure(state, 'game_not_playing');
  if (!state.awaitingHandTrim && state.hand.length <= HAND_SIZE_MAX) {
    return createFailure(state, 'hand_trim_not_active');
  }
  if (cardIndex < 0 || cardIndex >= state.hand.length) {
    return createFailure(state, 'invalid_card_index');
  }
  const ctx = makeContext(state);
  const card = ctx.draft.hand[cardIndex];
  if (card.canDiscard === false) {
    return createFailure(state, 'card_not_discardable');
  }
  removeHandCardAfterPlay(ctx.draft, cardIndex);
  return {
    success: true,
    nextState: ctx.draft,
    events: ctx.events,
    presentation: ctx.presentation,
    steps: ctx.steps,
    meta: ctx.meta,
  };
}

function runRemoveHandCardAfterPlayCommand(state: GameState, cardIndex: number): ResolutionResult {
  const ctx = makeContext(state);
  removeHandCardAfterPlay(ctx.draft, cardIndex);
  return {
    success: true,
    nextState: ctx.draft,
    events: ctx.events,
    presentation: ctx.presentation,
    steps: ctx.steps,
    meta: ctx.meta,
  };
}

function runPlaceEntityCommand(
  state: GameState,
  card: Card,
  row: number,
  col: number
): ResolutionResult {
  if (state.gameStatus !== 'playing') return createFailure(state, 'game_not_playing');
  if (row < 0 || row >= 3 || col < 0 || col >= 6) {
    return createFailure(state, 'invalid_target');
  }
  if (!card.type.includes('pet') && !card.type.includes('worker')) {
    return createFailure(state, 'unsupported_card_type');
  }

  const ctx = makeContext(state);
  if (!cellDurabilityOk(ctx.draft, row, col)) {
    return createFailure(state, 'target_ruins');
  }
  if (ctx.draft.grid[row][col] !== null) {
    return createFailure(state, 'target_occupied');
  }
  if (!spendCans(ctx.draft, card.cost)) {
    return createFailure(state, 'insufficient_cans');
  }

  const entity: GridEntity = {
    id: `${card.id}_${Date.now()}`,
    cardId: card.id,
    type: card.type.includes('pet') ? 'pet' : 'worker',
    name: card.name,
    health: card.attributes.health || 0,
    maxHealth: card.attributes.health || 0,
    attack: card.attributes.attack || 0,
    income: card.attributes.income || 0,
    stress: 0,
    maxStress: card.attributes.maxStress || 100,
    tags: card.tags,
    position: { row, col },
    isExhausted: false,
  };
  ctx.draft.grid[row][col] = entity;
  addEvent(ctx, {
    type: 'entity_placed',
    row,
    col,
    entityId: entity.id,
    cardId: entity.cardId,
  });

  return {
    success: true,
    nextState: ctx.draft,
    events: ctx.events,
    presentation: ctx.presentation,
    steps: ctx.steps,
    meta: ctx.meta,
  };
}

function runRemoveEntityCommand(state: GameState, row: number, col: number): ResolutionResult {
  const ctx = makeContext(state);
  const entity = ctx.draft.grid[row]?.[col];
  if (!entity) {
    return {
      success: true,
      nextState: ctx.draft,
      events: ctx.events,
      presentation: ctx.presentation,
      steps: ctx.steps,
      meta: ctx.meta,
    };
  }

  ctx.draft.grid[row][col] = null;
  addEvent(ctx, {
    type: 'entity_removed',
    row,
    col,
    entityId: entity.id,
    cardId: entity.cardId,
    reason: 'action',
  });
  return {
    success: true,
    nextState: ctx.draft,
    events: ctx.events,
    presentation: ctx.presentation,
    steps: ctx.steps,
    meta: ctx.meta,
  };
}

function runMoveEntityCommand(
  state: GameState,
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number
): ResolutionResult {
  if (state.gameStatus !== 'playing') return createFailure(state, 'game_not_playing');
  if (
    fromRow < 0 ||
    fromRow >= 3 ||
    fromCol < 0 ||
    fromCol >= 6 ||
    toRow < 0 ||
    toRow >= 3 ||
    toCol < 0 ||
    toCol >= 6
  ) {
    return createFailure(state, 'invalid_target');
  }

  const ctx = makeContext(state);
  if (!cellDurabilityOk(ctx.draft, fromRow, fromCol) || !cellDurabilityOk(ctx.draft, toRow, toCol)) {
    return createFailure(state, 'target_ruins');
  }

  const entity = ctx.draft.grid[fromRow][fromCol];
  if (!entity) return createFailure(state, 'missing_entity');
  if (ctx.draft.grid[toRow][toCol] !== null) {
    return createFailure(state, 'target_occupied');
  }

  ctx.draft.grid[fromRow][fromCol] = null;
  ctx.draft.grid[toRow][toCol] = {
    ...entity,
    position: { row: toRow, col: toCol },
  };
  addEvent(ctx, {
    type: 'entity_moved',
    fromRow,
    fromCol,
    toRow,
    toCol,
    entityId: entity.id,
  });

  return {
    success: true,
    nextState: ctx.draft,
    events: ctx.events,
    presentation: ctx.presentation,
    steps: ctx.steps,
    meta: ctx.meta,
  };
}

function runAddStressCommand(
  state: GameState,
  row: number,
  col: number,
  amount: number
): ResolutionResult {
  const ctx = makeContext(state);
  addStressInState(ctx, row, col, amount);
  return {
    success: true,
    nextState: ctx.draft,
    events: ctx.events,
    presentation: ctx.presentation,
    steps: ctx.steps,
    meta: ctx.meta,
  };
}

function runTriggerMeltdownCommand(
  state: GameState,
  row: number,
  col: number
): ResolutionResult {
  const ctx = makeContext(state);
  triggerMeltdownInState(ctx, row, col);
  return {
    success: true,
    nextState: ctx.draft,
    events: ctx.events,
    presentation: ctx.presentation,
    steps: ctx.steps,
    meta: ctx.meta,
  };
}

function runRebuildCellCommand(state: GameState, row: number, col: number): ResolutionResult {
  if (state.gameStatus !== 'playing') return createFailure(state, 'game_not_playing');
  const ctx = makeContext(state);
  if (row < 0 || row >= 3 || col < 0 || col >= 6) {
    return createFailure(state, 'invalid_target');
  }
  if (ctx.draft.grid[row][col] !== null) {
    return createFailure(state, 'cell_occupied');
  }
  if ((ctx.draft.cellDurability[row][col] ?? 0) > 0) {
    return createFailure(state, 'cell_not_ruins');
  }
  if (!spendCans(ctx.draft, RUINS_REBUILD_COST)) {
    return createFailure(state, 'insufficient_cans');
  }
  ctx.draft.cellDurability[row][col] = CELL_DURABILITY_MAX;
  return {
    success: true,
    nextState: ctx.draft,
    events: ctx.events,
    presentation: ctx.presentation,
    steps: ctx.steps,
    meta: ctx.meta,
  };
}

function runInitGameCommand(state: GameState, initialDeck?: Card[]): ResolutionResult {
  const ctx = makeContext(state);
  ctx.draft = createBaseState(initialDeck || state.deck);
  if (ctx.draft.deck.length > 0) {
    drawCardsInState(ctx, SETUP_DRAW_COUNT, {
      source: 'setup',
      sourceLabel: '初始抽牌',
    });
  }
  return {
    success: true,
    nextState: ctx.draft,
    events: ctx.events,
    presentation: ctx.presentation,
    steps: ctx.steps,
    meta: ctx.meta,
  };
}

function runRestartRunCommand(initialDeck: Card[]): ResolutionResult {
  const ctx = makeContext(createBaseState());
  ctx.draft = createBaseState(initialDeck);
  drawCardsInState(ctx, SETUP_DRAW_COUNT, {
    source: 'setup',
    sourceLabel: '初始抽牌',
  });
  return {
    success: true,
    nextState: ctx.draft,
    events: ctx.events,
    presentation: ctx.presentation,
    steps: ctx.steps,
    meta: ctx.meta,
  };
}

function resolveEntityIncomeTrigger(
  ctx: ResolutionContext,
  row: number,
  col: number,
  entityId: string
): void {
  const live = ctx.draft.grid[row]?.[col];
  if (!live || live.id !== entityId) return;

  if (live.type === 'pet' && live.cardId === 'pet_006') {
    const skillPresentation: PresentationEvent[] = [
      {
        type: 'show_entity_cue',
        row,
        col,
        title: '永动机猫',
        subtitle: '技能触发：抽 1 张牌',
        color: 0xffd54f,
      },
    ];
    const drawEvent = drawCardsInState(ctx, 1, {
      source: 'skill',
      sourceLabel: '永动机猫',
      sourceCardId: live.cardId,
      sourceEntityId: live.id,
      sourceRow: row,
      sourceCol: col,
      uiMode: 'manual',
    });
    if (drawEvent) {
      skillPresentation.push({
        type: 'play_draw_event',
        event: drawEvent,
      });
    }
    pushStep(ctx, ctx.draft, skillPresentation);
  }
}

function runResolveTurnSequenceCommand(state: GameState): ResolutionResult {
  if (state.gameStatus !== 'playing') return createFailure(state, 'game_not_playing');
  if (state.phase !== 'preparation' && state.phase !== 'action') {
    return createFailure(state, 'invalid_phase');
  }

  const ctx = makeContext(state);

  if (ctx.draft.phase === 'preparation') {
    ctx.draft.phase = 'action';
    addEvent(ctx, { type: 'phase_started', phase: 'action' });
    pushStep(ctx, ctx.draft, [
      { type: 'show_phase_banner', title: '行动阶段', holdMs: 420 },
    ]);
  }

  if (ctx.draft.phase === 'action') {
    ctx.draft.phase = 'income';
    addEvent(ctx, { type: 'phase_started', phase: 'income' });
    pushStep(ctx, ctx.draft, [
      { type: 'show_phase_banner', title: '收入阶段', holdMs: 480 },
    ]);

    calculateInterest(ctx.draft);
    const breakdown = getIncomeBreakdown(ctx.draft);
    const incomeByCell = new Map(
      breakdown.entities.map(entry => [`${entry.row}|${entry.col}`, entry] as const)
    );
    let entityIncomeSum = 0;

    for (const unit of getResolutionOrderSnapshot(ctx.draft)) {
      const entry = incomeByCell.get(`${unit.row}|${unit.col}`);
      const live = ctx.draft.grid[unit.row]?.[unit.col];
      if (!entry || !live || live.id !== unit.entityId) continue;

      addCans(ctx.draft, entry.income);
      entityIncomeSum += entry.income;
      addEvent(ctx, {
        type: 'income_resolved',
        row: unit.row,
        col: unit.col,
        entityId: live.id,
        cardId: live.cardId,
        entityType: live.type,
        amount: entry.income,
      });
      pushStep(ctx, ctx.draft, [
        {
          type: 'show_entity_cue',
          row: unit.row,
          col: unit.col,
          title: live.name,
          subtitle: '收益结算',
          color: 0xffe082,
        },
        {
          type: 'spawn_income_float',
          row: unit.row,
          col: unit.col,
          amount: entry.income,
        },
      ]);

      resolveEntityIncomeTrigger(ctx, unit.row, unit.col, unit.entityId);
      if (ctx.draft.gameStatus !== 'playing') {
        break;
      }
    }

    if (ctx.draft.gameStatus === 'playing' && breakdown.interest > 0) {
      addCans(ctx.draft, breakdown.interest);
      pushStep(ctx, ctx.draft, [
        { type: 'spawn_hud_float', text: `利息 +${breakdown.interest}`, color: 0xfff9c4 },
      ]);
    }

    if (ctx.draft.gameStatus === 'playing' && breakdown.streakBonus > 0) {
      addCans(ctx.draft, breakdown.streakBonus);
      pushStep(ctx, ctx.draft, [
        { type: 'spawn_hud_float', text: `连胜 +${breakdown.streakBonus}`, color: 0xabebc6 },
      ]);
    }

    if (ctx.draft.gameStatus === 'playing') {
      const heartsGain = Math.floor(entityIncomeSum * HEARTS_ENTITY_INCOME_MULTIPLIER);
      if (heartsGain > 0) {
        addHearts(ctx.draft, heartsGain);
        pushStep(ctx, ctx.draft, [
          { type: 'spawn_hud_float', text: `人气 +${heartsGain}`, color: 0xffd6e8 },
        ]);
      }
      if (ctx.draft.gameStatus !== 'playing') {
        addEvent(ctx, { type: 'game_ended', status: 'won', reason: null });
      }
    }
  }

  if (ctx.draft.gameStatus === 'playing') {
    ctx.draft.phase = 'end';
    addEvent(ctx, { type: 'phase_started', phase: 'end' });
    pushStep(ctx, ctx.draft, [
      {
        type: 'show_phase_banner',
        title: '结算阶段 · 逐个结算暴躁度',
        holdMs: 500,
      },
    ]);

    for (const unit of getResolutionOrderSnapshot(ctx.draft)) {
      const liveBefore = ctx.draft.grid[unit.row]?.[unit.col];
      if (!liveBefore || liveBefore.id !== unit.entityId) continue;

      pushStep(ctx, ctx.draft, [
        {
          type: 'show_entity_cue',
          row: unit.row,
          col: unit.col,
          title: liveBefore.name,
          subtitle: '暴躁 +1',
          color: 0xffb74d,
        },
      ]);

      const result = addStressInState(ctx, unit.row, unit.col, 1);
      pushStep(ctx, ctx.draft, [
        { type: 'pulse_stress_cell', row: unit.row, col: unit.col },
      ]);

      if (!result) continue;
      if (result.outcome === 'black_red') {
        const presentation: PresentationEvent[] = [
          {
            type: 'show_entity_cue',
            row: result.row,
            col: result.col,
            title: '黑红暴走',
            subtitle: `额外收益 +${result.bonusIncome ?? 0}`,
            color: 0xff6f61,
          },
        ];
        if (result.bonusIncome && result.bonusIncome > 0) {
          presentation.unshift({
            type: 'spawn_income_float',
            row: result.row,
            col: result.col,
            amount: result.bonusIncome,
          });
        }
        pushStep(ctx, ctx.draft, presentation);
      } else if (result.outcome === 'meltdown') {
        pushStep(ctx, ctx.draft, [
          {
            type: 'show_entity_cue',
            row: result.row,
            col: result.col,
            title: '彻底拆家',
            subtitle: '工位耐久受损，店长掉血',
            color: 0xff8a80,
          },
        ]);
      }

      if (ctx.draft.gameStatus !== 'playing') {
        break;
      }
    }
  }

  if (ctx.draft.gameStatus === 'playing') {
    addEvent(ctx, { type: 'turn_ended', turn: ctx.draft.turn });
    if (ctx.draft.hand.length > HAND_SIZE_MAX) {
      ctx.draft.awaitingHandTrim = true;
      pushStep(ctx, ctx.draft, [
        {
          type: 'spawn_hud_float',
          text: `手牌超过 ${HAND_SIZE_MAX} 张，请打出或将可弃牌拖向屏幕底边红区弃牌`,
          color: 0xfff9c4,
        },
      ]);
    } else {
      const drawEvent = advanceTurnAfterTrim(ctx, {
        source: 'turn_start',
        sourceLabel: '每日抽牌',
        uiMode: 'manual',
      });
      if (ctx.draft.gameStatus === 'playing') {
        pushStep(ctx, ctx.draft, [
          {
            type: 'show_phase_banner',
            title: `第 ${ctx.draft.turn} 回合 · 准备阶段`,
            holdMs: 520,
          },
        ]);
        if (drawEvent) {
          pushStep(ctx, ctx.draft, [
            { type: 'play_draw_event', event: drawEvent },
          ]);
        }
      }
    }
  }

  return {
    success: true,
    nextState: ctx.draft,
    events: ctx.events,
    presentation: ctx.presentation,
    steps: ctx.steps,
    meta: ctx.meta,
  };
}

export function runGameCommand(state: GameState, command: GameCommand): ResolutionResult {
  switch (command.type) {
    case 'play_card':
      return runPlayCardCommand(
        state,
        command.cardIndex,
        command.targetRow,
        command.targetCol,
        command.targetRow2,
        command.targetCol2
      );
    case 'draw_cards':
      return runDrawCardsCommand(state, command.count, command.meta);
    case 'set_phase': {
      const ctx = makeContext(state);
      ctx.draft.phase = command.phase;
      addEvent(ctx, { type: 'phase_started', phase: command.phase });
      return {
        success: true,
        nextState: ctx.draft,
        events: ctx.events,
        presentation: ctx.presentation,
        steps: ctx.steps,
        meta: ctx.meta,
      };
    }
    case 'next_phase':
      return runNextPhaseCommand(state);
    case 'end_turn':
      return runEndTurnCommand(state);
    case 'finish_hand_trim_and_advance_turn':
      return runFinishHandTrimCommand(state, command.drawMeta);
    case 'discard_hand_trim':
      return runDiscardHandTrimCommand(state, command.cardIndex);
    case 'remove_hand_card_after_play':
      return runRemoveHandCardAfterPlayCommand(state, command.cardIndex);
    case 'place_entity':
      return runPlaceEntityCommand(state, command.card, command.row, command.col);
    case 'remove_entity':
      return runRemoveEntityCommand(state, command.row, command.col);
    case 'move_entity':
      return runMoveEntityCommand(
        state,
        command.fromRow,
        command.fromCol,
        command.toRow,
        command.toCol
      );
    case 'add_stress':
      return runAddStressCommand(state, command.row, command.col, command.amount);
    case 'trigger_meltdown':
      return runTriggerMeltdownCommand(state, command.row, command.col);
    case 'rebuild_cell':
      return runRebuildCellCommand(state, command.row, command.col);
    case 'init_game':
      return runInitGameCommand(state, command.initialDeck);
    case 'restart_run':
      return runRestartRunCommand(command.initialDeck);
    case 'resolve_turn_sequence':
      return runResolveTurnSequenceCommand(state);
    default:
      return createFailure(state, 'unsupported_command');
  }
}

export function createRestartInitialDeck(): Card[] {
  return buildShuffledStartingDeck();
}
