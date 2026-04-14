import * as PIXI from 'pixi.js';
import { VICTORY_DAYS, VICTORY_HEARTS } from '@config/gameRules';
import { strokeDarkBold, strokePetBrown } from '../../utils/fxTextStyles';
import { PET_UI } from './GameSceneUiController';
import type { GameEndReason, GameStatus } from '../../../store/gameStore';

interface GameOverState {
  gameStatus: GameStatus;
  endReason: GameEndReason | null;
  turn: number;
}

interface GameOverControllerDeps {
  fxLayer: PIXI.Container;
  onRestart: () => void;
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
    layer.position.set(960, 520);
    this.layer = layer;

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
    if (state.gameStatus === 'won') {
      title = '🎉 大成功！萌宠直播间上市啦';
      sub =
        state.turn > VICTORY_DAYS
          ? `撑满 ${VICTORY_DAYS} 天，人气也达标啦～`
          : `人气突破 ${VICTORY_HEARTS}，提前完成上市目标～`;
    } else if (state.endReason === 'hp') {
      title = '😿 要先休息一下…';
      sub = '店长元气见底了，改天再来营业吧';
    } else if (state.endReason === 'grid') {
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
      this.onRestart();
    });
    layer.addChild(btn);

    this.fxLayer.addChild(layer);
  }
}
