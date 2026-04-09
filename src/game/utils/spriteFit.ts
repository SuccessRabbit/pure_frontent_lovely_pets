import * as PIXI from 'pixi.js';

/**
 * 在矩形框内 **contain** 等比适配：整图可见、不变形、居中（类似 object-fit: contain）
 * 缩放系数 = min(框宽/图宽, 框高/图高)，由较短适配边决定整体比例
 */
export function layoutSpriteContain(
  sprite: PIXI.Sprite,
  texture: PIXI.Texture,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number
): void {
  const tw = texture.width > 0 ? texture.width : 1;
  const th = texture.height > 0 ? texture.height : 1;
  sprite.texture = texture;
  const s = Math.min(boxW / tw, boxH / th);
  sprite.scale.set(s);
  sprite.x = boxX + (boxW - tw * s) / 2;
  sprite.y = boxY + (boxH - th * s) / 2;
}
