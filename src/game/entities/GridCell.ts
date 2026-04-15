import * as PIXI from 'pixi.js';
import type { GridEntity } from '../../store/gameStore';
import type { StatusInstance } from '../status/statusTypes';
import { resolveStatusVisual } from '../status/statusRegistry';
import { loadIllustrationForEntity } from '../utils/illustrationTextures';
import { layoutSpriteContain } from '../utils/spriteFit';
import { strokeDark } from '../utils/fxTextStyles';
import { Tween, Easing } from '../utils/Tween';
const DEBUG_GRID_CELL = true;

function logGridCell(message: string, payload?: unknown) {
  if (!DEBUG_GRID_CELL) return;
  if (payload === undefined) {
    console.log(`[GridCell] ${message}`);
  } else {
    console.log(`[GridCell] ${message}`, payload);
  }
}

function lerpByte(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function lerpColorRgb(from: number, to: number, t: number): number {
  const u = Math.min(1, Math.max(0, t));
  const fr = (from >> 16) & 255;
  const fg = (from >> 8) & 255;
  const fb = from & 255;
  const tr = (to >> 16) & 255;
  const tg = (to >> 8) & 255;
  const tb = to & 255;
  const r = lerpByte(fr, tr, u);
  const g = lerpByte(fg, tg, u);
  const b = lerpByte(fb, tb, u);
  return (r << 16) | (g << 8) | b;
}

/** 暴躁填充比例 0~1：绿 → 黄 → 红（越接近满值越红） */
function stressBarColorForRatio(ratio: number): number {
  const t = Math.min(1, Math.max(0, ratio));
  if (t <= 0.5) {
    return lerpColorRgb(0x2ecc71, 0xf1c40f, t / 0.5);
  }
  return lerpColorRgb(0xf1c40f, 0xff2d2d, (t - 0.5) / 0.5);
}

export class GridCell extends PIXI.Container {
  private background!: PIXI.Graphics;
  private highlight!: PIXI.Graphics;
  /** 行动牌选格：与拖拽高亮分离 */
  private actionPickGfx!: PIXI.Graphics;
  private actionPickEligible = false;
  private actionPickSelected = false;
  private isHighlighted = false;
  private renderBackground3DMode = false;
  /** 3D 模式下不再使用 entitySprite，改为通过 onEntitySet 回调通知外部 */
  private entitySprite: PIXI.Sprite | null = null;
  private entitySpriteRestX = 0;
  private entitySpriteRestY = 0;
  private entityLoadGen = 0;
  private currentEntityKey: string | null = null;
  /** 仅宠物：用于每帧颤抖 */
  private stressShakeRatio = 0;
  private stressShakePet = false;
  private stressShakePhase = 0;
  /** 打出宠物/员工时逻辑已上格，立绘等飞入落地后再显示 */
  private entityPortraitSuppressed = false;
  private stressContainer: PIXI.Container;
  private stressTrack!: PIXI.Graphics;
  private stressFill!: PIXI.Graphics;
  private stressText!: PIXI.Text;
  private statusContainer: PIXI.Container;
  private statusOverflowText!: PIXI.Text;
  private readonly stressBaseWidth: number;
  private showStatusTooltipHandler:
    | ((status: StatusInstance, globalX: number, globalY: number) => void)
    | null = null;
  private hideStatusTooltipHandler: (() => void) | null = null;
  private toggleStatusTooltipHandler:
    | ((status: StatusInstance, globalX: number, globalY: number, key: string) => void)
    | null = null;

  public row: number;
  public col: number;
  public isEmpty = true;
  /** 工位耐久已毁，不可部署；可花罐头重建 */
  public isRuins = false;
  /** 布局尺寸（与 hitArea 一致；勿用 Container.width，避免 bounds 未更新时为 0） */
  public readonly cellWidth: number;
  public readonly cellHeight: number;

  /** 外部回调：当实体设置/清除时通知（用于 3D 渲染） */
  public onEntitySet: ((entity: GridEntity | null, row: number, col: number) => void) | null = null;

  constructor(row: number, col: number, width: number, height: number) {
    super();
    this.row = row;
    this.col = col;
    this.cellWidth = width;
    this.cellHeight = height;
    this.stressBaseWidth = width - 8;

    this.eventMode = 'static';
    this.hitArea = new PIXI.Rectangle(0, 0, width, height);

    this.createBackground(width, height);
    this.stressContainer = new PIXI.Container();
    this.statusContainer = new PIXI.Container();
    // 3D 模式下状态层会持续同步位置；使用 dynamic 让鼠标静止时也能刷新 hover 命中。
    this.statusContainer.eventMode = 'dynamic';
    this.statusContainer.interactiveChildren = true;
    this.statusContainer.sortableChildren = true;
    this.createStressUi(width, height);
    this.addChild(this.stressContainer);
    this.createStatusUi();
    this.addChild(this.statusContainer);
    this.createHighlight(width, height);
    this.createActionPickOverlay();
  }

  private createBackground(width: number, height: number) {
    this.background = new PIXI.Graphics();
    this.background.beginFill(0x3d5a80, 0.75);
    this.background.lineStyle(2, 0x7eb8da, 1);
    this.background.drawRoundedRect(0, 0, width, height, 8);
    this.background.endFill();
    this.addChild(this.background);
  }

  private createStressUi(_width: number, height: number) {
    const pad = 4;
    const barW = this.stressBaseWidth;
    const barH = 7;
    const barY = height - barH - pad;

    this.stressText = new PIXI.Text('', {
      fontSize: 14,
      fill: 0xfce4ec,
      fontWeight: 'bold',
      stroke: strokeDark,
    });
    this.stressText.x = pad;
    this.stressText.y = barY - 20;

    this.stressTrack = new PIXI.Graphics();
    this.stressTrack.beginFill(0x1a1a2e, 0.95);
    this.stressTrack.lineStyle(1, 0x5c5c7a, 1);
    this.stressTrack.drawRoundedRect(pad, barY, barW, barH, 3);
    this.stressTrack.endFill();

    this.stressFill = new PIXI.Graphics();

    this.stressContainer.addChild(this.stressText);
    this.stressContainer.addChild(this.stressTrack);
    this.stressContainer.addChild(this.stressFill);
    this.stressContainer.visible = false;
  }

  private createStatusUi() {
    this.statusOverflowText = new PIXI.Text('', {
      fontSize: 12,
      fill: 0xf7f7f7,
      fontWeight: 'bold',
      stroke: strokeDark,
    });
    this.statusOverflowText.visible = false;
    this.statusContainer.addChild(this.statusOverflowText);
  }

  private createHighlight(width: number, height: number) {
    this.highlight = new PIXI.Graphics();
    this.highlight.beginFill(0x3498db, 0.65);
    this.highlight.lineStyle(3, 0x5dade2, 1);
    this.highlight.drawRoundedRect(0, 0, width, height, 8);
    this.highlight.endFill();
    this.highlight.visible = false;
    this.addChild(this.highlight);
  }

  private createActionPickOverlay() {
    this.actionPickGfx = new PIXI.Graphics();
    this.actionPickGfx.visible = false;
    this.actionPickGfx.eventMode = 'none';
    this.addChild(this.actionPickGfx);
  }

  private redrawActionPickOverlay() {
    const w = this.cellWidth;
    const h = this.cellHeight;
    const rr = 8;
    Tween.killTarget(this.actionPickGfx);
    this.actionPickGfx.clear();

    if (!this.actionPickEligible && !this.actionPickSelected) {
      this.actionPickGfx.visible = false;
      return;
    }

    if (this.actionPickSelected) {
      this.actionPickGfx.lineStyle(4, 0xd946ef, 1);
      this.actionPickGfx.beginFill(0xc084fc, 0.24);
      this.actionPickGfx.drawRoundedRect(2, 2, w - 4, h - 4, rr);
      this.actionPickGfx.endFill();
    } else {
      this.actionPickGfx.lineStyle(3, 0xf59e0b, 1);
      this.actionPickGfx.beginFill(0xfbbf24, 0.18);
      this.actionPickGfx.drawRoundedRect(3, 3, w - 6, h - 6, rr);
      this.actionPickGfx.endFill();
    }

    this.actionPickGfx.visible = true;
    this.actionPickGfx.alpha = 0;
    Tween.to(this.actionPickGfx, { alpha: 1 }, 200, Easing.easeOutCubic);
  }

  /**
   * 行动牌选格样式（一次写入，避免先关 eligible 再关 selected 时闪一帧）
   * - 仅 eligible：琥珀提示框
   * - selected：紫环（交换第一格）；可与 eligible 同时为真
   */
  public setActionPickVisual(eligible: boolean, selected: boolean) {
    if (this.actionPickEligible === eligible && this.actionPickSelected === selected) return;
    this.actionPickEligible = eligible;
    this.actionPickSelected = selected;
    if (this.renderBackground3DMode) return;
    this.redrawActionPickOverlay();
  }

  public clearActionPickOverlay() {
    Tween.killTarget(this.actionPickGfx);
    this.actionPickEligible = false;
    this.actionPickSelected = false;
    this.actionPickGfx.clear();
    this.actionPickGfx.visible = false;
  }

  public setHighlight(highlighted: boolean) {
    if (this.isHighlighted === highlighted) return;

    this.isHighlighted = highlighted;
    if (this.renderBackground3DMode) {
      this.highlight.visible = false;
      return;
    }
    this.highlight.visible = highlighted;

    if (highlighted) {
      this.highlight.alpha = 0;
      Tween.to(this.highlight, { alpha: 1 }, 240, Easing.easeOutCubic);
    }
  }

  /** 画布/屏幕坐标（与 InputManager 一致）是否在格内 */
  public containsScreenPoint(screenX: number, screenY: number): boolean {
    const lp = this.toLocal({ x: screenX, y: screenY });
    return (
      lp.x >= 0 &&
      lp.x <= this.cellWidth &&
      lp.y >= 0 &&
      lp.y <= this.cellHeight
    );
  }

  public setOccupied(occupied: boolean) {
    this.isEmpty = !occupied;
    this.redrawBackgroundShell();
  }

  /** 与 store 对齐：耐久、实体、立绘与压力条 */
  public syncFromStore(entity: GridEntity | null, durability: number) {
    const ruins = durability <= 0;
    this.isRuins = ruins;
    this.isEmpty = !entity;
    this.redrawBackgroundShell();

    if (ruins) {
      this.setGridEntity(null);
      this.stressContainer.visible = false;
      this.syncStatuses([]);
      this.stressShakePet = false;
      this.stressShakeRatio = 0;
      this.cursor = 'pointer';
      return;
    }

    this.cursor = 'default';
    this.setGridEntity(entity);
    this.syncStress(entity);
  }

  public syncStatuses(statuses: StatusInstance[]) {
    const dynamicChildren = this.statusContainer.children.filter(
      child => child !== this.statusOverflowText
    );
    dynamicChildren.forEach(child => {
      this.statusContainer.removeChild(child);
      child.destroy({ children: true });
    });
    this.statusOverflowText.visible = false;

    if (this.renderBackground3DMode) {
      this.statusContainer.visible = false;
      return;
    }

    this.statusContainer.visible = true;

    if (!statuses.length) return;
    const visible = statuses
      .filter(status => !status.isPassive || status.shortLabel.length > 0)
      .sort((a, b) => resolveStatusVisual(b.kind, b.theme).priority - resolveStatusVisual(a.kind, a.theme).priority)
      .slice(0, 3);

    visible.forEach((status, index) => {
      const visual = resolveStatusVisual(status.kind, status.theme);
      const badge = new PIXI.Container();
      badge.position.set(6 + index * 34, 6);
      badge.eventMode = 'dynamic';
      badge.cursor = 'help';
      badge.hitArea = new PIXI.Rectangle(0, 0, 28, 28);
      badge.zIndex = 1;

      const bg = new PIXI.Graphics();
      bg.beginFill(visual.color, 0.88);
      bg.lineStyle(1.5, 0xffffff, 0.68);
      bg.drawRoundedRect(0, 0, 28, 28, 10);
      bg.endFill();
      badge.addChild(bg);

      const label = new PIXI.Text(visual.shortLabel || visual.symbol, {
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
          fontSize: 9,
          fill: 0xfefefe,
          fontWeight: 'bold',
          stroke: strokeDark,
        });
        duration.anchor.set(0.5);
        duration.position.set(14, 21.5);
        badge.addChild(duration);
      }

      badge.on('pointerover', (e: PIXI.FederatedPointerEvent) => {
        e.stopPropagation();
        this.showStatusTooltipHandler?.(status, e.global.x + 18, e.global.y + 12);
      });
      badge.on('pointerout', (e: PIXI.FederatedPointerEvent) => {
        e.stopPropagation();
        this.hideStatusTooltipHandler?.();
      });
      badge.on('pointertap', (e: PIXI.FederatedPointerEvent) => {
        e.stopPropagation();
        this.toggleStatusTooltipHandler?.(
          status,
          e.global.x + 18,
          e.global.y + 12,
          `entity:${status.id}`
        );
      });

      this.statusContainer.addChild(badge);
    });

    if (statuses.length > 3) {
      this.statusOverflowText.text = `+${statuses.length - 3}`;
      this.statusOverflowText.position.set(110, 18);
      this.statusOverflowText.visible = true;
    }
  }

  private redrawBackgroundShell() {
    const { cellWidth: w, cellHeight: h } = this;
    this.background.clear();

    if (this.isRuins) {
      this.background.beginFill(0x2c3c4c, 0.92);
      this.background.lineStyle(2, 0x95a5a6, 1);
      this.background.drawRoundedRect(0, 0, w, h, 8);
      this.background.endFill();
      this.background.lineStyle(2, 0x566573, 0.55);
      this.background.moveTo(10, h - 10);
      this.background.lineTo(w - 10, 10);
      return;
    }

    if (!this.isEmpty) {
      this.background.beginFill(0x1e8449, 0.85);
      this.background.lineStyle(2, 0x58d68d, 1);
    } else {
      this.background.beginFill(0x3d5a80, 0.75);
      this.background.lineStyle(2, 0x7eb8da, 1);
    }
    this.background.drawRoundedRect(0, 0, w, h, 8);
    this.background.endFill();
  }

  private clearEntitySprite() {
    if (this.entitySprite) {
      this.removeChild(this.entitySprite);
      // 不销毁共享贴图（Assets 缓存）；只移除精灵
      this.entitySprite.destroy({ texture: false, textureSource: false });
      this.entitySprite = null;
    }
    this.currentEntityKey = null;
    this.stressShakePhase = 0;
    this.stressShakePet = false;
    this.stressShakeRatio = 0;
    // 注意：不要在这里调用 onEntitySet 回调
    // 调用者 setGridEntity 会在清除后负责设置新实体或通知外部
  }

  private resetEntitySpriteToRest() {
    if (!this.entitySprite) return;
    this.entitySprite.x = this.entitySpriteRestX;
    this.entitySprite.y = this.entitySpriteRestY;
  }

  public setEntityPortraitSuppressed(suppress: boolean) {
    this.entityPortraitSuppressed = suppress;
    if (this.entitySprite) {
      this.entitySprite.visible = !suppress;
    }
  }

  public isEntityPortraitSuppressed(): boolean {
    return this.entityPortraitSuppressed;
  }

  /** 设置为 3D 渲染模式：隐藏 2D 背景（由 Three.js 3D 格子替代） */
  public setRenderBackground3DMode(enabled: boolean): void {
    this.renderBackground3DMode = enabled;
    // 3D 模式下仍需要格子与其状态徽章参与命中，不能退成 passive。
    this.eventMode = 'static';
    this.background.visible = !enabled;
    this.highlight.visible = !enabled && this.isHighlighted;
    if (enabled) {
      this.setStressOverlay3DAnchor(null);
      this.setStatusOverlay3DAnchor(null);
    } else {
      this.stressContainer.position.set(0, 0);
      this.stressContainer.scale.set(1);
      this.statusContainer.position.set(0, 0);
      this.statusContainer.scale.set(1);
      this.hitArea = new PIXI.Rectangle(0, 0, this.cellWidth, this.cellHeight);
      this.statusContainer.hitArea = null;
    }
    if (enabled) {
      Tween.killTarget(this.actionPickGfx);
      this.actionPickGfx.visible = false;
    } else {
      this.redrawActionPickOverlay();
    }
  }

  /** 同步网格实体立绘（空位则清除）- 3D 模式下委托给外部渲染 */
  public setGridEntity(entity: GridEntity | null): void {
    if (!entity) {
      this.entityPortraitSuppressed = false;
    }
    const key = entity ? `${entity.id}|${entity.cardId}|${entity.type}` : null;
    const isSameEntity = key === this.currentEntityKey;
    if (isSameEntity) {
      logGridCell('setGridEntity:reuse', {
        cell: [this.row, this.col],
        key,
      });
      return;
    }

    const gen = ++this.entityLoadGen;
    this.clearEntitySprite();
    if (!entity) {
      logGridCell('setGridEntity:clear', { cell: [this.row, this.col] });
      // 通知外部（3D 渲染器）移除模型
      console.log('[GridCell] setGridEntity:clear, onEntitySet:', this.onEntitySet !== null, 'at', this.row, this.col);
      this.onEntitySet?.(null, this.row, this.col);
      return;
    }
    logGridCell('setGridEntity:loadStart', {
      cell: [this.row, this.col],
      key,
      cardId: entity.cardId,
      type: entity.type,
      gen,
    });

    // 如果有外部回调（3D 模式），使用外部渲染
    if (this.onEntitySet) {
      console.log('[GridCell] setGridEntity:3DMode', entity.cardId, 'at', this.row, this.col);
      this.currentEntityKey = key;
      this.onEntitySet(entity, this.row, this.col);
      logGridCell('setGridEntity:3DMode', {
        cell: [this.row, this.col],
        key,
      });
      return;
    }

    console.log('[GridCell] setGridEntity:2DMode (onEntitySet is null!)', entity.cardId, 'at', this.row, this.col);
    // 原有 2D 精灵模式（备用）
    void loadIllustrationForEntity(entity.cardId, entity.type).then(tex => {
      if (this.destroyed || gen !== this.entityLoadGen) {
        logGridCell('setGridEntity:loadAborted', {
          cell: [this.row, this.col],
          key,
          gen,
          currentGen: this.entityLoadGen,
          destroyed: this.destroyed,
        });
        return;
      }

      const pad = 6;
      const iw = this.cellWidth - pad * 2;
      const ih = this.cellHeight - pad * 2;
      const spr = new PIXI.Sprite(tex);
      layoutSpriteContain(spr, tex, pad, pad, iw, ih);
      this.entitySprite = spr;
      this.entitySpriteRestX = spr.x;
      this.entitySpriteRestY = spr.y;
      this.currentEntityKey = key;
      spr.visible = !this.entityPortraitSuppressed;
      this.addChildAt(spr, 1);
      logGridCell('setGridEntity:loadDone', {
        cell: [this.row, this.col],
        key,
        texSize: [tex.width, tex.height],
      });
    });
  }

  /** 同步暴躁度显示 */
  public syncStress(entity: GridEntity | null) {
    if (!entity) {
      this.stressContainer.visible = false;
      this.stressShakePet = false;
      this.stressShakeRatio = 0;
      this.resetEntitySpriteToRest();
      return;
    }

    if (this.entityPortraitSuppressed) {
      this.stressContainer.visible = false;
      this.stressShakePet = false;
      this.stressShakeRatio = 0;
      this.resetEntitySpriteToRest();
      return;
    }

    this.stressContainer.visible = true;
    const pad = 4;
    const barW = this.cellWidth - pad * 2;
    const barH = 7;
    const barY = this.cellHeight - barH - pad;
    const max = Math.max(1, entity.maxStress);
    const ratio = Math.min(1, entity.stress / max);

    const color = stressBarColorForRatio(ratio);

    this.stressShakeRatio = ratio;
    this.stressShakePet = entity.type === 'pet';
    if (!this.stressShakePet) {
      this.resetEntitySpriteToRest();
    }

    this.stressFill.clear();
    if (ratio > 0) {
      this.stressFill.beginFill(color, 1);
      this.stressFill.drawRoundedRect(pad, barY, Math.max(2, barW * ratio), barH, 3);
      this.stressFill.endFill();
    }

    this.stressText.text = `暴躁 ${entity.stress}/${entity.maxStress}`;
    this.stressText.style.fill = color;
  }

  /** 每帧更新：宠物立绘随暴躁度颤抖（由 GameScene.update 驱动） */
  public updatePetStressShake(deltaTime: number) {
    if (!this.entitySprite || !this.stressShakePet) return;
    const r = this.stressShakeRatio;
    if (r <= 0.001) {
      this.resetEntitySpriteToRest();
      return;
    }
    // 振幅与频率随比例升高，略加重高段（更「暴躁」）
    const amp = r * (1.2 + 4 * r);
    const speed = 6 + 18 * r;
    this.stressShakePhase += deltaTime * speed;
    const ox = Math.sin(this.stressShakePhase) * amp;
    const oy = Math.cos(this.stressShakePhase * 1.4) * amp * 0.9;
    this.entitySprite.x = this.entitySpriteRestX + ox;
    this.entitySprite.y = this.entitySpriteRestY + oy;
  }

  /** 结算阶段强调压力条与文案 */
  public pulseStressBar() {
    if (!this.stressContainer.visible) return;
    Tween.killTarget(this.stressText.scale);
    this.stressText.scale.set(1);
    Tween.to(this.stressText.scale, { x: 1.22, y: 1.22 }, 200, Easing.easeOutQuad, () => {
      Tween.to(this.stressText.scale, { x: 1, y: 1 }, 260, Easing.easeOutQuad);
    });
    Tween.killTarget(this.stressFill);
    this.stressFill.alpha = 1;
    Tween.to(this.stressFill, { alpha: 0.35 }, 200, Easing.easeOutQuad, () => {
      Tween.to(this.stressFill, { alpha: 1 }, 280, Easing.easeInQuad);
    });
  }

  public setStressOverlay3DAnchor(
    anchor: { x: number; y: number; scale?: number } | null
  ) {
    if (!this.renderBackground3DMode) {
      this.stressContainer.position.set(0, 0);
      this.stressContainer.scale.set(1);
      return;
    }
    if (!anchor) {
      this.stressContainer.visible = false;
      return;
    }

    const scale = anchor.scale ?? 1;
    const local = this.toLocal(new PIXI.Point(anchor.x, anchor.y), this.parent ?? undefined);
    const offsetX = local.x - (this.stressBaseWidth * scale) / 2 - 4 * scale;
    const offsetY = local.y;
    this.stressContainer.position.set(offsetX, offsetY);
    this.stressContainer.scale.set(scale);
  }

  public setStatusOverlay3DAnchor(
    anchor: { x: number; y: number; scale?: number } | null
  ) {
    if (!this.renderBackground3DMode) {
      this.statusContainer.position.set(0, 0);
      this.statusContainer.scale.set(1);
      return;
    }
    if (!anchor) {
      this.statusContainer.visible = false;
      this.hitArea = new PIXI.Rectangle(0, 0, this.cellWidth, this.cellHeight);
      this.statusContainer.hitArea = null;
      return;
    }

    this.statusContainer.visible = true;
    const scale = anchor.scale ?? 1;
    const local = this.toLocal(new PIXI.Point(anchor.x, anchor.y), this.parent ?? undefined);
    const localX = local.x;
    const localY = local.y;
    this.statusContainer.position.set(localX, localY);
    this.statusContainer.scale.set(scale);
    this.statusContainer.hitArea = new PIXI.Rectangle(
      -8,
      -8,
      132,
      40
    );
    this.hitArea = new PIXI.Rectangle(
      0,
      Math.min(0, localY - 8),
      Math.max(this.cellWidth, localX + Math.max(132, 132 * scale)),
      Math.max(this.cellHeight, localY + Math.max(40, 40 * scale))
    );
  }

  public setStatusTooltipHandlers(
    show: ((status: StatusInstance, globalX: number, globalY: number) => void) | null,
    hide: (() => void) | null,
    toggle: ((status: StatusInstance, globalX: number, globalY: number, key: string) => void) | null
  ) {
    this.showStatusTooltipHandler = show;
    this.hideStatusTooltipHandler = hide;
    this.toggleStatusTooltipHandler = toggle;
  }
}
