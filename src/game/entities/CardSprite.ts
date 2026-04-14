import * as PIXI from 'pixi.js';
import type { Card as CardData } from '../../types/card';
import { loadIllustrationForCard } from '../utils/illustrationTextures';
import { layoutSpriteContain } from '../utils/spriteFit';
import { Tween, Easing } from '../utils/Tween';
import {
  ACTION_BURST_COLORS,
  PET_BURST_COLORS,
  SHARD_BURST_COLORS,
  burstParticlesAtGlobal,
} from '../utils/cardFx';
import { CARD_RARITY_COLORS, VISUAL_THEME, getCardTypeLabel } from '../theme/visualTheme';

const CARD_W = 200;
const CARD_H = 280;
const CARD_TEXT_PADDING_X = 16;
const DESC_TEXT_Y = 190;
const DESC_TEXT_BOTTOM_PADDING = 18;
const DESC_TEXT_WIDTH = CARD_W - CARD_TEXT_PADDING_X * 2;
const DESC_TEXT_MAX_HEIGHT = CARD_H - DESC_TEXT_Y - DESC_TEXT_BOTTOM_PADDING;
const DESC_FONT_MAX = 13;
const DESC_FONT_MIN = 9;
const HAND_TILT_MAX = (6 * Math.PI) / 180;

function textStyle(
  size: number,
  fill: number,
  options?: Partial<PIXI.TextStyle>
): Partial<PIXI.TextStyle> {
  return {
    fontFamily: VISUAL_THEME.typography.heading,
    fontSize: size,
    fill,
    fontWeight: '700',
    ...options,
  };
}

export class CardSprite extends PIXI.Container {
  private background!: PIXI.Graphics;
  private illustrationFrame!: PIXI.Graphics;
  private illustrationBorder!: PIXI.Graphics;
  private illustration: PIXI.Sprite | null = null;
  private costBadge!: PIXI.Graphics;
  private costText!: PIXI.Text;
  private typePill!: PIXI.Graphics;
  private typeText!: PIXI.Text;
  private nameText!: PIXI.Text;
  private descText!: PIXI.Text;

  public cardData: CardData;
  public isDragging = false;
  public isResolving = false;
  public originalX = 0;
  public originalY = 0;
  public handTilt = 0;
  public handZIndex = 0;

  constructor(cardData: CardData) {
    super();
    this.cardData = cardData;

    this.pivot.set(CARD_W / 2, CARD_H / 2);
    this.handTilt = (Math.random() - 0.5) * 2 * HAND_TILT_MAX;
    this.rotation = this.handTilt;

    this.eventMode = 'static';
    this.cursor = 'pointer';

    this.createBackground();
    this.createIllustration();
    this.createCostBadge();
    this.createTexts();
  }

  private getRarityTheme() {
    return CARD_RARITY_COLORS[this.cardData.rarity] ?? CARD_RARITY_COLORS.common;
  }

  private createBackground() {
    const rarity = this.getRarityTheme();
    this.background = new PIXI.Graphics();

    this.background.beginFill(0x000000, 0.12);
    this.background.drawRoundedRect(8, 10, CARD_W - 4, CARD_H - 2, 22);
    this.background.endFill();

    this.background.beginFill(0xfffbf4, 0.98);
    this.background.lineStyle(3, rarity.edge, 0.95);
    this.background.drawRoundedRect(0, 0, CARD_W, CARD_H, 22);
    this.background.endFill();

    this.background.beginFill(rarity.glow, 0.55);
    this.background.drawRoundedRect(10, 10, CARD_W - 20, 32, 16);
    this.background.endFill();

    this.background.beginFill(0xf7efe6, 0.9);
    this.background.drawRoundedRect(10, 166, CARD_W - 20, 100, 16);
    this.background.endFill();

    this.background.lineStyle(1, 0xffffff, 0.5);
    this.background.drawRoundedRect(8, 8, CARD_W - 16, CARD_H - 16, 18);
    this.addChild(this.background);
  }

  private createIllustration() {
    const rarity = this.getRarityTheme();
    this.illustrationFrame = new PIXI.Graphics();
    this.illustrationFrame.beginFill(0x231a22, 0.18);
    this.illustrationFrame.drawRoundedRect(14, 44, 172, 112, 18);
    this.illustrationFrame.endFill();
    this.illustrationFrame.beginFill(0xfff9f0, 0.96);
    this.illustrationFrame.drawRoundedRect(10, 40, 180, 118, 18);
    this.illustrationFrame.endFill();
    this.addChild(this.illustrationFrame);

    this.illustrationBorder = new PIXI.Graphics();
    this.illustrationBorder.lineStyle(2, rarity.edge, 0.8);
    this.illustrationBorder.drawRoundedRect(10, 40, 180, 118, 18);
    this.addChild(this.illustrationBorder);

    const iw = 164;
    const ih = 102;
    const ix = 18;
    const iy = 48;

    void loadIllustrationForCard(this.cardData).then(tex => {
      if (this.destroyed) return;
      if (!this.illustration) {
        this.illustration = new PIXI.Sprite(tex);
        this.addChildAt(this.illustration, this.getChildIndex(this.illustrationBorder));
      }
      layoutSpriteContain(this.illustration, tex, ix, iy, iw, ih);
      if (tex === PIXI.Texture.WHITE) {
        this.illustration.tint = rarity.glow;
        this.illustration.alpha = 0.36;
      } else {
        this.illustration.tint = 0xffffff;
        this.illustration.alpha = 1;
      }
    });
  }

  private createCostBadge() {
    const rarity = this.getRarityTheme();
    this.costBadge = new PIXI.Graphics();
    this.costBadge.beginFill(rarity.badge, 1);
    this.costBadge.lineStyle(2, 0xffffff, 0.85);
    this.costBadge.drawCircle(0, 0, 24);
    this.costBadge.endFill();
    this.costBadge.x = 170;
    this.costBadge.y = 28;
    this.addChild(this.costBadge);

    this.costText = new PIXI.Text({
      text: this.cardData.cost.toString(),
      style: textStyle(28, 0xffffff, {
        fontFamily: VISUAL_THEME.typography.display,
      }),
    });
    this.costText.anchor.set(0.5);
    this.costBadge.addChild(this.costText);
  }

  private createTexts() {
    const rarity = this.getRarityTheme();

    this.typePill = new PIXI.Graphics();
    this.typePill.beginFill(rarity.glow, 0.92);
    this.typePill.lineStyle(1.5, rarity.edge, 0.85);
    this.typePill.drawRoundedRect(14, 14, 78, 22, 11);
    this.typePill.endFill();
    this.addChild(this.typePill);

    this.typeText = new PIXI.Text({
      text: getCardTypeLabel(this.cardData.type),
      style: textStyle(11, VISUAL_THEME.colors.inkSoft, {
        fontFamily: VISUAL_THEME.typography.body,
        letterSpacing: 1.2,
      }),
    });
    this.typeText.anchor.set(0.5);
    this.typeText.position.set(53, 25);
    this.addChild(this.typeText);

    this.nameText = new PIXI.Text({
      text: this.cardData.name,
      style: textStyle(18, VISUAL_THEME.colors.ink, {
        wordWrap: true,
        wordWrapWidth: 172,
        fontFamily: VISUAL_THEME.typography.display,
      }),
    });
    this.nameText.position.set(14, 164);
    this.addChild(this.nameText);

    this.descText = new PIXI.Text(
      this.cardData.description,
      this.createDescriptionStyle(DESC_FONT_MAX)
    );
    this.descText.x = CARD_TEXT_PADDING_X;
    this.descText.y = DESC_TEXT_Y;
    this.fitDescriptionText();
    this.addChild(this.descText);

    const statWrap = new PIXI.Container();
    statWrap.position.set(14, 128);
    this.addChild(statWrap);

    let nextX = 0;
    if (this.cardData.income !== undefined) {
      statWrap.addChild(this.createStatChip(nextX, 0xdff6ea, 0x2e8b66, `收益 ${this.cardData.income}`));
      nextX += 84;
    }

    if (this.cardData.stress !== undefined) {
      statWrap.addChild(this.createStatChip(nextX, 0xffe0de, 0xd56a5c, `压力 ${this.cardData.stress}`));
    }
  }

  private createStatChip(x: number, fill: number, line: number, text: string): PIXI.Container {
    const wrap = new PIXI.Container();
    wrap.position.set(x, 0);

    const bg = new PIXI.Graphics();
    bg.beginFill(fill, 0.96);
    bg.lineStyle(1.5, line, 0.8);
    bg.drawRoundedRect(0, 0, 74, 24, 12);
    bg.endFill();
    wrap.addChild(bg);

    const label = new PIXI.Text({
      text,
      style: textStyle(11, VISUAL_THEME.colors.ink, {
        fontFamily: VISUAL_THEME.typography.body,
      }),
    });
    label.anchor.set(0.5);
    label.position.set(37, 12);
    wrap.addChild(label);
    return wrap;
  }

  private createDescriptionStyle(fontSize: number): Partial<PIXI.TextStyle> {
    return {
      fontFamily: VISUAL_THEME.typography.body,
      fontSize,
      lineHeight: Math.ceil(fontSize * 1.34),
      fill: VISUAL_THEME.colors.inkSoft,
      wordWrap: true,
      wordWrapWidth: DESC_TEXT_WIDTH,
      breakWords: true,
      whiteSpace: 'normal' as const,
      fontWeight: 'bold',
    };
  }

  private fitDescriptionText() {
    for (let fontSize = DESC_FONT_MAX; fontSize >= DESC_FONT_MIN; fontSize--) {
      this.descText.style = this.createDescriptionStyle(fontSize);
      if (
        this.descText.height <= DESC_TEXT_MAX_HEIGHT &&
        this.descText.width <= DESC_TEXT_WIDTH + 1
      ) {
        return;
      }
    }
  }

  public playHandHoverLift() {
    if (this.isDragging) return;
    Tween.killTarget(this);
    Tween.killTarget(this.scale);
    this.zIndex = 1000;
    Tween.to(this, { y: this.originalY - 88, rotation: 0 }, 240, Easing.easeOutCubic);
    Tween.to(this.scale, { x: 1.15, y: 1.15 }, 240, Easing.easeOutCubic);
  }

  public playDragStartAnimation() {
    this.isResolving = false;
    this.isDragging = true;
    Tween.killTarget(this);
    Tween.killTarget(this.scale);
    this.alpha = 1;
    this.eventMode = 'static';
    this.cursor = 'pointer';
    Tween.to(this.scale, { x: 1.08, y: 1.08 }, 180, Easing.easeOutCubic);
    Tween.to(this, { rotation: 0 }, 200, Easing.easeOutCubic);
    this.zIndex = 2000;
  }

  public playDragEndAnimation(opts?: { keepFront?: boolean }) {
    this.isDragging = false;
    if (!opts?.keepFront) this.zIndex = this.handZIndex;
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
    Tween.to(this.scale, { x: 0.9, y: 0.9 }, 440, Easing.easeOutCubic);
  }

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

  public playPlaceAnimation(targetX: number, targetY: number, callback?: () => void) {
    Tween.killTarget(this);
    Tween.killTarget(this.scale);
    Tween.to(this, { x: targetX, y: targetY, rotation: 0 }, 400, Easing.easeOutCubic, callback);
    Tween.to(this.scale, { x: 0.8, y: 0.8 }, 400, Easing.easeOutCubic);
  }
}
