import * as PIXI from 'pixi.js';
import { VISUAL_THEME } from '../theme/visualTheme';
import { burstParticlesAtGlobal } from '../utils/cardFx';
import { strokeDark, strokeDarkBold, strokeOnCool, strokeOnWarm } from '../utils/fxTextStyles';
import { Tween, Easing } from '../utils/Tween';
import type { ToastMessage, ToastTone } from '../rules/toast';
export type { ToastMessage, ToastTone } from '../rules/toast';

interface HudToastEntry {
  id: number;
  wrap: PIXI.Container;
  timeoutId: number;
}

interface ToastPresenterDeps {
  anchor: PIXI.Container;
  fxLayer: PIXI.Container;
}

const DEFAULT_HOLD_MS = 1500;
const FADE_MS = 340;
const GAP = 14;

function colorToTone(color: number): ToastTone {
  if (color === 0xffb3b3 || color === 0xff7a7a || color === VISUAL_THEME.colors.danger) {
    return 'danger';
  }
  if (color === 0xfff9c4) return 'warning';
  if (color === 0xabebc6) return 'success';
  return 'info';
}

export function toastFromColor(text: string, color: number): ToastMessage {
  return {
    text,
    color,
    tone: colorToTone(color),
  };
}

export class ToastPresenter {
  private readonly anchor: PIXI.Container;
  private readonly fxLayer: PIXI.Container;
  private toasts: HudToastEntry[] = [];
  private nextToastId = 1;

  constructor(deps: ToastPresenterDeps) {
    this.anchor = deps.anchor;
    this.fxLayer = deps.fxLayer;
  }

  public show(message: ToastMessage) {
    const color = message.color ?? this.resolveTextColor(message.tone);
    const g = this.anchor.getGlobalPosition(new PIXI.Point());
    const lp = this.fxLayer.toLocal(g);
    const tone = message.tone;
    const outline = tone === 'warning' ? strokeOnWarm : tone === 'success' ? strokeOnCool : strokeDark;
    const accent = this.resolveAccent(tone, color);
    const bgFill = this.resolveBackground(tone);
    const icon = this.resolveIcon(tone);

    const wrap = new PIXI.Container();
    wrap.position.set(lp.x, lp.y);
    wrap.alpha = 0;

    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x000000, tone === 'danger' ? 0.34 : 0.22);
    shadow.drawRoundedRect(8, 10, 0, 0, 20);
    shadow.endFill();
    wrap.addChild(shadow);

    const plate = new PIXI.Graphics();
    wrap.addChild(plate);

    const iconDisc = new PIXI.Graphics();
    wrap.addChild(iconDisc);

    const iconText = new PIXI.Text({
      text: icon,
      style: {
        fontFamily: VISUAL_THEME.typography.display,
        fontSize: tone === 'danger' ? 22 : 20,
        fill: 0xffffff,
        fontWeight: '900',
        stroke: strokeDarkBold,
      },
    });
    iconText.anchor.set(0.5);
    wrap.addChild(iconText);

    const text = new PIXI.Text({
      text: message.text,
      style: {
        fontFamily: VISUAL_THEME.typography.heading,
        fontSize: tone === 'danger' ? 25 : 23,
        fill: color,
        fontWeight: 'bold',
        stroke: outline,
        wordWrap: true,
        wordWrapWidth: 520,
      },
    });
    text.anchor.set(0.5);
    wrap.addChild(text);

    const bubbleWidth = Math.max(220, Math.min(620, text.width + 88));
    const bubbleHeight = Math.max(54, text.height + 24);
    const halfW = bubbleWidth * 0.5;
    const halfH = bubbleHeight * 0.5;

    shadow.clear();
    shadow.beginFill(0x000000, tone === 'danger' ? 0.34 : 0.22);
    shadow.drawRoundedRect(-halfW + 8, -halfH + 10, bubbleWidth, bubbleHeight, 22);
    shadow.endFill();

    plate.clear();
    plate.beginFill(bgFill, tone === 'danger' ? 0.96 : 0.9);
    plate.lineStyle(tone === 'danger' ? 3 : 2, accent, 0.9);
    plate.drawRoundedRect(-halfW, -halfH, bubbleWidth, bubbleHeight, 22);
    plate.endFill();

    iconDisc.clear();
    iconDisc.beginFill(accent, 0.94);
    iconDisc.drawCircle(-halfW + 30, 0, tone === 'danger' ? 16 : 14);
    iconDisc.endFill();

    iconText.position.set(-halfW + 30, 0);
    text.position.set(22, 0);
    this.fxLayer.addChild(wrap);

    const toastId = this.nextToastId++;
    const timeoutId = window.setTimeout(() => {
      this.dismiss(toastId, tone === 'danger' ? 44 : 36);
    }, message.holdMs ?? DEFAULT_HOLD_MS);
    this.toasts.unshift({ id: toastId, wrap, timeoutId });
    this.layout(true);

    burstParticlesAtGlobal(this.fxLayer, g.x - halfW + 30, g.y, {
      count: tone === 'danger' ? 14 : 10,
      colors: tone === 'danger' ? [accent, 0xffd6d6, 0xffffff] : [accent, color, 0xffffff],
      spread: tone === 'danger' ? 34 : 24,
      durationMin: 220,
      durationMax: 420,
    });

    Tween.to(wrap, { alpha: 1 }, 180, Easing.easeOutQuad);
  }

  public clear() {
    this.toasts.forEach(entry => {
      window.clearTimeout(entry.timeoutId);
      Tween.killTarget(entry.wrap);
      entry.wrap.destroy({ children: true });
    });
    this.toasts = [];
  }

  private layout(animate: boolean) {
    const g = this.anchor.getGlobalPosition(new PIXI.Point());
    const lp = this.fxLayer.toLocal(g);
    let offsetY = 0;

    this.toasts.forEach(entry => {
      const bounds = entry.wrap.getLocalBounds();
      const targetY = lp.y + offsetY;
      if (animate) {
        Tween.to(entry.wrap, { x: lp.x, y: targetY }, 180, Easing.easeOutCubic);
      } else {
        entry.wrap.position.set(lp.x, targetY);
      }
      offsetY += bounds.height + GAP;
    });
  }

  private dismiss(id: number, travelY: number) {
    const index = this.toasts.findIndex(entry => entry.id === id);
    if (index < 0) return;

    const [entry] = this.toasts.splice(index, 1);
    window.clearTimeout(entry.timeoutId);
    Tween.killTarget(entry.wrap);
    Tween.to(
      entry.wrap,
      { y: entry.wrap.y - travelY, alpha: 0 },
      FADE_MS,
      Easing.easeOutQuad,
      () => {
        Tween.killTarget(entry.wrap);
        entry.wrap.destroy({ children: true });
      }
    );
    this.layout(true);
  }

  private resolveTextColor(tone: ToastTone): number {
    if (tone === 'danger') return 0xffb3b3;
    if (tone === 'warning') return 0xfff9c4;
    if (tone === 'success') return 0xabebc6;
    return VISUAL_THEME.colors.cream;
  }

  private resolveAccent(tone: ToastTone, color: number): number {
    if (tone === 'danger') return 0xff8f8f;
    if (tone === 'warning') return VISUAL_THEME.colors.gold;
    if (tone === 'success') return 0x7cd8b6;
    return color;
  }

  private resolveBackground(tone: ToastTone): number {
    if (tone === 'danger') return 0x341c24;
    if (tone === 'warning') return 0x3a2a17;
    if (tone === 'success') return 0x183128;
    return 0x1d1c28;
  }

  private resolveIcon(tone: ToastTone): string {
    if (tone === 'danger') return '!';
    if (tone === 'warning') return 'i';
    if (tone === 'success') return '+';
    return '*';
  }
}
