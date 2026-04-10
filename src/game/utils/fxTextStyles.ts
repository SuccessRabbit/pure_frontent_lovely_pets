/**
 * 动效 / HUD 文字描边，避免与背景色融在一起
 * Pixi v8：stroke 使用 { color, width, join }
 */
export const strokeDark = {
  color: 0x050508,
  width: 1,
  join: 'round' as const,
};

/** 与 strokeDark 同色，仅语义区分标题 */
export const strokeDarkBold = {
  color: 0x020203,
  width: 1,
  join: 'round' as const,
};

/** 浅黄、浅绿等亮色填充上的描边 */
export const strokeOnWarm = {
  color: 0x1a0f00,
  width: 1,
  join: 'round' as const,
};

export const strokeOnCool = {
  color: 0x051a10,
  width: 1,
  join: 'round' as const,
};

/** 萌宠系 HUD：暖棕描边 */
export const strokePetBrown = {
  color: 0x4e342e,
  width: 1,
  join: 'round' as const,
};
