import * as PIXI from 'pixi.js';
import { Scene } from '../core/Scene';
import { GridCell } from '../entities/GridCell';
import { CardSprite } from '../entities/CardSprite';
import { DragSystem, type ActionZoneHit } from '../systems/DragSystem';
import { InputManager } from '../core/InputManager';
import { useGameStore } from '../../store/gameStore';
import type { Card } from '../../types/card';
import { Tween, Easing } from '../utils/Tween';
import { strokeDark, strokeDarkBold, strokeOnCool, strokeOnWarm } from '../utils/fxTextStyles';

const PHASE_GAP_MS = 380;
const INCOME_STAGGER_MS = 175;
const POST_INCOME_MS = 520;
const POST_STRESS_MS = 820;

function waitMs(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

const HAND_CARD_W = 200;
const HAND_CARD_H = 280;

export class GameScene extends Scene {
  private gridCells: GridCell[] = [];
  private handCards: CardSprite[] = [];
  private lastHandSignature = '';
  /** 当前悬停的手牌（用于邻居推开与统一复位） */
  private hoveredHandCard: CardSprite | null = null;
  private dragSystem: DragSystem;
  private inputManager: InputManager;
  private storeUnsub: (() => void) | null = null;
  private roundResolving = false;

  // UI 容器
  private gridContainer: PIXI.Container;
  private handContainer: PIXI.Container;
  private uiContainer: PIXI.Container;
  /** 飘字、阶段条（最顶层） */
  private fxLayer: PIXI.Container;

  /** 左上角 HUD（罐头、利息、回合、阶段、连胜/败） */
  private hudText: PIXI.Text;
  private endTurnButton!: PIXI.Graphics;
  private endTurnLabel!: PIXI.Text;

  private actionZoneWrap!: PIXI.Container;
  private actionZoneBg!: PIXI.Graphics;
  private actionZoneHit: ActionZoneHit | null = null;

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

    this.hudText = new PIXI.Text('', {
      fontSize: 26,
      fill: 0xffffff,
      lineHeight: 34,
      fontWeight: 'bold',
      stroke: strokeDark,
    });
    this.hudText.x = 48;
    this.hudText.y = 28;
    this.uiContainer.addChild(this.hudText);
  }

  public onEnter(): void {
    console.log('GameScene entered');
    this.detachFromStore();
    this.createGrid();
    this.createHand();
    this.createUI();
    this.createActionDropZone();
    this.wireDragVfxHooks();

    this.storeUnsub = useGameStore.subscribe(() => this.onStoreUpdate());
    this.syncGridFromStore();
  }

  public onExit(): void {
    console.log('GameScene exited');
    this.detachFromStore();
  }

  /** React 卸载或销毁引擎前调用，避免订阅回调访问已销毁的显示对象 */
  public detachFromStore(): void {
    this.storeUnsub?.();
    this.storeUnsub = null;
  }

  public update(deltaTime: number): void {
    // 更新 Tween 动画
    Tween.update(deltaTime);

    // 更新拖拽系统
    this.dragSystem.update();
    this.updateActionZoneVisual();

    // 更新 UI 显示
    this.updateUI();
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

        this.gridCells.push(cell);
        this.gridContainer.addChild(cell);
      }
    }

    // 设置网格到拖拽系统
    this.dragSystem.setGridCells(this.gridCells);

    console.log('Grid created: 3x6');
  }

  private createHand() {
    this.handContainer.x = 0;
    this.handContainer.y = 850;

    // 从 store 获取手牌
    const hand = useGameStore.getState().hand;
    this.updateHandCards(hand);
  }

  private updateHandCards(hand: Card[]) {
    this.handCards.forEach(card => {
      Tween.killTarget(card);
      Tween.killTarget(card.scale);
      card.destroy();
    });
    this.handCards = [];
    this.handContainer.removeChildren();

    // 创建新手牌
    const cardSpacing = 220;
    const startX = 960 - (hand.length * cardSpacing) / 2;

    hand.forEach((cardData, index) => {
      const card = new CardSprite(cardData);
      card.handZIndex = index;
      card.zIndex = index;
      // pivot 在卡牌中心，坐标为视觉中心点
      card.x = startX + index * cardSpacing + HAND_CARD_W / 2;
      card.y = HAND_CARD_H / 2;
      card.originalX = card.x;
      card.originalY = card.y;

      card.on('pointerdown', () => this.onCardPointerDown(card));
      card.on('pointerenter', () => this.onHandCardPointerEnter(card));
      card.on('pointerleave', () => this.onHandCardPointerLeave(card));

      // 监听卡牌放置事件
      card.on('cardPlaced', (data: { card: CardSprite; cell: GridCell }) =>
        this.onCardPlaced(data.card, data.cell)
      );

      this.handCards.push(card);
      this.handContainer.addChild(card);
    });
    this.lastHandSignature = this.getHandSignature(hand);

    console.log(`Hand updated: ${hand.length} cards`);
  }

  private getHandSignature(hand: Card[]): string {
    return hand.map(c => `${c.id}:${c.type}:${c.cost}`).join('|');
  }

  private onHandCardPointerEnter(card: CardSprite) {
    if (this.dragSystem.isDragging() || card.isResolving) return;
    this.hoveredHandCard = card;
    this.applyHandHoverLayout(card);
  }

  private onHandCardPointerLeave(card: CardSprite) {
    if (this.dragSystem.isDragging() || card.isResolving) return;
    if (this.hoveredHandCard !== card) return;
    this.hoveredHandCard = null;
    this.clearHandHoverLayout();
  }

  /** 悬停卡牌上浮放大，两侧邻居水平推开 */
  private applyHandHoverLayout(hovered: CardSprite) {
    const idx = this.handCards.indexOf(hovered);
    if (idx < 0) return;

    const spreadNear = 48;
    const spreadMid = 24;
    const spreadFar = 12;

    this.handCards.forEach((c, j) => {
      if (c.isDragging || c.isResolving) return;
      Tween.killTarget(c);
      Tween.killTarget(c.scale);
      if (c === hovered) {
        c.playHandHoverLift();
        return;
      }
      const dist = Math.abs(j - idx);
      const dir = j > idx ? 1 : -1;
      const mag = dist === 1 ? spreadNear : dist === 2 ? spreadMid : dist > 2 ? spreadFar : 0;
      c.zIndex = c.handZIndex;
      Tween.to(
        c,
        { x: c.originalX + dir * mag, y: c.originalY, rotation: c.handTilt },
        260,
        Easing.easeOutCubic
      );
      Tween.to(c.scale, { x: 1, y: 1 }, 260, Easing.easeOutCubic);
    });
  }

  private clearHandHoverLayout() {
    this.handCards.forEach(c => {
      if (c.isDragging || c.isResolving) return;
      Tween.killTarget(c);
      Tween.killTarget(c.scale);
      c.zIndex = c.handZIndex;
      Tween.to(
        c,
        { x: c.originalX, y: c.originalY, rotation: c.handTilt },
        240,
        Easing.easeOutCubic
      );
      Tween.to(c.scale, { x: 1, y: 1 }, 240, Easing.easeOutCubic);
    });
  }

  /** 点击/拖拽起手瞬间复位，避免与 DragSystem 抢同一帧位移 */
  private resetHandLayoutImmediate() {
    this.handCards.forEach(c => {
      if (c.isResolving) return;
      Tween.killTarget(c);
      Tween.killTarget(c.scale);
      c.position.set(c.originalX, c.originalY);
      c.rotation = c.handTilt;
      c.scale.set(1);
      c.zIndex = c.handZIndex;
    });
  }

  private onCardPointerDown(card: CardSprite) {
    if (card.isResolving) return;
    this.hoveredHandCard = null;
    this.resetHandLayoutImmediate();

    const idx = this.handCards.indexOf(card);
    if (idx < 0) return;

    const type = card.cardData.type.toLowerCase();
    if (type.includes('action')) {
      const { x, y } = this.inputManager.getMouse();
      this.dragSystem.startDrag(card, x, y, 'action', idx);
      return;
    }

    const { x, y } = this.inputManager.getMouse();
    this.dragSystem.startDrag(card, x, y, 'entity', idx);
  }

  private onCardPlaced(card: CardSprite, cell: GridCell) {
    // 调用 Zustand store 的 playCard 方法
    const cardIndex = this.handCards.indexOf(card);
    if (cardIndex !== -1) {
      const success = useGameStore.getState().playCard(cardIndex, cell.row, cell.col);

      if (success) {
        console.log(`Card played successfully: ${card.cardData.name}`);
      } else {
        console.warn('Failed to play card');
        card.isResolving = false;
        card.alpha = 1;
        card.scale.set(1);
        card.playReturnAnimation();
      }
    }
  }

  private createUI() {
    const button = new PIXI.Graphics();
    this.endTurnButton = button;
    button.beginFill(0x9b59b6);
    button.drawRoundedRect(0, 0, 220, 60, 10);
    button.endFill();
    button.x = 1620;
    button.y = 950;
    button.eventMode = 'static';
    button.cursor = 'pointer';

    this.endTurnLabel = new PIXI.Text('结束回合', {
      fontSize: 24,
      fill: 0xffffff,
      fontWeight: 'bold',
      stroke: strokeDarkBold,
    });
    this.endTurnLabel.anchor.set(0.5);
    this.endTurnLabel.x = 110;
    this.endTurnLabel.y = 30;
    button.addChild(this.endTurnLabel);

    const paintBtn = (hover: boolean) => {
      button.clear();
      button.beginFill(hover ? 0x8e44ad : 0x9b59b6);
      button.drawRoundedRect(0, 0, 220, 60, 10);
      button.endFill();
    };

    button.on('pointerdown', () => {
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
    wrap.position.set(710, 96);
    wrap.eventMode = 'none';
    wrap.alpha = 0;

    const bg = new PIXI.Graphics();
    this.actionZoneBg = bg;
    bg.beginFill(0xb794f6, 1);
    bg.lineStyle(3, 0xffffff, 0.55);
    bg.drawRoundedRect(0, 0, 500, 120, 22);
    bg.endFill();
    bg.alpha = 0.14;

    const hint = new PIXI.Text({
      text: '将「行动牌」拖至此处释放以触发效果',
      style: {
        fontSize: 21,
        fill: 0xffffff,
        fontWeight: 'bold',
        stroke: strokeDarkBold,
        align: 'center',
        dropShadow: {
          alpha: 0.85,
          angle: Math.PI / 5,
          blur: 6,
          color: 0x000000,
          distance: 2,
        },
      },
    });
    hint.anchor.set(0.5);
    hint.position.set(250, 60);

    wrap.addChild(bg);
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

  private wireDragVfxHooks() {
    this.dragSystem.onRequestEntityPlace = (card, cell, tx, ty) => {
      const get = useGameStore.getState;
      if (get().cans < card.cardData.cost) {
        card.playReturnAnimation();
        return;
      }
      const cellCenter = new PIXI.Point(
        cell.x + cell.cellWidth / 2,
        cell.y + cell.cellHeight / 2
      );
      const gg = this.gridContainer.toGlobal(cellCenter);
      card.playPlaceEntityFx(tx, ty, this.fxLayer, gg.x, gg.y, () => {
        card.emit('cardPlaced', { card, cell });
      });
    };

    this.dragSystem.onRequestActionTrigger = (card, idx) => {
      const get = useGameStore.getState;
      const hand = get().hand;
      if (idx < 0 || idx >= hand.length) {
        card.playReturnAnimation();
        return;
      }
      const data = hand[idx];
      if (!data.type.toLowerCase().includes('action')) {
        card.playReturnAnimation();
        return;
      }
      if (get().cans < data.cost) {
        card.playReturnAnimation();
        return;
      }

      const center = new PIXI.Point();
      this.actionZoneHit?.getCenterGlobal(center);
      const local = this.handContainer.toLocal(center);
      card.playActionTriggerFx(local.x, local.y, this.fxLayer, center.x, center.y, () => {
        const success = get().playCard(idx);
        if (!success) {
          card.isResolving = false;
          card.alpha = 1;
          card.scale.set(1);
          card.playReturnAnimation();
        }
      });
    };
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

    let target = 0.24;
    if (this.dragSystem.isDraggingAction()) {
      target = this.dragSystem.isActionZoneHovered() ? 0.44 : 0.28;
    }
    bg.alpha += (target - bg.alpha) * 0.22;
    if (Math.abs(target - bg.alpha) < 0.004) {
      bg.alpha = target;
    }
  }

  private setEndTurnInteractable(on: boolean) {
    this.endTurnButton.eventMode = on ? 'static' : 'none';
    this.endTurnButton.alpha = on ? 1 : 0.38;
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
    const g = cell.toGlobal(new PIXI.Point(cell.cellWidth * 0.5, cell.cellHeight * 0.28));
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
    const g = this.hudText.toGlobal(new PIXI.Point(200, 24));
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

  /** 自动推进：行动→收入（飘字）→结算（暴躁 GUI）→新回合 */
  private async runEndTurnSequence() {
    if (this.roundResolving) return;

    const get = useGameStore.getState;
    const phase = get().phase;
    if (phase !== 'preparation' && phase !== 'action') {
      return;
    }

    this.roundResolving = true;
    this.setEndTurnInteractable(false);

    try {
      if (get().phase === 'preparation') {
        get().setPhase('action');
        await this.showPhaseBanner('行动阶段', 420);
        await waitMs(PHASE_GAP_MS);
      }

      if (get().phase === 'action') {
        get().setPhase('income');
        await this.showPhaseBanner('收入阶段', 480);
        await waitMs(300);

        get().calculateInterest();
        const breakdown = get().getIncomeBreakdown();

        let i = 0;
        for (const ent of breakdown.entities) {
          const slot = i;
          setTimeout(() => this.spawnIncomeFloat(ent.row, ent.col, ent.income), slot * INCOME_STAGGER_MS);
          i++;
        }
        if (breakdown.interest > 0) {
          setTimeout(
            () => this.spawnHudFloat(`利息 +${breakdown.interest}`, 0xfff9c4),
            i * INCOME_STAGGER_MS + 80
          );
          i++;
        }
        if (breakdown.streakBonus > 0) {
          setTimeout(
            () => this.spawnHudFloat(`连胜 +${breakdown.streakBonus}`, 0xabebc6),
            i * INCOME_STAGGER_MS + 80
          );
        }

        const waitAnim = Math.max(1100, breakdown.entities.length * INCOME_STAGGER_MS + 750);
        await waitMs(waitAnim);

        get().applyIncomeTotal(breakdown.total);
        await waitMs(POST_INCOME_MS);
      }

      get().setPhase('end');
      await this.showPhaseBanner('结算阶段 · 暴躁度 +1', 500);
      await waitMs(280);

      get().applyTurnEndStress();
      this.syncGridFromStore();
      this.gridCells.forEach(c => {
        if (get().grid[c.row][c.col]) {
          c.pulseStressBar();
        }
      });
      await waitMs(POST_STRESS_MS);

      get().endTurn();
      const turn = get().turn;
      await this.showPhaseBanner(`第 ${turn} 回合 · 准备阶段`, 520);
      await waitMs(PHASE_GAP_MS);
    } finally {
      this.roundResolving = false;
      this.setEndTurnInteractable(true);
    }
  }

  private updateUI() {
    const state = useGameStore.getState();

    const phaseNames: Record<string, string> = {
      preparation: '准备阶段',
      action: '行动阶段',
      income: '收入阶段',
      end: '结束阶段',
    };

    const lines = [
      `🥫 小罐头 ${state.cans}    利息 +${state.interest}`,
      `回合 ${state.turn}    ${phaseNames[state.phase] || state.phase}`,
    ];
    if (state.winStreak > 0) {
      lines.push(`连胜 ${state.winStreak}`);
    }
    if (state.loseStreak > 0) {
      lines.push(`连败 ${state.loseStreak}`);
    }
    this.hudText.text = lines.join('\n');
  }

  /** 与 Zustand grid 对齐占位格显示（放置、移除、拆家等） */
  private syncGridFromStore() {
    const grid = useGameStore.getState().grid;
    this.gridCells.forEach(cell => {
      const entity = grid[cell.row][cell.col];
      cell.setOccupied(!!entity);
      cell.setGridEntity(entity);
      cell.syncStress(entity);
    });
  }

  private onStoreUpdate() {
    this.syncGridFromStore();
    const hand = useGameStore.getState().hand;
    const sig = this.getHandSignature(hand);
    if (sig !== this.lastHandSignature || hand.length !== this.handCards.length) {
      this.updateHandCards(hand);
    }
  }
}
