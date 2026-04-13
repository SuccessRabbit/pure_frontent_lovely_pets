import type { Card } from '../types/card';
import type { GameActions, GameState, GridEntity } from './gameStore';
import actionsConfig from '../../config/actions.json';
import { normalizeCard } from '../utils/cardNormalize';
import { getEntityCardTemplate } from '../utils/cardCatalog';

export type ActionTargetMode = 'none' | 'pet' | 'worker' | 'swap';

export function getActionTargetMode(cardId: string): ActionTargetMode {
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

type Store = GameState & GameActions;

function cellDurabilityOk(get: () => Store, r: number, c: number): boolean {
  const d = get().cellDurability[r]?.[c];
  return (d ?? 0) > 0;
}

function resentmentCard(): Card | null {
  const list = actionsConfig as Card[];
  const raw = list.find(c => c.id === 'action_resentment');
  return raw ? normalizeCard(raw as Card) : null;
}

const ADJ4 = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

function mapGridStress(
  grid: (GridEntity | null)[][],
  fn: (e: GridEntity, r: number, c: number) => GridEntity | null
): (GridEntity | null)[][] {
  return grid.map((row, i) =>
    row.map((cell, j) => {
      if (!cell) return null;
      return fn(cell, i, j);
    })
  );
}

/**
 * 执行行动牌效果（已扣费）。失败时不应由调用方弃牌；调用方负责退费。
 */
export function runActionCardEffect(
  get: () => Store,
  set: (partial: Partial<GameState> | ((s: GameState) => Partial<GameState>)) => void,
  card: Card,
  targetRow?: number,
  targetCol?: number,
  targetRow2?: number,
  targetCol2?: number
): boolean {
  const id = card.id;

  const setGrid = (next: (GridEntity | null)[][]) => set({ grid: next });

  if (id === 'action_001') {
    if (targetRow === undefined || targetCol === undefined) return false;
    if (!cellDurabilityOk(get, targetRow, targetCol)) return false;
    const { grid } = get();
    const e = grid[targetRow][targetCol];
    if (!e || e.type !== 'pet') return false;
    const newGrid = grid.map((row, i) =>
      row.map((c, j) =>
        i === targetRow && j === targetCol && c ? { ...c, stress: 0 } : c
      )
    );
    setGrid(newGrid);
    return true;
  }

  if (id === 'action_002') {
    const { workerIncomeMultiplierThisTurn, pendingCardsNextTurnDiscard } = get();
    const next = resentmentCard();
    set({
      workerIncomeMultiplierThisTurn: workerIncomeMultiplierThisTurn * 2,
      pendingCardsNextTurnDiscard: next
        ? [...pendingCardsNextTurnDiscard, next]
        : pendingCardsNextTurnDiscard,
    });
    return true;
  }

  if (id === 'action_003') {
    if (
      targetRow === undefined ||
      targetCol === undefined ||
      targetRow2 === undefined ||
      targetCol2 === undefined
    ) {
      return false;
    }
    const { grid } = get();
    if (!cellDurabilityOk(get, targetRow, targetCol) || !cellDurabilityOk(get, targetRow2, targetCol2)) {
      return false;
    }
    const a = grid[targetRow][targetCol];
    const b = grid[targetRow2][targetCol2];
    if (!a || !b) return false;
    if (targetRow === targetRow2 && targetCol === targetCol2) return false;
    const newGrid = grid.map((row, i) =>
      row.map((c, j) => {
        if (i === targetRow && j === targetCol) {
          return { ...b, position: { row: targetRow, col: targetCol } };
        }
        if (i === targetRow2 && j === targetCol2) {
          return { ...a, position: { row: targetRow2, col: targetCol2 } };
        }
        return c;
      })
    );
    setGrid(newGrid);
    return true;
  }

  if (id === 'action_004') {
    const { petIncomeMultiplierThisTurn } = get();
    set({ petIncomeMultiplierThisTurn: petIncomeMultiplierThisTurn * 2 });
    return true;
  }

  if (id === 'action_005') {
    const { grid } = get();
    const newGrid = mapGridStress(grid, (e, _r, _c) => {
      if (e.type !== 'pet') return e;
      return { ...e, stress: Math.max(0, e.stress - 2) };
    });
    setGrid(newGrid);
    return true;
  }

  if (id === 'action_006') {
    if (targetRow === undefined || targetCol === undefined) return false;
    if (!cellDurabilityOk(get, targetRow, targetCol)) return false;
    const { grid } = get();
    const victim = grid[targetRow][targetCol];
    if (!victim || victim.type !== 'worker') return false;

    let newGrid = grid.map((row, i) =>
      row.map((c, j) => (i === targetRow && j === targetCol ? null : c))
    );

    for (const [dr, dc] of ADJ4) {
      const r = targetRow + dr;
      const c = targetCol + dc;
      if (r < 0 || r >= 3 || c < 0 || c >= 6) continue;
      const cell = newGrid[r][c];
      if (cell?.type === 'pet') {
        newGrid = newGrid.map((row, i) =>
          row.map((ent, j) =>
            i === r && j === c && ent ? { ...ent, stress: Math.max(0, ent.stress - 2) } : ent
          )
        );
      }
    }
    setGrid(newGrid);
    return true;
  }

  if (id === 'action_007') {
    get().drawCards(2, {
      source: 'action',
      sourceCardId: id,
      sourceLabel: '盲盒零食',
    });
    return true;
  }

  if (id === 'action_008') {
    if (targetRow === undefined || targetCol === undefined) return false;
    if (!cellDurabilityOk(get, targetRow, targetCol)) return false;
    const { grid, hand } = get();
    const e = grid[targetRow][targetCol];
    if (!e || e.type !== 'pet') return false;
    const petCard = getEntityCardTemplate(e.cardId);
    if (!petCard) return false;

    const newGrid = grid.map((row, i) =>
      row.map((c, j) => (i === targetRow && j === targetCol ? null : c))
    );
    set({
      grid: newGrid,
      hand: [...hand, petCard],
    });
    return true;
  }

  if (id === 'action_resentment') {
    const { grid } = get();
    const cells: { row: number; col: number }[] = [];
    grid.forEach((row, i) => {
      row.forEach((ent, j) => {
        if (ent?.type === 'pet') cells.push({ row: i, col: j });
      });
    });
    for (const { row, col } of cells) {
      get().addStress(row, col, 2);
    }
    return true;
  }

  return false;
}
