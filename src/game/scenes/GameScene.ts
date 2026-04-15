import * as PIXI from 'pixi.js';
import { Scene } from '../core/Scene';
import { GridCell } from '../entities/GridCell';
import { DragSystem } from '../systems/DragSystem';
import { VfxQueue } from '../systems/VfxQueue';
import { ToastPresenter, toastFromColor, type ToastMessage } from '../systems/ToastPresenter';
import { InputManager } from '../core/InputManager';
import { snapshotGameState, useGameStore } from '../../store/gameStore';
import type { GridEntity } from '../../store/gameStore';
import type { StatusInstance, StatusTheme } from '../status/statusTypes';
import { HAND_SIZE_MAX } from '@config/gameRules';
import { Tween, Easing } from '../utils/Tween';
import { IsometricPetRenderer } from '../renderers/IsometricPetRenderer';
import { burstParticlesAtGlobal, PET_BURST_COLORS } from '../utils/cardFx';
import {
  strokeDark,
  strokeDarkBold,
  strokeOnWarm,
} from '../utils/fxTextStyles';
import { VISUAL_THEME, type SceneMood } from '../theme/visualTheme';
import { resolveStatusVisual } from '../status/statusRegistry';
import { CardInteractionController } from './gameScene/CardInteractionController';
import { GameOverController } from './gameScene/GameOverController';
import { GridInteractionController } from './gameScene/GridInteractionController';
import { HandController } from './gameScene/HandController';
import { GameSceneUiController } from './gameScene/GameSceneUiController';
import { TurnResolutionController } from './gameScene/TurnResolutionController';
import { runGameCommand } from '../rules/ResolutionEngine';

const PHASE_GAP_MS = 380;
const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;
const DEBUG_SCENE_FLOW = true;

function logSceneFlow(message: string, payload?: unknown) {
  if (!DEBUG_SCENE_FLOW) return;
  if (payload === undefined) {
    console.log(`[SceneFlow] ${message}`);
  } else {
    console.log(`[SceneFlow] ${message}`, payload);
  }
}

function waitMs(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

export class GameScene extends Scene {
  private gridCells: GridCell[] = [];
  private gridInteractionController: GridInteractionController;
  private gameOverController: GameOverController;
  private cardInteractionController: CardInteractionController;
  private handController: HandController;
  private uiController: GameSceneUiController;
  private turnResolutionController: TurnResolutionController;
  private dragSystem: DragSystem;
  private inputManager: InputManager;
  private storeUnsub: (() => void) | null = null;
  private roundResolving = false;
  private vfxQueue = new VfxQueue();
  /** 3D 等轴视角宠物渲染器 */
  private petRenderer: IsometricPetRenderer | null = null;
  /** 3D 渲染器窗口 resize 处理 */
  private readonly boundPetRendererResize = () => this.onPetRendererResize();

  // UI 容器
  private gridContainer: PIXI.Container;
  private handContainer: PIXI.Container;
  private uiContainer: PIXI.Container;
  /** 飘字、阶段条（最顶层） */
  private fxLayer: PIXI.Container;

  /** 飘字锚点（屏幕中上，避免挤在角落） */
  private hudToastAnchor!: PIXI.Container;
  private toastPresenter: ToastPresenter;
  private globalStatusHud!: PIXI.Container;
  private entityStatusHud!: PIXI.Container;
  private statusTooltipLayer!: PIXI.Container;
  private statusTooltipBg!: PIXI.Graphics;
  private statusTooltipTitle!: PIXI.Text;
  private statusTooltipDescription!: PIXI.Text;
  private pinnedStatusTooltipKey: string | null = null;
  private deckDisplayOverrideCount: number | null = null;

  /** 点格子外区域时取消选格（与 container 的 pointerdown 绑定） */
  private boundPointerDownWhilePending?: (e: PIXI.FederatedPointerEvent) => void;

  constructor(inputManager: InputManager) {
    super();
    this.inputManager = inputManager;

    this.gridContainer = new PIXI.Container();
    this.handContainer = new PIXI.Container();
    this.handContainer.sortableChildren = true;
    this.uiContainer = new PIXI.Container();

    this.dragSystem = new DragSystem(inputManager, this.handContainer, this.gridContainer);

    this.fxLayer = new PIXI.Container();

    this.container.addChild(this.gridContainer);
    this.container.addChild(this.handContainer);
    this.container.addChild(this.uiContainer);
    this.container.addChild(this.fxLayer);

    this.hudToastAnchor = new PIXI.Container();
    this.hudToastAnchor.position.set(960, 118);
    this.uiContainer.addChild(this.hudToastAnchor);
    this.toastPresenter = new ToastPresenter({
      anchor: this.hudToastAnchor,
      fxLayer: this.fxLayer,
    });
    this.globalStatusHud = new PIXI.Container();
    this.globalStatusHud.position.set(1180, 102);
    this.uiContainer.addChild(this.globalStatusHud);
    this.entityStatusHud = new PIXI.Container();
    this.entityStatusHud.eventMode = 'static';
    this.entityStatusHud.sortableChildren = true;
    this.uiContainer.addChild(this.entityStatusHud);

    this.uiController = new GameSceneUiController({
      uiContainer: this.uiContainer,
      onEndTurnAttempt: () => {
        if (this.isHandTrimUiActive()) {
          this.showToast({
            text: `请先将手牌整理至 ${HAND_SIZE_MAX} 张以内`,
            tone: 'warning',
            color: 0xfff9c4,
          });
          return;
        }
        void this.runEndTurnSequence();
      },
    });

    this.gridInteractionController = new GridInteractionController({
      getGridCells: () => this.gridCells,
      getPetRenderer: () => this.petRenderer,
      isTargetUnderGridCell: target => {
        let current: PIXI.Container | null | undefined = target ?? undefined;
        while (current) {
          if (current instanceof GridCell) return true;
          current = current.parent;
        }
        return false;
      },
      isTargetIgnored: target => {
        let current: PIXI.Container | null | undefined = target ?? undefined;
        while (current) {
          if (
            current === this.handContainer ||
            current === this.fxLayer ||
            this.uiController.isTargetUnderEndTurnButton(current) ||
            this.uiController.isTargetUnderUi(current)
          ) {
            return true;
          }
          current = current.parent;
        }
        return false;
      },
      setDragEnabled: on => this.dragSystem.setEnabled(on),
      showToast: message => this.showToast(message),
      syncGridFromStore: () => this.syncGridFromStore(),
    });

    this.gameOverController = new GameOverController({
      fxLayer: this.fxLayer,
      onRestart: () => {
        useGameStore.getState().restartRun();
      },
    });

    this.cardInteractionController = new CardInteractionController({
      dragSystem: this.dragSystem,
      fxLayer: this.fxLayer,
      vfxQueue: this.vfxQueue,
      getGridCells: () => this.gridCells,
      getMouse: () => this.inputManager.getMouse(),
      getActionZoneCenterGlobal: out => {
        this.uiController.getActionZoneHit()?.getCenterGlobal(out);
      },
      getHandController: () => this.handController,
      getGridInteractionController: () => this.gridInteractionController,
      getGridCellCenterGlobal: (row, col) => this.getGridCellCenterGlobal(row, col),
      revealPlacedEntity: (row, col) => this.revealPlacedEntity(row, col),
      showToast: message => this.showToast(message),
      logFlow: (message, payload) => logSceneFlow(message, payload),
    });

    this.handController = new HandController({
      handContainer: this.handContainer,
      fxLayer: this.fxLayer,
      rootContainer: this.container,
      vfxQueue: this.vfxQueue,
      getPetRenderer: () => this.petRenderer,
      getStoreState: () => {
        const state = useGameStore.getState();
        return {
          hand: state.hand,
          lastDrawEvent: state.lastDrawEvent,
        };
      },
      isDragging: () => this.dragSystem.isDragging(),
      onStartDrag: (card, index) => this.cardInteractionController.startHandCardDrag(card, index),
      showToast: message => this.showToast(message),
      setDeckDisplayOverrideCount: count => {
        this.deckDisplayOverrideCount = count;
        this.petRenderer?.setDeckCount(count ?? useGameStore.getState().deck.length);
      },
    });

    this.turnResolutionController = new TurnResolutionController({
      getRoundResolving: () => this.roundResolving,
      setRoundResolving: value => {
        this.roundResolving = value;
      },
      clearPendingActionPick: () => this.gridInteractionController.clearPendingActionPick(),
      setEndTurnInteractable: on => this.setEndTurnInteractable(on),
      showPhaseBanner: (title, holdMs) => this.showPhaseBanner(title, holdMs),
      showEntityCue: (row, col, title, subtitle, color) =>
        this.showEntityCue(row, col, title, subtitle, color),
      spawnIncomeFloat: (row, col, amount) => this.spawnIncomeFloat(row, col, amount),
      showToast: message => this.showToast(message),
      spawnStatusBurst: (kind, theme, title, subtitle, color, row, col, global) =>
        this.spawnStatusBurst(kind, theme, title, subtitle, color, row, col, global),
      syncGridFromStore: () => this.syncGridFromStore(),
      sync3DStressOverlays: () => this.sync3DStressOverlays(),
      pulseStressCell: (row, col) => this.pulseStressCell(row, col),
      playManualDrawEvent: event => this.handController.playManualDrawEvent(event),
      prepareManualDrawEvents: events => this.handController.prepareManualDrawEvents(events),
    });
  }

  public onEnter(): void {
    console.log('GameScene entered');
    this.detachFromStore();
    this.createGrid();
    this.createHand();
    this.createUI();
    this.cardInteractionController.wire();
    this.dragSystem.setAwaitingHandTrimGetter(() => this.isHandTrimUiActive());
    this.dragSystem.setDiscardDesignRoot(this.container);
    this.wirePendingActionOutsideCancel();

    // 初始化 3D 宠物渲染器
    this.initPetRenderer();

    this.storeUnsub = useGameStore.subscribe(() => this.onStoreUpdate());
    this.onStoreUpdate();
  }

  public onExit(): void {
    console.log('GameScene exited');
    this.detachFromStore();
  }

  /** React 卸载或销毁引擎前调用，避免订阅回调访问已销毁的显示对象 */
  public detachFromStore(): void {
    this.unwirePendingActionOutsideCancel();
    this.cardInteractionController.unwire();
    this.dragSystem.setDiscardDesignRoot(null);
    this.storeUnsub?.();
    this.storeUnsub = null;
    this.toastPresenter.clear();
    this.gridInteractionController.clearPendingActionPick();
    this.gameOverController.clear();
    this.destroyPetRenderer();
  }

  public update(deltaTime: number): void {
    // 更新 Tween 动画
    Tween.update(deltaTime);

    // 更新拖拽系统
    this.dragSystem.update();
    this.updateActionZoneVisual();
    this.uiController.updateHandTrimBottomDiscardOverlay(
      this.isHandTrimUiActive(),
      this.dragSystem.isDraggingForHandTrim(),
      this.dragSystem.getHandTrimBottomDiscardProximity(),
      DragSystem.HAND_TRIM_DISCARD_RELEASE
    );

    const mouse = this.inputManager.getMouse();
    this.gridInteractionController.sync3DGridHints({
      screenX: mouse.x,
      screenY: mouse.y,
      dragHoveredCell: this.dragSystem.getHoveredCell(),
      dragMode: this.dragSystem.isDraggingEntity()
        ? 'entity'
        : this.dragSystem.isDraggingTargetedAction()
          ? 'action-target'
          : 'none',
    });

    // 3D 宠物渲染（不再使用 2D 颤抖）
    this.petRenderer?.render();
    this.sync3DStressOverlays();

    // 更新 UI 显示
    this.updateUI();
  }

  private sync3DStressOverlays() {
    if (!this.petRenderer) return;
    const { grid } = useGameStore.getState();
    this.gridCells.forEach(cell => {
      const entity = grid[cell.row][cell.col];
      if (!entity) {
        cell.setStressOverlay3DAnchor(null);
        cell.setStatusOverlay3DAnchor(null);
        return;
      }
      const anchor = this.petRenderer?.getPetStressAnchor(cell.row, cell.col) ?? null;
      cell.setStressOverlay3DAnchor(anchor);
      const statusAnchor = this.petRenderer?.getPetStatusAnchor(cell.row, cell.col) ?? null;
      cell.setStatusOverlay3DAnchor(statusAnchor);
    });
  }

  /** 设计分辨率全屏命中，便于点在「空白处」也能收到 pointerdown */
  private wirePendingActionOutsideCancel() {
    this.unwirePendingActionOutsideCancel();
    this.container.eventMode = 'static';
    this.container.hitArea = new PIXI.Rectangle(0, 0, 1920, 1080);
    this.boundPointerDownWhilePending = (e: PIXI.FederatedPointerEvent) => {
      this.onContainerPointerDownWhilePending(e);
    };
    this.container.on('pointerdown', this.boundPointerDownWhilePending);
  }

  private unwirePendingActionOutsideCancel() {
    if (this.boundPointerDownWhilePending) {
      this.container.off('pointerdown', this.boundPointerDownWhilePending);
      this.boundPointerDownWhilePending = undefined;
    }
    this.container.hitArea = null;
    this.container.eventMode = 'auto';
  }

  private onContainerPointerDownWhilePending(e: PIXI.FederatedPointerEvent) {
    this.hideStatusTooltip();
    const target = e.target as PIXI.Container;
    const { x: screenX, y: screenY } = this.inputManager.getMouse();
    this.gridInteractionController.handleContainerPointerDown(target, screenX, screenY);
  }

  private createGrid() {
    const cellWidth = 180;
    const cellHeight = 140;
    const padding = 10;
    const startX = 400;
    const startY = 200;

    // 创建 3x6 网格
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 6; col++) {
        const cell = new GridCell(row, col, cellWidth, cellHeight);
        cell.x = startX + col * (cellWidth + padding);
        cell.y = startY + row * (cellHeight + padding);

        cell.on('pointertap', (e: PIXI.FederatedPointerEvent) => {
          e.stopPropagation();
          this.gridInteractionController.handleGridCellPointer(cell);
        });

        this.gridCells.push(cell);
        this.gridContainer.addChild(cell);
      }
    }

    // 设置网格到拖拽系统
    this.dragSystem.setGridCells(this.gridCells);

    // 启用 3D 模式：隐藏 2D 格子背景
    this.gridCells.forEach(cell => cell.setRenderBackground3DMode(true));

    // 设置格子实体变化回调（用于 3D 渲染）
    this.gridCells.forEach(cell => {
      cell.onEntitySet = (entity, row, col) => {
        this.onGridCellEntitySet(entity, row, col);
      };
    });

    console.log('Grid created: 3x6');
  }

  /** 初始化 3D 等轴视角宠物渲染器 */
  private initPetRenderer(): void {
    const pixiCanvas = this.inputManager.getCanvas();
    const parent = pixiCanvas.parentElement as HTMLElement;

    const threeCanvas = document.createElement('canvas');
    Object.assign(threeCanvas.style, {
      position: 'absolute',
      pointerEvents: 'none',
      zIndex: '2',
    });
    threeCanvas.id = 'three-canvas';
    this.syncThreeCanvasViewport(threeCanvas);

    // 插入到 PixiJS canvas 之后（透明 Pixi 覆盖在上层）
    parent.appendChild(threeCanvas);

    // 创建渲染器
    this.petRenderer = new IsometricPetRenderer(threeCanvas);
    this.petRenderer.setQualityLevel(window.innerWidth >= 1440 ? 'high' : 'medium');

    // 创建 3D 网格格子
    this.petRenderer.createGridCells();

    // 传入 DragSystem 引用（用于 3D 格子命中检测）
    this.dragSystem.setPetRenderer(this.petRenderer);

    // 初始同步所有已有实体和格子状态
    const { grid } = useGameStore.getState();
    const { cellDurability } = useGameStore.getState();
    let petCount = 0;
    grid.forEach((rowEntities, r) => {
      rowEntities.forEach((entity, c) => {
        if (entity) {
          petCount++;
          this.petRenderer?.spawnPet(r, c, entity);
        }
        // 同步格子状态
        const durability = cellDurability[r]?.[c] ?? 0;
        const ruins = durability <= 0;
        this.petRenderer?.syncCellState(r, c, ruins ? 'ruins' : entity ? 'occupied' : 'empty');
      });
    });
    this.syncVisualMood();
    console.log('[3D] Initial pets spawned:', petCount);
    console.log('IsometricPetRenderer initialized');

    // 监听窗口 resize，同步 Three.js canvas 尺寸
    window.addEventListener('resize', this.boundPetRendererResize);
  }

  private getDesignViewportRect() {
    const scale = Math.min(window.innerWidth / DESIGN_WIDTH, window.innerHeight / DESIGN_HEIGHT);
    const width = DESIGN_WIDTH * scale;
    const height = DESIGN_HEIGHT * scale;
    const left = (window.innerWidth - width) * 0.5;
    const top = (window.innerHeight - height) * 0.5;
    return { left, top, width, height };
  }

  private syncThreeCanvasViewport(canvas: HTMLCanvasElement): void {
    const { left, top, width, height } = this.getDesignViewportRect();
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    Object.assign(canvas.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
    });
  }

  /** 销毁 3D 宠物渲染器 */
  private destroyPetRenderer(): void {
    window.removeEventListener('resize', this.boundPetRendererResize);
    if (this.petRenderer) {
      this.petRenderer.destroy();
      this.petRenderer = null;
      console.log('IsometricPetRenderer destroyed');
    }
  }

  /** 3D 渲染器窗口 resize 回调 */
  private onPetRendererResize(): void {
    const threeCanvas = document.getElementById('three-canvas') as HTMLCanvasElement | null;
    if (!threeCanvas || !this.petRenderer) return;
    this.syncThreeCanvasViewport(threeCanvas);
    const { width, height } = this.getDesignViewportRect();
    this.petRenderer.resize(width, height);
    console.log('[3D] PetRenderer resized to', width, 'x', height);
  }

  /** GridCell 实体变化回调 - 同步到 3D 渲染器 */
  private onGridCellEntitySet(entity: GridEntity | null, row: number, col: number): void {
    console.log('[3D] onGridCellEntitySet:', entity?.cardId, 'at', row, col, 'petRenderer exists:', !!this.petRenderer);
    if (!this.petRenderer) return;

    if (entity) {
      this.petRenderer.spawnPet(row, col, entity);
    } else {
      this.petRenderer.removePet(row, col);
    }
  }

  private createHand() {
    this.handController.initPosition();
  }

  private revealPlacedEntity(row: number, col: number) {
    const gc = this.gridCells.find(c => c.row === row && c.col === col);
    if (!gc) return;
    gc.setEntityPortraitSuppressed(false);
    const entity = useGameStore.getState().grid[row][col];
    gc.syncStress(entity);
  }

  private getGridCellCenterGlobal(row: number, col: number): PIXI.Point {
    const projectedCell = this.petRenderer?.getGridCellCenterAnchor(row, col) ?? null;
    if (projectedCell) {
      return this.container.toGlobal(new PIXI.Point(projectedCell.x, projectedCell.y));
    }

    const cell = this.gridCells.find(entry => entry.row === row && entry.col === col);
    if (!cell) {
      return this.container.toGlobal(new PIXI.Point(960, 540));
    }

    return this.gridContainer.toGlobal(
      new PIXI.Point(cell.x + cell.cellWidth / 2, cell.y + cell.cellHeight / 2)
    );
  }

  private createUI() {
    this.uiController.init();
    this.initStatusTooltipLayer();
    this.dragSystem.setActionZone(this.uiController.getActionZoneHit());
  }

  private initStatusTooltipLayer() {
    this.statusTooltipLayer = new PIXI.Container();
    this.statusTooltipLayer.visible = false;
    this.statusTooltipLayer.eventMode = 'none';
    this.statusTooltipLayer.zIndex = 2000;

    this.statusTooltipBg = new PIXI.Graphics();
    this.statusTooltipTitle = new PIXI.Text('', {
      fontFamily: VISUAL_THEME.typography.heading,
      fontSize: 13,
      fill: 0xfbf6ef,
      fontWeight: '700',
      stroke: strokeDarkBold,
      wordWrap: true,
      wordWrapWidth: 220,
      lineHeight: 18,
    });
    this.statusTooltipDescription = new PIXI.Text('', {
      fontFamily: VISUAL_THEME.typography.body,
      fontSize: 12,
      fill: 0xfbf6ef,
      fontWeight: '700',
      stroke: strokeDark,
      wordWrap: true,
      wordWrapWidth: 220,
      lineHeight: 18,
    });
    this.statusTooltipTitle.position.set(12, 10);
    this.statusTooltipDescription.position.set(12, 34);

    this.statusTooltipLayer.addChild(this.statusTooltipBg);
    this.statusTooltipLayer.addChild(this.statusTooltipTitle);
    this.statusTooltipLayer.addChild(this.statusTooltipDescription);
    this.uiContainer.addChild(this.statusTooltipLayer);
  }

  private updateEntityStatusHud(
    grid: (GridEntity | null)[][],
    entityStatuses: Record<string, StatusInstance[]>
  ) {
    this.entityStatusHud.removeChildren().forEach(child => child.destroy({ children: true }));

    this.gridCells.forEach(cell => {
      const entity = grid[cell.row][cell.col];
      if (!entity) return;

      const statuses = entityStatuses[entity.id] ?? [];
      const visible = statuses
        .filter(status => !status.isPassive || status.shortLabel.length > 0)
        .sort(
          (a, b) =>
            resolveStatusVisual(b.kind, b.theme).priority - resolveStatusVisual(a.kind, a.theme).priority
        )
        .slice(0, 3);

      if (visible.length === 0) return;

      const anchor = this.petRenderer?.getPetStatusAnchor(cell.row, cell.col);
      if (!anchor) return;

      const wrap = new PIXI.Container();
      wrap.position.set(anchor.x, anchor.y);
      wrap.zIndex = 50 + cell.row * 10 + cell.col;
      this.entityStatusHud.addChild(wrap);

      visible.forEach((status, index) => {
        const visual = resolveStatusVisual(status.kind, status.theme);
        const badge = new PIXI.Container();
        badge.position.set(index * 34, 0);
        badge.eventMode = 'static';
        badge.cursor = 'help';
        badge.hitArea = new PIXI.Rectangle(0, 0, 28, 28);

        const bg = new PIXI.Graphics();
        bg.beginFill(visual.color, 0.9);
        bg.lineStyle(1.5, 0xffffff, 0.72);
        bg.drawRoundedRect(0, 0, 28, 28, 10);
        bg.endFill();
        badge.addChild(bg);

        const label = new PIXI.Text(visual.shortLabel || visual.symbol, {
          fontFamily: VISUAL_THEME.typography.heading,
          fontSize: 11,
          fill: 0x1f1b2d,
          fontWeight: 'bold',
          stroke: 0xffffff,
        });
        label.anchor.set(0.5);
        label.position.set(14, 11.5);
        badge.addChild(label);

        if (!status.isPassive && status.duration > 0) {
          const duration = new PIXI.Text(`${status.duration}`, {
            fontFamily: VISUAL_THEME.typography.body,
            fontSize: 9,
            fill: 0xfefefe,
            fontWeight: 'bold',
            stroke: strokeDark,
          });
          duration.anchor.set(0.5);
          duration.position.set(14, 21.5);
          badge.addChild(duration);
        }

        const tooltipKey = `entity:${status.id}`;
        const description = this.getStatusDescription(status);
        badge.on('pointerover', (e: PIXI.FederatedPointerEvent) => {
          e.stopPropagation();
          this.showStatusTooltip(e.global.x + 18, e.global.y + 12, status.title, description, null);
        });
        badge.on('pointerout', (e: PIXI.FederatedPointerEvent) => {
          e.stopPropagation();
          if (this.pinnedStatusTooltipKey === tooltipKey) return;
          this.hideStatusTooltip(false);
        });
        badge.on('pointertap', (e: PIXI.FederatedPointerEvent) => {
          e.stopPropagation();
          this.toggleStatusTooltip(tooltipKey, e.global.x + 18, e.global.y + 12, status.title, description);
        });

        wrap.addChild(badge);
      });

      if (statuses.length > 3) {
        const more = new PIXI.Text(`+${statuses.length - 3}`, {
          fontFamily: VISUAL_THEME.typography.body,
          fontSize: 12,
          fill: 0xf7f7f7,
          fontWeight: 'bold',
          stroke: strokeDark,
        });
        more.position.set(108, 7);
        wrap.addChild(more);
      }
    });
  }

  private isHandTrimUiActive(): boolean {
    const state = useGameStore.getState();
    return state.awaitingHandTrim || state.hand.length > HAND_SIZE_MAX;
  }

  /** 拖拽行动牌时加亮释放区 */
  private updateActionZoneVisual() {
    this.uiController.updateActionZoneVisual(
      this.dragSystem.isDraggingZoneAction(),
      this.dragSystem.isActionZoneHovered()
    );
  }

  private setEndTurnInteractable(on: boolean) {
    const trim = this.isHandTrimUiActive();
    const btnOn = on && !trim;
    this.uiController.setEndTurnButtonInteractable(btnOn);
    this.handContainer.eventMode = on ? 'static' : 'none';
    this.dragSystem.setEnabled(on);
  }

  /** 阶段标题：淡入 → 停留 → 淡出 */
  private async showPhaseBanner(title: string, holdMs: number): Promise<void> {
    const wrap = new PIXI.Container();
    const bg = new PIXI.Graphics();
    bg.beginFill(0x000000, 0.16);
    bg.drawRoundedRect(-446, -54, 892, 108, 28);
    bg.endFill();
    bg.beginFill(VISUAL_THEME.colors.cream, 0.94);
    bg.lineStyle(3, VISUAL_THEME.colors.gold, 0.8);
    bg.drawRoundedRect(-430, -46, 860, 92, 24);
    bg.endFill();

    const txt = new PIXI.Text({
      text: title,
      style: {
        fontFamily: VISUAL_THEME.typography.display,
        fontSize: 36,
        fill: VISUAL_THEME.colors.ink,
        fontWeight: 'bold',
        stroke: strokeDarkBold,
        dropShadow: {
          alpha: 0.18,
          angle: Math.PI / 6,
          blur: 6,
          color: 0xffffff,
          distance: 0,
        },
      },
    });
    txt.anchor.set(0.5);

    wrap.addChild(bg);
    wrap.addChild(txt);
    wrap.position.set(960, 500);
    wrap.alpha = 0;
    this.fxLayer.addChild(wrap);

    Tween.to(wrap, { alpha: 1 }, 360, Easing.easeOutCubic);
    await waitMs(360 + holdMs);
    Tween.to(wrap, { alpha: 0 }, 400, Easing.easeInCubic);
    await waitMs(420);
    wrap.destroy({ children: true });
  }

  private spawnIncomeFloat(row: number, col: number, amount: number) {
    const cell = this.gridCells.find(c => c.row === row && c.col === col);
    if (!cell) return;
    const anchor = this.petRenderer?.getCellGuiAnchor(row, col, 18) ?? null;
    const g = anchor
      ? this.container.toGlobal(new PIXI.Point(anchor.x, anchor.y))
      : cell.toGlobal(new PIXI.Point(cell.cellWidth * 0.5, cell.cellHeight * 0.28));
    const lp = this.fxLayer.toLocal(g);
    const t = new PIXI.Text({
      text: `+${amount} 🥫`,
      style: {
        fontFamily: VISUAL_THEME.typography.display,
        fontSize: 28,
        fill: VISUAL_THEME.colors.goldSoft,
        fontWeight: 'bold',
        stroke: strokeOnWarm,
      },
    });
    t.anchor.set(0.5);
    t.position.set(lp.x, lp.y);
    t.alpha = 0;
    this.fxLayer.addChild(t);

    Tween.to(t, { alpha: 1 }, 180, Easing.easeOutQuad, () => {
      Tween.to(t, { y: t.y - 62, alpha: 0 }, 880, Easing.easeOutQuad, () => {
        t.destroy();
      });
    });
  }

  private showToast(message: ToastMessage) {
    this.toastPresenter.show(message);
  }

  private getStatusDescription(status: StatusInstance): string {
    return (
      status.description ||
      String(status.params.descriptionPreview ?? '') ||
      String(status.params.summary ?? '') ||
      status.title
    );
  }

  private showStatusTooltip(
    globalX: number,
    globalY: number,
    title: string,
    description: string,
    pinnedKey?: string | null
  ) {
    if (pinnedKey !== undefined) {
      this.pinnedStatusTooltipKey = pinnedKey;
    }

    this.statusTooltipTitle.text = title;
    this.statusTooltipDescription.text = description;

    const width = Math.max(
      160,
      Math.min(
        260,
        Math.max(this.statusTooltipTitle.width, this.statusTooltipDescription.width) + 24
      )
    );
    this.statusTooltipTitle.style.wordWrapWidth = width - 24;
    this.statusTooltipDescription.style.wordWrapWidth = width - 24;
    this.statusTooltipDescription.position.set(
      12,
      this.statusTooltipTitle.y + this.statusTooltipTitle.height + 6
    );
    const height = Math.max(
      58,
      this.statusTooltipDescription.y + this.statusTooltipDescription.height + 12
    );

    this.statusTooltipBg.clear();
    this.statusTooltipBg.beginFill(0x17131f, 0.95);
    this.statusTooltipBg.lineStyle(2, 0xf9d27d, 0.82);
    this.statusTooltipBg.drawRoundedRect(0, 0, width, height, 12);
    this.statusTooltipBg.endFill();

    const point = this.uiContainer.toLocal(new PIXI.Point(globalX, globalY));
    const margin = 16;
    const x = Math.max(margin, Math.min(DESIGN_WIDTH - width - margin, point.x + 14));
    const y = Math.max(margin, Math.min(DESIGN_HEIGHT - height - margin, point.y - height * 0.5));
    this.statusTooltipLayer.position.set(x, y);
    this.statusTooltipLayer.visible = true;
  }

  private hideStatusTooltip(clearPinned = true) {
    this.statusTooltipLayer.visible = false;
    if (clearPinned) {
      this.pinnedStatusTooltipKey = null;
    }
  }

  private toggleStatusTooltip(
    key: string,
    globalX: number,
    globalY: number,
    title: string,
    description: string
  ) {
    if (this.pinnedStatusTooltipKey === key && this.statusTooltipLayer.visible) {
      this.hideStatusTooltip();
      return;
    }
    this.showStatusTooltip(globalX, globalY, title, description, key);
  }

  private updateGlobalStatusHud(statuses: StatusInstance[]) {
    this.globalStatusHud.removeChildren().forEach(child => child.destroy({ children: true }));
    statuses.slice(0, 4).forEach((status, index) => {
      const visual = resolveStatusVisual(status.kind, status.theme);
      const wrap = new PIXI.Container();
      wrap.position.set(index * 126, 0);
      wrap.eventMode = 'static';
      wrap.cursor = 'help';
      wrap.hitArea = new PIXI.Rectangle(0, 0, 114, 38);

      const bg = new PIXI.Graphics();
      bg.beginFill(0x1f2434, 0.84);
      bg.lineStyle(2, visual.color, 0.7);
      bg.drawRoundedRect(0, 0, 114, 38, 14);
      bg.endFill();
      wrap.addChild(bg);

      const title = new PIXI.Text(`${visual.shortLabel} ${status.title}`, {
        fontFamily: VISUAL_THEME.typography.heading,
        fontSize: 12,
        fill: 0xfbf6ef,
        fontWeight: '700',
        stroke: strokeDark,
      });
      title.position.set(10, 6);
      wrap.addChild(title);

      const duration = new PIXI.Text(status.duration > 0 ? `${status.duration} 回合` : '常驻', {
        fontFamily: VISUAL_THEME.typography.body,
        fontSize: 10,
        fill: visual.color,
        fontWeight: '700',
        stroke: strokeDark,
      });
      duration.position.set(10, 20);
      wrap.addChild(duration);

      const description = this.getStatusDescription(status);
      const tooltipKey = `global:${status.id}`;
      wrap.on('pointerover', () => {
        const point = wrap.getGlobalPosition(new PIXI.Point());
        this.showStatusTooltip(point.x + 114, point.y + 19, status.title, description);
      });
      wrap.on('pointerout', () => {
        if (this.pinnedStatusTooltipKey === tooltipKey) return;
        this.hideStatusTooltip(false);
      });
      wrap.on('pointertap', (e: PIXI.FederatedPointerEvent) => {
        e.stopPropagation();
        const point = wrap.getGlobalPosition(new PIXI.Point());
        this.toggleStatusTooltip(tooltipKey, point.x + 114, point.y + 19, status.title, description);
      });
      this.globalStatusHud.addChild(wrap);
    });
  }

  private statusThemeToParticleColors(theme: StatusTheme, color: number): number[] {
    if (theme === 'buff') return [color, 0xfff1a8, 0xffffff];
    if (theme === 'debuff') return [color, 0xffb0b0, 0x3b2236];
    if (theme === 'passive') return [color, 0xa9f0d1, 0xffffff];
    return [color, 0xb8d8ff, 0xffffff];
  }

  private spawnStatusBurst(
    kind: string,
    theme: StatusTheme,
    title: string,
    subtitle: string,
    color: number,
    row?: number,
    col?: number,
    global = false
  ) {
    const visual = resolveStatusVisual(kind, theme);
    const burstColors = this.statusThemeToParticleColors(theme, color || visual.color);
    if (global || row === undefined || col === undefined) {
      this.showToast(toastFromColor(`${title} · ${subtitle}`, color || visual.color));
      const g = this.hudToastAnchor.toGlobal(new PIXI.Point(140, -6));
      burstParticlesAtGlobal(this.fxLayer, g.x, g.y, {
        count: 18,
        colors: burstColors,
        spread: 54,
        durationMin: 260,
        durationMax: 520,
      });
      return;
    }

    const anchor = this.getCellAnchorGlobal(row, col, 8);
    burstParticlesAtGlobal(this.fxLayer, anchor.x, anchor.y, {
      count: 24,
      colors: burstColors,
      spread: 72,
      durationMin: 320,
      durationMax: 620,
    });
    void this.showEntityCue(row, col, title, subtitle, color || visual.color);
  }

  private getCellAnchorGlobal(row: number, col: number, yOffset = 26) {
    const cell = this.gridCells.find(c => c.row === row && c.col === col);
    if (!cell) return this.container.toGlobal(new PIXI.Point(960, 540));
    const anchor = this.petRenderer?.getCellGuiAnchor(row, col, yOffset) ?? null;
    if (anchor) {
      return this.container.toGlobal(new PIXI.Point(anchor.x, anchor.y));
    }
    return cell.toGlobal(new PIXI.Point(cell.cellWidth * 0.5, cell.cellHeight * 0.28));
  }

  private async showEntityCue(
    row: number,
    col: number,
    title: string,
    subtitle: string,
    color: number
  ) {
    const global = this.getCellAnchorGlobal(row, col);
    const lp = this.fxLayer.toLocal(global);
    const wrap = new PIXI.Container();
    wrap.position.set(lp.x, lp.y);
    wrap.alpha = 0;
    wrap.scale.set(0.72);

    const plate = new PIXI.Graphics();
    plate.beginFill(VISUAL_THEME.colors.surfaceDark, 0.84);
    plate.lineStyle(2, color, 0.78);
    plate.drawRoundedRect(-126, -48, 252, 92, 22);
    plate.endFill();
    wrap.addChild(plate);

    const titleText = new PIXI.Text({
      text: title,
      style: {
        fontFamily: VISUAL_THEME.typography.display,
        fontSize: 22,
        fill: color,
        fontWeight: 'bold',
        stroke: strokeDarkBold,
        align: 'center',
      },
    });
    titleText.anchor.set(0.5);
    titleText.position.set(0, -14);
    wrap.addChild(titleText);

    const subText = new PIXI.Text({
      text: subtitle,
      style: {
        fontFamily: VISUAL_THEME.typography.body,
        fontSize: 14,
        fill: VISUAL_THEME.colors.cream,
        fontWeight: 'bold',
        stroke: strokeDark,
        align: 'center',
      },
    });
    subText.anchor.set(0.5);
    subText.position.set(0, 16);
    wrap.addChild(subText);

    this.fxLayer.addChild(wrap);
    burstParticlesAtGlobal(this.fxLayer, global.x, global.y, {
      count: 18,
      colors: PET_BURST_COLORS,
      spread: 56,
      durationMin: 280,
      durationMax: 560,
    });

    await Promise.all([
      new Promise<void>(resolve => {
        Tween.to(wrap, { alpha: 1 }, 160, Easing.easeOutQuad, resolve);
      }),
      new Promise<void>(resolve => {
        Tween.to(wrap.scale, { x: 1, y: 1 }, 220, Easing.easeOutBack, resolve);
      }),
    ]);
    await waitMs(200);
    await new Promise<void>(resolve => {
      Tween.to(
        wrap,
        { y: wrap.y - 28, alpha: 0 },
        320,
        Easing.easeInCubic,
        resolve
      );
    });
    wrap.destroy({ children: true });
  }

  private pulseStressCell(row: number, col: number) {
    const cell = this.gridCells.find(entry => entry.row === row && entry.col === col);
    if (cell && useGameStore.getState().grid[row][col]) {
      cell.pulseStressBar();
    }
  }

  /** 自动推进：行动→收入（飘字）→结算（暴躁 GUI）→新回合 */
  private async runEndTurnSequence() {
    await this.turnResolutionController.runEndTurnSequence();
  }

  private updateUI() {
    const state = useGameStore.getState();
    this.syncVisualMood();
    const deckDisplayCount = this.deckDisplayOverrideCount ?? state.deck.length;
    this.uiController.updateHud(
      {
        turn: state.turn,
        phase: state.phase,
        cans: state.cans,
        interest: state.interest,
        deckLength: state.deck.length,
        discardLength: state.discardPile.length,
        hearts: state.hearts,
        playerHp: state.playerHp,
        maxPlayerHp: state.maxPlayerHp,
        winStreak: state.winStreak,
        loseStreak: state.loseStreak,
        gameStatus: state.gameStatus,
      },
      {
        deckDisplayCount,
        roundResolving: this.roundResolving,
        handTrimActive: this.isHandTrimUiActive(),
        petRenderer: this.petRenderer,
      }
    );
  }

  /** 与 Zustand grid 对齐占位格显示（放置、移除、拆家等） */
  private syncGridFromStore() {
    const { grid, cellDurability, entityStatuses, globalStatuses } = useGameStore.getState();
    this.gridCells.forEach(cell => {
      const entity = grid[cell.row][cell.col];
      const d = cellDurability[cell.row][cell.col] ?? 0;
      const ruins = d <= 0;
      cell.setStatusTooltipHandlers(
        (status, globalX, globalY) => {
          this.showStatusTooltip(globalX, globalY, status.title, this.getStatusDescription(status));
        },
        () => {
          this.hideStatusTooltip(false);
        },
        (status, globalX, globalY, key) => {
          this.toggleStatusTooltip(key, globalX, globalY, status.title, this.getStatusDescription(status));
        }
      );
      cell.syncFromStore(entity, d);
      cell.syncStatuses(entity ? (entityStatuses[entity.id] ?? []) : []);

      // 同步格子状态到 3D 渲染器
      if (this.petRenderer) {
        this.petRenderer.syncCellState(cell.row, cell.col, ruins ? 'ruins' : entity ? 'occupied' : 'empty');
      }

      // 同步 stress 到 3D 渲染器（驱动动画切换）
      if (entity && this.petRenderer) {
        this.petRenderer.updatePetStress(cell.row, cell.col, entity.stress, entity.maxStress);
        const topStatus = (entityStatuses[entity.id] ?? [])
          .filter(status => !status.isPassive)
          .sort((a, b) => resolveStatusVisual(b.kind, b.theme).priority - resolveStatusVisual(a.kind, a.theme).priority)[0];
        this.petRenderer.updatePetAura(
          cell.row,
          cell.col,
          topStatus ? resolveStatusVisual(topStatus.kind, topStatus.theme).color : null,
          topStatus ? 1 : 0
        );
      } else if (this.petRenderer) {
        this.petRenderer.updatePetAura(cell.row, cell.col, null, 0);
      }
    });
    this.updateEntityStatusHud(grid, entityStatuses);
    this.updateGlobalStatusHud(globalStatuses);
    this.syncVisualMood();
  }

  private syncVisualMood() {
    if (!this.petRenderer) return;

    const state = useGameStore.getState();
    let mood: SceneMood = 'idle';

    if (state.gameStatus !== 'playing') {
      mood = 'gameover';
    } else if (state.phase === 'action') {
      mood = 'action';
    } else if (state.phase === 'income' || state.phase === 'end') {
      mood = 'income';
    }

    if (state.awaitingHandTrim) {
      mood = 'danger';
    }

    const highestStress = state.grid.reduce((maxRatio, row) => {
      return Math.max(
        maxRatio,
        ...row.map(entity => (entity ? entity.stress / Math.max(1, entity.maxStress) : 0))
      );
    }, 0);
    if (highestStress >= 0.72 && state.gameStatus === 'playing') {
      mood = 'danger';
    }

    this.petRenderer.updateSceneMood(mood);
  }

  private onStoreUpdate() {
    this.syncGridFromStore();
    this.gameOverController.sync(useGameStore.getState());
    const state = useGameStore.getState();
    logSceneFlow('onStoreUpdate', {
      storeHand: state.hand.map(c => `${c.id}:${c.type}`),
    });
    this.handController.updateFromStore({
      hand: state.hand,
      lastDrawEvent: state.lastDrawEvent,
    });
    this.maybeResolveHandTrim();
  }

  /** 手牌整理达标后进入次日并播放准备阶段横幅 */
  private maybeResolveHandTrim() {
    const s = useGameStore.getState();
    if (s.gameStatus !== 'playing') return;
    if (!s.awaitingHandTrim) return;
    if (s.hand.length > HAND_SIZE_MAX) return;

    const result = runGameCommand(snapshotGameState(s), {
      type: 'finish_hand_trim_and_advance_turn',
      drawMeta: {
        source: 'turn_start',
        sourceLabel: '每日抽牌',
        uiMode: 'manual',
      },
    });
    if (!result.success) return;

    const drawEvent = result.meta.drawEvent;
    if (drawEvent) {
      this.handController.prepareManualDrawEvents([drawEvent]);
    }

    useGameStore.setState(result.nextState);
    if (result.nextState.gameStatus === 'playing') {
      void this.playAfterHandTrimBanner(drawEvent);
    }
  }

  private async playAfterHandTrimBanner(drawEvent?: ReturnType<typeof useGameStore.getState>['lastDrawEvent']) {
    if (this.roundResolving) return;
    this.roundResolving = true;
    this.setEndTurnInteractable(false);
    try {
      if (useGameStore.getState().gameStatus !== 'playing') return;
      const turn = useGameStore.getState().turn;
      await this.showPhaseBanner(`第 ${turn} 回合 · 准备阶段`, 520);
      await waitMs(PHASE_GAP_MS);
      if (drawEvent) {
        await this.handController.playManualDrawEvent(drawEvent);
      }
    } finally {
      this.roundResolving = false;
      const playing = useGameStore.getState().gameStatus === 'playing';
      this.setEndTurnInteractable(playing);
    }
  }
}
