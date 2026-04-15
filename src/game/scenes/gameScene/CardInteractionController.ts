import * as PIXI from 'pixi.js';
import { getActionTargetMode } from '../../../store/actionEffects';
import { useGameStore } from '../../../store/gameStore';
import type { Card } from '../../../types/card';
import { CardSprite } from '../../entities/CardSprite';
import { GridCell } from '../../entities/GridCell';
import { DragSystem } from '../../systems/DragSystem';
import type { ToastMessage } from '../../systems/ToastPresenter';
import { VfxQueue } from '../../systems/VfxQueue';
import { runActionTargetVfx, runActionTriggerVfx, runEntityPlaceVfx } from '../../utils/placeVfx';
import { GridInteractionController } from './GridInteractionController';
import { HandController } from './HandController';

interface CardInteractionControllerDeps {
  dragSystem: DragSystem;
  fxLayer: PIXI.Container;
  vfxQueue: VfxQueue;
  getGridCells: () => GridCell[];
  getMouse: () => { x: number; y: number };
  getActionZoneCenterGlobal: (out: PIXI.Point) => void;
  getHandController: () => HandController;
  getGridInteractionController: () => GridInteractionController;
  getGridCellCenterGlobal: (row: number, col: number) => PIXI.Point;
  revealPlacedEntity: (row: number, col: number) => void;
  showToast: (message: ToastMessage) => void;
  logFlow: (message: string, payload?: unknown) => void;
}

export class CardInteractionController {
  private readonly dragSystem: DragSystem;
  private readonly fxLayer: PIXI.Container;
  private readonly vfxQueue: VfxQueue;
  private readonly getGridCells: () => GridCell[];
  private readonly getMouse: () => { x: number; y: number };
  private readonly getActionZoneCenterGlobal: (out: PIXI.Point) => void;
  private readonly getHandController: () => HandController;
  private readonly getGridInteractionController: () => GridInteractionController;
  private readonly getGridCellCenterGlobal: (row: number, col: number) => PIXI.Point;
  private readonly revealPlacedEntity: (row: number, col: number) => void;
  private readonly showToast: (message: ToastMessage) => void;
  private readonly logFlow: (message: string, payload?: unknown) => void;

  constructor(deps: CardInteractionControllerDeps) {
    this.dragSystem = deps.dragSystem;
    this.fxLayer = deps.fxLayer;
    this.vfxQueue = deps.vfxQueue;
    this.getGridCells = deps.getGridCells;
    this.getMouse = deps.getMouse;
    this.getActionZoneCenterGlobal = deps.getActionZoneCenterGlobal;
    this.getHandController = deps.getHandController;
    this.getGridInteractionController = deps.getGridInteractionController;
    this.getGridCellCenterGlobal = deps.getGridCellCenterGlobal;
    this.revealPlacedEntity = deps.revealPlacedEntity;
    this.showToast = deps.showToast;
    this.logFlow = deps.logFlow;
  }

  private showInsufficientCans(cost: number, cans: number) {
    this.showToast({
      text: `小罐头不足：需要 ${cost}，当前仅有 ${cans}`,
      tone: 'danger',
      color: 0xff7a7a,
    });
  }

  public wire() {
    this.dragSystem.onRequestEntityPlace = (card, cell, _tx, _ty) => {
      this.handleEntityPlace(card, cell);
    };
    this.dragSystem.onRequestActionTrigger = (card, idx) => {
      this.handleActionTrigger(card, idx);
    };
    this.dragSystem.onRequestActionTargetDrop = (card, idx, cell) => {
      this.handleActionTargetDrop(card, idx, cell);
    };
    this.dragSystem.onRequestHandTrimDiscard = (card, idx) => {
      this.handleHandTrimDiscard(card, idx);
    };
  }

  public unwire() {
    this.dragSystem.onRequestEntityPlace = null;
    this.dragSystem.onRequestActionTrigger = null;
    this.dragSystem.onRequestActionTargetDrop = null;
    this.dragSystem.onRequestHandTrimDiscard = null;
  }

  public startHandCardDrag(card: CardSprite, idx: number) {
    if (useGameStore.getState().gameStatus !== 'playing') return;
    if (card.isResolving || card.destroyed || !card.parent) return;
    this.getHandController().resetHandLayoutImmediate();

    const type = card.cardData.type.toLowerCase();
    this.logFlow('onCardPointerDown', {
      card: `${card.cardData.id}:${card.cardData.type}`,
      idx,
      type,
    });
    const { x, y } = this.getMouse();
    this.dragSystem.startDrag(card, x, y, type.includes('action') ? 'action' : 'entity', idx);
  }

  private handleEntityPlace(card: CardSprite, cell: GridCell) {
    const get = useGameStore.getState;
    this.logFlow('onRequestEntityPlace', {
      card: `${card.cardData.id}:${card.cardData.type}`,
      target: [cell.row, cell.col],
      cans: get().cans,
      cost: card.cardData.cost,
    });
    if (card.cardData.cost > 0 && get().cans < card.cardData.cost) {
      this.showInsufficientCans(card.cardData.cost, get().cans);
      card.playReturnAnimation();
      return;
    }
    const handIdx = this.getHandController().resolveCardIndexInStore(card);
    if (handIdx < 0) {
      card.playReturnAnimation();
      return;
    }

    const fromGlobal = new PIXI.Point();
    card.getGlobalPosition(fromGlobal);
    const gridCell = this.getGridCells().find(c => c.row === cell.row && c.col === cell.col);
    if (!gridCell) {
      card.playReturnAnimation();
      return;
    }

    const { row, col } = cell;
    const targetGlobal = this.getGridCellCenterGlobal(row, col);
    const cardSnapshot = structuredClone(card.cardData) as Card;

    gridCell.setEntityPortraitSuppressed(true);
    const ok = get().playCard(handIdx, row, col);
    if (!ok) {
      gridCell.setEntityPortraitSuppressed(false);
      gridCell.syncStress(get().grid[row][col]);
      card.playReturnAnimation();
      return;
    }

    this.logFlow('onRequestEntityPlace:playCardOkEnqueueVfx', {
      card: `${cardSnapshot.id}:${cardSnapshot.type}`,
      target: [row, col],
    });

    this.vfxQueue.enqueue(async () => {
      try {
        await runEntityPlaceVfx(this.fxLayer, cardSnapshot, fromGlobal, targetGlobal.x, targetGlobal.y, () => {
          this.revealPlacedEntity(row, col);
        });
      } finally {
        if (gridCell.isEntityPortraitSuppressed()) {
          this.revealPlacedEntity(row, col);
        }
      }
    });
  }

  private handleActionTrigger(card: CardSprite, idx: number) {
    const get = useGameStore.getState;
    const hand = get().hand;
    const liveIdx =
      idx >= 0 && idx < hand.length ? idx : this.getHandController().resolveCardIndexInStore(card);
    this.logFlow('onRequestActionTrigger:start', {
      card: `${card.cardData.id}:${card.cardData.type}`,
      dragIdx: idx,
      liveIdx,
      hand: hand.map(c => `${c.id}:${c.type}`),
    });
    if (liveIdx < 0 || liveIdx >= hand.length) {
      card.playReturnAnimation();
      return;
    }
    const data = hand[liveIdx];
    if (!data.type.toLowerCase().includes('action')) {
      card.playReturnAnimation();
      return;
    }
    if (data.cost > 0 && get().cans < data.cost) {
      this.showInsufficientCans(data.cost, get().cans);
      card.playReturnAnimation();
      return;
    }

    if (getActionTargetMode(data.id) !== 'none') {
      card.playReturnAnimation();
      this.getGridInteractionController().beginPendingTargetedAction(liveIdx, data.id);
      return;
    }

    const fromGlobal = new PIXI.Point();
    card.getGlobalPosition(fromGlobal);
    const center = new PIXI.Point();
    this.getActionZoneCenterGlobal(center);

    const cardSnapshot = structuredClone(data) as Card;
    const success = get().playCard(liveIdx);
    if (!success) {
      console.warn('[SceneFlow] onRequestActionTrigger:playCardFailed', {
        card: `${card.cardData.id}:${card.cardData.type}`,
        liveIdx,
      });
      card.playReturnAnimation();
      return;
    }

    this.logFlow('onRequestActionTrigger:playCardOkEnqueueVfx', {
      card: `${cardSnapshot.id}:${cardSnapshot.type}`,
    });

    this.vfxQueue.enqueue(() =>
      runActionTriggerVfx(this.fxLayer, cardSnapshot, fromGlobal, center.x, center.y)
    );
  }

  private handleActionTargetDrop(card: CardSprite, idx: number, cell: GridCell) {
    const get = useGameStore.getState;
    const hand = get().hand;
    const liveIdx =
      idx >= 0 && idx < hand.length ? idx : this.getHandController().resolveCardIndexInStore(card);
    if (liveIdx < 0 || liveIdx >= hand.length) {
      card.playReturnAnimation();
      return;
    }

    const data = hand[liveIdx];
    const mode = getActionTargetMode(data.id);
    if (mode === 'none') {
      card.playReturnAnimation();
      return;
    }
    if (data.cost > 0 && get().cans < data.cost) {
      this.showInsufficientCans(data.cost, get().cans);
      card.playReturnAnimation();
      return;
    }
    const targetEntity = useGameStore.getState().grid[cell.row][cell.col];
    const isEligibleTarget =
      !cell.isRuins &&
      !!targetEntity &&
      ((mode === 'pet' && targetEntity.type === 'pet') ||
        (mode === 'worker' && targetEntity.type === 'worker') ||
        mode === 'swap');
    if (!isEligibleTarget) {
      card.playReturnAnimation();
      this.showToast({ text: '目标无效，已取消释放', tone: 'danger', color: 0xffb3b3 });
      return;
    }

    if (mode === 'swap') {
      card.playReturnAnimation();
      this.getGridInteractionController().beginPendingTargetedAction(liveIdx, data.id, {
        row: cell.row,
        col: cell.col,
      });
      return;
    }

    const fromGlobal = new PIXI.Point();
    card.getGlobalPosition(fromGlobal);
    const targetGlobal = this.getGridCellCenterGlobal(cell.row, cell.col);
    const cardSnapshot = structuredClone(data) as Card;
    const success = get().playCard(liveIdx, cell.row, cell.col);
    if (!success) {
      card.playReturnAnimation();
      this.showToast({ text: '目标无效，已取消释放', tone: 'danger', color: 0xffb3b3 });
      return;
    }

    this.vfxQueue.enqueue(() =>
      runActionTargetVfx(this.fxLayer, cardSnapshot, fromGlobal, targetGlobal.x, targetGlobal.y)
    );
  }

  private handleHandTrimDiscard(card: CardSprite, idx: number) {
    const get = useGameStore.getState;
    const liveIdx =
      idx >= 0 && idx < get().hand.length
        ? idx
        : this.getHandController().resolveCardIndexInStore(card);
    if (liveIdx < 0 || liveIdx >= get().hand.length) {
      card.playReturnAnimation();
      return;
    }
    const ok = get().discardHandCardForTrim(liveIdx);
    if (!ok) {
      this.showToast({ text: '此卡不可弃置，请打出', tone: 'danger', color: 0xffb3b3 });
      card.playReturnAnimation();
    }
  }
}
