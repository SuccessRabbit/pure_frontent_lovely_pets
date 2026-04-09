import * as PIXI from 'pixi.js';
import type { Card as CardData } from '../../types/card';
import { loadIllustrationForCard } from '../utils/illustrationTextures';
import { layoutSpriteContain } from '../utils/spriteFit';
import { Tween, Easing } from '../utils/Tween';
import {
  burstParticlesAtGlobal,
  PET_BURST_COLORS,
  ACTION_BURST_COLORS,
  SHARD_BURST_COLORS,
} from '../utils/cardFx';

const CARD_W = 200;
const CARD_H = 280;
/** 手牌静止时随机倾斜幅度（弧度），约 ±6° */
const HAND_TILT_MAX = (6 * Math.PI) / 180;

export class CardSprite extends PIXI.Container {
  private background!: PIXI.Graphics;
  private illustration: PIXI.Sprite | null = null;
  private costBadge!: PIXI.Graphics;
  private costText!: PIXI.Text;
  private nameText!: PIXI.Text;
  private descText!: PIXI.Text;

  public cardData: CardData;
  public isDragging = false;
  /** 正在执行“打出并消失”的不可打断动效 */
  public isResolving = false;
  public originalX = 0;
  public originalY = 0;
  /** 手牌区随机倾角，回弹/取消悬停时恢复 */
  public handTilt = 0;
  /** 与手牌排序一致，用于悬停结束后 zIndex */
  public handZIndex = 0;

  constructor(cardData: CardData) {
    super();
    this.cardData = cardData;

    this.pivot.set(CARD_W / 2, CARD_H / 2);
    this.handTilt = (Math.random() - 0.5) * 2 * HAND_TILT_MAX;
    this.rotation = this.handTilt;

    // 设置交互
    this.eventMode = 'static';
    this.cursor = 'pointer';

    this.createBackground();
    this.createIllustration();
    this.createCostBadge();
    this.createTexts();
  }

  private createBackground() {
    this.background = new PIXI.Graphics();

    // 根据稀有度设置边框颜色
    const rarityColors: Record<string, number> = {
      common: 0xcccccc,
      rare: 0x4a90e2,
      epic: 0x9b59b6,
      legendary: 0xf39c12,
    };

    const borderColor = rarityColors[this.cardData.rarity] || 0xcccccc;

    // 绘制卡牌背景
    this.background.beginFill(0xffffff);
    this.background.lineStyle(4, borderColor, 1);
    this.background.drawRoundedRect(0, 0, 200, 280, 12);
    this.background.endFill();

    this.addChild(this.background);
  }

  private createIllustration() {
    const illustrationBg = new PIXI.Graphics();
    illustrationBg.beginFill(0xf0f0f0);
    illustrationBg.drawRoundedRect(10, 10, 180, 135, 8);
    illustrationBg.endFill();
    this.addChild(illustrationBg);

    const iw = 180;
    const ih = 135;
    const ix = 10;
    const iy = 10;

    void loadIllustrationForCard(this.cardData).then(tex => {
      if (this.destroyed) return;
      if (!this.illustration) {
        this.illustration = new PIXI.Sprite(tex);
        this.addChild(this.illustration);
      }
      layoutSpriteContain(this.illustration, tex, ix, iy, iw, ih);
    });
  }

  private createCostBadge() {
    // 费用徽章
    this.costBadge = new PIXI.Graphics();
    this.costBadge.beginFill(0xff6b9d);
    this.costBadge.drawCircle(0, 0, 24);
    this.costBadge.endFill();
    this.costBadge.x = 176;
    this.costBadge.y = 24;
    this.addChild(this.costBadge);

    this.costText = new PIXI.Text(this.cardData.cost.toString(), {
      fontSize: 28,
      fill: 0xffffff,
      fontWeight: 'bold',
    });
    this.costText.anchor.set(0.5);
    this.costBadge.addChild(this.costText);
  }

  private createTexts() {
    // 卡牌名称
    this.nameText = new PIXI.Text(this.cardData.name, {
      fontSize: 18,
      fill: 0x333333,
      fontWeight: 'bold',
      wordWrap: true,
      wordWrapWidth: 180,
    });
    this.nameText.x = 10;
    this.nameText.y = 155;
    this.addChild(this.nameText);

    // 卡牌描述
    this.descText = new PIXI.Text(this.cardData.description, {
      fontSize: 12,
      fill: 0x666666,
      wordWrap: true,
      wordWrapWidth: 180,
    });
    this.descText.x = 10;
    this.descText.y = 185;
    this.addChild(this.descText);

    // 属性显示（收益/压力）
    if (this.cardData.income !== undefined) {
      const incomeText = new PIXI.Text(`💰 ${this.cardData.income}`, {
        fontSize: 14,
        fill: 0x27ae60,
        fontWeight: 'bold',
      });
      incomeText.x = 10;
      incomeText.y = 250;
      this.addChild(incomeText);
    }

    if (this.cardData.stress !== undefined) {
      const stressText = new PIXI.Text(`⚡ ${this.cardData.stress}`, {
        fontSize: 14,
        fill: 0xe74c3c,
        fontWeight: 'bold',
      });
      stressText.x = 100;
      stressText.y = 250;
      this.addChild(stressText);
    }
  }

  /** 由 GameScene 在悬停布局时调用：上浮、放大、扶正 */
  public playHandHoverLift() {
    if (this.isDragging) return;
    Tween.killTarget(this);
    Tween.killTarget(this.scale);
    this.zIndex = 1000;
    Tween.to(this, { y: this.originalY - 54, rotation: 0 }, 260, Easing.easeOutCubic);
    Tween.to(this.scale, { x: 1.14, y: 1.14 }, 260, Easing.easeOutCubic);
  }

  public playDragStartAnimation() {
    this.isResolving = false;
    this.isDragging = true;
    Tween.killTarget(this);
    Tween.killTarget(this.scale);
    this.alpha = 1;
    this.eventMode = 'static';
    this.cursor = 'pointer';
    Tween.to(this.scale, { x: 1.07, y: 1.07 }, 180, Easing.easeOutCubic);
    Tween.to(this, { rotation: 0 }, 200, Easing.easeOutCubic);
    this.zIndex = 2000;
  }

  /** 飞行动效期间保持最前时可传 keepFront */
  public playDragEndAnimation(opts?: { keepFront?: boolean }) {
    this.isDragging = false;
    if (!opts?.keepFront) {
      this.zIndex = this.handZIndex;
    }
  }

  public playReturnAnimation(callback?: () => void) {
    Tween.killTarget(this);
    Tween.killTarget(this.scale);
    this.isResolving = false;
    this.alpha = 1;
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.zIndex = this.handZIndex;
    Tween.to(
      this,
      { x: this.originalX, y: this.originalY, rotation: this.handTilt },
      400,
      Easing.easeOutBack,
      callback
    );
    Tween.to(this.scale, { x: 1, y: 1 }, 400, Easing.easeOutBack);
  }

  /**
   * 宠物/员工：飞向格子 → 格心粒子 → 卡牌处碎屑 → 溶解，最后回调（再 playCard）
   */
  public playPlaceEntityFx(
    targetX: number,
    targetY: number,
    fxLayer: PIXI.Container,
    cellGlobalX: number,
    cellGlobalY: number,
    onComplete?: () => void
  ) {
    Tween.killTarget(this);
    Tween.killTarget(this.scale);
    this.isResolving = true;
    this.eventMode = 'none';
    this.cursor = 'default';
    this.alpha = 1;
    this.zIndex = 2600;

    Tween.to(this, { x: targetX, y: targetY, rotation: 0 }, 440, Easing.easeOutCubic, () => {
      burstParticlesAtGlobal(fxLayer, cellGlobalX, cellGlobalY, {
        count: 42,
        colors: PET_BURST_COLORS,
        spread: 130,
        durationMin: 520,
        durationMax: 820,
      });
      const gp = new PIXI.Point();
      this.getGlobalPosition(gp);
      burstParticlesAtGlobal(fxLayer, gp.x, gp.y, {
        count: 16,
        colors: SHARD_BURST_COLORS,
        spread: 55,
        durationMin: 380,
        durationMax: 560,
      });

      Tween.to(this.scale, { x: 0.78, y: 0.78 }, 400, Easing.easeInCubic);
      Tween.to(this, { alpha: 0 }, 400, Easing.easeInCubic, () => {
        onComplete?.();
      });
    });
    Tween.to(this.scale, { x: 0.88, y: 0.88 }, 440, Easing.easeOutCubic);
  }

  /**
   * 行动牌：吸向触发区中心 → 魔法粒子 + 溶解 → 回调（再 playCard）
   */
  public playActionTriggerFx(
    targetX: number,
    targetY: number,
    fxLayer: PIXI.Container,
    zoneGlobalX: number,
    zoneGlobalY: number,
    onComplete?: () => void
  ) {
    Tween.killTarget(this);
    Tween.killTarget(this.scale);
    this.isResolving = true;
    this.eventMode = 'none';
    this.cursor = 'default';
    this.alpha = 1;
    this.zIndex = 2600;

    Tween.to(this, { x: targetX, y: targetY, rotation: 0 }, 260, Easing.easeOutCubic, () => {
      burstParticlesAtGlobal(fxLayer, zoneGlobalX, zoneGlobalY, {
        count: 48,
        colors: ACTION_BURST_COLORS,
        spread: 140,
        durationMin: 450,
        durationMax: 780,
      });
      const gp = new PIXI.Point();
      this.getGlobalPosition(gp);
      burstParticlesAtGlobal(fxLayer, gp.x, gp.y, {
        count: 20,
        colors: SHARD_BURST_COLORS,
        spread: 48,
        durationMin: 320,
        durationMax: 500,
      });

      Tween.to(this.scale, { x: this.scale.x * 1.08, y: this.scale.y * 1.08 }, 360, Easing.easeOutQuad);
      Tween.to(this, { alpha: 0 }, 360, Easing.easeInCubic, () => {
        onComplete?.();
      });
    });
  }

  /** 旧路径保留（若外部仍调用） */
  public playPlaceAnimation(targetX: number, targetY: number, callback?: () => void) {
    Tween.killTarget(this);
    Tween.killTarget(this.scale);
    Tween.to(this, { x: targetX, y: targetY, rotation: 0 }, 400, Easing.easeOutCubic, callback);
    Tween.to(this.scale, { x: 0.8, y: 0.8 }, 400, Easing.easeOutCubic);
  }
}
