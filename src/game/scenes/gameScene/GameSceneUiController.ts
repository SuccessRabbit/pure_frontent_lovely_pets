import * as PIXI from 'pixi.js';
import type { ActionZoneHit } from '../../systems/DragSystem';
import type { IsometricPetRenderer } from '../../renderers/IsometricPetRenderer';
import { strokeDarkBold, strokePetBrown } from '../../utils/fxTextStyles';
import { HAND_SIZE_MAX, VICTORY_DAYS, VICTORY_HEARTS } from '@config/gameRules';
import { VISUAL_THEME } from '../../theme/visualTheme';

export const PET_UI = {
  cream: VISUAL_THEME.colors.cream,
  creamDeep: VISUAL_THEME.colors.creamDeep,
  creamLine: VISUAL_THEME.colors.creamLine,
  mint: VISUAL_THEME.colors.mint,
  mintLine: VISUAL_THEME.colors.mintStrong,
  pink: VISUAL_THEME.colors.rose,
  pinkLine: VISUAL_THEME.colors.roseStrong,
  coral: VISUAL_THEME.colors.coral,
  coralHi: VISUAL_THEME.colors.coralStrong,
  coralLine: 0xb24d6e,
  honey: VISUAL_THEME.colors.goldSoft,
  honeyLine: VISUAL_THEME.colors.gold,
  sky: VISUAL_THEME.colors.sky,
  lavender: VISUAL_THEME.colors.lavender,
  text: VISUAL_THEME.colors.ink,
  textMuted: VISUAL_THEME.colors.inkSoft,
  barTrack: 0xf1e6d8,
  barHp: 0xff9f8d,
  barHeart: 0xf28dac,
  surfaceDark: VISUAL_THEME.colors.surfaceDark,
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

function makeTextStyle(
  size: number,
  fill: number,
  options?: Partial<PIXI.TextStyle>
): Partial<PIXI.TextStyle> {
  return {
    fontFamily: VISUAL_THEME.typography.heading,
    fontSize: size,
    fill,
    fontWeight: '700',
    stroke: strokePetBrown,
    letterSpacing: 0.5,
    ...options,
  };
}

function drawGlassPanel(
  width: number,
  height: number,
  fill: number,
  line: number,
  radius = VISUAL_THEME.ui.panelRadius
): PIXI.Container {
  const wrap = new PIXI.Container();

  const shadow = new PIXI.Graphics();
  shadow.beginFill(0x000000, VISUAL_THEME.ui.softShadowAlpha);
  shadow.drawRoundedRect(8, 12, width, height, radius);
  shadow.endFill();
  wrap.addChild(shadow);

  const glow = new PIXI.Graphics();
  glow.beginFill(0xffffff, 0.22);
  glow.drawRoundedRect(0, 0, width, height * 0.44, radius);
  glow.endFill();

  const base = new PIXI.Graphics();
  base.beginFill(fill, VISUAL_THEME.ui.panelAlpha);
  base.lineStyle(2.5, line, VISUAL_THEME.ui.panelBorderAlpha);
  base.drawRoundedRect(0, 0, width, height, radius);
  base.endFill();
  wrap.addChild(base);
  wrap.addChild(glow);

  const inner = new PIXI.Graphics();
  inner.lineStyle(1, 0xffffff, 0.3);
  inner.drawRoundedRect(8, 8, width - 16, height - 16, Math.max(12, radius - 8));
  wrap.addChild(inner);

  return wrap;
}

function drawProgressBar(
  width: number,
  y: number,
  radius: number,
  trackColor: number,
  alpha = 1
): PIXI.Graphics {
  const track = new PIXI.Graphics();
  track.beginFill(trackColor, alpha);
  track.drawRoundedRect(0, y, width, 16, radius);
  track.endFill();
  return track;
}

export class GameSceneUiController {
  private readonly uiContainer: PIXI.Container;
  private readonly onEndTurnAttempt: () => void;

  private endTurnButton!: PIXI.Container;
  private endTurnButtonBg!: PIXI.Graphics;
  private endTurnLabel!: PIXI.Text;
  private endTurnCaption!: PIXI.Text;

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
  private hudDeckCaption!: PIXI.Text;

  private actionZoneWrap!: PIXI.Container;
  private actionZoneBg!: PIXI.Graphics;
  private actionZoneHint!: PIXI.Text;
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
    this.endTurnButton.alpha = on ? 1 : 0.52;
    this.endTurnCaption.text = on ? '进入结算与下一天' : '当前不可结束';
  }

  public updateActionZoneVisual(draggingAction: boolean, actionZoneHovered: boolean) {
    const wrap = this.actionZoneWrap;
    if (!wrap) return;

    const wrapTarget = draggingAction ? 1 : 0;
    wrap.alpha += (wrapTarget - wrap.alpha) * 0.18;
    if (Math.abs(wrapTarget - wrap.alpha) < 0.004) wrap.alpha = wrapTarget;

    const accent = draggingAction ? (actionZoneHovered ? 0.24 : 0.16) : 0.05;
    this.actionZoneBg.alpha += (accent - this.actionZoneBg.alpha) * 0.2;
    this.actionZoneHint.style.fill = actionZoneHovered ? PET_UI.coralLine : PET_UI.text;
    this.actionZoneHint.text = actionZoneHovered
      ? '松手触发行动特技'
      : '把行动牌拖入这里，触发舞台技';
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

    if (!active || !dragging) {
      wrap.visible = false;
      g.clear();
      return;
    }

    wrap.visible = true;
    this.redrawHandTrimBottomArc(g, proximity);

    hint.alpha = 0.5 + 0.5 * proximity;
    if (proximity >= discardReleaseThreshold) {
      hint.style.fill = 0xfaf8f2;
      hint.text = '已进入整理弃牌区\n松手后会尝试弃置当前卡牌';
    } else if (proximity >= 0.2) {
      hint.style.fill = 0xfff0f0;
      hint.text = '继续向下拖拽至发光红区\n达到释放线才会执行弃牌';
    } else {
      hint.style.fill = 0xfff0f0;
      hint.text = '拖向底部整理区\n超出释放线后松手才会弃牌';
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
      preparation: '营业准备',
      action: '排班与行动',
      income: '人气结算',
      end: '收尾整理',
    };

    const dayDisplay = Math.min(state.turn, VICTORY_DAYS);
    let phaseLabel = phaseNames[state.phase] || state.phase;
    if (opts.handTrimActive) phaseLabel = `手牌整理中（上限 ${HAND_SIZE_MAX}）`;

    const endTurnEnabled =
      state.gameStatus === 'playing' && !opts.roundResolving && !opts.handTrimActive;
    this.setEndTurnButtonInteractable(endTurnEnabled);

    this.hudCansValue.text = String(state.cans);
    this.hudInterestLine.text = `本日利息 +${state.interest} · 现金流稳定`;
    this.hudDeckValue.text = `${opts.deckDisplayCount}`;
    this.hudDiscardValue.text = `${state.discardLength}`;
    this.hudDeckCaption.text = `牌库 ${opts.deckDisplayCount} · 弃牌 ${state.discardLength}`;
    opts.petRenderer?.setDeckCount(opts.deckDisplayCount);

    this.hudHeartsValue.text = String(state.hearts);
    const heartRatio = Math.min(1, state.hearts / Math.max(1, VICTORY_HEARTS));
    const heartWidth = 240 * heartRatio;
    this.hudHeartsBarFill.clear();
    if (heartWidth > 2) {
      this.hudHeartsBarFill.beginFill(PET_UI.barHeart, 1);
      this.hudHeartsBarFill.drawRoundedRect(24, 94, heartWidth, 16, 8);
      this.hudHeartsBarFill.endFill();
    }

    this.hudDayLine.text = `DAY ${dayDisplay} / ${VICTORY_DAYS}`;
    this.hudPhaseLine.text = phaseLabel;

    this.hudHpLine.text = `${state.playerHp} / ${state.maxPlayerHp}`;
    const hpRatio = Math.min(1, state.playerHp / Math.max(1, state.maxPlayerHp));
    const hpWidth = 224 * hpRatio;
    this.hudHpBarFill.clear();
    if (hpWidth > 2) {
      this.hudHpBarFill.beginFill(PET_UI.barHp, 1);
      this.hudHpBarFill.drawRoundedRect(24, 70, hpWidth, 16, 8);
      this.hudHpBarFill.endFill();
    }

    const showWin = state.winStreak > 0;
    const showLose = state.loseStreak > 0;
    this.hudWinPill.visible = showWin;
    this.hudLosePill.visible = showLose;
    if (showWin) this.hudWinText.text = `连胜 ${state.winStreak}`;
    if (showLose) this.hudLoseText.text = `连败 ${state.loseStreak}`;
    if (showWin && showLose) {
      this.hudWinPill.position.set(-168, 0);
      this.hudLosePill.position.set(12, 0);
    } else if (showWin) {
      this.hudWinPill.position.set(-82, 0);
    } else if (showLose) {
      this.hudLosePill.position.set(-82, 0);
    }
  }

  private createPetHud() {
    const resourceWrap = new PIXI.Container();
    resourceWrap.position.set(36, 28);
    resourceWrap.addChild(drawGlassPanel(316, 132, PET_UI.cream, PET_UI.honeyLine));

    const resTitle = new PIXI.Text({
      text: '现金流',
      style: makeTextStyle(14, PET_UI.textMuted, {
        fontFamily: VISUAL_THEME.typography.body,
        letterSpacing: 2.6,
      }),
    });
    resTitle.position.set(24, 16);
    resourceWrap.addChild(resTitle);

    this.hudCansValue = new PIXI.Text({
      text: '0',
      style: makeTextStyle(42, 0xd9782b, { fontFamily: VISUAL_THEME.typography.display }),
    });
    this.hudCansValue.position.set(24, 40);
    resourceWrap.addChild(this.hudCansValue);

    const currency = new PIXI.Text({
      text: '罐头储备',
      style: makeTextStyle(16, PET_UI.textMuted, { fontFamily: VISUAL_THEME.typography.body }),
    });
    currency.position.set(24, 88);
    resourceWrap.addChild(currency);

    this.hudInterestLine = new PIXI.Text({
      text: '本日利息 +0',
      style: makeTextStyle(14, PET_UI.textMuted, {
        fontFamily: VISUAL_THEME.typography.body,
        fontWeight: '600',
      }),
    });
    this.hudInterestLine.position.set(24, 106);
    resourceWrap.addChild(this.hudInterestLine);
    this.uiContainer.addChild(resourceWrap);

    const hpWrap = new PIXI.Container();
    hpWrap.position.set(36, 176);
    hpWrap.addChild(drawGlassPanel(316, 104, PET_UI.cream, PET_UI.coralLine));

    const hpTitle = new PIXI.Text({
      text: '店长状态',
      style: makeTextStyle(14, PET_UI.textMuted, {
        fontFamily: VISUAL_THEME.typography.body,
        letterSpacing: 2.2,
      }),
    });
    hpTitle.position.set(24, 14);
    hpWrap.addChild(hpTitle);

    this.hudHpLine = new PIXI.Text({
      text: '100 / 100',
      style: makeTextStyle(22, PET_UI.text, {
        fontFamily: VISUAL_THEME.typography.display,
      }),
    });
    this.hudHpLine.position.set(24, 38);
    hpWrap.addChild(this.hudHpLine);

    hpWrap.addChild(drawProgressBar(224, 70, 8, PET_UI.barTrack));
    this.hudHpBarFill = new PIXI.Graphics();
    hpWrap.addChild(this.hudHpBarFill);
    this.uiContainer.addChild(hpWrap);

    const dayWrap = new PIXI.Container();
    dayWrap.position.set(960, 34);
    const plate = drawGlassPanel(444, 108, PET_UI.mint, PET_UI.mintLine);
    plate.pivot.set(222, 0);
    dayWrap.addChild(plate);

    const eyebrow = new PIXI.Text({
      text: '直播营业排程',
      style: makeTextStyle(13, PET_UI.textMuted, {
        fontFamily: VISUAL_THEME.typography.body,
        letterSpacing: 2.8,
      }),
    });
    eyebrow.anchor.set(0.5, 0);
    eyebrow.position.set(0, 16);
    dayWrap.addChild(eyebrow);

    this.hudDayLine = new PIXI.Text({
      text: 'DAY 1 / 30',
      style: makeTextStyle(28, PET_UI.text, {
        align: 'center',
        fontFamily: VISUAL_THEME.typography.display,
      }),
    });
    this.hudDayLine.anchor.set(0.5, 0);
    this.hudDayLine.position.set(0, 38);
    dayWrap.addChild(this.hudDayLine);

    this.hudPhaseLine = new PIXI.Text({
      text: '营业准备',
      style: makeTextStyle(16, PET_UI.textMuted, {
        align: 'center',
        fontFamily: VISUAL_THEME.typography.body,
      }),
    });
    this.hudPhaseLine.anchor.set(0.5, 0);
    this.hudPhaseLine.position.set(0, 74);
    dayWrap.addChild(this.hudPhaseLine);
    this.uiContainer.addChild(dayWrap);

    const heartWrap = new PIXI.Container();
    heartWrap.position.set(1564, 28);
    heartWrap.addChild(drawGlassPanel(320, 138, PET_UI.pink, PET_UI.pinkLine));

    const title = new PIXI.Text({
      text: '人气目标',
      style: makeTextStyle(14, PET_UI.textMuted, {
        fontFamily: VISUAL_THEME.typography.body,
        letterSpacing: 2.4,
      }),
    });
    title.position.set(24, 16);
    heartWrap.addChild(title);

    this.hudHeartsValue = new PIXI.Text({
      text: '0',
      style: makeTextStyle(38, PET_UI.pinkLine, {
        fontFamily: VISUAL_THEME.typography.display,
      }),
    });
    this.hudHeartsValue.position.set(24, 42);
    heartWrap.addChild(this.hudHeartsValue);

    this.hudHeartsGoal = new PIXI.Text({
      text: `上市目标 ${VICTORY_HEARTS}`,
      style: makeTextStyle(15, PET_UI.textMuted, {
        fontFamily: VISUAL_THEME.typography.body,
      }),
    });
    this.hudHeartsGoal.position.set(120, 54);
    heartWrap.addChild(this.hudHeartsGoal);

    heartWrap.addChild(drawProgressBar(240, 94, 8, PET_UI.barTrack));
    this.hudHeartsBarFill = new PIXI.Graphics();
    heartWrap.addChild(this.hudHeartsBarFill);
    this.uiContainer.addChild(heartWrap);

    this.hudStreakWrap = new PIXI.Container();
    this.hudStreakWrap.position.set(960, 156);

    this.hudWinPill = this.createStreakPill(0xdff6ea, 0x5cae84, '连胜 0');
    this.hudWinText = this.hudWinPill.getChildAt(1) as PIXI.Text;
    this.hudWinPill.visible = false;

    this.hudLosePill = this.createStreakPill(0xffe2cc, 0xd98252, '连败 0');
    this.hudLoseText = this.hudLosePill.getChildAt(1) as PIXI.Text;
    this.hudLosePill.visible = false;

    this.hudStreakWrap.addChild(this.hudWinPill);
    this.hudStreakWrap.addChild(this.hudLosePill);
    this.uiContainer.addChild(this.hudStreakWrap);
  }

  private createStreakPill(fill: number, line: number, text: string): PIXI.Container {
    const pill = new PIXI.Container();
    const bg = new PIXI.Graphics();
    bg.beginFill(fill, 0.96);
    bg.lineStyle(2, line, 0.86);
    bg.drawRoundedRect(0, 0, 156, 34, 17);
    bg.endFill();
    pill.addChild(bg);

    const label = new PIXI.Text({
      text,
      style: makeTextStyle(14, PET_UI.text, {
        fontFamily: VISUAL_THEME.typography.body,
        align: 'center',
      }),
    });
    label.anchor.set(0.5);
    label.position.set(78, 17);
    pill.addChild(label);
    return pill;
  }

  private createDeckHud() {
    const wrap = new PIXI.Container();
    wrap.position.set(42, 584);
    wrap.addChild(drawGlassPanel(344, 118, 0x2f2230, 0xe2b88f, 26));

    const title = new PIXI.Text({
      text: '操作台',
      style: makeTextStyle(14, 0xf6dfc8, {
        fontFamily: VISUAL_THEME.typography.body,
        letterSpacing: 2.2,
      }),
    });
    title.position.set(22, 16);
    wrap.addChild(title);

    this.hudDeckValue = new PIXI.Text({
      text: '0',
      style: makeTextStyle(34, 0xfff1d5, {
        fontFamily: VISUAL_THEME.typography.display,
      }),
    });
    this.hudDeckValue.position.set(24, 40);
    wrap.addChild(this.hudDeckValue);

    const deckLabel = new PIXI.Text({
      text: '牌库剩余',
      style: makeTextStyle(14, 0xd8c3ba, { fontFamily: VISUAL_THEME.typography.body }),
    });
    deckLabel.position.set(24, 78);
    wrap.addChild(deckLabel);

    this.hudDiscardValue = new PIXI.Text({
      text: '0',
      style: makeTextStyle(30, 0xf2d6cc, {
        fontFamily: VISUAL_THEME.typography.display,
      }),
    });
    this.hudDiscardValue.position.set(174, 42);
    wrap.addChild(this.hudDiscardValue);

    const discardLabel = new PIXI.Text({
      text: '弃牌堆',
      style: makeTextStyle(14, 0xd8c3ba, { fontFamily: VISUAL_THEME.typography.body }),
    });
    discardLabel.position.set(174, 78);
    wrap.addChild(discardLabel);

    this.hudDeckCaption = new PIXI.Text({
      text: '牌库 0 · 弃牌 0',
      style: makeTextStyle(13, 0xf4dfd5, {
        fontFamily: VISUAL_THEME.typography.body,
        fontWeight: '600',
      }),
    });
    this.hudDeckCaption.position.set(24, 98);
    wrap.addChild(this.hudDeckCaption);

    this.uiContainer.addChild(wrap);
  }

  private createCuteEndTurnButton() {
    const button = new PIXI.Container();
    this.endTurnButton = button;
    button.position.set(1510, 914);
    button.eventMode = 'static';
    button.cursor = 'pointer';

    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x000000, 0.16);
    shadow.drawRoundedRect(10, 12, 330, 110, VISUAL_THEME.ui.buttonRadius);
    shadow.endFill();
    button.addChild(shadow);

    this.endTurnButtonBg = new PIXI.Graphics();
    button.addChild(this.endTurnButtonBg);

    const eyebrow = new PIXI.Text({
      text: '准备就绪',
      style: makeTextStyle(13, 0xfff6f2, {
        fontFamily: VISUAL_THEME.typography.body,
        letterSpacing: 2.4,
      }),
    });
    eyebrow.position.set(28, 18);
    button.addChild(eyebrow);

    this.endTurnLabel = new PIXI.Text({
      text: '结束本日',
      style: makeTextStyle(28, 0xffffff, {
        fontFamily: VISUAL_THEME.typography.display,
        stroke: strokeDarkBold,
      }),
    });
    this.endTurnLabel.position.set(26, 44);
    button.addChild(this.endTurnLabel);

    this.endTurnCaption = new PIXI.Text({
      text: '进入结算与下一天',
      style: makeTextStyle(14, 0xfff8f3, {
        fontFamily: VISUAL_THEME.typography.body,
        fontWeight: '600',
      }),
    });
    this.endTurnCaption.position.set(28, 82);
    button.addChild(this.endTurnCaption);

    const paintBtn = (hover: boolean) => {
      this.endTurnButtonBg.clear();
      this.endTurnButtonBg.beginFill(hover ? PET_UI.coralHi : PET_UI.coral, 1);
      this.endTurnButtonBg.lineStyle(3, PET_UI.coralLine, 0.95);
      this.endTurnButtonBg.drawRoundedRect(0, 0, 330, 110, VISUAL_THEME.ui.buttonRadius);
      this.endTurnButtonBg.endFill();
      this.endTurnLabel.scale.set(hover ? 1.02 : 1);
    };

    paintBtn(false);
    button.on('pointerdown', () => this.onEndTurnAttempt());
    button.on('pointerover', () => paintBtn(true));
    button.on('pointerout', () => paintBtn(false));

    this.uiContainer.addChild(button);
  }

  private createActionDropZone() {
    const wrap = new PIXI.Container();
    this.actionZoneWrap = wrap;
    wrap.position.set(706, 172);
    wrap.eventMode = 'none';
    wrap.alpha = 0;

    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x000000, 0.12);
    shadow.drawRoundedRect(10, 12, 520, 128, 28);
    shadow.endFill();
    wrap.addChild(shadow);

    const bg = new PIXI.Graphics();
    this.actionZoneBg = bg;
    bg.beginFill(0xf4d5e8, 1);
    bg.lineStyle(2, 0xdca1bf, 0.6);
    bg.drawRoundedRect(0, 0, 520, 128, 28);
    bg.endFill();
    bg.alpha = 0.06;
    wrap.addChild(bg);

    const inner = new PIXI.Graphics();
    inner.beginFill(0xfffbfe, 0.9);
    inner.lineStyle(1.5, 0xe5bfd4, 0.8);
    inner.drawRoundedRect(18, 18, 484, 92, 22);
    inner.endFill();
    wrap.addChild(inner);

    const eyebrow = new PIXI.Text({
      text: 'LIVE TRIGGER',
      style: makeTextStyle(12, PET_UI.textMuted, {
        fontFamily: VISUAL_THEME.typography.body,
        letterSpacing: 2.8,
        align: 'center',
      }),
    });
    eyebrow.anchor.set(0.5, 0);
    eyebrow.position.set(260, 28);
    wrap.addChild(eyebrow);

    const hint = new PIXI.Text({
      text: '把行动牌拖入这里，触发舞台技',
      style: makeTextStyle(23, PET_UI.text, {
        fontFamily: VISUAL_THEME.typography.display,
        align: 'center',
      }),
    });
    hint.anchor.set(0.5);
    hint.position.set(260, 75);
    this.actionZoneHint = hint;
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
    wrap.eventMode = 'none';
    wrap.visible = false;

    const arc = new PIXI.Graphics();
    this.handTrimBottomArcGfx = arc;
    wrap.addChild(arc);

    const hint = new PIXI.Text({
      text: '拖到下方整理区即可弃牌',
      style: makeTextStyle(22, 0xfff5f5, {
        align: 'center',
        lineHeight: 30,
        wordWrap: true,
        wordWrapWidth: 900,
        stroke: { color: 0x31141c, width: 4 },
      }),
    });
    hint.anchor.set(0.5, 1);
    hint.position.set(960, 1032);
    this.handTrimBottomHint = hint;
    wrap.addChild(hint);

    this.uiContainer.addChildAt(wrap, 0);
  }

  private redrawHandTrimBottomArc(g: PIXI.Graphics, proximity: number) {
    g.clear();
    const width = 1920;
    const height = 1080;
    const zoneHeight = 116;
    const p = Math.max(0, Math.min(1, proximity));
    if (p < 0.02) return;

    g.beginFill(0x8a263b, 0.16 + p * 0.36);
    g.drawRoundedRect(-20, height - zoneHeight - 10, width + 40, zoneHeight + 20, 44);
    g.endFill();

    g.beginFill(0xff6f87, 0.1 + p * 0.18);
    g.drawRoundedRect(0, height - zoneHeight, width, zoneHeight, 36);
    g.endFill();

    g.lineStyle(4, 0xffd1d8, 0.28 + p * 0.5);
    g.moveTo(60, height - zoneHeight + 8);
    g.lineTo(width - 60, height - zoneHeight + 8);
  }
}
