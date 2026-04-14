import { VISUAL_THEME } from '../theme/visualTheme';

/**
 * 动效 / HUD 文字描边，避免与背景色融在一起
 * Pixi v8：stroke 使用 { color, width, join }
 * 全局 UI 使用 1px 描边（见各导出常量的 width）
 */
export const strokeDark = {
  color: 0x120f15,
  width: 1,
  join: 'round' as const,
};

/** 与 strokeDark 同色，仅语义区分标题 */
export const strokeDarkBold = {
  color: 0x0d0a10,
  width: 1,
  join: 'round' as const,
};

/** 浅黄、浅绿等亮色填充上的描边 */
export const strokeOnWarm = {
  color: 0x2f1c10,
  width: 1,
  join: 'round' as const,
};

export const strokeOnCool = {
  color: 0x14261f,
  width: 1,
  join: 'round' as const,
};

/** 萌宠系 HUD：暖棕描边 */
export const strokePetBrown = {
  color: VISUAL_THEME.colors.ink,
  width: 1,
  join: 'round' as const,
};
