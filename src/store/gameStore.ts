import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Card } from '../types/card';
import { getEntityCardTemplate } from '../utils/cardCatalog';
import { buildShuffledStartingDeck } from '../utils/deckFactory';
import {
  CELL_DURABILITY_MAX,
  HAND_SIZE_MAX,
  HEARTS_ENTITY_INCOME_MULTIPLIER,
  MELTDOWN_HP_LOSS,
  PLAYER_HP_START,
  RUINS_REBUILD_COST,
  VICTORY_DAYS,
  VICTORY_HEARTS,
} from '@config/gameRules';
import { getActionTargetMode, runActionCardEffect } from './actionEffects';

const DEBUG_STORE_FLOW = true;

const MELTDOWN_ADJ4: readonly [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

function allCellsRuins(cellDurability: number[][]): boolean {
  return cellDurability.every(row => row.every(d => d <= 0));
}

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
  drawCards: (count: number) => void;
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
  finishHandTrimAndAdvanceTurn: () => void;

  // 压力系统
  addStress: (row: number, col: number, amount: number) => void;
  triggerMeltdown: (row: number, col: number) => void;

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
  cans: 10,
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
};

export const useGameStore = create<GameState & GameActions>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // 进入下一阶段
      nextPhase: () => {
        if (get().gameStatus !== 'playing') return;
        const { phase } = get();
        const phaseOrder: GamePhase[] = ['preparation', 'action', 'income', 'end'];
        const currentIndex = phaseOrder.indexOf(phase);
        const nextPhase = phaseOrder[(currentIndex + 1) % phaseOrder.length];

        console.log('Phase transition:', phase, '->', nextPhase);

        if (nextPhase === 'preparation') {
          get().endTurn();
        } else {
          set({ phase: nextPhase });

          if (nextPhase === 'income') {
            get().calculateInterest();
            const breakdown = get().getIncomeBreakdown();
            console.log('Income phase: adding', breakdown.total, 'cans');
            get().applyIncomePhaseFromBreakdown(breakdown);
          }
        }
      },

      setPhase: (phase: GamePhase) => {
        set({ phase });
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
          set(s => {
            const nextHearts = s.hearts + heartsGain;
            if (nextHearts >= VICTORY_HEARTS) {
              return { hearts: nextHearts, gameStatus: 'won', endReason: null };
            }
            return { hearts: nextHearts };
          });
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
        if (get().gameStatus !== 'playing') return;

        const hand = get().hand;
        if (hand.length > HAND_SIZE_MAX) {
          const discardable = hand.filter(c => c.canDiscard !== false).length;
          const need = hand.length - HAND_SIZE_MAX;
          if (discardable < need) {
            console.warn('[StoreFlow] handTrim: not enough discardable cards', {
              handSize: hand.length,
              discardable,
              need,
              HAND_SIZE_MAX,
            });
          }
          set({ awaitingHandTrim: true });
          return;
        }

        get().finishHandTrimAndAdvanceTurn();
      },

      finishHandTrimAndAdvanceTurn: () => {
        if (get().gameStatus !== 'playing') return;
        if (get().hand.length > HAND_SIZE_MAX) return;

        if (get().awaitingHandTrim) {
          set({ awaitingHandTrim: false });
        }

        const { turn, grid, discardPile, pendingCardsNextTurnDiscard } = get();

        console.log('Ending turn', turn);

        const newGrid = grid.map(row =>
          row.map(entity => (entity ? { ...entity, isExhausted: false } : null))
        );

        const inject = [...pendingCardsNextTurnDiscard];

        const nextTurn = turn + 1;

        set({
          turn: nextTurn,
          phase: 'preparation',
          grid: newGrid,
          petIncomeMultiplierThisTurn: 1,
          workerIncomeMultiplierThisTurn: 1,
          pendingCardsNextTurnDiscard: [],
          discardPile: [...discardPile, ...inject],
        });

        const s1 = get();
        if (s1.gameStatus === 'playing' && s1.turn > VICTORY_DAYS) {
          if (s1.hearts >= VICTORY_HEARTS) {
            set({ gameStatus: 'won', endReason: null });
          } else {
            set({ gameStatus: 'lost', endReason: 'hearts' });
          }
        }

        if (get().gameStatus === 'playing') {
          console.log('Drawing 3 cards for new turn');
          get().drawCards(3);
        }
      },

      // 添加罐头
      addCans: (amount: number) => {
        set(state => ({ cans: state.cans + amount }));
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
        if (get().gameStatus !== 'playing') return false;
        const { grid, spendCans, cellDurability } = get();

        // 检查位置是否有效
        if (row < 0 || row >= 3 || col < 0 || col >= 6) {
          return false;
        }

        if ((cellDurability[row][col] ?? 0) <= 0) {
          return false;
        }

        // 检查位置是否已占用
        if (grid[row][col] !== null) {
          return false;
        }

        // 检查是否是宠物或员工卡
        if (!card.type.includes('pet') && !card.type.includes('worker')) {
          return false;
        }

        // 消费罐头
        if (!spendCans(card.cost)) {
          return false;
        }

        // 创建实体
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

        // 放置到网格
        const newGrid = grid.map((r, i) =>
          r.map((c, j) => (i === row && j === col ? entity : c))
        );

        set({ grid: newGrid });
        return true;
      },

      // 移除实体
      removeEntity: (row: number, col: number) => {
        const { grid } = get();
        const newGrid = grid.map((r, i) =>
          r.map((c, j) => (i === row && j === col ? null : c))
        );
        set({ grid: newGrid });
      },

      // 移动实体
      moveEntity: (fromRow: number, fromCol: number, toRow: number, toCol: number) => {
        if (get().gameStatus !== 'playing') return false;
        const { grid, cellDurability } = get();

        // 检查位置有效性
        if (fromRow < 0 || fromRow >= 3 || fromCol < 0 || fromCol >= 6 ||
            toRow < 0 || toRow >= 3 || toCol < 0 || toCol >= 6) {
          return false;
        }

        if ((cellDurability[fromRow][fromCol] ?? 0) <= 0 || (cellDurability[toRow][toCol] ?? 0) <= 0) {
          return false;
        }

        const entity = grid[fromRow][fromCol];
        if (!entity) return false;

        // 目标位置必须为空
        if (grid[toRow][toCol] !== null) {
          return false;
        }

        // 执行移动
        const newGrid = grid.map((r, i) =>
          r.map((c, j) => {
            if (i === fromRow && j === fromCol) return null;
            if (i === toRow && j === toCol) return { ...entity, position: { row: toRow, col: toCol } };
            return c;
          })
        );

        set({ grid: newGrid });
        return true;
      },

      // 获取实体
      getEntity: (row: number, col: number) => {
        const { grid } = get();
        if (row < 0 || row >= 3 || col < 0 || col >= 6) return null;
        return grid[row][col];
      },

      // 抽牌
      drawCards: (count: number) => {
        const { deck, hand, discardPile } = get();
        let newDeck = [...deck];
        let newHand = [...hand];
        let newDiscard = [...discardPile];

        console.log('Drawing cards:', {
          count,
          deckSize: newDeck.length,
          handSize: newHand.length,
          discardSize: newDiscard.length
        });

        for (let i = 0; i < count; i++) {
          // 如果牌库空了，洗入弃牌堆
          if (newDeck.length === 0) {
            console.log('Deck empty, shuffling discard pile');
            newDeck = [...newDiscard].sort(() => Math.random() - 0.5);
            newDiscard = [];
          }

          // 抽牌
          if (newDeck.length > 0) {
            const card = newDeck.pop()!;
            newHand.push(card);
          } else {
            console.warn('No cards available to draw!');
          }
        }

        console.log('After drawing:', {
          deckSize: newDeck.length,
          handSize: newHand.length,
          discardSize: newDiscard.length
        });

        set({ deck: newDeck, hand: newHand, discardPile: newDiscard });
      },

      // 打出手牌
      playCard: (
        cardIndex: number,
        targetRow?: number,
        targetCol?: number,
        targetRow2?: number,
        targetCol2?: number
      ) => {
        if (get().gameStatus !== 'playing') return false;

        const { hand, placeEntity, removeHandCardAfterPlay } = get();
        logStoreFlow('playCard:start', {
          cardIndex,
          targetRow,
          targetCol,
          targetRow2,
          targetCol2,
          hand: hand.map(c => `${c.id}:${c.type}`),
        });

        if (cardIndex < 0 || cardIndex >= hand.length) {
          console.warn('[StoreFlow] playCard:invalidIndex', { cardIndex, handSize: hand.length });
          return false;
        }

        const card = hand[cardIndex];
        logStoreFlow('playCard:selectedCard', {
          card: `${card.id}:${card.type}`,
          cost: card.cost,
        });

        // 宠物/员工卡需要目标位置
        if (card.type.includes('pet') || card.type.includes('worker')) {
          if (targetRow === undefined || targetCol === undefined) {
            console.warn('[StoreFlow] playCard:missingTarget', {
              card: `${card.id}:${card.type}`,
            });
            return false;
          }

          const success = placeEntity(card, targetRow, targetCol);
          logStoreFlow('playCard:placeEntityResult', {
            card: `${card.id}:${card.type}`,
            success,
            target: [targetRow, targetCol],
          });
          if (success) {
            removeHandCardAfterPlay(cardIndex);
          }
          return success;
        }

        // 行动卡：校验目标格 → 扣费 → 执行效果（失败则退费）
        if (card.type.includes('action')) {
          const mode = getActionTargetMode(card.id);
          if (mode === 'pet' || mode === 'worker') {
            if (targetRow === undefined || targetCol === undefined) {
              logStoreFlow('playCard:actionMissingTarget', { card: card.id, mode });
              return false;
            }
          }
          if (mode === 'swap') {
            if (
              targetRow === undefined ||
              targetCol === undefined ||
              targetRow2 === undefined ||
              targetCol2 === undefined
            ) {
              logStoreFlow('playCard:actionMissingSwapTargets', { card: card.id });
              return false;
            }
          }

          const { spendCans, addCans } = get();
          if (card.cost > 0 && !spendCans(card.cost)) {
            console.warn('[StoreFlow] playCard:actionSpendFailed', {
              card: `${card.id}:${card.type}`,
              cans: get().cans,
              cost: card.cost,
            });
            return false;
          }

          const ok = runActionCardEffect(
            get,
            set,
            card,
            targetRow,
            targetCol,
            targetRow2,
            targetCol2
          );
          if (!ok) {
            if (card.cost > 0) addCans(card.cost);
            logStoreFlow('playCard:actionEffectFailed', { card: card.id });
            return false;
          }

          removeHandCardAfterPlay(cardIndex);
          logStoreFlow('playCard:actionSuccess', {
            card: `${card.id}:${card.type}`,
          });
          return true;
        }

        console.warn('[StoreFlow] playCard:unsupportedType', {
          card: `${card.id}:${card.type}`,
        });
        return false;
      },

      removeHandCardAfterPlay: (cardIndex: number) => {
        const { hand, discardPile } = get();
        if (cardIndex < 0 || cardIndex >= hand.length) return;

        const card = hand[cardIndex];
        const newHand = hand.filter((_, i) => i !== cardIndex);
        const newDiscard = [...discardPile, card];
        logStoreFlow('removeHandCardAfterPlay', {
          cardIndex,
          card: `${card.id}:${card.type}`,
          beforeHand: hand.map(c => `${c.id}:${c.type}`),
          afterHand: newHand.map(c => `${c.id}:${c.type}`),
        });

        set({ hand: newHand, discardPile: newDiscard });
      },

      discardHandCardForTrim: (cardIndex: number) => {
        if (get().gameStatus !== 'playing') return false;
        const { hand } = get();
        if (!get().awaitingHandTrim && hand.length <= HAND_SIZE_MAX) return false;
        if (cardIndex < 0 || cardIndex >= hand.length) return false;
        const card = hand[cardIndex];
        if (card.canDiscard === false) return false;
        get().removeHandCardAfterPlay(cardIndex);
        return true;
      },

      // 增加压力
      addStress: (row: number, col: number, amount: number) => {
        if (get().gameStatus !== 'playing') return;
        const { grid } = get();
        const entity = grid[row][col];

        if (!entity) return;

        const newStress = Math.min(entity.stress + amount, entity.maxStress);

        // 如果压力达到上限，触发拆家
        if (newStress >= entity.maxStress) {
          get().triggerMeltdown(row, col);
          return;
        }

        const newGrid = grid.map((r, i) =>
          r.map((c, j) =>
            (i === row && j === col && c) ? { ...c, stress: newStress } : c
          )
        );

        set({ grid: newGrid });
      },

      // 触发拆家
      triggerMeltdown: (row: number, col: number) => {
        if (get().gameStatus !== 'playing') return;

        const { grid, turn, meltdownHistory, cellDurability, discardPile, playerHp } = get();
        const entity = grid[row][col];

        if (!entity) return;

        // 50%概率成功（5倍收益），50%完全崩溃
        const success = Math.random() < 0.5;
        const histEntry = { turn, entityId: entity.id, success };

        if (success) {
          const bonusIncome = entity.income * 5;
          get().addCans(bonusIncome);

          const newGrid = grid.map((r, i) =>
            r.map((c, j) =>
              (i === row && j === col && c) ? { ...c, stress: 0 } : c
            )
          );
          set({
            grid: newGrid,
            meltdownHistory: [...meltdownHistory, histEntry],
          });
          return;
        }

        const cardTpl = getEntityCardTemplate(entity.cardId);
        const newGrid = grid.map(r => [...r]);
        const newDur = cellDurability.map(r => [...r]);
        const newDiscard = [...discardPile];
        if (cardTpl) {
          newDiscard.push(cardTpl);
        }

        newGrid[row][col] = null;
        newDur[row][col] = 0;

        for (const [dr, dc] of MELTDOWN_ADJ4) {
          const nr = row + dr;
          const nc = col + dc;
          if (nr < 0 || nr >= 3 || nc < 0 || nc >= 6) continue;
          newDur[nr][nc] -= 1;
          if (newDur[nr][nc] <= 0) {
            newDur[nr][nc] = 0;
            newGrid[nr][nc] = null;
          }
        }

        const nextHp = playerHp - MELTDOWN_HP_LOSS;

        set({
          grid: newGrid,
          cellDurability: newDur,
          discardPile: newDiscard,
          playerHp: nextHp,
          meltdownHistory: [...meltdownHistory, histEntry],
        });

        const after = get();
        if (after.gameStatus !== 'playing') return;
        if (after.playerHp <= 0) {
          set({ gameStatus: 'lost', endReason: 'hp' });
          return;
        }
        if (allCellsRuins(after.cellDurability)) {
          set({ gameStatus: 'lost', endReason: 'grid' });
        }
      },

      rebuildCell: (row: number, col: number) => {
        if (get().gameStatus !== 'playing') return false;
        const { grid, cellDurability, spendCans } = get();
        if (row < 0 || row >= 3 || col < 0 || col >= 6) return false;
        if (grid[row][col] !== null) return false;
        if ((cellDurability[row][col] ?? 0) > 0) return false;
        if (!spendCans(RUINS_REBUILD_COST)) return false;
        const nd = cellDurability.map(r => [...r]);
        nd[row][col] = CELL_DURABILITY_MAX;
        set({ cellDurability: nd });
        return true;
      },

      // 初始化游戏（接受可选的初始牌库）
      initGame: (initialDeck?: Card[]) => {
        const currentDeck = initialDeck || get().deck;

        set({
          ...initialState,
          grid: createEmptyGrid(),
          cellDurability: createFullDurability(),
          deck: currentDeck,
        });

        if (currentDeck.length > 0) {
          get().drawCards(5);
        }

        console.log('Game initialized:', {
          deckSize: currentDeck.length,
          handSize: get().hand.length,
          cans: get().cans,
          phase: get().phase
        });
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
        set({
          ...initialState,
          grid: createEmptyGrid(),
          cellDurability: createFullDurability(),
          deck: buildShuffledStartingDeck(),
        });
        get().drawCards(5);
      },
    }),
    { name: 'GameStore' }
  )
);
