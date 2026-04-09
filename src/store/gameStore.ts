import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Card } from '../types/card';

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

  // 手牌操作
  drawCards: (count: number) => void;
  playCard: (cardIndex: number, targetRow?: number, targetCol?: number) => boolean;
  discardCard: (cardIndex: number) => void;

  // 压力系统
  addStress: (row: number, col: number, amount: number) => void;
  triggerMeltdown: (row: number, col: number) => void;

  // 游戏初始化
  initGame: (initialDeck?: Card[]) => void;
  resetGame: () => void;
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
  grid: createEmptyGrid(),
  hand: [],
  deck: [],
  discardPile: [],
  globalStress: 0,
  meltdownHistory: [],
};

export const useGameStore = create<GameState & GameActions>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // 进入下一阶段
      nextPhase: () => {
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
            get().applyIncomeTotal(breakdown.total);
          }
        }
      },

      setPhase: (phase: GamePhase) => {
        set({ phase });
      },

      getIncomeBreakdown: () => {
        const { grid, interest, winStreak } = get();
        const entities: IncomeBreakdown['entities'] = [];
        let sum = 0;
        grid.forEach((row, i) => {
          row.forEach((entity, j) => {
            if (entity && entity.income > 0) {
              entities.push({
                row: i,
                col: j,
                income: entity.income,
                name: entity.name,
              });
              sum += entity.income;
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
        if (total > 0) {
          get().addCans(total);
        }
      },

      applyTurnEndStress: () => {
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

      // 结束回合
      endTurn: () => {
        const { turn, grid } = get();

        console.log('Ending turn', turn);

        // 重置所有实体的行动状态
        const newGrid = grid.map(row =>
          row.map(entity => entity ? { ...entity, isExhausted: false } : null)
        );

        set({
          turn: turn + 1,
          phase: 'preparation',
          grid: newGrid,
        });

        // 抽新手牌
        console.log('Drawing 3 cards for new turn');
        get().drawCards(3);
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
        const { grid, spendCans } = get();

        // 检查位置是否有效
        if (row < 0 || row >= 3 || col < 0 || col >= 6) {
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
        const { grid } = get();

        // 检查位置有效性
        if (fromRow < 0 || fromRow >= 3 || fromCol < 0 || fromCol >= 6 ||
            toRow < 0 || toRow >= 3 || toCol < 0 || toCol >= 6) {
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
      playCard: (cardIndex: number, targetRow?: number, targetCol?: number) => {
        const { hand, placeEntity, discardCard } = get();

        if (cardIndex < 0 || cardIndex >= hand.length) {
          return false;
        }

        const card = hand[cardIndex];

        // 宠物/员工卡需要目标位置
        if (card.type.includes('pet') || card.type.includes('worker')) {
          if (targetRow === undefined || targetCol === undefined) {
            return false;
          }

          const success = placeEntity(card, targetRow, targetCol);
          if (success) {
            discardCard(cardIndex);
          }
          return success;
        }

        // 行动卡直接执行效果（暂时简化处理）
        if (card.type.includes('action')) {
          const { spendCans } = get();
          if (spendCans(card.cost)) {
            // TODO: 执行行动卡效果
            discardCard(cardIndex);
            return true;
          }
          return false;
        }

        return false;
      },

      // 弃牌
      discardCard: (cardIndex: number) => {
        const { hand, discardPile } = get();
        if (cardIndex < 0 || cardIndex >= hand.length) return;

        const card = hand[cardIndex];
        const newHand = hand.filter((_, i) => i !== cardIndex);
        const newDiscard = [...discardPile, card];

        set({ hand: newHand, discardPile: newDiscard });
      },

      // 增加压力
      addStress: (row: number, col: number, amount: number) => {
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
        const { grid, turn, meltdownHistory } = get();
        const entity = grid[row][col];

        if (!entity) return;

        // 50%概率成功（5倍收益），50%完全崩溃
        const success = Math.random() < 0.5;

        if (success) {
          // 爆发成功：5倍收益
          const bonusIncome = entity.income * 5;
          get().addCans(bonusIncome);

          // 重置压力
          const newGrid = grid.map((r, i) =>
            r.map((c, j) =>
              (i === row && j === col && c) ? { ...c, stress: 0 } : c
            )
          );
          set({ grid: newGrid });
        } else {
          // 完全崩溃：移除实体
          get().removeEntity(row, col);
        }

        // 记录拆家历史
        set({
          meltdownHistory: [
            ...meltdownHistory,
            { turn, entityId: entity.id, success }
          ]
        });
      },

      // 初始化游戏（接受可选的初始牌库）
      initGame: (initialDeck?: Card[]) => {
        const currentDeck = initialDeck || get().deck;

        // 重置游戏状态，但保留牌库
        set({
          ...initialState,
          deck: currentDeck,
        });

        // 抽初始手牌
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
        set({ ...initialState });
      },
    }),
    { name: 'GameStore' }
  )
);
