import * as PIXI from 'pixi.js';
import type { ActionZoneHit } from '../../systems/DragSystem';
import type { IsometricPetRenderer } from '../../renderers/IsometricPetRenderer';
import { strokeDark, strokeDarkBold, strokePetBrown } from '../../utils/fxTextStyles';
import { HAND_SIZE_MAX, VICTORY_DAYS, VICTORY_HEARTS } from '@config/gameRules';

export const PET_UI = {
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
} as const;

interface UiControllerDeps {
  uiContainer: PIXI.Container;
  onEndTurnAttempt: () => void;
}

interface UiUpdateState {
  turn: number;
  phase: string;
  cans: number;
  interest: number;
  deckLength: number;
  discardLength: number;
  hearts: number;
  playerHp: number;
  maxPlayerHp: number;
  winStreak: number;
  loseStreak: number;
  gameStatus: string;
}

export class GameSceneUiController {
  private readonly uiContainer: PIXI.Container;
  private readonly onEndTurnAttempt: () => void;

  private endTurnButton!: PIXI.Graphics;
  private endTurnLabel!: PIXI.Text;

  private hudCansValue!: PIXI.Text;
  private hudInterestLine!: PIXI.Text;
  private hudHeartsValue!: PIXI.Text;
  private hudHeartsGoal!: PIXI.Text;
  private hudHeartsBarFill!: PIXI.Graphics;
  private hudDayLine!: PIXI.Text;
  private hudPhaseLine!: PIXI.Text;
  private hudHpLine!: PIXI.Text;
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

  private handTrimBottomOverlayWrap!: PIXI.Container;
  private handTrimBottomArcGfx!: PIXI.Graphics;
  private handTrimBottomHint!: PIXI.Text;

  constructor(deps: UiControllerDeps) {
    this.uiContainer = deps.uiContainer;
    this.onEndTurnAttempt = deps.onEndTurnAttempt;
  }

  public init() {
    this.createPetHud();
    this.createDeckHud();
    this.createCuteEndTurnButton();
    this.createActionDropZone();
    this.createHandTrimBottomDiscardOverlay();
  }

  public getActionZoneHit(): ActionZoneHit | null {
    return this.actionZoneHit;
  }

  public isTargetUnderEndTurnButton(target: PIXI.Container | null | undefined): boolean {
    const btn = this.endTurnButton;
    if (!btn) return false;
    let current: PIXI.Container | null | undefined = target ?? undefined;
    while (current) {
      if (current === btn) return true;
      current = current.parent;
    }
    return false;
  }

  public isTargetUnderUi(target: PIXI.Container | null | undefined): boolean {
    let current: PIXI.Container | null | undefined = target ?? undefined;
    while (current) {
      if (current === this.uiContainer) return true;
      current = current.parent;
    }
    return false;
  }

  public setEndTurnButtonInteractable(on: boolean) {
    this.endTurnButton.eventMode = on ? 'static' : 'none';
    this.endTurnButton.alpha = on ? 1 : 0.38;
  }

  public updateActionZoneVisual(draggingAction: boolean, actionZoneHovered: boolean) {
    const wrap = this.actionZoneWrap;
    const bg = this.actionZoneBg;
    if (!bg || !wrap) return;

    const wrapTarget = draggingAction ? 1 : 0;
    wrap.alpha += (wrapTarget - wrap.alpha) * 0.2;
    if (Math.abs(wrapTarget - wrap.alpha) < 0.004) {
      wrap.alpha = wrapTarget;
    }

    let target = 0.09;
    if (draggingAction) {
      target = actionZoneHovered ? 0.16 : 0.11;
    }
    bg.alpha += (target - bg.alpha) * 0.22;
    if (Math.abs(target - bg.alpha) < 0.004) {
      bg.alpha = target;
    }
  }

  public updateHandTrimBottomDiscardOverlay(
    active: boolean,
    dragging: boolean,
    proximity: number,
    discardReleaseThreshold: number
  ) {
    const wrap = this.handTrimBottomOverlayWrap;
    const g = this.handTrimBottomArcGfx;
    const hint = this.handTrimBottomHint;
    if (!wrap || !g || !hint) return;

    if (!active) {
      wrap.visible = false;
      return;
    }

    if (!dragging) {
      wrap.visible = false;
      g.clear();
      return;
    }

    wrap.visible = true;
    this.redrawHandTrimBottomArc(g, proximity);

    hint.alpha = 0.42 + 0.58 * proximity;
    if (proximity >= discardReleaseThreshold) {
      hint.style.fill = 0xe8f5e9;
      hint.text = '✓ 已达弃牌线\n松手将尝试弃牌；不可弃置卡仍会弹回';
    } else if (proximity >= 0.2) {
      hint.style.fill = 0xffebee;
      hint.text = '再向下拖至底部红区\n未达弃牌线时松手不会弃牌';
    } else {
      hint.style.fill = 0xffebee;
      hint.text = '向下拖至底部 100 像素红区\n未达弃牌线时松手不会弃牌';
    }
  }

  public updateHud(
    state: UiUpdateState,
    opts: {
      deckDisplayCount: number;
      roundResolving: boolean;
      handTrimActive: boolean;
      petRenderer: IsometricPetRenderer | null;
    }
  ) {
    const phaseNames: Record<string, string> = {
      preparation: '准备阶段',
      action: '行动阶段',
      income: '收入阶段',
      end: '结束阶段',
    };

    const dayDisplay = Math.min(state.turn, VICTORY_DAYS);
    let phaseLabel = phaseNames[state.phase] || state.phase;
    if (opts.handTrimActive) {
      phaseLabel = `弃牌整理（≤${HAND_SIZE_MAX} 张）`;
    }

    const endTurnEnabled =
      state.gameStatus === 'playing' && !opts.roundResolving && !opts.handTrimActive;
    this.setEndTurnButtonInteractable(endTurnEnabled);

    this.hudCansValue.text = String(state.cans);
    this.hudInterestLine.text = `银行利息 +${state.interest} 🥫/回合`;
    this.hudDeckValue.text = `牌库 ${opts.deckDisplayCount}`;
    this.hudDiscardValue.text = `弃牌 ${state.discardLength}`;
    opts.petRenderer?.setDeckCount(opts.deckDisplayCount);

    this.hudHeartsValue.text = String(state.hearts);
    const heartRatio = Math.min(1, state.hearts / Math.max(1, VICTORY_HEARTS));
    const heartWidth = 252 * heartRatio;
    this.hudHeartsBarFill.clear();
    if (heartWidth > 2) {
      this.hudHeartsBarFill.beginFill(PET_UI.barHeart, 1);
      this.hudHeartsBarFill.drawRoundedRect(18, 82, heartWidth, 14, 7);
      this.hudHeartsBarFill.endFill();
    }

    this.hudDayLine.text = `📅 今日营业 · 第 ${dayDisplay} / ${VICTORY_DAYS} 天`;
    this.hudPhaseLine.text = `✨ ${phaseLabel}`;

    this.hudHpLine.text = `${state.playerHp} / ${state.maxPlayerHp}`;
    const hpRatio = Math.min(1, state.playerHp / Math.max(1, state.maxPlayerHp));
    const hpWidth = 232 * hpRatio;
    this.hudHpBarFill.clear();
    if (hpWidth > 2) {
      this.hudHpBarFill.beginFill(PET_UI.barHp, 1);
      this.hudHpBarFill.drawRoundedRect(18, 64, hpWidth, 16, 8);
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

  private createUISectionTitleStyle(size: number, fill: number = PET_UI.text): Partial<PIXI.TextStyle> {
    return {
      fontSize: size,
      fill,
      fontWeight: 'bold',
      stroke: strokePetBrown,
    };
  }

  private createPetHud() {
    const titleStyle = (size: number, fill: number = PET_UI.text) =>
      this.createUISectionTitleStyle(size, fill);

    const resWrap = new PIXI.Container();
    resWrap.position.set(36, 32);
    const hudResourceBg = new PIXI.Graphics();
    hudResourceBg.beginFill(PET_UI.cream, 0.96);
    hudResourceBg.lineStyle(3, PET_UI.honeyLine, 0.85);
    hudResourceBg.drawRoundedRect(0, 0, 268, 112, 22);
    hudResourceBg.endFill();
    resWrap.addChild(hudResourceBg);

    const resTitle = new PIXI.Text({ text: '🥫 口粮罐头', style: titleStyle(17, PET_UI.textMuted) });
    resTitle.position.set(18, 12);
    resWrap.addChild(resTitle);

    this.hudCansValue = new PIXI.Text({ text: '0', style: titleStyle(36, 0xe65100) });
    this.hudCansValue.position.set(18, 38);
    resWrap.addChild(this.hudCansValue);

    this.hudInterestLine = new PIXI.Text({
      text: '银行利息 +0',
      style: titleStyle(15, PET_UI.textMuted),
    });
    this.hudInterestLine.position.set(18, 84);
    resWrap.addChild(this.hudInterestLine);
    this.uiContainer.addChild(resWrap);

    const heartWrap = new PIXI.Container();
    heartWrap.position.set(1616, 32);
    const hudHeartsBg = new PIXI.Graphics();
    hudHeartsBg.beginFill(PET_UI.pink, 0.96);
    hudHeartsBg.lineStyle(3, PET_UI.pinkLine, 0.75);
    hudHeartsBg.drawRoundedRect(0, 0, 288, 124, 22);
    hudHeartsBg.endFill();
    heartWrap.addChild(hudHeartsBg);

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

    const hudHeartsBarTrack = new PIXI.Graphics();
    hudHeartsBarTrack.beginFill(PET_UI.barTrack, 1);
    hudHeartsBarTrack.drawRoundedRect(18, 82, 252, 14, 7);
    hudHeartsBarTrack.endFill();
    heartWrap.addChild(hudHeartsBarTrack);

    this.hudHeartsBarFill = new PIXI.Graphics();
    heartWrap.addChild(this.hudHeartsBarFill);
    this.uiContainer.addChild(heartWrap);

    const dayWrap = new PIXI.Container();
    dayWrap.position.set(960, 40);
    const hudDayBg = new PIXI.Graphics();
    hudDayBg.beginFill(PET_UI.mint, 0.96);
    hudDayBg.lineStyle(3, PET_UI.mintLine, 0.9);
    hudDayBg.drawRoundedRect(-200, 0, 400, 96, 24);
    hudDayBg.endFill();
    dayWrap.addChild(hudDayBg);

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

    const hpWrap = new PIXI.Container();
    hpWrap.position.set(36, 168);
    const hudHpBg = new PIXI.Graphics();
    hudHpBg.beginFill(PET_UI.cream, 0.94);
    hudHpBg.lineStyle(3, PET_UI.coralLine, 0.55);
    hudHpBg.drawRoundedRect(0, 0, 268, 102, 22);
    hudHpBg.endFill();
    hpWrap.addChild(hudHpBg);

    const hpTitle = new PIXI.Text({ text: '🐾 店长元气', style: titleStyle(17, PET_UI.textMuted) });
    hpTitle.position.set(18, 10);
    hpWrap.addChild(hpTitle);

    this.hudHpLine = new PIXI.Text({ text: '100 / 100', style: titleStyle(16, PET_UI.text) });
    this.hudHpLine.position.set(18, 36);
    hpWrap.addChild(this.hudHpLine);

    const hudHpBarTrack = new PIXI.Graphics();
    hudHpBarTrack.beginFill(PET_UI.barTrack, 1);
    hudHpBarTrack.drawRoundedRect(18, 64, 232, 16, 8);
    hudHpBarTrack.endFill();
    hpWrap.addChild(hudHpBarTrack);

    this.hudHpBarFill = new PIXI.Graphics();
    hpWrap.addChild(this.hudHpBarFill);
    this.uiContainer.addChild(hpWrap);

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
    this.hudWinText = new PIXI.Text({ text: '连胜 0', style: titleStyle(15, 0x2e7d32) });
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
    this.hudLoseText = new PIXI.Text({ text: '连败 0', style: titleStyle(15, 0xef6c00) });
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
    wrap.position.set(48, 866);

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
      this.onEndTurnAttempt();
    });
    button.on('pointerover', () => paintBtn(true));
    button.on('pointerout', () => paintBtn(false));

    this.uiContainer.addChild(button);
  }

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
    this.actionZoneHit = {
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
  }

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
    const width = 1920;
    const height = 1080;
    const zoneHeight = 100;
    const p = Math.max(0, Math.min(1, proximity));
    if (p < 0.02) return;

    const fillAlpha = 0.12 + 0.55 * p;
    const strokeAlpha = 0.28 + 0.58 * p;

    g.beginFill(0xb71c1c, fillAlpha);
    g.drawRect(0, height - zoneHeight, width, zoneHeight);
    g.endFill();

    g.lineStyle(3, 0xff8a80, strokeAlpha);
    g.moveTo(0, height - zoneHeight);
    g.lineTo(width, height - zoneHeight);
  }
}
