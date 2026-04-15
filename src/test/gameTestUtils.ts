import { CELL_DURABILITY_MAX, PLAYER_HP_START, STARTING_CANS } from '@config/gameRules';
import type { GameState, GridEntity } from '../store/gameStore';
import type { Card } from '../types/card';
import { getRuntimeCardDefinition } from '../utils/runtimeConfig';
import { normalizeCard } from '../utils/cardNormalize';

export function createEmptyGameState(overrides: Partial<GameState> = {}): GameState {
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
    cellDurability: Array.from({ length: 3 }, () => Array(6).fill(CELL_DURABILITY_MAX)),
    gameStatus: 'playing',
    endReason: null,
    grid: Array.from({ length: 3 }, () => Array(6).fill(null)),
    hand: [],
    deck: [],
    discardPile: [],
    globalStress: 0,
    meltdownHistory: [],
    petIncomeMultiplierThisTurn: 1,
    workerIncomeMultiplierThisTurn: 1,
    pendingCardsNextTurnDiscard: [],
    awaitingHandTrim: false,
    lastDrawEvent: null,
    nextDrawEventId: 1,
    entityStatuses: {},
    globalStatuses: [],
    nextStatusId: 1,
    ...overrides,
  };
}

export function runtimeCard(cardId: string): Card {
  const definition = getRuntimeCardDefinition(cardId);
  if (!definition) {
    throw new Error(`Unknown runtime card: ${cardId}`);
  }

  return normalizeCard({
    id: definition.id,
    name: definition.name,
    type: definition.type,
    cost: definition.cost,
    rarity: definition.rarity,
    description: definition.description,
    derivedDescription: definition.derivedDescription,
    tags: definition.tags,
    income: definition.income,
    stress: definition.stress,
    stressLimit: definition.stressLimit,
    canDiscard: definition.canDiscard,
    image: definition.image,
    illustrationPath: definition.illustrationPath,
    imageFitMode: definition.imageFitMode,
    imageAnchorPreset: definition.imageAnchorPreset,
    modelProfileId: definition.modelProfileId,
    skills: definition.skills,
    attributes: {
      income: definition.income ?? 0,
      maxStress: definition.stressLimit ?? 100,
      health: 100,
      attack: 0,
    },
  });
}

export function entityFromCard(cardId: string, row: number, col: number, overrides: Partial<GridEntity> = {}): GridEntity {
  const card = runtimeCard(cardId);
  const entity: GridEntity = {
    id: `${cardId}_${row}_${col}`,
    cardId,
    type: card.type.includes('pet') ? 'pet' : 'worker',
    name: card.name,
    health: card.attributes.health ?? 100,
    maxHealth: card.attributes.health ?? 100,
    attack: card.attributes.attack ?? 0,
    income: card.attributes.income ?? 0,
    stress: 0,
    maxStress: card.attributes.maxStress ?? 100,
    tags: [...card.tags],
    position: { row, col },
    isExhausted: false,
    ...overrides,
  };

  return entity;
}

export function withEntities(state: GameState, entities: GridEntity[]): GameState {
  const next = createEmptyGameState(state);
  next.grid = state.grid.map(row => [...row]);
  next.entityStatuses = { ...state.entityStatuses };

  for (const entity of entities) {
    next.grid[entity.position.row][entity.position.col] = entity;
  }

  return next;
}

export function setCellRuins(state: GameState, row: number, col: number): GameState {
  const next = createEmptyGameState(state);
  next.cellDurability = state.cellDurability.map(line => [...line]);
  next.cellDurability[row][col] = 0;
  return next;
}
