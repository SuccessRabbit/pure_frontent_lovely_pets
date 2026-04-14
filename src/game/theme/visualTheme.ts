export type QualityLevel = 'low' | 'medium' | 'high';
export type SceneMood = 'idle' | 'action' | 'income' | 'danger' | 'gameover';

export interface VisualThemeTokens {
  typography: {
    display: string;
    heading: string;
    body: string;
    mono: string;
  };
  colors: {
    ink: number;
    inkSoft: number;
    cream: number;
    creamDeep: number;
    creamLine: number;
    peach: number;
    coral: number;
    coralStrong: number;
    mint: number;
    mintStrong: number;
    gold: number;
    goldSoft: number;
    rose: number;
    roseStrong: number;
    sky: number;
    lavender: number;
    danger: number;
    success: number;
    surfaceDark: number;
    surfaceDarkSoft: number;
    white: number;
  };
  ui: {
    panelAlpha: number;
    panelBorderAlpha: number;
    softShadowAlpha: number;
    buttonRadius: number;
    panelRadius: number;
  };
  scene: {
    ambientTop: number;
    ambientBottom: number;
    stageGlow: number;
    rim: number;
    dangerGlow: number;
    actionGlow: number;
  };
}

export const VISUAL_THEME: VisualThemeTokens = {
  typography: {
    display: '"Trebuchet MS", "Avenir Next", "PingFang SC", sans-serif',
    heading: '"Avenir Next", "PingFang SC", "Helvetica Neue", sans-serif',
    body: '"PingFang SC", "Microsoft YaHei", "Helvetica Neue", sans-serif',
    mono: '"SFMono-Regular", "Menlo", monospace',
  },
  colors: {
    ink: 0x4e342e,
    inkSoft: 0x73564a,
    cream: 0xfff6ec,
    creamDeep: 0xf4e3d2,
    creamLine: 0xe6c7aa,
    peach: 0xf8d6be,
    coral: 0xf78ca2,
    coralStrong: 0xeb5b7a,
    mint: 0xd7efe6,
    mintStrong: 0x5d9b88,
    gold: 0xf4bf6a,
    goldSoft: 0xffe2a9,
    rose: 0xfad8e7,
    roseStrong: 0xd86b8c,
    sky: 0xb9d8f6,
    lavender: 0xd9d0f8,
    danger: 0xff6f61,
    success: 0x72c9a4,
    surfaceDark: 0x2d2430,
    surfaceDarkSoft: 0x4d4150,
    white: 0xffffff,
  },
  ui: {
    panelAlpha: 0.94,
    panelBorderAlpha: 0.76,
    softShadowAlpha: 0.16,
    buttonRadius: 24,
    panelRadius: 26,
  },
  scene: {
    ambientTop: 0xfdeedb,
    ambientBottom: 0xf4c3d8,
    stageGlow: 0xf4c0cc,
    rim: 0xfff3d4,
    dangerGlow: 0xff8d7a,
    actionGlow: 0xa5d8ff,
  },
};

export const QUALITY_POST_FX: Record<QualityLevel, { bloomStrength: number; vignette: number }> = {
  low: { bloomStrength: 0.08, vignette: 0.08 },
  medium: { bloomStrength: 0.14, vignette: 0.12 },
  high: { bloomStrength: 0.22, vignette: 0.18 },
};

export const MOOD_FACTORS: Record<
  SceneMood,
  { warmth: number; intensity: number; danger: number; accent: number }
> = {
  idle: { warmth: 0.18, intensity: 0.38, danger: 0, accent: 0.24 },
  action: { warmth: 0.26, intensity: 0.58, danger: 0.06, accent: 0.68 },
  income: { warmth: 0.46, intensity: 0.72, danger: 0, accent: 0.52 },
  danger: { warmth: 0.12, intensity: 0.86, danger: 0.84, accent: 0.2 },
  gameover: { warmth: 0.08, intensity: 0.46, danger: 0.4, accent: 0.1 },
};

export const CARD_RARITY_COLORS: Record<string, { edge: number; glow: number; badge: number }> = {
  common: { edge: 0xe7c9aa, glow: 0xfff8ef, badge: 0xf0b989 },
  rare: { edge: 0x80b8ec, glow: 0xddecff, badge: 0x5da9e9 },
  epic: { edge: 0xb59ee9, glow: 0xebdfff, badge: 0x9b78f1 },
  legendary: { edge: 0xf2be63, glow: 0xffefbd, badge: 0xe49e36 },
};

export function getCardTypeLabel(type: string): string {
  if (type.includes('pet')) return '萌宠';
  if (type.includes('worker')) return '员工';
  if (type.includes('action')) return '行动';
  if (type.includes('status')) return '状态';
  return '卡牌';
}

