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
import { getPassiveStatusesForCard, resolveStatusVisual } from '../status/statusRegistry';
import type { StatusInstance, StatusTheme } from '../status/statusTypes';
import { buildShuffledStartingDeck } from '../../utils/deckFactory';
import { getEntityCardTemplate } from '../../utils/cardCatalog';
import { normalizeCard } from '../../utils/cardNormalize';
import { getActionTargetModeFromConfig, getRuntimeCardDefinition } from '../../utils/runtimeConfig';
import type { RuntimeSkillBinding } from '../../utils/runtimeConfig';
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
type SkillTrigger =
  | 'on_play'
  | 'turn_start'
  | 'turn_end'
  | 'income_calc'
  | 'before_stress_apply'
  | 'before_meltdown'
  | 'after_meltdown'
  | 'passive';

type StressSource = 'turn_end' | 'action' | 'skill' | 'skill_adjacent' | 'meltdown' | 'system';

interface SkillOperation {
  kind?: string;
  selector?: string;
  filters?: Record<string, unknown>;
  params?: Record<string, unknown>;
}

interface SkillEntitySource {
  entity: GridEntity;
  row: number;
  col: number;
}

interface SkillExecutionInput {
  trigger: SkillTrigger;
  card?: Card;
  skill?: RuntimeSkillBinding;
  source?: SkillEntitySource;
  targetRow?: number;
  targetCol?: number;
  targetRow2?: number;
  targetCol2?: number;
  stress?: {
    row: number;
    col: number;
    amount: number;
    source: StressSource;
    prevented?: boolean;
  };
  meltdown?: {
    row: number;
    col: number;
    prevented?: boolean;
    radius: number;
  };
}

interface IncomeModifier {
  targetEntityId: string;
  targetRow: number;
  targetCol: number;
  percent: number;
  sourceCardId: string;
  sourceEntityId: string;
  statusKind?: string;
}

interface IncomeCalculation {
  interestThreshold: number;
  modifiers: IncomeModifier[];
}

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

function cloneStatus(status: StatusInstance): StatusInstance {
  return {
    ...status,
    params: { ...status.params },
  };
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
    entityStatuses: Object.fromEntries(
      Object.entries(state.entityStatuses).map(([entityId, statuses]) => [
        entityId,
        statuses.map(status => cloneStatus(status)),
      ])
    ),
    globalStatuses: state.globalStatuses.map(status => cloneStatus(status)),
    nextStatusId: state.nextStatusId,
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
    entityStatuses: {},
    globalStatuses: [],
    nextStatusId: 1,
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
  return getActionTargetModeFromConfig(cardId);
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

function makeStatusId(state: GameState): string {
  const id = `status_${state.nextStatusId}`;
  state.nextStatusId += 1;
  return id;
}

function findEntityCellById(state: GameState, entityId: string): { row: number; col: number } | null {
  for (let row = 0; row < state.grid.length; row += 1) {
    for (let col = 0; col < state.grid[row]!.length; col += 1) {
      if (state.grid[row]![col]?.id === entityId) return { row, col };
    }
  }
  return null;
}

function getEntityAt(state: GameState, row: number, col: number): GridEntity | null {
  return state.grid[row]?.[col] ?? null;
}

function getAdjacentOrthogonalCells(row: number, col: number): Array<{ row: number; col: number }> {
  const cells: Array<{ row: number; col: number }> = [];
  for (const [dr, dc] of MELTDOWN_ADJ4) {
    const nextRow = row + dr;
    const nextCol = col + dc;
    if (nextRow < 0 || nextRow >= 3 || nextCol < 0 || nextCol >= 6) continue;
    cells.push({ row: nextRow, col: nextCol });
  }
  return cells;
}

function getSquareRadiusCells(row: number, col: number, radius: number): Array<{ row: number; col: number }> {
  const cells: Array<{ row: number; col: number }> = [];
  const delta = Math.max(0, radius - 1);
  for (let dr = -delta; dr <= delta; dr += 1) {
    for (let dc = -delta; dc <= delta; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const nextRow = row + dr;
      const nextCol = col + dc;
      if (nextRow < 0 || nextRow >= 3 || nextCol < 0 || nextCol >= 6) continue;
      cells.push({ row: nextRow, col: nextCol });
    }
  }
  return cells;
}

function resolveTemplateToken(raw: unknown, params: Record<string, unknown>): unknown {
  if (typeof raw !== 'string') return raw;
  if (!raw.includes('$')) return raw;
  const replaced = raw.replace(/\$([a-zA-Z_]\w*)/g, (_match, key) => String(params[key] ?? ''));
  if (/^-?\d+(\.\d+)?$/.test(replaced)) return Number(replaced);
  if (replaced === 'true') return true;
  if (replaced === 'false') return false;
  return replaced;
}

function resolveTemplateValue(raw: unknown, params: Record<string, unknown>): unknown {
  if (Array.isArray(raw)) return raw.map(item => resolveTemplateValue(item, params));
  if (raw && typeof raw === 'object') {
    return Object.fromEntries(
      Object.entries(raw as Record<string, unknown>).map(([key, value]) => [key, resolveTemplateValue(value, params)])
    );
  }
  return resolveTemplateToken(raw, params);
}

function resolveSkillOperation(skill: RuntimeSkillBinding, operation: Record<string, unknown>): SkillOperation {
  const resolved = resolveTemplateValue(operation, skill.params ?? {}) as Record<string, unknown>;
  return {
    kind: typeof resolved.kind === 'string' ? resolved.kind : undefined,
    selector: typeof resolved.selector === 'string' ? resolved.selector : 'self',
    filters: typeof resolved.filters === 'object' && resolved.filters ? (resolved.filters as Record<string, unknown>) : {},
    params: typeof resolved.params === 'object' && resolved.params ? (resolved.params as Record<string, unknown>) : {},
  };
}

function entityMatchesFilters(entity: GridEntity, filters: Record<string, unknown>): boolean {
  const entityType = filters.entityType;
  if (typeof entityType === 'string' && entity.type !== entityType) return false;
  const cardId = filters.cardId;
  if (typeof cardId === 'string' && entity.cardId !== cardId) return false;
  const tagsAny = filters.tagsAny;
  if (Array.isArray(tagsAny) && tagsAny.length > 0 && !tagsAny.some(tag => entity.tags.includes(String(tag)))) {
    return false;
  }
  return true;
}

function resolveSkillSourceFromInput(state: GameState, input: SkillExecutionInput): SkillEntitySource | null {
  if (input.source) return input.source;
  const entityId = input.stress ? getEntityAt(state, input.stress.row, input.stress.col)?.id : null;
  if (entityId) {
    const cell = findEntityCellById(state, entityId);
    if (cell) {
      const entity = getEntityAt(state, cell.row, cell.col);
      if (entity) return { entity, row: cell.row, col: cell.col };
    }
  }
  if (input.meltdown) {
    const entity = getEntityAt(state, input.meltdown.row, input.meltdown.col);
    if (entity) return { entity, row: input.meltdown.row, col: input.meltdown.col };
  }
  return null;
}

function collectTargetsForSelector(
  state: GameState,
  input: SkillExecutionInput,
  selector: string,
  filters: Record<string, unknown>
): Array<{ entity: GridEntity; row: number; col: number }> {
  const source = resolveSkillSourceFromInput(state, input);
  const allEntities: Array<{ entity: GridEntity; row: number; col: number }> = [];
  state.grid.forEach((row, rowIndex) => {
    row.forEach((entity, colIndex) => {
      if (!entity) return;
      allEntities.push({ entity, row: rowIndex, col: colIndex });
    });
  });

  let candidates: Array<{ entity: GridEntity; row: number; col: number }> = [];
  if (selector === 'self') {
    candidates = source ? [source] : [];
  } else if (selector === 'target') {
    if (input.targetRow !== undefined && input.targetCol !== undefined) {
      const entity = getEntityAt(state, input.targetRow, input.targetCol);
      if (entity) candidates = [{ entity, row: input.targetRow, col: input.targetCol }];
    } else if (source) {
      candidates = [source];
    }
  } else if (selector === 'second_target') {
    if (input.targetRow2 !== undefined && input.targetCol2 !== undefined) {
      const entity = getEntityAt(state, input.targetRow2, input.targetCol2);
      if (entity) candidates = [{ entity, row: input.targetRow2, col: input.targetCol2 }];
    }
  } else if (selector === 'adjacent_orthogonal' || selector === 'adjacent_entities') {
    if (source) {
      candidates = getAdjacentOrthogonalCells(source.row, source.col)
        .map(cell => {
          const entity = getEntityAt(state, cell.row, cell.col);
          return entity ? { entity, row: cell.row, col: cell.col } : null;
        })
        .filter((item): item is { entity: GridEntity; row: number; col: number } => item !== null);
    }
  } else if (selector === 'all_entities') {
    candidates = allEntities;
  } else if (selector === 'all_pets') {
    candidates = allEntities.filter(item => item.entity.type === 'pet');
  } else if (selector === 'all_workers') {
    candidates = allEntities.filter(item => item.entity.type === 'worker');
  }

  const excludeSelf = Boolean(filters.excludeSelf);
  return candidates.filter(item => {
    if (excludeSelf && source && item.entity.id === source.entity.id) return false;
    return entityMatchesFilters(item.entity, filters);
  });
}

function getPassiveSkillsForEntity(entity: GridEntity, trigger: SkillTrigger): RuntimeSkillBinding[] {
  const definition = getRuntimeCardDefinition(entity.cardId);
  return (definition?.skills ?? []).filter(skill => skill.trigger === trigger);
}

function emitSkillTriggeredEvent(
  ctx: ResolutionContext,
  input: SkillExecutionInput,
  operationKind?: string,
  target?: { entity: GridEntity; row: number; col: number }
): void {
  if (!input.skill) return;
  addEvent(ctx, {
    type: 'skill_triggered',
    skillId: input.skill.id,
    templateId: input.skill.templateId,
    trigger: input.trigger,
    sourceCardId: input.skill.templateId.startsWith('action_') ? input.card?.id ?? input.skill.templateId : input.source?.entity.cardId ?? input.skill.templateId,
    sourceEntityId: input.source?.entity.id,
    targetEntityId: target?.entity.id,
    targetRow: target?.row,
    targetCol: target?.col,
    operationKind,
  });
}

function getAllSkillsForEntity(entity: GridEntity): RuntimeSkillBinding[] {
  const definition = getRuntimeCardDefinition(entity.cardId);
  return definition?.skills ?? [];
}

function entityHasOperation(entity: GridEntity, kind: string): boolean {
  return getAllSkillsForEntity(entity).some(skill =>
    (skill.operations ?? []).some(operation => resolveSkillOperation(skill, operation).kind === kind)
  );
}

function resolveAnchorPosition(
  _state: GameState,
  input: SkillExecutionInput,
  selector: string
): { row: number; col: number } | null {
  if (selector === 'self' && input.source) return { row: input.source.row, col: input.source.col };
  if (selector === 'target' && input.targetRow !== undefined && input.targetCol !== undefined) {
    return { row: input.targetRow, col: input.targetCol };
  }
  if (selector === 'second_target' && input.targetRow2 !== undefined && input.targetCol2 !== undefined) {
    return { row: input.targetRow2, col: input.targetCol2 };
  }
  if (selector === 'self' && input.meltdown) return { row: input.meltdown.row, col: input.meltdown.col };
  if (selector === 'self' && input.stress) return { row: input.stress.row, col: input.stress.col };
  return null;
}

function adjustEntityStress(
  ctx: ResolutionContext,
  row: number,
  col: number,
  amount: number,
  source: StressSource
): StressResolutionResult | null {
  if (amount === 0) return null;
  if (amount > 0) {
    return addStressInState(ctx, row, col, amount, source);
  }
  const entity = ctx.draft.grid[row]?.[col];
  if (!entity) return null;
  ctx.draft.grid[row][col] = {
    ...entity,
    stress: Math.max(0, entity.stress + amount),
  };
  emitStatusBurst(ctx, {
    kind: 'stress_relief',
    theme: 'buff',
    title: '安抚减压',
    subtitle: `压力 ${amount}`,
    row,
    col,
  });
  return {
    outcome: 'applied',
    row,
    col,
    entityId: entity.id,
    entityName: entity.name,
    stress: Math.max(0, entity.stress + amount),
    maxStress: entity.maxStress,
  };
}

function executeSkillOperation(
  ctx: ResolutionContext,
  input: SkillExecutionInput,
  operation: SkillOperation,
  options?: { incomeCalculation?: IncomeCalculation }
): boolean {
  const state = ctx.draft;
  const params = operation.params ?? {};
  const filters = operation.filters ?? {};
  const selector = operation.selector ?? 'self';

  if (!operation.kind) return true;

  if (operation.kind === 'set_stress') {
    const targets = collectTargetsForSelector(state, input, selector, filters);
    if (targets.length === 0) return false;
    const value = Math.max(0, Number(params.value ?? 0));
    targets.forEach(target => {
      state.grid[target.row][target.col] = { ...target.entity, stress: Math.min(value, target.entity.maxStress) };
      emitSkillTriggeredEvent(ctx, input, operation.kind, target);
      emitStatusBurst(ctx, {
        kind: 'stress_relief',
        theme: 'buff',
        title: '安抚减压',
        subtitle: value > 0 ? `压力设为 ${value}` : '压力归零',
        row: target.row,
        col: target.col,
      });
    });
    return true;
  }

  if (operation.kind === 'multiply_income_turn') {
    const entityType = String(filters.entityType ?? params.entityType ?? '');
    const multiplier = Math.max(1, Number(params.multiplier ?? 1));
    const kind = entityType === 'pet' ? 'pet_income_boost' : 'worker_income_boost';
    const visual = resolveStatusVisual(kind, 'buff');
    if (entityType === 'pet') state.petIncomeMultiplierThisTurn *= multiplier;
    else if (entityType === 'worker') state.workerIncomeMultiplierThisTurn *= multiplier;
    else return false;

    addGlobalStatus(ctx, {
      kind,
      scope: 'global',
      sourceCardId: input.card?.id ?? input.source?.entity.cardId ?? 'skill',
      sourceSkillId: input.skill?.id,
      title: visual.title,
      shortLabel: visual.shortLabel,
      theme: visual.theme,
      duration: 1,
      maxDuration: 1,
      durationUnit: 'turn',
      stacks: 1,
      iconKey: visual.iconKey,
      vfxKey: visual.vfxKey,
      appliedTurn: state.turn,
      description: input.skill?.descriptionPreview || input.skill?.summary || `本回合 ${entityType} 收益 x${multiplier}`,
      params: { entityType, multiplier },
    });
    emitSkillTriggeredEvent(ctx, input, operation.kind);
    emitStatusBurst(ctx, {
      kind,
      theme: visual.theme,
      title: visual.title,
      subtitle: `本回合收益 x${multiplier}`,
      global: true,
      color: visual.color,
    });
    return true;
  }

  if (operation.kind === 'queue_card_next_turn') {
    const queuedId = String(params.cardId ?? '');
    const queuedRaw =
      queuedId === 'action_resentment'
        ? null
        : (actionsConfig as unknown as Card[]).find(item => item.id === queuedId) ?? null;
    const next = queuedId === 'action_resentment' ? resentmentCard() : queuedRaw ? normalizeCard(queuedRaw) : null;
    if (!next) return false;
    state.pendingCardsNextTurnDiscard = [...state.pendingCardsNextTurnDiscard, next];
    const visual = resolveStatusVisual('queued_resentment', 'debuff');
    addGlobalStatus(ctx, {
      kind: visual.kind,
      scope: 'global',
      sourceCardId: input.card?.id ?? input.source?.entity.cardId ?? 'skill',
      sourceSkillId: input.skill?.id,
      title: visual.title,
      shortLabel: visual.shortLabel,
      theme: visual.theme,
      duration: 1,
      maxDuration: 1,
      durationUnit: 'turn',
      stacks: 1,
      iconKey: visual.iconKey,
      vfxKey: visual.vfxKey,
      appliedTurn: state.turn,
      description: input.skill?.descriptionPreview || input.skill?.summary || `下回合开始时加入 ${queuedId}`,
      params: { cardId: queuedId },
    });
    emitSkillTriggeredEvent(ctx, input, operation.kind);
    emitStatusBurst(ctx, {
      kind: visual.kind,
      theme: visual.theme,
      title: visual.title,
      subtitle: `下回合注入 ${next.name}`,
      global: true,
      color: visual.color,
    });
    return true;
  }

  if (operation.kind === 'swap_entities') {
    if (
      input.targetRow === undefined ||
      input.targetCol === undefined ||
      input.targetRow2 === undefined ||
      input.targetCol2 === undefined
    ) {
      return false;
    }
    if (!cellDurabilityOk(state, input.targetRow, input.targetCol) || !cellDurabilityOk(state, input.targetRow2, input.targetCol2)) {
      return false;
    }
    const first = state.grid[input.targetRow][input.targetCol];
    const second = state.grid[input.targetRow2][input.targetCol2];
    if (!first || !second) return false;
    if (input.targetRow === input.targetRow2 && input.targetCol === input.targetCol2) return false;
    state.grid[input.targetRow][input.targetCol] = { ...second, position: { row: input.targetRow, col: input.targetCol } };
    state.grid[input.targetRow2][input.targetCol2] = { ...first, position: { row: input.targetRow2, col: input.targetCol2 } };
    emitSkillTriggeredEvent(ctx, input, operation.kind, {
      entity: first,
      row: input.targetRow,
      col: input.targetCol,
    });
    addEvent(ctx, {
      type: 'entity_moved',
      fromRow: input.targetRow,
      fromCol: input.targetCol,
      toRow: input.targetRow2,
      toCol: input.targetCol2,
      entityId: first.id,
    });
    addEvent(ctx, {
      type: 'entity_moved',
      fromRow: input.targetRow2,
      fromCol: input.targetCol2,
      toRow: input.targetRow,
      toCol: input.targetCol,
      entityId: second.id,
    });
    return true;
  }

  if (operation.kind === 'adjust_stress_by_selector') {
    const amount = Number(params.amount ?? 0);
    const reason = String(params.reason ?? 'skill') as StressSource;
    const targets = collectTargetsForSelector(state, input, selector, filters);
    targets.forEach(target => {
      adjustEntityStress(ctx, target.row, target.col, amount, reason);
      emitSkillTriggeredEvent(ctx, input, operation.kind, target);
    });
    return true;
  }

  if (operation.kind === 'remove_entity') {
    const targets = collectTargetsForSelector(state, input, selector, filters);
    if (targets.length === 0) return false;
    const reason = String(params.reason ?? 'action') as 'action' | 'meltdown' | 'movement' | 'replacement';
    targets.forEach(target => {
      removeEntityStatuses(ctx, target.entity.id, 'entity_removed');
      state.grid[target.row][target.col] = null;
      emitSkillTriggeredEvent(ctx, input, operation.kind, target);
      addEvent(ctx, {
        type: 'entity_removed',
        row: target.row,
        col: target.col,
        entityId: target.entity.id,
        cardId: target.entity.cardId,
        reason,
      });
    });
    return true;
  }

  if (operation.kind === 'adjust_stress_adjacent') {
    const anchor = resolveAnchorPosition(state, input, selector);
    if (!anchor) return false;
    const amount = Number(params.amount ?? 0);
    const reason = String(params.reason ?? 'skill_adjacent') as StressSource;
    getAdjacentOrthogonalCells(anchor.row, anchor.col).forEach(cell => {
      const entity = getEntityAt(state, cell.row, cell.col);
      if (!entity || !entityMatchesFilters(entity, filters)) return;
      adjustEntityStress(ctx, cell.row, cell.col, amount, reason);
      emitSkillTriggeredEvent(ctx, input, operation.kind, { entity, row: cell.row, col: cell.col });
    });
    return true;
  }

  if (operation.kind === 'draw_cards') {
    const count = Math.max(0, Number(params.count ?? 0));
    const sourceEntity = input.source?.entity;
    drawCardsInState(ctx, count, {
      source: input.card ? 'action' : 'skill',
      sourceLabel: input.card?.name ?? sourceEntity?.name ?? '技能抽牌',
      sourceCardId: input.card?.id ?? sourceEntity?.cardId,
      sourceEntityId: sourceEntity?.id,
      sourceRow: input.source?.row,
      sourceCol: input.source?.col,
      uiMode: input.card ? 'store_event' : 'manual',
    });
    emitSkillTriggeredEvent(ctx, input, operation.kind);
    return true;
  }

  if (operation.kind === 'return_entity_to_hand') {
    const targets = collectTargetsForSelector(state, input, selector, filters);
    if (targets.length === 0) return false;
    targets.forEach(target => {
      const cardTemplate = getEntityCardTemplate(target.entity.cardId);
      if (!cardTemplate) return;
      removeEntityStatuses(ctx, target.entity.id, 'entity_removed');
      state.grid[target.row][target.col] = null;
      state.hand = [...state.hand, cardTemplate];
      emitSkillTriggeredEvent(ctx, input, operation.kind, target);
      addEvent(ctx, {
        type: 'entity_removed',
        row: target.row,
        col: target.col,
        entityId: target.entity.id,
        cardId: target.entity.cardId,
        reason: 'action',
      });
    });
    return true;
  }

  if (operation.kind === 'income_modifier_aura') {
    if (!options?.incomeCalculation || !input.source) return false;
    const percent = Number(params.percent ?? 0);
    const statusKind = typeof params.statusKind === 'string' ? params.statusKind : undefined;
    const targets = collectTargetsForSelector(state, input, selector, filters);
    targets.forEach(target => {
      options.incomeCalculation?.modifiers.push({
        targetEntityId: target.entity.id,
        targetRow: target.row,
        targetCol: target.col,
        percent,
        sourceCardId: input.source!.entity.cardId,
        sourceEntityId: input.source!.entity.id,
        statusKind,
      });
      emitSkillTriggeredEvent(ctx, input, operation.kind, target);
      addEvent(ctx, {
        type: 'income_modifier_applied',
        sourceCardId: input.source!.entity.cardId,
        sourceEntityId: input.source!.entity.id,
        targetEntityId: target.entity.id,
        targetRow: target.row,
        targetCol: target.col,
        percent,
      });
    });
    return true;
  }

  if (operation.kind === 'modify_interest_rule') {
    if (!options?.incomeCalculation || !input.source) return false;
    const threshold = Math.max(1, Number(params.threshold ?? 10));
    options.incomeCalculation.interestThreshold = Math.min(options.incomeCalculation.interestThreshold, threshold);
    emitSkillTriggeredEvent(ctx, input, operation.kind, input.source);
    addEvent(ctx, {
      type: 'interest_rule_applied',
      sourceCardId: input.source.entity.cardId,
      sourceEntityId: input.source.entity.id,
      threshold,
    });
    return true;
  }

  if (operation.kind === 'modify_meltdown_radius') {
    if (!input.meltdown || !input.source) return false;
    if (input.source.row !== input.meltdown.row || input.source.col !== input.meltdown.col) return true;
    input.meltdown.radius = Math.max(input.meltdown.radius, Number(params.radius ?? 1));
    emitSkillTriggeredEvent(ctx, input, operation.kind, input.source);
    return true;
  }

  if (operation.kind === 'prevent_meltdown') {
    if (!input.meltdown || !input.source) return false;
    if (input.source.row !== input.meltdown.row || input.source.col !== input.meltdown.col) return true;
    input.meltdown.prevented = true;
    emitSkillTriggeredEvent(ctx, input, operation.kind, input.source);
    emitStatusBurst(ctx, {
      kind: input.skill?.templateId ?? 'prevent_meltdown',
      theme: 'passive',
      title: input.source.entity.name,
      subtitle: '本次拆家被免疫',
      row: input.source.row,
      col: input.source.col,
    });
    return true;
  }

  if (operation.kind === 'prevent_adjacent_stress') {
    if (!input.stress || !input.source) return false;
    if (input.stress.source !== 'skill_adjacent') return true;
    if (input.source.row !== input.stress.row || input.source.col !== input.stress.col) return true;
    input.stress.prevented = true;
    emitSkillTriggeredEvent(ctx, input, operation.kind, input.source);
    return true;
  }

  if (operation.kind === 'on_meltdown_gain_cans') {
    if (!input.source || !input.meltdown) return false;
    const amount = Math.max(0, Number(params.amount ?? 0));
    addCans(state, amount);
    emitSkillTriggeredEvent(ctx, input, operation.kind, input.source);
    addEvent(ctx, {
      type: 'cans_granted_by_skill',
      sourceCardId: input.source.entity.cardId,
      sourceEntityId: input.source.entity.id,
      amount,
    });
    emitStatusBurst(ctx, {
      kind: 'worker_gain_cans_on_meltdown',
      theme: 'buff',
      title: input.source.entity.name,
      subtitle: `废墟捡回 ${amount} 罐头`,
      row: input.source.row,
      col: input.source.col,
    });
    return true;
  }

  return false;
}

function executeSkill(
  ctx: ResolutionContext,
  input: SkillExecutionInput,
  options?: { incomeCalculation?: IncomeCalculation }
): boolean {
  if (!input.skill) return false;
  const operations = input.skill.operations ?? [];
  if (operations.length === 0) return false;
  for (const rawOperation of operations) {
    const operation = resolveSkillOperation(input.skill, rawOperation);
    const ok = executeSkillOperation(ctx, input, operation, options);
    if (!ok) return false;
  }
  return true;
}

function executeEntityTrigger(
  ctx: ResolutionContext,
  trigger: SkillTrigger,
  options?: {
    source?: SkillEntitySource;
    targetRow?: number;
    targetCol?: number;
    targetRow2?: number;
    targetCol2?: number;
    stress?: SkillExecutionInput['stress'];
    meltdown?: SkillExecutionInput['meltdown'];
    incomeCalculation?: IncomeCalculation;
  }
): void {
  const sources =
    options?.source != null
      ? [options.source]
      : getResolutionOrderSnapshot(ctx.draft)
          .map(unit => {
            const entity = ctx.draft.grid[unit.row]?.[unit.col];
            if (!entity || entity.id !== unit.entityId) return null;
            return { entity, row: unit.row, col: unit.col };
          })
          .filter((item): item is SkillEntitySource => item !== null);

  sources.forEach(source => {
    const live = ctx.draft.grid[source.row]?.[source.col];
    if (!live || live.id !== source.entity.id) return;
    getPassiveSkillsForEntity(live, trigger).forEach(skill => {
      executeSkill(
        ctx,
        {
          trigger,
          skill,
          source: { entity: live, row: source.row, col: source.col },
          targetRow: options?.targetRow,
          targetCol: options?.targetCol,
          targetRow2: options?.targetRow2,
          targetCol2: options?.targetCol2,
          stress: options?.stress,
          meltdown: options?.meltdown,
        },
        options?.incomeCalculation ? { incomeCalculation: options.incomeCalculation } : undefined
      );
    });
  });
}

function buildIncomeCalculation(ctx: ResolutionContext): IncomeCalculation {
  const calculation: IncomeCalculation = {
    interestThreshold: 10,
    modifiers: [],
  };
  executeEntityTrigger(ctx, 'income_calc', { incomeCalculation: calculation });
  return calculation;
}

function emitStatusBurst(
  ctx: ResolutionContext,
  options: {
    kind: string;
    theme: StatusTheme;
    title: string;
    subtitle: string;
    row?: number;
    col?: number;
    global?: boolean;
    color?: number;
  }
): void {
  const visual = resolveStatusVisual(options.kind, options.theme);
  addPresentation(ctx, {
    type: 'status_burst',
    statusKind: options.kind,
    theme: options.theme,
    title: options.title,
    subtitle: options.subtitle,
    row: options.row,
    col: options.col,
    global: options.global,
    color: options.color ?? visual.color,
  });
}

function addGlobalStatus(
  ctx: ResolutionContext,
  statusInput: Omit<StatusInstance, 'id' | 'targetEntityId'>
): StatusInstance {
  const state = ctx.draft;
  const next: StatusInstance = {
    ...statusInput,
    id: makeStatusId(state),
  };
  state.globalStatuses = [...state.globalStatuses.filter(status => status.kind !== next.kind), next];
  addEvent(ctx, { type: 'status_added', status: cloneStatus(next) });
  return next;
}

function removeEntityStatuses(
  ctx: ResolutionContext,
  entityId: string,
  reason: 'expired' | 'entity_removed' | 'consumed' | 'replaced'
): void {
  const statuses = ctx.draft.entityStatuses[entityId] ?? [];
  if (statuses.length === 0) return;
  const cell = findEntityCellById(ctx.draft, entityId);
  statuses.forEach(status => {
    addEvent(ctx, {
      type: 'status_removed',
      statusId: status.id,
      statusKind: status.kind,
      targetEntityId: entityId,
      targetRow: cell?.row,
      targetCol: cell?.col,
      reason,
    });
  });
  delete ctx.draft.entityStatuses[entityId];
}

function removeGlobalStatusByKind(
  ctx: ResolutionContext,
  kind: string,
  reason: 'expired' | 'entity_removed' | 'consumed' | 'replaced'
): void {
  const removed = ctx.draft.globalStatuses.filter(status => status.kind === kind);
  if (removed.length === 0) return;
  removed.forEach(status => {
    addEvent(ctx, {
      type: 'status_removed',
      statusId: status.id,
      statusKind: status.kind,
      reason,
    });
  });
  ctx.draft.globalStatuses = ctx.draft.globalStatuses.filter(status => status.kind !== kind);
}

function tickGlobalStatusesForNewTurn(ctx: ResolutionContext): void {
  const kept: StatusInstance[] = [];
  for (const status of ctx.draft.globalStatuses) {
    if (status.isPassive) {
      kept.push(status);
      continue;
    }
    const nextDuration = Math.max(0, status.duration - 1);
    if (nextDuration <= 0) {
      addEvent(ctx, {
        type: 'status_removed',
        statusId: status.id,
        statusKind: status.kind,
        reason: 'expired',
      });
      emitStatusBurst(ctx, {
        kind: status.kind,
        theme: status.theme,
        title: status.title,
        subtitle: '效果结束',
        global: true,
      });
      continue;
    }
    const updated = { ...status, duration: nextDuration };
    kept.push(updated);
    addEvent(ctx, { type: 'status_updated', status: cloneStatus(updated) });
  }
  ctx.draft.globalStatuses = kept;
}

function attachPassiveStatuses(ctx: ResolutionContext, entity: GridEntity): void {
  const passives = getPassiveStatusesForCard(entity.cardId);
  if (passives.length === 0) return;
  const cell = findEntityCellById(ctx.draft, entity.id);
  ctx.draft.entityStatuses[entity.id] = passives.map(status => ({
    ...cloneStatus(status),
    targetEntityId: entity.id,
  }));
  passives.forEach(status => {
    addEvent(ctx, {
      type: 'status_added',
      status: { ...cloneStatus(status), targetEntityId: entity.id },
      targetRow: cell?.row,
      targetCol: cell?.col,
    });
  });
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
  const list = actionsConfig as unknown as Card[];
  const raw = list.find(c => c.id === 'action_resentment');
  return raw ? normalizeCard(raw) : null;
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

function calculateInterest(state: GameState, threshold = 10): number {
  state.interest = Math.floor(state.cans / Math.max(1, threshold));
  return state.interest;
}

function getIncomeBreakdown(
  state: GameState,
  incomeCalculation?: IncomeCalculation
): IncomeBreakdown {
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
      const modifiers = incomeCalculation?.modifiers.filter(modifier => modifier.targetEntityId === entity.id) ?? [];
      if (modifiers.length > 0) {
        const totalPercent = modifiers.reduce((sum, modifier) => sum + modifier.percent, 0);
        income = Math.max(0, Math.floor(income * (1 + totalPercent / 100)));
      }
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

  tickGlobalStatusesForNewTurn(ctx);
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
  if (inject.length > 0) {
    const queued = state.globalStatuses.find(status => status.kind === 'queued_resentment');
    if (queued) {
      addEvent(ctx, {
        type: 'status_triggered',
        statusId: queued.id,
        statusKind: queued.kind,
        sourceCardId: queued.sourceCardId,
      });
      emitStatusBurst(ctx, {
        kind: queued.kind,
        theme: queued.theme,
        title: queued.title,
        subtitle: '怨气卡已注入弃牌堆',
        global: true,
      });
      removeGlobalStatusByKind(ctx, queued.kind, 'consumed');
    }
  }
  addEvent(ctx, { type: 'turn_started', turn: state.turn });

  maybeEndGameByVictoryWindow(state, ctx);
  if (state.gameStatus !== 'playing') return null;

  executeEntityTrigger(ctx, 'turn_start');

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

  const meltdownContext: NonNullable<SkillExecutionInput['meltdown']> = {
    row,
    col,
    prevented: false,
    radius: 1,
  };
  executeEntityTrigger(ctx, 'before_meltdown', {
    source: { entity, row, col },
    meltdown: meltdownContext,
  });
  if (meltdownContext.prevented) {
    state.grid[row][col] = { ...entity, stress: entity.maxStress };
    const result: StressResolutionResult = {
      outcome: 'applied',
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

  removeEntityStatuses(ctx, entity.id, 'entity_removed');
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

  for (const cell of getSquareRadiusCells(row, col, meltdownContext.radius)) {
    const nr = cell.row;
    const nc = cell.col;
    const splashTarget = state.grid[nr][nc];
    if (splashTarget && entityHasOperation(splashTarget, 'prevent_meltdown_splash')) {
      continue;
    }
    state.cellDurability[nr][nc] -= 1;
    if (state.cellDurability[nr][nc] <= 0) {
      state.cellDurability[nr][nc] = 0;
      const destroyed = state.grid[nr][nc];
      if (destroyed) {
        removeEntityStatuses(ctx, destroyed.id, 'entity_removed');
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
  executeEntityTrigger(ctx, 'after_meltdown', { meltdown: meltdownContext });
  return result;
}

function addStressInState(
  ctx: ResolutionContext,
  row: number,
  col: number,
  amount: number,
  source: StressSource = 'system'
): StressResolutionResult | null {
  const state = ctx.draft;
  if (state.gameStatus !== 'playing') return null;
  const entity = state.grid[row]?.[col];
  if (!entity) return null;

  const stressContext: NonNullable<SkillExecutionInput['stress']> = {
    row,
    col,
    amount,
    source,
    prevented: false,
  };
  executeEntityTrigger(ctx, 'before_stress_apply', {
    source: { entity, row, col },
    stress: stressContext,
  });
  if (stressContext.prevented) {
    return null;
  }

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
  const definition = getRuntimeCardDefinition(card.id);
  const skills = definition?.skills?.filter(skill => skill.trigger === 'on_play') ?? [];
  if (skills.length === 0) return false;

  for (const skill of skills) {
    const ok = executeSkill(ctx, {
      trigger: 'on_play',
      card,
      skill,
      targetRow,
      targetCol,
      targetRow2,
      targetCol2,
    });
    if (!ok) return false;
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
    attachPassiveStatuses(ctx, entity);
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
    const incomeCalculation = buildIncomeCalculation(ctx);
    calculateInterest(ctx.draft, incomeCalculation.interestThreshold);
    const breakdown = getIncomeBreakdown(ctx.draft, incomeCalculation);
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
  attachPassiveStatuses(ctx, entity);
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

  removeEntityStatuses(ctx, entity.id, 'entity_removed');
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
  addStressInState(ctx, row, col, amount, 'system');
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

    const incomeCalculation = buildIncomeCalculation(ctx);
    calculateInterest(ctx.draft, incomeCalculation.interestThreshold);
    const breakdown = getIncomeBreakdown(ctx.draft, incomeCalculation);
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
      if (live.type === 'pet') {
        const status = ctx.draft.globalStatuses.find(item => item.kind === 'pet_income_boost');
        if (status) {
          addEvent(ctx, {
            type: 'status_triggered',
            statusId: status.id,
            statusKind: status.kind,
            targetEntityId: live.id,
            targetRow: unit.row,
            targetCol: unit.col,
            sourceCardId: status.sourceCardId,
          });
        }
      } else if (live.type === 'worker') {
        const status = ctx.draft.globalStatuses.find(item => item.kind === 'worker_income_boost');
        if (status) {
          addEvent(ctx, {
            type: 'status_triggered',
            statusId: status.id,
            statusKind: status.kind,
            targetEntityId: live.id,
            targetRow: unit.row,
            targetCol: unit.col,
            sourceCardId: status.sourceCardId,
          });
        }
      }
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
      if (live.type === 'pet' && ctx.draft.globalStatuses.some(status => status.kind === 'pet_income_boost')) {
        pushStep(ctx, ctx.draft, [
          {
            type: 'status_burst',
            statusKind: 'pet_income_boost',
            theme: 'buff',
            title: '萌宠收益提升',
            subtitle: '增益已生效',
            row: unit.row,
            col: unit.col,
            color: resolveStatusVisual('pet_income_boost', 'buff').color,
          },
        ]);
      }
      if (live.type === 'worker' && ctx.draft.globalStatuses.some(status => status.kind === 'worker_income_boost')) {
        pushStep(ctx, ctx.draft, [
          {
            type: 'status_burst',
            statusKind: 'worker_income_boost',
            theme: 'buff',
            title: '牛马收益提升',
            subtitle: '增益已生效',
            row: unit.row,
            col: unit.col,
            color: resolveStatusVisual('worker_income_boost', 'buff').color,
          },
        ]);
      }
      if (ctx.draft.gameStatus !== 'playing') {
        break;
      }
    }

    if (ctx.draft.gameStatus === 'playing' && breakdown.interest > 0) {
      addCans(ctx.draft, breakdown.interest);
      pushStep(ctx, ctx.draft, [
        { type: 'spawn_hud_float', text: `利息 +${breakdown.interest}`, tone: 'warning', color: 0xfff9c4 },
      ]);
    }

    if (ctx.draft.gameStatus === 'playing' && breakdown.streakBonus > 0) {
      addCans(ctx.draft, breakdown.streakBonus);
      pushStep(ctx, ctx.draft, [
        { type: 'spawn_hud_float', text: `连胜 +${breakdown.streakBonus}`, tone: 'success', color: 0xabebc6 },
      ]);
    }

    if (ctx.draft.gameStatus === 'playing') {
      const heartsGain = Math.floor(entityIncomeSum * HEARTS_ENTITY_INCOME_MULTIPLIER);
      if (heartsGain > 0) {
        addHearts(ctx.draft, heartsGain);
        pushStep(ctx, ctx.draft, [
          { type: 'spawn_hud_float', text: `人气 +${heartsGain}`, tone: 'info', color: 0xffd6e8 },
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

    executeEntityTrigger(ctx, 'turn_end');

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

      const result = addStressInState(ctx, unit.row, unit.col, 1, 'turn_end');
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
          tone: 'warning',
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
        const presentation: PresentationEvent[] = [
          {
            type: 'show_phase_banner',
            title: `第 ${ctx.draft.turn} 回合 · 准备阶段`,
            holdMs: 520,
          },
        ];
        if (drawEvent) {
          presentation.push({ type: 'play_draw_event', event: drawEvent });
        }
        pushStep(ctx, ctx.draft, presentation);
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
