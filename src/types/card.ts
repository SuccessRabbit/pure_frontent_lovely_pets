export interface CardEffect {
  type: string;
  value?: number;
  target?: string;
  description?: string;
  raw?: string;
}

export interface CardAttributes {
  health?: number;
  attack?: number;
  income?: number;
  maxStress?: number;
}

export interface Card {
  id: string;
  name: string;
  type: string;
  /** 配置中的插画路径（多为 .png；实际资源可能为同路径 .svg） */
  image?: string;
  cost: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  description: string;
  effects?: CardEffect[];
  tags: string[];
  attributes: CardAttributes;
  income?: number;
  stress?: number;
  stressLimit?: number;
}
