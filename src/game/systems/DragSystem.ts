import * as PIXI from 'pixi.js';
import { CardSprite } from '../entities/CardSprite';
import { GridCell } from '../entities/GridCell';
import { InputManager } from '../core/InputManager';

export type HandDragKind = 'entity' | 'action';

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

  /** 实体牌落格：由 GameScene 实现飞入 + 溶解 + emit cardPlaced */
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
      this.draggingCard.playDragEndAnimation();
      this.draggingCard.playReturnAnimation();
      this.draggingCard = null;
      this.dragKind = null;
      this.dragCardIndex = -1;
      this.actionZoneHovered = false;
      this.clearHighlights();
    }
  }

  public startDrag(
    card: CardSprite,
    screenX: number,
    screenY: number,
    kind: HandDragKind,
    cardIndex: number
  ) {
    if (!this.enabled) return;
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

    console.log('Drag started:', card.cardData.name, kind);
  }

  public update() {
    if (!this.enabled || !this.draggingCard || !this.dragKind) return;

    const mouse = this.inputManager.getMouse();
    const local = this.handContainer.toLocal({ x: mouse.x, y: mouse.y });
    this.draggingCard.x = local.x - this.dragOffset.x;
    this.draggingCard.y = local.y - this.dragOffset.y;

    if (this.dragKind === 'entity') {
      const hoveredCell = this.findHoveredCell(mouse.x, mouse.y);
      this.gridCells.forEach(cell => {
        if (cell === hoveredCell && cell.isEmpty) {
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

    if (targetCell && targetCell.isEmpty) {
      card.playDragEndAnimation({ keepFront: true });
      this.runEntityPlace(card, targetCell, idx);
    } else {
      card.playDragEndAnimation();
      card.playReturnAnimation();
    }

    console.log('Drag ended (entity)');
  }

  private runEntityPlace(card: CardSprite, cell: GridCell, _cardIndex: number) {
    const cellCenter = new PIXI.Point(
      cell.x + cell.cellWidth / 2,
      cell.y + cell.cellHeight / 2
    );
    const globalDest = this.gridContainer.toGlobal(cellCenter);
    const targetInHand = this.handContainer.toLocal(globalDest);

    if (this.onRequestEntityPlace) {
      this.onRequestEntityPlace(card, cell, targetInHand.x, targetInHand.y);
    } else {
      card.playPlaceAnimation(targetInHand.x, targetInHand.y, () => {
        card.emit('cardPlaced', { card, cell });
      });
    }

    console.log(`Card place FX: ${card.cardData.name} at [${cell.row}, ${cell.col}]`);
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
    if (inZone && this.onRequestActionTrigger) {
      card.playDragEndAnimation({ keepFront: true });
      this.onRequestActionTrigger(card, idx);
    } else {
      card.playDragEndAnimation();
      card.playReturnAnimation();
    }

    console.log('Drag ended (action)', inZone ? 'trigger' : 'cancel');
  }

  private findHoveredCell(screenX: number, screenY: number): GridCell | null {
    return (
      this.gridCells.find(cell => cell.containsScreenPoint(screenX, screenY)) || null
    );
  }

  private highlightValidCells() {
    this.gridCells.forEach(cell => {
      if (cell.isEmpty) {
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
