import * as PIXI from 'pixi.js';
import { Scene } from '../core/Scene';
import { GridCell } from '../entities/GridCell';
import { CardSprite } from '../entities/CardSprite';
import { DragSystem, type ActionZoneHit } from '../systems/DragSystem';
import { VfxQueue } from '../systems/VfxQueue';
import { runActionTriggerVfx, runEntityPlaceVfx } from '../utils/placeVfx';
import { InputManager } from '../core/InputManager';
import { useGameStore } from '../../store/gameStore';
import { getActionTargetMode } from '../../store/actionEffects';
import type { Card } from '../../types/card';
import type { GridEntity } from '../../store/gameStore';
import {
  HAND_SIZE_MAX,
  RUINS_REBUILD_COST,
  VICTORY_DAYS,
  VICTORY_HEARTS,
} from '@config/gameRules';
import { Tween, Easing } from '../utils/Tween';
import { IsometricPetRenderer } from '../renderers/IsometricPetRenderer';
import { burstParticlesAtGlobal, PET_BURST_COLORS } from '../utils/cardFx';
import {
  strokeDark,
  strokeDarkBold,
  strokeOnCool,
  strokeOnWarm,
  strokePetBrown,
} from '../utils/fxTextStyles';
import { HandController } from './gameScene/HandController';
import { TurnResolutionController } from './gameScene/TurnResolutionController';

const PHASE_GAP_MS = 380;
const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;
const HAND_TRIM_DISCARD_ZONE_HEIGHT = 100;
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

/** 萌宠 HUD 色板 */
const PET_UI = {
  cream: 0xfff8f0,
  mint: 0xd4f4e8,
  mintLine: 0x7eb8a8,
  honeyLine: 0xf9a825,
  pink: 0xffd6e8,
  pinkLine: 0xe91e8c,
  coral: 0xff8fab,
  coralHi: 0xff6b9b,
  coralLine: 0xc2185b,
  text: 0x5d4037,
  textMuted: 0x8d6e63,
  barTrack: 0xe8dcc8,
  barHp: 0xff8a80,
  barHeart: 0xf48fb1,
};

export class GameScene extends Scene {
  private gridCells: GridCell[] = [];
  private handController: HandController;
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

  private endTurnButton!: PIXI.Graphics;
  private endTurnLabel!: PIXI.Text;

  private hudResourceBg!: PIXI.Graphics;
  private hudCansValue!: PIXI.Text;
  private hudInterestLine!: PIXI.Text;

  private hudHeartsBg!: PIXI.Graphics;
  private hudHeartsValue!: PIXI.Text;
  private hudHeartsGoal!: PIXI.Text;
  private hudHeartsBarTrack!: PIXI.Graphics;
  private hudHeartsBarFill!: PIXI.Graphics;

  private hudDayBg!: PIXI.Graphics;
  private hudDayLine!: PIXI.Text;
  private hudPhaseLine!: PIXI.Text;

  private hudHpBg!: PIXI.Graphics;
  private hudHpLine!: PIXI.Text;
  private hudHpBarTrack!: PIXI.Graphics;
  private hudHpBarFill!: PIXI.Graphics;

  private hudStreakWrap!: PIXI.Container;
  private hudWinPill!: PIXI.Container;
  private hudWinText!: PIXI.Text;
  private hudLosePill!: PIXI.Container;
  private hudLoseText!: PIXI.Text;
  private hudDeckValue!: PIXI.Text;
  private hudDiscardValue!: PIXI.Text;

  private actionZoneWrap!: PIXI.Container;
  private actionZoneBg!: PIXI.Graphics;
  private actionZoneHit: ActionZoneHit | null = null;

  /** 手牌整理：底边弧形弃牌提示（随拖拽接近度变色） */
  private handTrimBottomOverlayWrap!: PIXI.Container;
  private handTrimBottomArcGfx!: PIXI.Graphics;
  private handTrimBottomHint!: PIXI.Text;

  /** 需点格子的行动牌：手牌索引 + 交换第一格 */
  private pendingActionPick: null | {
    handIndex: number;
    actionId: string;
    firstCell: { row: number; col: number } | null;
  } = null;

  private gameOverLayer: PIXI.Container | null = null;
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
      onStartDrag: (card, index) => this.startHandCardDrag(card, index),
      spawnHudFloat: (text, color) => this.spawnHudFloat(text, color),
      setDeckDisplayOverrideCount: count => {
        this.deckDisplayOverrideCount = count;
      },
    });

    this.turnResolutionController = new TurnResolutionController({
      getRoundResolving: () => this.roundResolving,
      setRoundResolving: value => {
        this.roundResolving = value;
      },
      clearPendingActionPick: () => this.clearPendingActionPick(),
      setEndTurnInteractable: on => this.setEndTurnInteractable(on),
      showPhaseBanner: (title, holdMs) => this.showPhaseBanner(title, holdMs),
      showEntityCue: (row, col, title, subtitle, color) =>
        this.showEntityCue(row, col, title, subtitle, color),
      spawnIncomeFloat: (row, col, amount) => this.spawnIncomeFloat(row, col, amount),
      spawnHudFloat: (text, color) => this.spawnHudFloat(text, color),
      syncGridFromStore: () => this.syncGridFromStore(),
      sync3DStressOverlays: () => this.sync3DStressOverlays(),
      pulseStressCell: (row, col) => this.pulseStressCell(row, col),
      playManualDrawEvent: event => this.handController.playManualDrawEvent(event),
    });
  }

  public onEnter(): void {
    console.log('GameScene entered');
    this.detachFromStore();
    this.createGrid();
    this.createHand();
    this.createUI();
    this.createActionDropZone();
    this.createHandTrimBottomDiscardOverlay();
    this.wireDragVfxHooks();
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
    this.dragSystem.setDiscardDesignRoot(null);
    this.storeUnsub?.();
    this.storeUnsub = null;
    this.clearPendingActionPick();
    this.removeGameOverOverlay();
    this.destroyPetRenderer();
  }

  public update(deltaTime: number): void {
    // 更新 Tween 动画
    Tween.update(deltaTime);

    // 更新拖拽系统
    this.dragSystem.update();
    this.updateActionZoneVisual();
    this.updateHandTrimBottomDiscardOverlay();

    // 同步 3D 格子高亮状态
    if (this.petRenderer) {
      const hoveredCell = this.dragSystem.getHoveredCell();
      this.gridCells.forEach(cell => {
        const isHovered = cell === hoveredCell;
        const isEligible = cell.isEmpty && !cell.isRuins;
        this.petRenderer?.setCellHighlight(cell.row, cell.col, isHovered && isEligible);
      });
    }

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
        return;
      }
      const anchor = this.petRenderer?.getPetStressAnchor(cell.row, cell.col) ?? null;
      cell.setStressOverlay3DAnchor(anchor);
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

  /** 事件目标是否在某一 GridCell 子树内（点在格子上不算「格子外」） */
  private isTargetUnderGridCell(target: PIXI.Container | null | undefined): boolean {
    let t: PIXI.Container | null | undefined = target ?? undefined;
    while (t) {
      if (t instanceof GridCell) return true;
      t = t.parent;
    }
    return false;
  }

  private isTargetUnderEndTurnButton(target: PIXI.Container | null | undefined): boolean {
    const btn = this.endTurnButton;
    if (!btn) return false;
    let t: PIXI.Container | null | undefined = target ?? undefined;
    while (t) {
      if (t === btn) return true;
      t = t.parent;
    }
    return false;
  }

  private onContainerPointerDownWhilePending(e: PIXI.FederatedPointerEvent) {
    if (!this.pendingActionPick) return;
    if (this.isTargetUnderGridCell(e.target as PIXI.Container)) return;
    if (this.isTargetUnderEndTurnButton(e.target as PIXI.Container)) return;

    logSceneFlow('pendingActionPick:cancelOutsideGrid', {
      actionId: this.pendingActionPick.actionId,
    });
    this.clearPendingActionPick();
    this.spawnHudFloat('已取消出牌', 0xbdc3c7);
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
          this.onGridCellPointer(cell);
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

  private startHandCardDrag(card: CardSprite, idx: number) {
    if (useGameStore.getState().gameStatus !== 'playing') return;
    if (card.isResolving || card.destroyed || !card.parent) return;
    this.handController.resetHandLayoutImmediate();

    const type = card.cardData.type.toLowerCase();
    logSceneFlow('onCardPointerDown', {
      card: `${card.cardData.id}:${card.cardData.type}`,
      idx,
      type,
    });
    if (type.includes('action')) {
      const { x, y } = this.inputManager.getMouse();
      this.dragSystem.startDrag(card, x, y, 'action', idx);
      return;
    }

    const { x, y } = this.inputManager.getMouse();
    this.dragSystem.startDrag(card, x, y, 'entity', idx);
  }

  private revealPlacedEntity(row: number, col: number) {
    const gc = this.gridCells.find(c => c.row === row && c.col === col);
    if (!gc) return;
    gc.setEntityPortraitSuppressed(false);
    const entity = useGameStore.getState().grid[row][col];
    gc.syncStress(entity);
  }

  private createUI() {
    this.createPetHud();
    this.createDeckHud();
    this.createCuteEndTurnButton();
  }

  /** 萌宠风：资源、人气、日程、体力、连胜分区布局 */
  private createPetHud() {
    const titleStyle = (size: number, fill: number = PET_UI.text): Partial<PIXI.TextStyle> => ({
      fontSize: size,
      fill,
      fontWeight: 'bold',
      stroke: strokePetBrown,
    });

    // —— 左上：口粮罐头 ——
    const resWrap = new PIXI.Container();
    resWrap.position.set(36, 32);
    this.hudResourceBg = new PIXI.Graphics();
    this.hudResourceBg.beginFill(PET_UI.cream, 0.96);
    this.hudResourceBg.lineStyle(3, PET_UI.honeyLine, 0.85);
    this.hudResourceBg.drawRoundedRect(0, 0, 268, 112, 22);
    this.hudResourceBg.endFill();
    resWrap.addChild(this.hudResourceBg);

    const resTitle = new PIXI.Text({ text: '🥫 口粮罐头', style: titleStyle(17, PET_UI.textMuted) });
    resTitle.position.set(18, 12);
    resWrap.addChild(resTitle);

    this.hudCansValue = new PIXI.Text({ text: '0', style: titleStyle(36, 0xe65100) });
    this.hudCansValue.position.set(18, 38);
    resWrap.addChild(this.hudCansValue);

    this.hudInterestLine = new PIXI.Text({ text: '银行利息 +0', style: titleStyle(15, PET_UI.textMuted) });
    this.hudInterestLine.position.set(18, 84);
    resWrap.addChild(this.hudInterestLine);

    this.uiContainer.addChild(resWrap);

    // —— 右上：直播间人气（小红心） ——
    const heartWrap = new PIXI.Container();
    heartWrap.position.set(1616, 32);
    this.hudHeartsBg = new PIXI.Graphics();
    this.hudHeartsBg.beginFill(PET_UI.pink, 0.96);
    this.hudHeartsBg.lineStyle(3, PET_UI.pinkLine, 0.75);
    this.hudHeartsBg.drawRoundedRect(0, 0, 288, 124, 22);
    this.hudHeartsBg.endFill();
    heartWrap.addChild(this.hudHeartsBg);

    const heartTitle = new PIXI.Text({ text: '💕 直播间人气', style: titleStyle(17, PET_UI.textMuted) });
    heartTitle.position.set(18, 10);
    heartWrap.addChild(heartTitle);

    this.hudHeartsValue = new PIXI.Text({ text: '0', style: titleStyle(32, PET_UI.pinkLine) });
    this.hudHeartsValue.position.set(18, 36);
    heartWrap.addChild(this.hudHeartsValue);

    this.hudHeartsGoal = new PIXI.Text({
      text: `目标 ${VICTORY_HEARTS} 心`,
      style: titleStyle(14, PET_UI.textMuted),
    });
    this.hudHeartsGoal.position.set(140, 44);
    heartWrap.addChild(this.hudHeartsGoal);

    this.hudHeartsBarTrack = new PIXI.Graphics();
    this.hudHeartsBarTrack.beginFill(PET_UI.barTrack, 1);
    this.hudHeartsBarTrack.drawRoundedRect(18, 82, 252, 14, 7);
    this.hudHeartsBarTrack.endFill();
    heartWrap.addChild(this.hudHeartsBarTrack);

    this.hudHeartsBarFill = new PIXI.Graphics();
    heartWrap.addChild(this.hudHeartsBarFill);

    this.uiContainer.addChild(heartWrap);

    // —— 中上：今日营业（天数 + 阶段） ——
    const dayWrap = new PIXI.Container();
    dayWrap.position.set(960, 40);
    this.hudDayBg = new PIXI.Graphics();
    this.hudDayBg.beginFill(PET_UI.mint, 0.96);
    this.hudDayBg.lineStyle(3, PET_UI.mintLine, 0.9);
    this.hudDayBg.drawRoundedRect(-200, 0, 400, 96, 24);
    this.hudDayBg.endFill();
    dayWrap.addChild(this.hudDayBg);

    this.hudDayLine = new PIXI.Text({
      text: '📅 今日营业 · 第 1 天',
      style: { ...titleStyle(22), align: 'center' },
    });
    this.hudDayLine.anchor.set(0.5, 0);
    this.hudDayLine.position.set(0, 14);
    dayWrap.addChild(this.hudDayLine);

    this.hudPhaseLine = new PIXI.Text({
      text: '✨ 准备阶段',
      style: { ...titleStyle(18, PET_UI.textMuted), align: 'center' },
    });
    this.hudPhaseLine.anchor.set(0.5, 0);
    this.hudPhaseLine.position.set(0, 52);
    dayWrap.addChild(this.hudPhaseLine);

    this.uiContainer.addChild(dayWrap);

    // —— 左侧中部：店长元气（HP） ——
    const hpWrap = new PIXI.Container();
    hpWrap.position.set(36, 168);
    this.hudHpBg = new PIXI.Graphics();
    this.hudHpBg.beginFill(PET_UI.cream, 0.94);
    this.hudHpBg.lineStyle(3, PET_UI.coralLine, 0.55);
    this.hudHpBg.drawRoundedRect(0, 0, 268, 102, 22);
    this.hudHpBg.endFill();
    hpWrap.addChild(this.hudHpBg);

    const hpTitle = new PIXI.Text({ text: '🐾 店长元气', style: titleStyle(17, PET_UI.textMuted) });
    hpTitle.position.set(18, 10);
    hpWrap.addChild(hpTitle);

    this.hudHpLine = new PIXI.Text({ text: '100 / 100', style: titleStyle(16, PET_UI.text) });
    this.hudHpLine.position.set(18, 36);
    hpWrap.addChild(this.hudHpLine);

    this.hudHpBarTrack = new PIXI.Graphics();
    this.hudHpBarTrack.beginFill(PET_UI.barTrack, 1);
    this.hudHpBarTrack.drawRoundedRect(18, 64, 232, 16, 8);
    this.hudHpBarTrack.endFill();
    hpWrap.addChild(this.hudHpBarTrack);

    this.hudHpBarFill = new PIXI.Graphics();
    hpWrap.addChild(this.hudHpBarFill);

    this.uiContainer.addChild(hpWrap);

    // —— 中上偏下：连胜 / 连败小标签 ——
    this.hudStreakWrap = new PIXI.Container();
    this.hudStreakWrap.position.set(960, 148);

    this.hudWinPill = new PIXI.Container();
    this.hudWinPill.position.set(-200, 0);
    const winBg = new PIXI.Graphics();
    winBg.beginFill(0xc8e6c9, 0.95);
    winBg.lineStyle(2, 0x43a047, 0.8);
    winBg.drawRoundedRect(0, 0, 168, 36, 18);
    winBg.endFill();
    this.hudWinPill.addChild(winBg);
    this.hudWinText = new PIXI.Text({
      text: '连胜 0',
      style: titleStyle(15, 0x2e7d32),
    });
    this.hudWinText.anchor.set(0.5);
    this.hudWinText.position.set(84, 18);
    this.hudWinPill.addChild(this.hudWinText);
    this.hudWinPill.visible = false;

    this.hudLosePill = new PIXI.Container();
    this.hudLosePill.position.set(32, 0);
    const loseBg = new PIXI.Graphics();
    loseBg.beginFill(0xffecb3, 0.95);
    loseBg.lineStyle(2, 0xff8f00, 0.75);
    loseBg.drawRoundedRect(0, 0, 168, 36, 18);
    loseBg.endFill();
    this.hudLosePill.addChild(loseBg);
    this.hudLoseText = new PIXI.Text({
      text: '连败 0',
      style: titleStyle(15, 0xef6c00),
    });
    this.hudLoseText.anchor.set(0.5);
    this.hudLoseText.position.set(84, 18);
    this.hudLosePill.addChild(this.hudLoseText);
    this.hudLosePill.visible = false;

    this.hudStreakWrap.addChild(this.hudWinPill);
    this.hudStreakWrap.addChild(this.hudLosePill);
    this.uiContainer.addChild(this.hudStreakWrap);
  }

  private createDeckHud() {
    const wrap = new PIXI.Container();
    wrap.position.set(56, 900);

    const bg = new PIXI.Graphics();
    bg.beginFill(0x33251f, 0.84);
    bg.lineStyle(2, 0xf4c27a, 0.55);
    bg.drawRoundedRect(0, 0, 248, 112, 20);
    bg.endFill();
    wrap.addChild(bg);

    const title = new PIXI.Text({
      text: '🃏 牌堆状态',
      style: {
        fontSize: 18,
        fill: 0xfff3e0,
        fontWeight: 'bold',
        stroke: strokeDark,
      },
    });
    title.position.set(16, 12);
    wrap.addChild(title);

    this.hudDeckValue = new PIXI.Text({
      text: '牌库 0',
      style: {
        fontSize: 20,
        fill: 0xfff9c4,
        fontWeight: 'bold',
        stroke: strokeDark,
      },
    });
    this.hudDeckValue.position.set(16, 46);
    wrap.addChild(this.hudDeckValue);

    this.hudDiscardValue = new PIXI.Text({
      text: '弃牌 0',
      style: {
        fontSize: 18,
        fill: 0xd7ccc8,
        fontWeight: 'bold',
        stroke: strokeDark,
      },
    });
    this.hudDiscardValue.position.set(16, 76);
    wrap.addChild(this.hudDiscardValue);

    this.uiContainer.addChild(wrap);
  }

  private createCuteEndTurnButton() {
    const button = new PIXI.Graphics();
    this.endTurnButton = button;
    const w = 236;
    const h = 64;
    const paintBtn = (hover: boolean) => {
      button.clear();
      button.beginFill(hover ? PET_UI.coralHi : PET_UI.coral, 1);
      button.lineStyle(3, PET_UI.coralLine, 0.9);
      button.drawRoundedRect(0, 0, w, h, 22);
      button.endFill();
    };
    paintBtn(false);
    button.x = 1588;
    button.y = 936;
    button.eventMode = 'static';
    button.cursor = 'pointer';

    this.endTurnLabel = new PIXI.Text('结束本日 🌙', {
      fontSize: 22,
      fill: 0xffffff,
      fontWeight: 'bold',
      stroke: strokeDarkBold,
    });
    this.endTurnLabel.anchor.set(0.5);
    this.endTurnLabel.x = w / 2;
    this.endTurnLabel.y = h / 2;
    button.addChild(this.endTurnLabel);

    button.on('pointerdown', () => {
      if (this.isHandTrimUiActive()) {
        this.spawnHudFloat(`请先将手牌整理至 ${HAND_SIZE_MAX} 张以内`, 0xfff9c4);
        return;
      }
      void this.runEndTurnSequence();
    });

    button.on('pointerover', () => paintBtn(true));
    button.on('pointerout', () => paintBtn(false));

    this.uiContainer.addChild(button);
  }

  /** 行动牌专用释放区：半透明 + 文案，不参与点击命中（由 DragSystem 做屏幕检测） */
  private createActionDropZone() {
    const wrap = new PIXI.Container();
    this.actionZoneWrap = wrap;
    wrap.position.set(720, 188);
    wrap.eventMode = 'none';
    wrap.alpha = 0;

    const bg = new PIXI.Graphics();
    this.actionZoneBg = bg;
    bg.beginFill(0xe1bee7, 1);
    bg.lineStyle(2, 0xce93d8, 0.35);
    bg.drawRoundedRect(0, 0, 500, 108, 24);
    bg.endFill();
    /** 底色更淡，避免压住文字 */
    bg.alpha = 0.08;

    const hintPlate = new PIXI.Graphics();
    hintPlate.beginFill(0xfffefb, 0.92);
    hintPlate.lineStyle(1, 0xba68c8, 0.45);
    hintPlate.drawRoundedRect(22, 28, 456, 52, 16);
    hintPlate.endFill();

    const hint = new PIXI.Text({
      text: '🎀 行动牌拖到这里 · 触发萌宠特技',
      style: {
        fontSize: 21,
        fill: 0x3e2723,
        fontWeight: 'bold',
        stroke: strokePetBrown,
        align: 'center',
        dropShadow: {
          alpha: 0.35,
          angle: Math.PI / 5,
          blur: 2,
          color: 0xffffff,
          distance: 0,
        },
      },
    });
    hint.anchor.set(0.5);
    hint.position.set(250, 54);

    wrap.addChild(bg);
    wrap.addChild(hintPlate);
    wrap.addChild(hint);
    this.uiContainer.addChild(wrap);

    const container = wrap;
    const hit: ActionZoneHit = {
      containsScreen: (sx, sy) => {
        const b = container.getBounds();
        return sx >= b.x && sy >= b.y && sx <= b.x + b.width && sy <= b.y + b.height;
      },
      getCenterGlobal: (out: PIXI.Point) => {
        const b = container.getBounds();
        out.x = b.x + b.width * 0.5;
        out.y = b.y + b.height * 0.5;
      },
    };
    this.actionZoneHit = hit;
    this.dragSystem.setActionZone(hit);
  }

  /** 回合末手牌整理：拖向屏幕底边弃牌时的弧形红区提示 */
  private createHandTrimBottomDiscardOverlay() {
    const wrap = new PIXI.Container();
    this.handTrimBottomOverlayWrap = wrap;
    wrap.position.set(0, 0);
    wrap.eventMode = 'none';
    wrap.visible = false;

    const arc = new PIXI.Graphics();
    this.handTrimBottomArcGfx = arc;
    wrap.addChild(arc);

    const hint = new PIXI.Text({
      text: '向下拖至底边红区可弃牌',
      style: {
        fontSize: 21,
        fill: 0xffebee,
        fontWeight: 'bold',
        stroke: { color: 0x3e2723, width: 5 },
        align: 'center',
        lineHeight: 28,
        wordWrap: true,
        wordWrapWidth: 880,
      },
    });
    hint.anchor.set(0.5, 1);
    hint.position.set(960, 1030);
    this.handTrimBottomHint = hint;
    wrap.addChild(hint);

    this.uiContainer.addChildAt(wrap, 0);
  }

  private redrawHandTrimBottomArc(g: PIXI.Graphics, proximity: number) {
    g.clear();
    const w = 1920;
    const h = 1080;
    const zoneHeight = HAND_TRIM_DISCARD_ZONE_HEIGHT;
    const p = Math.max(0, Math.min(1, proximity));
    if (p < 0.02) return;

    const fillA = 0.12 + 0.55 * p;
    const strokeA = 0.28 + 0.58 * p;

    g.beginFill(0xb71c1c, fillA);
    g.drawRect(0, h - zoneHeight, w, zoneHeight);
    g.endFill();

    g.lineStyle(3, 0xff8a80, strokeA);
    g.moveTo(0, h - zoneHeight);
    g.lineTo(w, h - zoneHeight);
  }

  private updateHandTrimBottomDiscardOverlay() {
    const wrap = this.handTrimBottomOverlayWrap;
    const g = this.handTrimBottomArcGfx;
    const hint = this.handTrimBottomHint;
    if (!wrap || !g || !hint) return;

    if (!this.isHandTrimUiActive()) {
      wrap.visible = false;
      return;
    }

    const dragging = this.dragSystem.isDraggingForHandTrim();
    if (!dragging) {
      wrap.visible = false;
      g.clear();
      return;
    }

    wrap.visible = true;
    const p = this.dragSystem.getHandTrimBottomDiscardProximity();
    this.redrawHandTrimBottomArc(g, p);

    hint.alpha = 0.42 + 0.58 * p;
    if (p >= DragSystem.HAND_TRIM_DISCARD_RELEASE) {
      hint.style.fill = 0xe8f5e9;
      hint.text =
        '✓ 已达弃牌线\n松手将尝试弃牌；不可弃置卡仍会弹回';
    } else if (p >= 0.2) {
      hint.style.fill = 0xffebee;
      hint.text = '再向下拖至底部红区\n未达弃牌线时松手不会弃牌';
    } else {
      hint.style.fill = 0xffebee;
      hint.text = '向下拖至底部 100 像素红区\n未达弃牌线时松手不会弃牌';
    }
  }

  private isHandTrimUiActive(): boolean {
    const state = useGameStore.getState();
    return state.awaitingHandTrim || state.hand.length > HAND_SIZE_MAX;
  }

  private wireDragVfxHooks() {
    this.dragSystem.onRequestEntityPlace = (card, cell, _tx, _ty) => {
      const get = useGameStore.getState;
      logSceneFlow('onRequestEntityPlace', {
        card: `${card.cardData.id}:${card.cardData.type}`,
        target: [cell.row, cell.col],
        cans: get().cans,
        cost: card.cardData.cost,
      });
      if (card.cardData.cost > 0 && get().cans < card.cardData.cost) {
        card.playReturnAnimation();
        return;
      }
      const handIdx = this.handController.resolveCardIndexInStore(card);
      if (handIdx < 0) {
        card.playReturnAnimation();
        return;
      }

      const fromGlobal = new PIXI.Point();
      card.getGlobalPosition(fromGlobal);
      const gridCell = this.gridCells.find(c => c.row === cell.row && c.col === cell.col);
      if (!gridCell) {
        card.playReturnAnimation();
        return;
      }

      const { row, col } = cell;
      const projectedCell = this.petRenderer?.getGridCellCenterAnchor(row, col) ?? null;
      const gg = projectedCell
        ? this.container.toGlobal(new PIXI.Point(projectedCell.x, projectedCell.y))
        : this.gridContainer.toGlobal(
            new PIXI.Point(cell.x + cell.cellWidth / 2, cell.y + cell.cellHeight / 2)
          );
      const cardSnapshot = structuredClone(card.cardData) as Card;

      gridCell.setEntityPortraitSuppressed(true);
      const ok = get().playCard(handIdx, row, col);
      if (!ok) {
        gridCell.setEntityPortraitSuppressed(false);
        gridCell.syncStress(get().grid[row][col]);
        card.playReturnAnimation();
        return;
      }

      logSceneFlow('onRequestEntityPlace:playCardOkEnqueueVfx', {
        card: `${cardSnapshot.id}:${cardSnapshot.type}`,
        target: [row, col],
      });

      this.vfxQueue.enqueue(async () => {
        try {
          await runEntityPlaceVfx(this.fxLayer, cardSnapshot, fromGlobal, gg.x, gg.y, () => {
            this.revealPlacedEntity(row, col);
          });
        } finally {
          const gc = this.gridCells.find(c => c.row === row && c.col === col);
          if (gc?.isEntityPortraitSuppressed()) {
            this.revealPlacedEntity(row, col);
          }
        }
      });
    };

    this.dragSystem.onRequestActionTrigger = (card, idx) => {
      const get = useGameStore.getState;
      const hand = get().hand;
      const liveIdx =
        idx >= 0 && idx < hand.length ? idx : this.handController.resolveCardIndexInStore(card);
      logSceneFlow('onRequestActionTrigger:start', {
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
        card.playReturnAnimation();
        return;
      }

      if (getActionTargetMode(data.id) !== 'none') {
        card.playReturnAnimation();
        this.beginPendingTargetedAction(liveIdx, data.id);
        return;
      }

      const fromGlobal = new PIXI.Point();
      card.getGlobalPosition(fromGlobal);
      const center = new PIXI.Point();
      this.actionZoneHit?.getCenterGlobal(center);

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

      logSceneFlow('onRequestActionTrigger:playCardOkEnqueueVfx', {
        card: `${cardSnapshot.id}:${cardSnapshot.type}`,
      });

      this.vfxQueue.enqueue(() =>
        runActionTriggerVfx(this.fxLayer, cardSnapshot, fromGlobal, center.x, center.y)
      );
    };

    this.dragSystem.onRequestHandTrimDiscard = (card, idx) => {
      const get = useGameStore.getState;
      const liveIdx =
        idx >= 0 && idx < get().hand.length
          ? idx
          : this.handController.resolveCardIndexInStore(card);
      if (liveIdx < 0 || liveIdx >= get().hand.length) {
        card.playReturnAnimation();
        return;
      }
      const ok = get().discardHandCardForTrim(liveIdx);
      if (!ok) {
        this.spawnHudFloat('此卡不可弃置，请打出', 0xffb3b3);
        card.playReturnAnimation();
      }
    };
  }

  private beginPendingTargetedAction(handIndex: number, actionId: string) {
    if (useGameStore.getState().gameStatus !== 'playing') return;
    this.pendingActionPick = { handIndex, actionId, firstCell: null };
    this.dragSystem.setEnabled(false);
    this.refreshActionPickOverlays();
    const hint =
      actionId === 'action_003'
        ? '请选择第一格（需有单位；再点同一格可取消）'
        : '请点击目标格子';
    this.spawnHudFloat(hint, 0xfff9c4);
  }

  private refreshActionPickOverlays() {
    const p = this.pendingActionPick;
    this.gridCells.forEach(c => {
      const eligible = !!p;
      const selected =
        !!p?.firstCell && p.firstCell.row === c.row && p.firstCell.col === c.col;
      c.setActionPickVisual(eligible, selected);
    });
  }

  /** 清除选格状态；无待定行动时也会清掉各格叠加层，防止残留 */
  private clearPendingActionPick() {
    const had = !!this.pendingActionPick;
    this.pendingActionPick = null;
    this.gridCells.forEach(c => c.clearActionPickOverlay());
    if (had) {
      this.dragSystem.setEnabled(true);
    }
  }

  private onGridCellPointer(cell: GridCell) {
    if (this.pendingActionPick) {
      this.onGridCellActionPick(cell);
      return;
    }
    const get = useGameStore.getState;
    if (get().gameStatus !== 'playing') return;
    if (!cell.isRuins) return;
    const ok = get().rebuildCell(cell.row, cell.col);
    if (ok) {
      this.syncGridFromStore();
      this.spawnHudFloat(`工位已重建（-${RUINS_REBUILD_COST}🥫）`, 0xabebc6);
    } else {
      this.spawnHudFloat(`废墟格需空且花费 ${RUINS_REBUILD_COST}🥫`, 0xffb3b3);
    }
  }

  private onGridCellActionPick(cell: GridCell) {
    const p = this.pendingActionPick;
    if (!p) return;

    const get = useGameStore.getState;
    const grid = get().grid;

    if (p.actionId === 'action_003') {
      if (!p.firstCell) {
        if (!grid[cell.row][cell.col]) {
          this.spawnHudFloat('第一格需有单位', 0xffb3b3);
          return;
        }
        p.firstCell = { row: cell.row, col: cell.col };
        this.refreshActionPickOverlays();
        this.spawnHudFloat('请选择第二格（再点第一格可取消选中）', 0xfff9c4);
        return;
      }
      const r1 = p.firstCell.row;
      const c1 = p.firstCell.col;
      if (cell.row === r1 && cell.col === c1) {
        p.firstCell = null;
        this.refreshActionPickOverlays();
        this.spawnHudFloat('已取消第一格，请重新选择', 0xfff9c4);
        return;
      }
      const success = get().playCard(p.handIndex, r1, c1, cell.row, cell.col);
      if (success) {
        this.clearPendingActionPick();
      } else {
        this.spawnHudFloat('无法交换（两格均需有单位且不同）', 0xffb3b3);
      }
      return;
    }

    const success = get().playCard(p.handIndex, cell.row, cell.col);
    if (success) {
      this.clearPendingActionPick();
    } else {
      this.spawnHudFloat('无效目标', 0xffb3b3);
    }
  }

  /** 拖拽行动牌时加亮释放区 */
  private updateActionZoneVisual() {
    const wrap = this.actionZoneWrap;
    const bg = this.actionZoneBg;
    if (!bg || !wrap) return;

    const zoneVisible = this.dragSystem.isDraggingAction();
    const wrapTarget = zoneVisible ? 1 : 0;
    wrap.alpha += (wrapTarget - wrap.alpha) * 0.2;
    if (Math.abs(wrapTarget - wrap.alpha) < 0.004) {
      wrap.alpha = wrapTarget;
    }

    /** 拖拽时略提亮，整体仍偏淡，保证字在 hintPlate 上清晰 */
    let target = 0.09;
    if (this.dragSystem.isDraggingAction()) {
      target = this.dragSystem.isActionZoneHovered() ? 0.16 : 0.11;
    }
    bg.alpha += (target - bg.alpha) * 0.22;
    if (Math.abs(target - bg.alpha) < 0.004) {
      bg.alpha = target;
    }
  }

  private setEndTurnInteractable(on: boolean) {
    const trim = this.isHandTrimUiActive();
    const btnOn = on && !trim;
    this.endTurnButton.eventMode = btnOn ? 'static' : 'none';
    this.endTurnButton.alpha = btnOn ? 1 : 0.38;
    this.handContainer.eventMode = on ? 'static' : 'none';
    this.dragSystem.setEnabled(on);
  }

  /** 阶段标题：淡入 → 停留 → 淡出 */
  private async showPhaseBanner(title: string, holdMs: number): Promise<void> {
    const wrap = new PIXI.Container();
    const bg = new PIXI.Graphics();
    bg.beginFill(0x000000, 0.58);
    bg.drawRoundedRect(-430, -46, 860, 92, 18);
    bg.endFill();

    const txt = new PIXI.Text({
      text: title,
      style: {
        fontSize: 38,
        fill: 0xffffff,
        fontWeight: 'bold',
        stroke: strokeDarkBold,
        dropShadow: {
          alpha: 0.92,
          angle: Math.PI / 6,
          blur: 8,
          color: 0x000000,
          distance: 3,
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
        fontSize: 28,
        fill: 0xffeaa7,
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

  private spawnHudFloat(text: string, color: number) {
    const g = this.hudToastAnchor.toGlobal(new PIXI.Point(0, 0));
    const lp = this.fxLayer.toLocal(g);
    const outline =
      color === 0xfff9c4 ? strokeOnWarm : color === 0xabebc6 ? strokeOnCool : strokeDark;
    const t = new PIXI.Text({
      text,
      style: { fontSize: 26, fill: color, fontWeight: 'bold', stroke: outline },
    });
    t.anchor.set(0, 0.5);
    t.position.set(lp.x, lp.y);
    t.alpha = 0;
    this.fxLayer.addChild(t);

    Tween.to(t, { alpha: 1 }, 160, Easing.easeOutQuad, () => {
      Tween.to(t, { y: t.y - 36, alpha: 0 }, 900, Easing.easeOutQuad, () => {
        t.destroy();
      });
    });
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
    plate.beginFill(0x2d1f19, 0.86);
    plate.lineStyle(2, color, 0.74);
    plate.drawRoundedRect(-116, -44, 232, 82, 18);
    plate.endFill();
    wrap.addChild(plate);

    const titleText = new PIXI.Text({
      text: title,
      style: {
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
        fontSize: 15,
        fill: 0xfdebd0,
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

    const phaseNames: Record<string, string> = {
      preparation: '准备阶段',
      action: '行动阶段',
      income: '收入阶段',
      end: '结束阶段',
    };

    const dayDisplay = Math.min(state.turn, VICTORY_DAYS);
    let phaseLabel = phaseNames[state.phase] || state.phase;
    if (this.isHandTrimUiActive()) {
      phaseLabel = `弃牌整理（≤${HAND_SIZE_MAX} 张）`;
    }

    const endTurnEnabled = state.gameStatus === 'playing' && !this.roundResolving && !this.isHandTrimUiActive();
    this.endTurnButton.eventMode = endTurnEnabled ? 'static' : 'none';
    this.endTurnButton.alpha = endTurnEnabled ? 1 : 0.38;

    this.hudCansValue.text = String(state.cans);
    this.hudInterestLine.text = `银行利息 +${state.interest} 🥫/回合`;
    const deckDisplayCount = this.deckDisplayOverrideCount ?? state.deck.length;
    this.hudDeckValue.text = `牌库 ${deckDisplayCount}`;
    this.hudDiscardValue.text = `弃牌 ${state.discardPile.length}`;
    this.petRenderer?.setDeckCount(deckDisplayCount);

    this.hudHeartsValue.text = String(state.hearts);
    const heartRatio = Math.min(1, state.hearts / Math.max(1, VICTORY_HEARTS));
    const hw = 252 * heartRatio;
    this.hudHeartsBarFill.clear();
    if (hw > 2) {
      this.hudHeartsBarFill.beginFill(PET_UI.barHeart, 1);
      this.hudHeartsBarFill.drawRoundedRect(18, 82, hw, 14, 7);
      this.hudHeartsBarFill.endFill();
    }

    this.hudDayLine.text = `📅 今日营业 · 第 ${dayDisplay} / ${VICTORY_DAYS} 天`;
    this.hudPhaseLine.text = `✨ ${phaseLabel}`;

    this.hudHpLine.text = `${state.playerHp} / ${state.maxPlayerHp}`;
    const hpRatio = Math.min(1, state.playerHp / Math.max(1, state.maxPlayerHp));
    const hpw = 232 * hpRatio;
    this.hudHpBarFill.clear();
    if (hpw > 2) {
      this.hudHpBarFill.beginFill(PET_UI.barHp, 1);
      this.hudHpBarFill.drawRoundedRect(18, 64, hpw, 16, 8);
      this.hudHpBarFill.endFill();
    }

    const showWin = state.winStreak > 0;
    const showLose = state.loseStreak > 0;
    this.hudWinPill.visible = showWin;
    this.hudLosePill.visible = showLose;
    if (showWin) {
      this.hudWinText.text = `连胜 ${state.winStreak} 🔥`;
    }
    if (showLose) {
      this.hudLoseText.text = `连败 ${state.loseStreak} 🥺`;
    }
    if (showWin && showLose) {
      this.hudWinPill.position.set(-184, 0);
      this.hudLosePill.position.set(16, 0);
    } else if (showWin) {
      this.hudWinPill.position.set(-84, 0);
    } else if (showLose) {
      this.hudLosePill.position.set(-84, 0);
    }
  }

  /** 与 Zustand grid 对齐占位格显示（放置、移除、拆家等） */
  private syncGridFromStore() {
    const { grid, cellDurability } = useGameStore.getState();
    this.gridCells.forEach(cell => {
      const entity = grid[cell.row][cell.col];
      const d = cellDurability[cell.row][cell.col] ?? 0;
      const ruins = d <= 0;
      cell.syncFromStore(entity, d);

      // 同步格子状态到 3D 渲染器
      if (this.petRenderer) {
        this.petRenderer.syncCellState(cell.row, cell.col, ruins ? 'ruins' : entity ? 'occupied' : 'empty');
      }

      // 同步 stress 到 3D 渲染器（驱动动画切换）
      if (entity && this.petRenderer) {
        this.petRenderer.updatePetStress(cell.row, cell.col, entity.stress, entity.maxStress);
      }
    });
  }

  private removeGameOverOverlay() {
    if (this.gameOverLayer) {
      this.gameOverLayer.destroy({ children: true });
      this.gameOverLayer = null;
    }
  }

  private syncGameOverOverlay() {
    const st = useGameStore.getState();
    if (st.gameStatus === 'playing') {
      this.removeGameOverOverlay();
      return;
    }
    if (this.gameOverLayer) return;

    const layer = new PIXI.Container();
    layer.position.set(960, 520);
    this.gameOverLayer = layer;

    const dim = new PIXI.Graphics();
    dim.beginFill(0x4e342e, 0.55);
    dim.drawRoundedRect(-520, -210, 1040, 420, 28);
    dim.endFill();
    layer.addChild(dim);

    const card = new PIXI.Graphics();
    card.beginFill(PET_UI.cream, 0.98);
    card.lineStyle(4, PET_UI.honeyLine, 0.65);
    card.drawRoundedRect(-440, -170, 880, 340, 26);
    card.endFill();
    layer.addChild(card);

    let title = '';
    let sub = '';
    if (st.gameStatus === 'won') {
      title = '🎉 大成功！萌宠直播间上市啦';
      sub =
        st.turn > VICTORY_DAYS
          ? `撑满 ${VICTORY_DAYS} 天，人气也达标啦～`
          : `人气突破 ${VICTORY_HEARTS}，提前完成上市目标～`;
    } else if (st.endReason === 'hp') {
      title = '😿 要先休息一下…';
      sub = '店长元气见底了，改天再来营业吧';
    } else if (st.endReason === 'grid') {
      title = '🏚️ 工位全没了…';
      sub = '直播间塌成废墟啦，试试更温柔的排班？';
    } else {
      title = '📉 人气还差一点点';
      sub = `${VICTORY_DAYS} 天到了，小红心还没攒够哦`;
    }

    const titleTxt = new PIXI.Text({
      text: title,
      style: {
        fontSize: 36,
        fill: PET_UI.text,
        fontWeight: 'bold',
        stroke: strokePetBrown,
        align: 'center',
      },
    });
    titleTxt.anchor.set(0.5, 0);
    titleTxt.y = -142;
    layer.addChild(titleTxt);

    const subTxt = new PIXI.Text({
      text: sub,
      style: {
        fontSize: 22,
        fill: PET_UI.textMuted,
        fontWeight: 'bold',
        stroke: strokePetBrown,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: 760,
      },
    });
    subTxt.anchor.set(0.5, 0);
    subTxt.y = -72;
    layer.addChild(subTxt);

    const btn = new PIXI.Graphics();
    btn.beginFill(PET_UI.coral);
    btn.lineStyle(3, PET_UI.coralLine, 0.85);
    btn.drawRoundedRect(0, 0, 240, 56, 18);
    btn.endFill();
    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.position.set(-120, 88);
    const btnLabel = new PIXI.Text({
      text: '再开一局 🐾',
      style: { fontSize: 22, fill: 0xffffff, fontWeight: 'bold', stroke: strokeDarkBold },
    });
    btnLabel.anchor.set(0.5);
    btnLabel.position.set(120, 28);
    btn.addChild(btnLabel);
    btn.on('pointerdown', () => {
      useGameStore.getState().restartRun();
    });
    layer.addChild(btn);

    this.fxLayer.addChild(layer);
  }

  private onStoreUpdate() {
    this.syncGridFromStore();
    this.syncGameOverOverlay();
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
    useGameStore.getState().finishHandTrimAndAdvanceTurn();
    const after = useGameStore.getState();
    if (after.gameStatus === 'playing') {
      void this.playAfterHandTrimBanner();
    }
  }

  private async playAfterHandTrimBanner() {
    if (this.roundResolving) return;
    this.roundResolving = true;
    this.setEndTurnInteractable(false);
    try {
      if (useGameStore.getState().gameStatus !== 'playing') return;
      const turn = useGameStore.getState().turn;
      await this.showPhaseBanner(`第 ${turn} 回合 · 准备阶段`, 520);
      await waitMs(PHASE_GAP_MS);
    } finally {
      this.roundResolving = false;
      const playing = useGameStore.getState().gameStatus === 'playing';
      this.setEndTurnInteractable(playing);
    }
  }
}
