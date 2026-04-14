import * as PIXI from 'pixi.js';
import { VICTORY_DAYS, VICTORY_HEARTS } from '@config/gameRules';
import { strokeDarkBold, strokePetBrown } from '../../utils/fxTextStyles';
import { PET_UI } from './GameSceneUiController';
import type { GameEndReason, GameStatus } from '../../../store/gameStore';
import { VISUAL_THEME } from '../../theme/visualTheme';

interface GameOverState {
  gameStatus: GameStatus;
  endReason: GameEndReason | null;
  turn: number;
}

interface GameOverControllerDeps {
  fxLayer: PIXI.Container;
  onRestart: () => void;
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
    align: 'center',
    ...options,
  };
}

export class GameOverController {
  private readonly fxLayer: PIXI.Container;
  private readonly onRestart: () => void;
  private layer: PIXI.Container | null = null;

  constructor(deps: GameOverControllerDeps) {
    this.fxLayer = deps.fxLayer;
    this.onRestart = deps.onRestart;
  }

  public clear() {
    if (this.layer) {
      this.layer.destroy({ children: true });
      this.layer = null;
    }
  }

  public sync(state: GameOverState) {
    if (state.gameStatus === 'playing') {
      this.clear();
      return;
    }
    if (this.layer) return;

    const layer = new PIXI.Container();
    layer.position.set(960, 540);
    this.layer = layer;

    const dim = new PIXI.Graphics();
    dim.beginFill(0x221522, 0.34);
    dim.drawRect(-1200, -800, 2400, 1600);
    dim.endFill();
    layer.addChild(dim);

    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x000000, 0.18);
    shadow.drawRoundedRect(-474, -236, 948, 472, 40);
    shadow.endFill();
    layer.addChild(shadow);

    const outer = new PIXI.Graphics();
    outer.beginFill(state.gameStatus === 'won' ? PET_UI.pink : PET_UI.cream, 0.97);
    outer.lineStyle(3, state.gameStatus === 'won' ? PET_UI.pinkLine : PET_UI.honeyLine, 0.86);
    outer.drawRoundedRect(-490, -250, 980, 500, 40);
    outer.endFill();
    layer.addChild(outer);

    const inner = new PIXI.Graphics();
    inner.beginFill(0xffffff, 0.28);
    inner.drawRoundedRect(-470, -230, 940, 180, 30);
    inner.endFill();
    layer.addChild(inner);

    const eyebrow = new PIXI.Text({
      text: state.gameStatus === 'won' ? 'BUSINESS HIGHLIGHT' : 'RUN SUMMARY',
      style: makeTextStyle(14, PET_UI.textMuted, {
        fontFamily: VISUAL_THEME.typography.body,
        letterSpacing: 3,
      }),
    });
    eyebrow.anchor.set(0.5);
    eyebrow.position.set(0, -196);
    layer.addChild(eyebrow);

    let title = '';
    let sub = '';
    let reason = '';
    if (state.gameStatus === 'won') {
      title = '萌宠直播间成功上市';
      sub =
        state.turn > VICTORY_DAYS
          ? `撑过 ${VICTORY_DAYS} 天，人气也成功冲线`
          : `人气突破 ${VICTORY_HEARTS}，提前达成上市目标`;
      reason = '本局运营策略已经足够成熟，可以继续冲更高分。';
    } else if (state.endReason === 'hp') {
      title = '店长体力见底';
      sub = '这轮营业强度太高，需要调整风险与恢复节奏';
      reason = '优先关注减压、站位和高风险宠物的结算窗口。';
    } else if (state.endReason === 'grid') {
      title = '工位系统全面崩塌';
      sub = '战场空间被拆空，后续运营无法继续';
      reason = '需要更早处理高压单位，避免连锁拆家扩散。';
    } else {
      title = '人气目标未达成';
      sub = `${VICTORY_DAYS} 天营业结束，小红心还差最后一段冲刺`;
      reason = '下次优先提升收益密度，减少空转回合。';
    }

    const titleTxt = new PIXI.Text({
      text: title,
      style: makeTextStyle(38, PET_UI.text, {
        fontFamily: VISUAL_THEME.typography.display,
        stroke: strokePetBrown,
      }),
    });
    titleTxt.anchor.set(0.5, 0);
    titleTxt.y = -158;
    layer.addChild(titleTxt);

    const subTxt = new PIXI.Text({
      text: sub,
      style: makeTextStyle(21, PET_UI.textMuted, {
        fontFamily: VISUAL_THEME.typography.body,
        wordWrap: true,
        wordWrapWidth: 760,
        fontWeight: '600',
      }),
    });
    subTxt.anchor.set(0.5, 0);
    subTxt.y = -92;
    layer.addChild(subTxt);

    const divider = new PIXI.Graphics();
    divider.beginFill(0xe3cdbd, 0.85);
    divider.drawRoundedRect(-392, -8, 784, 2, 1);
    divider.endFill();
    layer.addChild(divider);

    const metricWrap = new PIXI.Container();
    metricWrap.position.set(0, 40);
    metricWrap.addChild(this.createMetricCard(-250, '经营天数', `${Math.min(state.turn, VICTORY_DAYS)} 天`));
    metricWrap.addChild(
      this.createMetricCard(
        0,
        state.gameStatus === 'won' ? '状态评级' : '本局提示',
        state.gameStatus === 'won' ? '优秀' : '调整中'
      )
    );
    metricWrap.addChild(
      this.createMetricCard(
        250,
        state.gameStatus === 'won' ? '目标状态' : '复盘方向',
        state.gameStatus === 'won' ? '达成' : '继续优化'
      )
    );
    layer.addChild(metricWrap);

    const reasonText = new PIXI.Text({
      text: reason,
      style: makeTextStyle(18, PET_UI.textMuted, {
        fontFamily: VISUAL_THEME.typography.body,
        wordWrap: true,
        wordWrapWidth: 760,
        fontWeight: '600',
      }),
    });
    reasonText.anchor.set(0.5, 0);
    reasonText.y = 106;
    layer.addChild(reasonText);

    const btn = new PIXI.Container();
    btn.position.set(0, 174);
    btn.eventMode = 'static';
    btn.cursor = 'pointer';

    const btnShadow = new PIXI.Graphics();
    btnShadow.beginFill(0x000000, 0.12);
    btnShadow.drawRoundedRect(-126, 10, 252, 64, 20);
    btnShadow.endFill();
    btn.addChild(btnShadow);

    const btnBg = new PIXI.Graphics();
    btnBg.beginFill(PET_UI.coral);
    btnBg.lineStyle(3, PET_UI.coralLine, 0.86);
    btnBg.drawRoundedRect(-136, 0, 272, 72, 20);
    btnBg.endFill();
    btn.addChild(btnBg);

    const btnLabel = new PIXI.Text({
      text: '再开一局',
      style: makeTextStyle(24, 0xffffff, {
        fontFamily: VISUAL_THEME.typography.display,
        stroke: strokeDarkBold,
      }),
    });
    btnLabel.anchor.set(0.5);
    btnLabel.position.set(0, 36);
    btn.addChild(btnLabel);

    btn.on('pointerdown', () => this.onRestart());
    btn.on('pointerover', () => {
      btn.scale.set(1.02);
      btnBg.tint = 0xffe3ec;
    });
    btn.on('pointerout', () => {
      btn.scale.set(1);
      btnBg.tint = 0xffffff;
    });
    layer.addChild(btn);

    this.fxLayer.addChild(layer);
  }

  private createMetricCard(x: number, label: string, value: string): PIXI.Container {
    const wrap = new PIXI.Container();
    wrap.position.set(x, 0);

    const bg = new PIXI.Graphics();
    bg.beginFill(0xffffff, 0.42);
    bg.lineStyle(2, PET_UI.creamLine, 0.7);
    bg.drawRoundedRect(-96, -18, 192, 94, 24);
    bg.endFill();
    wrap.addChild(bg);

    const labelText = new PIXI.Text({
      text: label,
      style: makeTextStyle(13, PET_UI.textMuted, {
        fontFamily: VISUAL_THEME.typography.body,
        letterSpacing: 1.6,
      }),
    });
    labelText.anchor.set(0.5, 0);
    labelText.position.set(0, -4);
    wrap.addChild(labelText);

    const valueText = new PIXI.Text({
      text: value,
      style: makeTextStyle(24, PET_UI.text, {
        fontFamily: VISUAL_THEME.typography.display,
      }),
    });
    valueText.anchor.set(0.5, 0);
    valueText.position.set(0, 28);
    wrap.addChild(valueText);

    return wrap;
  }
}
