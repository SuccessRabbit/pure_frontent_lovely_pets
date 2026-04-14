import * as PIXI from 'pixi.js';
import { CardSprite } from '../entities/CardSprite';
import { GridCell } from '../entities/GridCell';
import { InputManager } from '../core/InputManager';
import { Tween, Easing } from '../utils/Tween';
import type { IsometricPetRenderer } from '../renderers/IsometricPetRenderer';
import { getActionTargetMode } from '../../store/actionEffects';

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
  /** 距离屏幕底部多少 CSS 像素内开始计入「接近底边弃牌区」 */
  private static readonly DISCARD_ZONE_BOTTOM_SCREEN = 200;
  /** 接近度 ≥ 此值时视为在弃牌释放区内（与 UI 提示一致） */
  public static readonly HAND_TRIM_DISCARD_RELEASE = 0.88;

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
  /** 底边弃牌：接近度足够，松手将弃牌 */
  private handTrimBottomDiscardReady = false;
  /** 是否处于回合末手牌整理（拖向底边弃牌） */
  private awaitingHandTrim: (() => boolean) | null = null;
  /** 3D 宠物渲染器引用（用于 3D 格子命中检测） */
  private petRenderer: IsometricPetRenderer | null = null;
  /** 当前悬停的格子（供 GameScene 同步 3D 高亮） */
  private hoveredCell: GridCell | null = null;
  /** 拖拽卡牌当前目标透明度，避免每帧重复创建 tween */
  private dragCardAlphaTarget = 1;

  /** 实体牌落格：由 GameScene 实现校验、立即 playCard + 排队 VFX（未设置 hook 时无法落格） */
  public onRequestEntityPlace:
    | ((card: CardSprite, cell: GridCell, targetX: number, targetY: number) => void)
    | null = null;

  /** 行动牌在释放区松手 */
  public onRequestActionTrigger: ((card: CardSprite, cardIndex: number) => void) | null = null;
  /** 指向性行动牌拖到目标格后松手 */
  public onRequestActionTargetDrop:
    | ((card: CardSprite, cardIndex: number, cell: GridCell) => void)
    | null = null;

  /** 整理阶段：拖向屏幕底边红区松手弃牌 */
  public onRequestHandTrimDiscard: ((card: CardSprite, cardIndex: number) => void) | null = null;

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

  public setAwaitingHandTrimGetter(fn: (() => boolean) | null) {
    this.awaitingHandTrim = fn;
  }

  public setDiscardDesignRoot(root: PIXI.Container | null) {
    void root;
  }

  public setPetRenderer(renderer: IsometricPetRenderer | null): void {
    this.petRenderer = renderer;
  }

  public getHoveredCell(): GridCell | null {
    return this.hoveredCell;
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
    if (this.draggingCard && !this.draggingCard.destroyed) {
      Tween.killTarget(this.draggingCard);
      this.draggingCard.alpha = 1;
    }
    this.dragCardAlphaTarget = 1;
    this.draggingCard = null;
    this.dragKind = null;
    this.dragCardIndex = -1;
    this.actionZoneHovered = false;
    this.handTrimBottomDiscardReady = false;
    this.clearHighlights();
  }

  private isAwaitingHandTrim(): boolean {
    return this.awaitingHandTrim?.() ?? false;
  }

  /**
   * 手牌整理拖拽时：按指针在屏幕坐标中的 Y 与底边的接近程度 0~1。
   * 弃牌区固定为屏幕底部 200 CSS 像素范围内。
   */
  public getHandTrimBottomDiscardProximity(): number {
    if (!this.draggingCard || !this.isAwaitingHandTrim()) return 0;
    const mouse = this.inputManager.getMouse();
    const screenY = mouse.y;
    const bottom = Math.max(1, window.innerHeight);
    const zoneTop = Math.max(0, bottom - DragSystem.DISCARD_ZONE_BOTTOM_SCREEN);
    if (screenY < zoneTop) return 0;
    if (screenY >= bottom) return 1;
    return (screenY - zoneTop) / Math.max(1, bottom - zoneTop);
  }

  private computeHandTrimBottomDiscardReady(): boolean {
    return this.getHandTrimBottomDiscardProximity() >= DragSystem.HAND_TRIM_DISCARD_RELEASE;
  }

  private isDragTargetAlive(card: CardSprite | null): card is CardSprite {
    return card != null && !card.destroyed && card.parent != null;
  }

  private tweenDraggingCardAlpha(targetAlpha: number) {
    if (!this.draggingCard || this.draggingCard.destroyed) return;
    if (Math.abs(this.dragCardAlphaTarget - targetAlpha) < 0.001) return;
    this.dragCardAlphaTarget = targetAlpha;
    Tween.killTarget(this.draggingCard);
    Tween.to(this.draggingCard, { alpha: targetAlpha }, 160, Easing.easeOutCubic);
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
    this.dragCardAlphaTarget = 1;
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

    const trim = this.isAwaitingHandTrim();
    const discardP = trim ? this.getHandTrimBottomDiscardProximity() : 0;
    this.handTrimBottomDiscardReady = trim && this.computeHandTrimBottomDiscardReady();
    const towardBottomDiscard = trim && discardP > 0.08;

    if (this.dragKind === 'entity') {
      let validHoveredCell: GridCell | null = null;
      if (towardBottomDiscard) {
        this.clearHighlights();
      } else {
        const hoveredCell = this.findHoveredCell(mouse.x, mouse.y);
        this.gridCells.forEach(cell => {
          if (cell === hoveredCell && cell.isEmpty && !cell.isRuins) {
            validHoveredCell = cell;
            cell.setHighlight(true);
          } else {
            cell.setHighlight(false);
          }
        });
      }
      this.tweenDraggingCardAlpha(validHoveredCell ? 0.2 : 1);
      this.actionZoneHovered = false;
    } else {
      const actionTargetMode = getActionTargetMode(this.draggingCard.cardData.id);
      if (actionTargetMode === 'none') {
        this.tweenDraggingCardAlpha(1);
        this.clearHighlights();
        if (towardBottomDiscard) {
          this.actionZoneHovered = false;
        } else {
          this.actionZoneHovered = this.actionZone?.containsScreen(mouse.x, mouse.y) ?? false;
        }
      } else {
        let validHoveredCell: GridCell | null = null;
        if (towardBottomDiscard) {
          this.clearHighlights();
        } else {
          const hoveredCell = this.findHoveredCell(mouse.x, mouse.y);
          this.gridCells.forEach(cell => {
            if (cell === hoveredCell && !cell.isRuins && !cell.isEmpty) {
              validHoveredCell = cell;
              cell.setHighlight(true);
            } else {
              cell.setHighlight(false);
            }
          });
        }
        this.tweenDraggingCardAlpha(validHoveredCell ? 0.2 : 1);
        this.actionZoneHovered = false;
      }
    }

    if (mouse.justReleased) {
      logDragFlow('update:mouseReleased', {
        card: this.draggingCard ? `${this.draggingCard.cardData.id}:${this.draggingCard.cardData.type}` : null,
        kind: this.dragKind,
        screen: [mouse.x, mouse.y],
        actionZoneHovered: this.actionZoneHovered,
        handTrimBottomDiscardReady: this.handTrimBottomDiscardReady,
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
    const trim = this.isAwaitingHandTrim();
    const doHandTrimDiscard = trim && this.computeHandTrimBottomDiscardReady();

    this.draggingCard = null;
    this.dragKind = null;
    this.dragCardIndex = -1;

    this.clearHighlights();
    this.handTrimBottomDiscardReady = false;
    Tween.killTarget(card);
    card.alpha = 1;
    this.dragCardAlphaTarget = 1;

    logDragFlow('endDragEntity', {
      card: `${card.cardData.id}:${card.cardData.type}`,
      dragCardIndex: idx,
      targetCell: targetCell ? [targetCell.row, targetCell.col] : null,
      targetEmpty: targetCell?.isEmpty ?? null,
    });

    if (doHandTrimDiscard) {
      if (this.onRequestHandTrimDiscard) {
        card.playDragEndAnimation({ keepFront: true });
        this.onRequestHandTrimDiscard(card, idx);
      } else {
        card.playDragEndAnimation();
        card.playReturnAnimation();
      }
      logDragFlow('endDragEntity:handTrimDiscard');
      return;
    }

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
    const trim = this.isAwaitingHandTrim();
    const doHandTrimDiscard = trim && this.computeHandTrimBottomDiscardReady();

    this.draggingCard = null;
    this.dragKind = null;
    this.dragCardIndex = -1;
    this.actionZoneHovered = false;
    this.handTrimBottomDiscardReady = false;
    Tween.killTarget(card);
    card.alpha = 1;
    this.dragCardAlphaTarget = 1;

    this.clearHighlights();

    if (doHandTrimDiscard) {
      if (this.onRequestHandTrimDiscard) {
        card.playDragEndAnimation({ keepFront: true });
        this.onRequestHandTrimDiscard(card, idx);
      } else {
        card.playDragEndAnimation();
        card.playReturnAnimation();
      }
      logDragFlow('endDragAction:handTrimDiscard');
      return;
    }

    const actionTargetMode = getActionTargetMode(card.cardData.id);
    const targetCell =
      actionTargetMode === 'none' ? null : this.findHoveredCell(screenX, screenY);
    const inZone = actionTargetMode === 'none' && (this.actionZone?.containsScreen(screenX, screenY) ?? false);
    logDragFlow('endDragAction', {
      card: `${card.cardData.id}:${card.cardData.type}`,
      dragCardIndex: idx,
      screen: [screenX, screenY],
      inZone,
      actionTargetMode,
      targetCell: targetCell ? [targetCell.row, targetCell.col] : null,
    });
    if (
      actionTargetMode !== 'none' &&
      targetCell &&
      !targetCell.isRuins &&
      !targetCell.isEmpty &&
      this.onRequestActionTargetDrop
    ) {
      card.playDragEndAnimation({ keepFront: true });
      this.onRequestActionTargetDrop(card, idx, targetCell);
    } else if (inZone && this.onRequestActionTrigger) {
      card.playDragEndAnimation({ keepFront: true });
      this.onRequestActionTrigger(card, idx);
    } else {
      card.playDragEndAnimation();
      card.playReturnAnimation();
    }
    logDragFlow('endDragAction:done', { inZone });
  }

  private findHoveredCell(screenX: number, screenY: number): GridCell | null {
    // 优先使用 3D 射线检测
    if (this.petRenderer) {
      const gridPos = this.petRenderer.screenToGridCell(screenX, screenY);
      if (gridPos) {
        const cell = this.gridCells.find(c => c.row === gridPos.row && c.col === gridPos.col);
        this.hoveredCell = cell || null;
        return this.hoveredCell;
      }
      this.hoveredCell = null;
      return null;
    }
    // 降级：使用 2D 命中检测
    const cell = this.gridCells.find(cell => cell.containsScreenPoint(screenX, screenY)) || null;
    this.hoveredCell = cell;
    return cell;
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
    this.hoveredCell = null;
  }

  public isDragging(): boolean {
    return this.draggingCard !== null;
  }

  public isDraggingAction(): boolean {
    return this.draggingCard !== null && this.dragKind === 'action';
  }

  public isDraggingEntity(): boolean {
    return this.draggingCard !== null && this.dragKind === 'entity';
  }

  public isDraggingZoneAction(): boolean {
    return (
      this.draggingCard !== null &&
      this.dragKind === 'action' &&
      getActionTargetMode(this.draggingCard.cardData.id) === 'none'
    );
  }

  public isDraggingTargetedAction(): boolean {
    return (
      this.draggingCard !== null &&
      this.dragKind === 'action' &&
      getActionTargetMode(this.draggingCard.cardData.id) !== 'none'
    );
  }

  public isActionZoneHovered(): boolean {
    return this.actionZoneHovered;
  }

  public isDiscardZoneHovered(): boolean {
    return this.handTrimBottomDiscardReady;
  }

  public isDraggingForHandTrim(): boolean {
    return this.draggingCard !== null && this.isAwaitingHandTrim();
  }
}
