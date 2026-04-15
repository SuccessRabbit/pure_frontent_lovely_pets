import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Card } from '../types/card';
import type { StatusInstance } from '../game/status/statusTypes';
import {
  CELL_DURABILITY_MAX,
  HEARTS_ENTITY_INCOME_MULTIPLIER,
  PLAYER_HP_START,
  STARTING_CANS,
  VICTORY_HEARTS,
} from '@config/gameRules';
import { createRestartInitialDeck, runGameCommand } from '../game/rules/ResolutionEngine';

const DEBUG_STORE_FLOW = true;

function createFullDurability(): number[][] {
  return Array(3)
    .fill(null)
    .map(() => Array(6).fill(CELL_DURABILITY_MAX));
}

function logStoreFlow(message: string, payload?: unknown) {
  if (!DEBUG_STORE_FLOW) return;
  if (payload === undefined) {
    console.log(`[StoreFlow] ${message}`);
  } else {
    console.log(`[StoreFlow] ${message}`, payload);
  }
}

// 网格实体类型
export interface GridEntity {
  id: string;
  cardId: string;
  type: 'pet' | 'worker';
  name: string;
  health: number;
  maxHealth: number;
  attack: number;
  income: number;
  stress: number;
  maxStress: number;
  tags: string[];
  position: { row: number; col: number };
  isExhausted: boolean; // 本回合是否已行动
}

// 游戏阶段
export type GamePhase = 'preparation' | 'action' | 'income' | 'end';

export type GameStatus = 'playing' | 'won' | 'lost';
export type GameEndReason = 'hp' | 'grid' | 'hearts';

/** 收入结算明细（用于 UI 逐格飘字） */
export interface IncomeBreakdown {
  entities: { row: number; col: number; income: number; name: string }[];
  interest: number;
  streakBonus: number;
  total: number;
}

export interface DrawCardsMeta {
  source?: 'setup' | 'turn_start' | 'action' | 'skill' | 'system';
  sourceLabel?: string;
  sourceCardId?: string;
  sourceEntityId?: string;
  sourceRow?: number;
  sourceCol?: number;
  uiMode?: 'store_event' | 'manual';
}

export interface DrawEvent {
  id: number;
  countRequested: number;
  drawnCards: Card[];
  reshuffled: boolean;
  deckBefore: number;
  deckAfter: number;
  discardBefore: number;
  discardAfter: number;
  handBefore: number;
  handAfter: number;
  source: NonNullable<DrawCardsMeta['source']>;
  sourceLabel: string;
  sourceCardId?: string;
  sourceEntityId?: string;
  sourceRow?: number;
  sourceCol?: number;
}

export interface StressResolutionResult {
  outcome: 'applied' | 'black_red' | 'meltdown';
  row: number;
  col: number;
  entityId: string;
  entityName: string;
  stress: number;
  maxStress: number;
  bonusIncome?: number;
}

// 游戏状态
export interface GameState {
  // 基础状态
  turn: number;
  phase: GamePhase;

  // 经济系统
  cans: number; // 小罐头数量
  interest: number; // 利息（每10罐头+1）
  winStreak: number; // 连胜次数
  loseStreak: number; // 连败次数

  /** 小红心（通关分数） */
  hearts: number;
  playerHp: number;
  maxPlayerHp: number;

  /** 工位耐久，<=0 为废墟 */
  cellDurability: number[][];

  gameStatus: GameStatus;
  endReason: GameEndReason | null;

  // 网格系统 (3行6列)
  grid: (GridEntity | null)[][];

  // 手牌系统
  hand: Card[];
  deck: Card[];
  discardPile: Card[];

  // 压力系统
  globalStress: number; // 全局压力值
  meltdownHistory: Array<{
    turn: number;
    entityId: string;
    success: boolean; // true=爆发成功5倍收益, false=完全崩溃
  }>;

  /** 本回合收入结算：萌宠、牛马倍率（行动牌「全屏打赏」「画大饼」等） */
  petIncomeMultiplierThisTurn: number;
  workerIncomeMultiplierThisTurn: number;
  /** 下回合开始时置入弃牌堆（如画大饼生成的怨气卡） */
  pendingCardsNextTurnDiscard: Card[];
  /** 本日结算后手牌超过上限，需先弃牌/打出整理后才能进入次日抽牌 */
  awaitingHandTrim: boolean;
  lastDrawEvent: DrawEvent | null;
  nextDrawEventId: number;
  entityStatuses: Record<string, StatusInstance[]>;
  globalStatuses: StatusInstance[];
  nextStatusId: number;
}

// 游戏操作
export interface GameActions {
  // 回合控制
  nextPhase: () => void;
  endTurn: () => void;
  /** 仅切换阶段，不触发收入等副作用（由界面驱动自动回合） */
  setPhase: (phase: GamePhase) => void;
  /** 先 ensure calculateInterest；再读取分解与总额 */
  getIncomeBreakdown: () => IncomeBreakdown;
  /** 将结算总额加入罐头（收入阶段动画结束后调用） */
  applyIncomeTotal: (total: number) => void;
  /** 收入阶段：罐头 + 小红心（仅 playing） */
  applyIncomePhaseFromBreakdown: (breakdown: IncomeBreakdown) => void;
  /** 回合末：场上每个单位 +1 暴躁度（可触发拆家逻辑） */
  applyTurnEndStress: () => void;

  // 经济操作
  addCans: (amount: number) => void;
  addHearts: (amount: number) => void;
  spendCans: (amount: number) => boolean;
  calculateInterest: () => number;

  // 网格操作
  placeEntity: (card: Card, row: number, col: number) => boolean;
  removeEntity: (row: number, col: number) => void;
  moveEntity: (fromRow: number, fromCol: number, toRow: number, toCol: number) => boolean;
  getEntity: (row: number, col: number) => GridEntity | null;
  /** 花罐头修复废墟工位 */
  rebuildCell: (row: number, col: number) => boolean;

  // 手牌操作
  drawCards: (count: number, meta?: DrawCardsMeta) => DrawEvent | null;
  playCard: (
    cardIndex: number,
    targetRow?: number,
    targetCol?: number,
    targetRow2?: number,
    targetCol2?: number
  ) => boolean;
  /** 打牌/效果结算后从手牌移入弃牌堆（不检查 canDiscard） */
  removeHandCardAfterPlay: (cardIndex: number) => void;
  /** 手里超上限或 awaitingHandTrim 时：弃一张可弃牌；不可弃则返回 false */
  discardHandCardForTrim: (cardIndex: number) => boolean;
  /** 手牌已不超过上限时结束整理并执行进入次日与抽牌 */
  finishHandTrimAndAdvanceTurn: (drawMeta?: DrawCardsMeta) => DrawEvent | null;

  // 压力系统
  addStress: (row: number, col: number, amount: number) => StressResolutionResult | null;
  triggerMeltdown: (row: number, col: number) => StressResolutionResult | null;

  // 游戏初始化
  initGame: (initialDeck?: Card[]) => void;
  resetGame: () => void;
  /** 胜负界面：新开一局（重洗牌库） */
  restartRun: () => void;
}

// 初始化空网格
const createEmptyGrid = (): (GridEntity | null)[][] => {
  return Array(3).fill(null).map(() => Array(6).fill(null));
};

// 初始状态
const initialState: GameState = {
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
};

export function snapshotGameState(source: GameState): GameState {
  return {
    turn: source.turn,
    phase: source.phase,
    cans: source.cans,
    interest: source.interest,
    winStreak: source.winStreak,
    loseStreak: source.loseStreak,
    hearts: source.hearts,
    playerHp: source.playerHp,
    maxPlayerHp: source.maxPlayerHp,
    cellDurability: source.cellDurability,
    gameStatus: source.gameStatus,
    endReason: source.endReason,
    grid: source.grid,
    hand: source.hand,
    deck: source.deck,
    discardPile: source.discardPile,
    globalStress: source.globalStress,
    meltdownHistory: source.meltdownHistory,
    petIncomeMultiplierThisTurn: source.petIncomeMultiplierThisTurn,
    workerIncomeMultiplierThisTurn: source.workerIncomeMultiplierThisTurn,
    pendingCardsNextTurnDiscard: source.pendingCardsNextTurnDiscard,
    awaitingHandTrim: source.awaitingHandTrim,
    lastDrawEvent: source.lastDrawEvent,
    nextDrawEventId: source.nextDrawEventId,
    entityStatuses: source.entityStatuses,
    globalStatuses: source.globalStatuses,
    nextStatusId: source.nextStatusId,
  };
}

function applyResolutionState(
  set: (
    partial:
      | Partial<GameState>
      | ((state: GameState) => Partial<GameState>)
  ) => void,
  result: { success: boolean; nextState: GameState }
): boolean {
  if (!result.success) return false;
  set(result.nextState);
  return true;
}

export const useGameStore = create<GameState & GameActions>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // 进入下一阶段
      nextPhase: () => {
        applyResolutionState(set, runGameCommand(snapshotGameState(get()), { type: 'next_phase' }));
      },

      setPhase: (phase: GamePhase) => {
        applyResolutionState(
          set,
          runGameCommand(snapshotGameState(get()), { type: 'set_phase', phase })
        );
      },

      getIncomeBreakdown: () => {
        const { grid, interest, winStreak, petIncomeMultiplierThisTurn, workerIncomeMultiplierThisTurn } =
          get();
        const petM = Math.max(1, petIncomeMultiplierThisTurn);
        const workerM = Math.max(1, workerIncomeMultiplierThisTurn);
        const entities: IncomeBreakdown['entities'] = [];
        let sum = 0;
        grid.forEach((row, i) => {
          row.forEach((entity, j) => {
            if (entity && entity.income > 0) {
              let inc = entity.income;
              if (entity.type === 'pet') inc = Math.floor(inc * petM);
              else if (entity.type === 'worker') inc = Math.floor(inc * workerM);
              entities.push({
                row: i,
                col: j,
                income: inc,
                name: entity.name,
              });
              sum += inc;
            }
          });
        });
        sum += interest;
        const streakBonus = winStreak > 0 ? winStreak : 0;
        sum += streakBonus;
        return {
          entities,
          interest,
          streakBonus,
          total: sum,
        };
      },

      applyIncomeTotal: (total: number) => {
        if (get().gameStatus !== 'playing') return;
        if (total > 0) {
          get().addCans(total);
        }
      },

      applyIncomePhaseFromBreakdown: (breakdown: IncomeBreakdown) => {
        if (get().gameStatus !== 'playing') return;
        const entitySum = breakdown.entities.reduce((s, e) => s + e.income, 0);
        const heartsGain = Math.floor(entitySum * HEARTS_ENTITY_INCOME_MULTIPLIER);
        if (breakdown.total > 0) {
          get().addCans(breakdown.total);
        }
        if (heartsGain > 0) {
          get().addHearts(heartsGain);
        }
      },

      applyTurnEndStress: () => {
        if (get().gameStatus !== 'playing') return;
        const { grid } = get();
        const cells: { row: number; col: number }[] = [];
        grid.forEach((row, i) => {
          row.forEach((e, j) => {
            if (e) cells.push({ row: i, col: j });
          });
        });
        cells.forEach(({ row, col }) => {
          get().addStress(row, col, 1);
        });
      },

      // 进入次日：重置倍率、回合数+1、注入延迟卡、抽牌（手牌整理完成后调用）
      endTurn: () => {
        applyResolutionState(set, runGameCommand(snapshotGameState(get()), { type: 'end_turn' }));
      },

      finishHandTrimAndAdvanceTurn: () => {
        const result = runGameCommand(snapshotGameState(get()), {
          type: 'finish_hand_trim_and_advance_turn',
          drawMeta: {
            source: 'turn_start',
            sourceLabel: '每日抽牌',
            uiMode: 'manual',
          },
        });
        if (!applyResolutionState(set, result)) return null;
        return result.meta.drawEvent;
      },

      // 添加罐头
      addCans: (amount: number) => {
        set(state => ({ cans: state.cans + amount }));
      },

      addHearts: (amount: number) => {
        if (amount <= 0) return;
        set(s => {
          const nextHearts = s.hearts + amount;
          if (nextHearts >= VICTORY_HEARTS) {
            return { hearts: nextHearts, gameStatus: 'won', endReason: null };
          }
          return { hearts: nextHearts };
        });
      },

      // 消费罐头
      spendCans: (amount: number) => {
        const { cans } = get();
        if (cans >= amount) {
          set({ cans: cans - amount });
          return true;
        }
        return false;
      },

      // 计算利息
      calculateInterest: () => {
        const { cans } = get();
        const interest = Math.floor(cans / 10);
        set({ interest });
        return interest;
      },


      // 放置实体到网格
      placeEntity: (card: Card, row: number, col: number) => {
        return applyResolutionState(
          set,
          runGameCommand(snapshotGameState(get()), { type: 'place_entity', card, row, col })
        );
      },

      // 移除实体
      removeEntity: (row: number, col: number) => {
        applyResolutionState(
          set,
          runGameCommand(snapshotGameState(get()), { type: 'remove_entity', row, col })
        );
      },

      // 移动实体
      moveEntity: (fromRow: number, fromCol: number, toRow: number, toCol: number) => {
        return applyResolutionState(
          set,
          runGameCommand(snapshotGameState(get()), {
            type: 'move_entity',
            fromRow,
            fromCol,
            toRow,
            toCol,
          })
        );
      },

      // 获取实体
      getEntity: (row: number, col: number) => {
        const { grid } = get();
        if (row < 0 || row >= 3 || col < 0 || col >= 6) return null;
        return grid[row][col];
      },

      // 抽牌
      drawCards: (count: number, meta?: DrawCardsMeta) => {
        const result = runGameCommand(snapshotGameState(get()), { type: 'draw_cards', count, meta });
        if (!applyResolutionState(set, result)) return null;
        return result.meta.drawEvent;
      },

      // 打出手牌
      playCard: (
        cardIndex: number,
        targetRow?: number,
        targetCol?: number,
        targetRow2?: number,
        targetCol2?: number
      ) => {
        const { hand } = get();
        logStoreFlow('playCard:start', {
          cardIndex,
          targetRow,
          targetCol,
          targetRow2,
          targetCol2,
          hand: hand.map(c => `${c.id}:${c.type}`),
        });
        const result = runGameCommand(snapshotGameState(get()), {
          type: 'play_card',
          cardIndex,
          targetRow,
          targetCol,
          targetRow2,
          targetCol2,
        });
        const success = applyResolutionState(set, result);
        if (!success) {
          logStoreFlow('playCard:failed', {
            cardIndex,
            failureReason: result.failureReason,
          });
          return false;
        }
        return true;
      },

      removeHandCardAfterPlay: (cardIndex: number) => {
        applyResolutionState(
          set,
          runGameCommand(snapshotGameState(get()), { type: 'remove_hand_card_after_play', cardIndex })
        );
      },

      discardHandCardForTrim: (cardIndex: number) => {
        return applyResolutionState(
          set,
          runGameCommand(snapshotGameState(get()), { type: 'discard_hand_trim', cardIndex })
        );
      },

      // 增加压力
      addStress: (row: number, col: number, amount: number) => {
        const result = runGameCommand(snapshotGameState(get()), {
          type: 'add_stress',
          row,
          col,
          amount,
        });
        if (!applyResolutionState(set, result)) return null;
        return result.meta.stressResult;
      },

      // 触发拆家
      triggerMeltdown: (row: number, col: number) => {
        const result = runGameCommand(snapshotGameState(get()), {
          type: 'trigger_meltdown',
          row,
          col,
        });
        if (!applyResolutionState(set, result)) return null;
        return result.meta.stressResult;
      },

      rebuildCell: (row: number, col: number) => {
        return applyResolutionState(
          set,
          runGameCommand(snapshotGameState(get()), { type: 'rebuild_cell', row, col })
        );
      },

      // 初始化游戏（接受可选的初始牌库）
      initGame: (initialDeck?: Card[]) => {
        const result = runGameCommand(snapshotGameState(get()), {
          type: 'init_game',
          initialDeck,
        });
        applyResolutionState(set, result);
      },

      // 重置游戏
      resetGame: () => {
        set({
          ...initialState,
          grid: createEmptyGrid(),
          cellDurability: createFullDurability(),
        });
      },

      restartRun: () => {
        applyResolutionState(
          set,
          runGameCommand(snapshotGameState(get()), {
            type: 'restart_run',
            initialDeck: createRestartInitialDeck(),
          })
        );
      },
    }),
    { name: 'GameStore' }
  )
);
