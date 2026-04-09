import * as PIXI from 'pixi.js';
import type { GridEntity } from '../../store/gameStore';
import { loadIllustrationForEntity } from '../utils/illustrationTextures';
import { layoutSpriteContain } from '../utils/spriteFit';
import { strokeDark } from '../utils/fxTextStyles';
import { Tween, Easing } from '../utils/Tween';

export class GridCell extends PIXI.Container {
  private background!: PIXI.Graphics;
  private highlight!: PIXI.Graphics;
  private isHighlighted = false;
  private entitySprite: PIXI.Sprite | null = null;
  private entityLoadGen = 0;
  private currentEntityKey: string | null = null;
  private stressContainer: PIXI.Container;
  private stressTrack!: PIXI.Graphics;
  private stressFill!: PIXI.Graphics;
  private stressText!: PIXI.Text;

  public row: number;
  public col: number;
  public isEmpty = true;
  /** 布局尺寸（与 hitArea 一致；勿用 Container.width，避免 bounds 未更新时为 0） */
  public readonly cellWidth: number;
  public readonly cellHeight: number;

  constructor(row: number, col: number, width: number, height: number) {
    super();
    this.row = row;
    this.col = col;
    this.cellWidth = width;
    this.cellHeight = height;

    this.eventMode = 'static';
    this.hitArea = new PIXI.Rectangle(0, 0, width, height);

    this.createBackground(width, height);
    this.stressContainer = new PIXI.Container();
    this.createStressUi(width, height);
    this.addChild(this.stressContainer);
    this.createHighlight(width, height);
  }

  private createBackground(width: number, height: number) {
    this.background = new PIXI.Graphics();
    this.background.beginFill(0x3d5a80, 0.75);
    this.background.lineStyle(2, 0x7eb8da, 1);
    this.background.drawRoundedRect(0, 0, width, height, 8);
    this.background.endFill();
    this.addChild(this.background);
  }

  private createStressUi(width: number, height: number) {
    const pad = 4;
    const barW = width - pad * 2;
    const barH = 7;
    const barY = height - barH - pad;

    this.stressText = new PIXI.Text('', {
      fontSize: 11,
      fill: 0xfce4ec,
      fontWeight: 'bold',
      stroke: strokeDark,
    });
    this.stressText.x = pad;
    this.stressText.y = barY - 13;

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

  private createHighlight(width: number, height: number) {
    this.highlight = new PIXI.Graphics();
    this.highlight.beginFill(0x3498db, 0.65);
    this.highlight.lineStyle(3, 0x5dade2, 1);
    this.highlight.drawRoundedRect(0, 0, width, height, 8);
    this.highlight.endFill();
    this.highlight.visible = false;
    this.addChild(this.highlight);
  }

  public setHighlight(highlighted: boolean) {
    if (this.isHighlighted === highlighted) return;

    this.isHighlighted = highlighted;
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
    const { cellWidth: w, cellHeight: h } = this;

    this.background.clear();
    if (occupied) {
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
  }

  /** 同步网格实体立绘（空位则清除） */
  public setGridEntity(entity: GridEntity | null): void {
    const key = entity ? `${entity.id}|${entity.cardId}|${entity.type}` : null;
    if (key && key === this.currentEntityKey && this.entitySprite) {
      return;
    }

    const gen = ++this.entityLoadGen;
    this.clearEntitySprite();
    if (!entity) return;

    void loadIllustrationForEntity(entity.cardId, entity.type).then(tex => {
      if (this.destroyed || gen !== this.entityLoadGen) return;

      const pad = 6;
      const iw = this.cellWidth - pad * 2;
      const ih = this.cellHeight - pad * 2;
      const spr = new PIXI.Sprite(tex);
      layoutSpriteContain(spr, tex, pad, pad, iw, ih);
      this.entitySprite = spr;
      this.currentEntityKey = key;
      this.addChildAt(spr, 1);
    });
  }

  /** 同步暴躁度显示 */
  public syncStress(entity: GridEntity | null) {
    if (!entity) {
      this.stressContainer.visible = false;
      return;
    }

    this.stressContainer.visible = true;
    const pad = 4;
    const barW = this.cellWidth - pad * 2;
    const barH = 7;
    const barY = this.cellHeight - barH - pad;
    const max = Math.max(1, entity.maxStress);
    const ratio = Math.min(1, entity.stress / max);

    const color =
      ratio < 0.45 ? 0x2ecc71 : ratio < 0.75 ? 0xf1c40f : 0xe74c3c;

    this.stressFill.clear();
    if (ratio > 0) {
      this.stressFill.beginFill(color, 1);
      this.stressFill.drawRoundedRect(pad, barY, Math.max(2, barW * ratio), barH, 3);
      this.stressFill.endFill();
    }

    this.stressText.text = `暴躁 ${entity.stress}/${entity.maxStress}`;
    this.stressText.style.fill = color;
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
}
