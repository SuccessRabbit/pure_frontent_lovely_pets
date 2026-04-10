import * as PIXI from 'pixi.js';
import { CardSprite } from '../entities/CardSprite';
import { GridCell } from '../entities/GridCell';
import { InputManager } from '../core/InputManager';
import { Tween } from '../utils/Tween';

export type HandDragKind = 'entity' | 'action';
const DEBUG_DRAG_FLOW = true;

function logDragFlow(message: string, payload?: unknown) {
  if (!DEBUG_DRAG_FLOW) return;
  if (payload === undefined) {
    console.log(`[DragFlow] ${message}`);
  } else {
    console.log(`[DragFlow] ${message}`, payload);
  }
}

/** 屏幕坐标下检测行动牌释放区 */
export interface ActionZoneHit {
  containsScreen(screenX: number, screenY: number): boolean;
  getCenterGlobal(out: PIXI.Point): void;
}

/**
 * 鼠标坐标与 InputManager 一致：画布 CSS 像素（屏幕空间）。
 * 卡牌挂在 handContainer 下，位置必须用 toLocal 换算，不能与屏幕坐标混用。
 */
export class DragSystem {
  private draggingCard: CardSprite | null = null;
  private dragKind: HandDragKind | null = null;
  private dragCardIndex = -1;
  private gridCells: GridCell[] = [];
  private inputManager: InputManager;
  private enabled = true;
  private dragOffset = { x: 0, y: 0 };
  private handContainer: PIXI.Container;
  private gridContainer: PIXI.Container;
  private actionZone: ActionZoneHit | null = null;
  /** 当前帧行动区是否悬停（供 GameScene 画高亮） */
  private actionZoneHovered = false;

  /** 实体牌落格：由 GameScene 实现校验、立即 playCard + 排队 VFX（未设置 hook 时无法落格） */
  public onRequestEntityPlace:
    | ((card: CardSprite, cell: GridCell, targetX: number, targetY: number) => void)
    | null = null;

  /** 行动牌在释放区松手 */
  public onRequestActionTrigger: ((card: CardSprite, cardIndex: number) => void) | null = null;

  constructor(
    inputManager: InputManager,
    handContainer: PIXI.Container,
    gridContainer: PIXI.Container
  ) {
    this.inputManager = inputManager;
    this.handContainer = handContainer;
    this.gridContainer = gridContainer;
  }

  public setGridCells(cells: GridCell[]) {
    this.gridCells = cells;
  }

  public setActionZone(zone: ActionZoneHit | null) {
    this.actionZone = zone;
  }

  public setEnabled(on: boolean) {
    this.enabled = on;
    if (!on && this.draggingCard) {
      const c = this.draggingCard;
      if (!c.destroyed && c.parent) {
        c.playDragEndAnimation();
        c.playReturnAnimation();
      }
      this.clearDragStateOnly();
    }
  }

  /** 手牌整排销毁前必须调用：避免仍指向已 destroy 的 CardSprite 导致每帧写属性崩溃 */
  public prepareForHandRebuild() {
    if (!this.draggingCard) return;
    const card = this.draggingCard;
    Tween.killTarget(card);
    Tween.killTarget(card.scale);
    card.isDragging = false;
    this.clearDragStateOnly();
  }

  private clearDragStateOnly() {
    this.draggingCard = null;
    this.dragKind = null;
    this.dragCardIndex = -1;
    this.actionZoneHovered = false;
    this.clearHighlights();
  }

  private isDragTargetAlive(card: CardSprite | null): card is CardSprite {
    return card != null && !card.destroyed && card.parent != null;
  }

  public startDrag(
    card: CardSprite,
    screenX: number,
    screenY: number,
    kind: HandDragKind,
    cardIndex: number
  ) {
    if (!this.enabled) return;
    if (!this.isDragTargetAlive(card)) return;

    if (this.draggingCard && this.draggingCard !== card) {
      const prev = this.draggingCard;
      if (this.isDragTargetAlive(prev)) {
        Tween.killTarget(prev);
        Tween.killTarget(prev.scale);
        prev.isDragging = false;
        prev.playDragEndAnimation();
        prev.playReturnAnimation();
      }
      this.clearDragStateOnly();
    }

    this.draggingCard = card;
    this.dragKind = kind;
    this.dragCardIndex = cardIndex;
    const local = this.handContainer.toLocal({ x: screenX, y: screenY });
    this.dragOffset.x = local.x - card.x;
    this.dragOffset.y = local.y - card.y;

    card.playDragStartAnimation();
    if (kind === 'entity') {
      this.highlightValidCells();
    } else {
      this.clearHighlights();
    }

    logDragFlow('startDrag', {
      card: `${card.cardData.id}:${card.cardData.type}`,
      kind,
      cardIndex,
      screen: [screenX, screenY],
      offset: this.dragOffset,
    });
  }

  public update() {
    if (!this.enabled) return;

    if (this.draggingCard && !this.isDragTargetAlive(this.draggingCard)) {
      logDragFlow('update:staleDragTargetCleared');
      this.clearDragStateOnly();
      return;
    }

    if (!this.draggingCard || !this.dragKind) return;

    const mouse = this.inputManager.getMouse();
    const local = this.handContainer.toLocal({ x: mouse.x, y: mouse.y });
    this.draggingCard.x = local.x - this.dragOffset.x;
    this.draggingCard.y = local.y - this.dragOffset.y;

    if (this.dragKind === 'entity') {
      const hoveredCell = this.findHoveredCell(mouse.x, mouse.y);
      this.gridCells.forEach(cell => {
        if (cell === hoveredCell && cell.isEmpty && !cell.isRuins) {
          cell.setHighlight(true);
        } else {
          cell.setHighlight(false);
        }
      });
      this.actionZoneHovered = false;
    } else {
      this.clearHighlights();
      this.actionZoneHovered = this.actionZone?.containsScreen(mouse.x, mouse.y) ?? false;
    }

    if (mouse.justReleased) {
      logDragFlow('update:mouseReleased', {
        card: this.draggingCard ? `${this.draggingCard.cardData.id}:${this.draggingCard.cardData.type}` : null,
        kind: this.dragKind,
        screen: [mouse.x, mouse.y],
        actionZoneHovered: this.actionZoneHovered,
      });
      if (this.dragKind === 'action') {
        this.endDragAction(mouse.x, mouse.y);
      } else {
        const hoveredCell = this.findHoveredCell(mouse.x, mouse.y);
        this.endDragEntity(hoveredCell);
      }
    }
  }

  private endDragEntity(targetCell: GridCell | null) {
    if (!this.draggingCard) return;

    const card = this.draggingCard;
    const idx = this.dragCardIndex;
    this.draggingCard = null;
    this.dragKind = null;
    this.dragCardIndex = -1;

    this.clearHighlights();

    logDragFlow('endDragEntity', {
      card: `${card.cardData.id}:${card.cardData.type}`,
      dragCardIndex: idx,
      targetCell: targetCell ? [targetCell.row, targetCell.col] : null,
      targetEmpty: targetCell?.isEmpty ?? null,
    });

    if (targetCell && targetCell.isEmpty && !targetCell.isRuins) {
      card.playDragEndAnimation({ keepFront: true });
      this.runEntityPlace(card, targetCell, idx);
    } else {
      card.playDragEndAnimation();
      card.playReturnAnimation();
    }
    logDragFlow('endDragEntity:done');
  }

  private runEntityPlace(card: CardSprite, cell: GridCell, _cardIndex: number) {
    const cellCenter = new PIXI.Point(
      cell.x + cell.cellWidth / 2,
      cell.y + cell.cellHeight / 2
    );
    const globalDest = this.gridContainer.toGlobal(cellCenter);
    const targetInHand = this.handContainer.toLocal(globalDest);

    if (this.onRequestEntityPlace) {
      logDragFlow('runEntityPlace:hook', {
        card: `${card.cardData.id}:${card.cardData.type}`,
        cell: [cell.row, cell.col],
        targetInHand: [targetInHand.x, targetInHand.y],
      });
      this.onRequestEntityPlace(card, cell, targetInHand.x, targetInHand.y);
    } else {
      console.warn('[DragSystem] onRequestEntityPlace is not set; entity drop ignored.');
      card.playReturnAnimation();
    }
    logDragFlow('runEntityPlace:scheduledFx', {
      card: `${card.cardData.id}:${card.cardData.type}`,
      cell: [cell.row, cell.col],
    });
  }

  private endDragAction(screenX: number, screenY: number) {
    if (!this.draggingCard) return;

    const card = this.draggingCard;
    const idx = this.dragCardIndex;
    this.draggingCard = null;
    this.dragKind = null;
    this.dragCardIndex = -1;
    this.actionZoneHovered = false;

    this.clearHighlights();

    const inZone = this.actionZone?.containsScreen(screenX, screenY) ?? false;
    logDragFlow('endDragAction', {
      card: `${card.cardData.id}:${card.cardData.type}`,
      dragCardIndex: idx,
      screen: [screenX, screenY],
      inZone,
    });
    if (inZone && this.onRequestActionTrigger) {
      card.playDragEndAnimation({ keepFront: true });
      this.onRequestActionTrigger(card, idx);
    } else {
      card.playDragEndAnimation();
      card.playReturnAnimation();
    }
    logDragFlow('endDragAction:done', { inZone });
  }

  private findHoveredCell(screenX: number, screenY: number): GridCell | null {
    return (
      this.gridCells.find(cell => cell.containsScreenPoint(screenX, screenY)) || null
    );
  }

  private highlightValidCells() {
    this.gridCells.forEach(cell => {
      if (cell.isEmpty && !cell.isRuins) {
        cell.setHighlight(true);
      }
    });
  }

  private clearHighlights() {
    this.gridCells.forEach(cell => cell.setHighlight(false));
  }

  public isDragging(): boolean {
    return this.draggingCard !== null;
  }

  public isDraggingAction(): boolean {
    return this.draggingCard !== null && this.dragKind === 'action';
  }

  public isActionZoneHovered(): boolean {
    return this.actionZoneHovered;
  }
}
