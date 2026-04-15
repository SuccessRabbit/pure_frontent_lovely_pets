import * as PIXI from 'pixi.js';
import { getActionTargetMode } from '../../../store/actionEffects';
import { useGameStore } from '../../../store/gameStore';
import { RUINS_REBUILD_COST } from '@config/gameRules';
import type { IsometricPetRenderer } from '../../renderers/IsometricPetRenderer';
import { GridCell } from '../../entities/GridCell';
import type { ToastMessage } from '../../systems/ToastPresenter';

interface PendingActionPick {
  handIndex: number;
  actionId: string;
  firstCell: { row: number; col: number } | null;
}

interface GridInteractionControllerDeps {
  getGridCells: () => GridCell[];
  getPetRenderer: () => IsometricPetRenderer | null;
  isTargetUnderGridCell: (target: PIXI.Container | null | undefined) => boolean;
  isTargetIgnored: (target: PIXI.Container | null | undefined) => boolean;
  setDragEnabled: (on: boolean) => void;
  showToast: (message: ToastMessage) => void;
  syncGridFromStore: () => void;
}

export class GridInteractionController {
  private readonly getGridCells: () => GridCell[];
  private readonly getPetRenderer: () => IsometricPetRenderer | null;
  private readonly isTargetUnderGridCell: (target: PIXI.Container | null | undefined) => boolean;
  private readonly isTargetIgnored: (target: PIXI.Container | null | undefined) => boolean;
  private readonly setDragEnabled: (on: boolean) => void;
  private readonly showToast: (message: ToastMessage) => void;
  private readonly syncGridFromStore: () => void;

  private pendingActionPick: PendingActionPick | null = null;

  constructor(deps: GridInteractionControllerDeps) {
    this.getGridCells = deps.getGridCells;
    this.getPetRenderer = deps.getPetRenderer;
    this.isTargetUnderGridCell = deps.isTargetUnderGridCell;
    this.isTargetIgnored = deps.isTargetIgnored;
    this.setDragEnabled = deps.setDragEnabled;
    this.showToast = deps.showToast;
    this.syncGridFromStore = deps.syncGridFromStore;
  }

  public beginPendingTargetedAction(
    handIndex: number,
    actionId: string,
    firstCell: { row: number; col: number } | null = null
  ) {
    if (useGameStore.getState().gameStatus !== 'playing') return;
    this.pendingActionPick = { handIndex, actionId, firstCell };
    this.setDragEnabled(false);
    this.refreshActionPickOverlays();
    const hint =
      actionId === 'action_003'
        ? firstCell
          ? '已选中第一只宠物，请选择另一只交换目标'
          : '请先拖到第一只需要交换的宠物上'
        : '请点击目标格子';
    this.showToast({ text: hint, tone: 'warning', color: 0xfff9c4 });
  }

  public clearPendingActionPick() {
    const had = !!this.pendingActionPick;
    this.pendingActionPick = null;
    this.getGridCells().forEach(cell => {
      cell.clearActionPickOverlay();
      this.getPetRenderer()?.setCellActionPick(cell.row, cell.col, false, false);
    });
    if (had) {
      this.setDragEnabled(true);
    }
  }

  public sync3DGridHints(params: {
    screenX: number;
    screenY: number;
    dragHoveredCell: GridCell | null;
    dragMode: 'none' | 'entity' | 'action-target';
  }) {
    const petRenderer = this.getPetRenderer();
    if (!petRenderer) return;

    const pending = this.pendingActionPick;
    const pendingHoverCell = pending
      ? this.resolveProjectedGridCell(params.screenX, params.screenY)
      : null;

    this.getGridCells().forEach(cell => {
      let hoverMode: 'none' | 'placement' | 'targeting' = 'none';

      if (pending) {
        const selectable = this.isEligibleActionTargetCell(
          pending.actionId,
          cell,
          pending.firstCell ? 'second' : 'first'
        );
        if (pendingHoverCell === cell && selectable) {
          hoverMode = 'targeting';
        }
      } else if (params.dragMode === 'entity') {
        if (params.dragHoveredCell === cell && cell.isEmpty && !cell.isRuins) {
          hoverMode = 'placement';
        }
      } else if (params.dragMode === 'action-target') {
        if (params.dragHoveredCell === cell && !cell.isRuins && !cell.isEmpty) {
          hoverMode = 'targeting';
        }
      }

      petRenderer.setCellHoverMode(cell.row, cell.col, hoverMode);
    });
  }

  public handleContainerPointerDown(
    target: PIXI.Container | null | undefined,
    screenX: number,
    screenY: number
  ): boolean {
    if (this.tryHandleProjectedGridPointer(target, screenX, screenY)) {
      return true;
    }

    if (!this.pendingActionPick) return false;
    if (this.isTargetUnderGridCell(target)) return false;
    if (this.isTargetIgnored(target)) return false;

    this.clearPendingActionPick();
    this.showToast({ text: '已取消出牌', tone: 'info', color: 0xbdc3c7 });
    return true;
  }

  public handleGridCellPointer(cell: GridCell): boolean {
    if (this.pendingActionPick) {
      this.handleGridCellActionPick(cell);
      return true;
    }

    const get = useGameStore.getState;
    if (get().gameStatus !== 'playing') return false;
    if (!cell.isRuins) return false;
    const ok = get().rebuildCell(cell.row, cell.col);
    if (ok) {
      this.syncGridFromStore();
      this.showToast({
        text: `工位已重建（-${RUINS_REBUILD_COST}🥫）`,
        tone: 'success',
        color: 0xabebc6,
      });
    } else {
      this.showToast({
        text: `废墟格需空且花费 ${RUINS_REBUILD_COST}🥫`,
        tone: 'danger',
        color: 0xffb3b3,
      });
    }
    return true;
  }

  private resolveProjectedGridCell(screenX: number, screenY: number): GridCell | null {
    const petRenderer = this.getPetRenderer();
    if (petRenderer) {
      const gridPos = petRenderer.screenToGridCell(screenX, screenY);
      if (!gridPos) return null;
      return this.getGridCells().find(cell => cell.row === gridPos.row && cell.col === gridPos.col) ?? null;
    }
    return this.getGridCells().find(cell => cell.containsScreenPoint(screenX, screenY)) ?? null;
  }

  private tryHandleProjectedGridPointer(
    target: PIXI.Container | null | undefined,
    screenX: number,
    screenY: number
  ): boolean {
    if (this.isTargetUnderGridCell(target)) return false;
    if (this.isTargetIgnored(target)) return false;

    const cell = this.resolveProjectedGridCell(screenX, screenY);
    if (!cell) return false;

    return this.handleGridCellPointer(cell);
  }

  private isEligibleActionTargetCell(
    actionId: string,
    cell: GridCell,
    stage: 'first' | 'second' = 'first'
  ): boolean {
    const entity = useGameStore.getState().grid[cell.row][cell.col];
    if (cell.isRuins || !entity) return false;

    const mode = getActionTargetMode(actionId);
    if (mode === 'pet') return entity.type === 'pet';
    if (mode === 'worker') return entity.type === 'worker';
    if (mode === 'swap') {
      if (stage === 'second' && this.pendingActionPick?.firstCell) {
        return !(
          this.pendingActionPick.firstCell.row === cell.row &&
          this.pendingActionPick.firstCell.col === cell.col
        );
      }
      return true;
    }
    return false;
  }

  private refreshActionPickOverlays() {
    const pending = this.pendingActionPick;
    this.getGridCells().forEach(cell => {
      const eligible =
        !!pending &&
        this.isEligibleActionTargetCell(
          pending.actionId,
          cell,
          pending.firstCell ? 'second' : 'first'
        );
      const selected =
        !!pending?.firstCell &&
        pending.firstCell.row === cell.row &&
        pending.firstCell.col === cell.col;
      cell.setActionPickVisual(eligible, selected);
      this.getPetRenderer()?.setCellActionPick(cell.row, cell.col, eligible, selected);
    });
  }

  private handleGridCellActionPick(cell: GridCell) {
    const pending = this.pendingActionPick;
    if (!pending) return;

    const get = useGameStore.getState;

    if (pending.actionId === 'action_003') {
      if (!pending.firstCell) {
        if (!this.isEligibleActionTargetCell(pending.actionId, cell, 'first')) {
          this.showToast({ text: '第一格需有单位', tone: 'danger', color: 0xffb3b3 });
          this.clearPendingActionPick();
          return;
        }
        pending.firstCell = { row: cell.row, col: cell.col };
        this.refreshActionPickOverlays();
        this.showToast({
          text: '请选择第二格（再点第一格可取消选中）',
          tone: 'warning',
          color: 0xfff9c4,
        });
        return;
      }

      const r1 = pending.firstCell.row;
      const c1 = pending.firstCell.col;
      if (cell.row === r1 && cell.col === c1) {
        pending.firstCell = null;
        this.refreshActionPickOverlays();
        this.showToast({ text: '已取消第一格，请重新选择', tone: 'warning', color: 0xfff9c4 });
        return;
      }
      if (!this.isEligibleActionTargetCell(pending.actionId, cell, 'second')) {
        this.showToast({ text: '交换目标无效，已取消释放', tone: 'danger', color: 0xffb3b3 });
        this.clearPendingActionPick();
        return;
      }

      const success = get().playCard(pending.handIndex, r1, c1, cell.row, cell.col);
      if (success) {
        this.clearPendingActionPick();
      } else {
        this.showToast({
          text: '无法交换（两格均需有单位且不同）',
          tone: 'danger',
          color: 0xffb3b3,
        });
        this.clearPendingActionPick();
      }
      return;
    }

    if (!this.isEligibleActionTargetCell(pending.actionId, cell, 'first')) {
      this.showToast({ text: '无效目标，已取消释放', tone: 'danger', color: 0xffb3b3 });
      this.clearPendingActionPick();
      return;
    }

    const success = get().playCard(pending.handIndex, cell.row, cell.col);
    if (success) {
      this.clearPendingActionPick();
    } else {
      this.showToast({ text: '无效目标', tone: 'danger', color: 0xffb3b3 });
      this.clearPendingActionPick();
    }
  }
}
