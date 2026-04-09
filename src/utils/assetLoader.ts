/**
 * 资源加载工具 - 更新版
 * 支持插画和卡牌框架的分离加载
 */

interface AssetConfig {
  png?: string;
  svg: string;
  alt: string;
}

/**
 * 检查图片是否存在
 */
async function checkImageExists(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

/**
 * 获取资源URL（自动fallback）
 */
export async function getAssetUrl(
  pngPath: string,
  svgPath: string
): Promise<string> {
  const exists = await checkImageExists(pngPath);
  return exists ? pngPath : svgPath;
}

/**
 * 同步获取资源配置（用于React组件）
 */
export function getAssetConfig(
  pngPath: string,
  svgPath: string,
  alt: string
): AssetConfig {
  return {
    png: pngPath,
    svg: svgPath,
    alt
  };
}

/**
 * 卡牌插画资源路径生成器（4:3比例的角色插画）
 */
export function getCardAssetPaths(cardId: string, type: 'pets' | 'workers' | 'actions') {
  return {
    png: `/assets/illustrations/${type}/${cardId}.png`,
    svg: `/assets/illustrations/${type}/${cardId}.svg`,
  };
}

/**
 * 卡牌框架资源路径生成器
 */
export function getCardFramePath(rarity: 'common' | 'rare' | 'epic' | 'legendary') {
  return {
    png: `/assets/frames/frame_${rarity}.png`,
    svg: `/assets/frames/frame_${rarity}.svg`,
  };
}

/**
 * UI图标资源路径生成器
 */
export function getIconAssetPaths(iconName: string) {
  return {
    png: `/assets/ui/icons/${iconName}.png`,
    svg: `/assets/ui/icons/${iconName}.svg`,
  };
}

/**
 * 批量预加载资源
 */
export async function preloadAssets(urls: string[]): Promise<void> {
  const promises = urls.map(url => {
    return new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve(); // 即使失败也继续
      img.src = url;
    });
  });

  await Promise.all(promises);
}

/**
 * 获取卡牌所需的所有资源路径
 */
export function getCardResourcePaths(cardId: string, type: 'pets' | 'workers' | 'actions', rarity: string) {
  const illustration = getCardAssetPaths(cardId, type);
  const frame = getCardFramePath(rarity as any);

  return {
    illustration,
    frame
  };
}
