import { Assets, Texture } from 'pixi.js';
import { getCardAssetPaths } from '../../utils/assetLoader';
const DEBUG_TEXTURE_LOAD = true;

function logTextureLoad(message: string, payload?: unknown) {
  if (!DEBUG_TEXTURE_LOAD) return;
  if (payload === undefined) {
    console.log(`[TextureLoad] ${message}`);
  } else {
    console.log(`[TextureLoad] ${message}`, payload);
  }
}

export function illustrationFolder(cardType: string): 'pets' | 'workers' | 'actions' {
  const t = cardType.toLowerCase();
  if (t.includes('worker')) return 'workers';
  if (t.includes('action')) return 'actions';
  return 'pets';
}

/** 去重并保持顺序 */
function uniqueUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

/**
 * 手牌 Card：配置里的 image、同路径 svg、插画目录、cards 目录
 */
export function candidateUrlsFromCard(card: { id: string; type: string; image?: string }): string[] {
  const folder = illustrationFolder(card.type);
  const ill = getCardAssetPaths(card.id, folder);
  const cardsPng = `/assets/cards/${folder}/${card.id}.png`;
  const cardsSvg = `/assets/cards/${folder}/${card.id}.svg`;

  const list: string[] = [];
  if (card.image) {
    list.push(card.image);
    list.push(card.image.replace(/\.png($|\?)/i, '.svg$1'));
  }
  list.push(cardsPng, cardsSvg, ill.png, ill.svg);
  return uniqueUrls(list);
}

/** 网格实体：仅 id + pet/worker */
export function candidateUrlsFromEntity(cardId: string, kind: 'pet' | 'worker'): string[] {
  const folder = kind === 'pet' ? 'pets' : 'workers';
  const ill = getCardAssetPaths(cardId, folder);
  return uniqueUrls([
    `/assets/cards/${folder}/${cardId}.png`,
    `/assets/cards/${folder}/${cardId}.svg`,
    ill.png,
    ill.svg,
  ]);
}

async function textureFromImageElement(url: string): Promise<Texture> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Image load failed: ${url}`));
    img.src = url;
  });
  return Texture.from(img);
}

/**
 * 依次尝试 URL：先 Pixi Assets（含缓存），再原生 Image（SVG/PNG 更稳）
 */
export async function loadIllustrationTexture(urls: string[]): Promise<Texture> {
  logTextureLoad('loadIllustrationTexture:start', { urls });
  for (const url of urls) {
    try {
      const asset = await Assets.load(url);
      const tex = asset instanceof Texture ? asset : (asset as { texture?: Texture }).texture;
      if (tex && tex.width > 0 && tex.height > 0) {
        logTextureLoad('loadIllustrationTexture:assetsHit', {
          url,
          size: [tex.width, tex.height],
        });
        return tex;
      }
    } catch {
      logTextureLoad('loadIllustrationTexture:assetsMiss', { url });
    }
  }

  for (const url of urls) {
    try {
      const tex = await textureFromImageElement(url);
      if (tex.width > 0 && tex.height > 0) {
        logTextureLoad('loadIllustrationTexture:imageHit', {
          url,
          size: [tex.width, tex.height],
        });
        return tex;
      }
    } catch {
      logTextureLoad('loadIllustrationTexture:imageMiss', { url });
    }
  }

  console.warn('[TextureLoad] loadIllustrationTexture:fallbackWhite', { urls });
  return Texture.WHITE;
}

export async function loadIllustrationForCard(
  card: { id: string; type: string; image?: string }
): Promise<Texture> {
  return loadIllustrationTexture(candidateUrlsFromCard(card));
}

export async function loadIllustrationForEntity(
  cardId: string,
  kind: 'pet' | 'worker'
): Promise<Texture> {
  return loadIllustrationTexture(candidateUrlsFromEntity(cardId, kind));
}
