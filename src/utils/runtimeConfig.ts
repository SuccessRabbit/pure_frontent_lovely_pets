import runtimeConfig from '../../config/runtimeConfig.json';

export interface RuntimeSkillBinding {
  id: string;
  templateId: string;
  templateName: string;
  trigger: string;
  targetMode: string;
  effectKind: string;
  supportsSecondTarget: boolean;
  params: Record<string, unknown>;
  summary: string;
  descriptionPreview: string;
}

export interface RuntimeCardDefinition {
  id: string;
  name: string;
  type: string;
  cost: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  description: string;
  derivedDescription?: string;
  tags: string[];
  income?: number;
  stress?: number;
  stressLimit?: number;
  canDiscard?: boolean;
  image?: string;
  illustrationPath?: string;
  imageFitMode?: 'contain' | 'cover';
  imageAnchorPreset?: string;
  modelProfileId?: string;
  skills?: RuntimeSkillBinding[];
}

export interface ModelProfile {
  id: string;
  name: string;
  rendererType: string;
  source: string;
  scale: number;
  rotationY: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  shadowSize: number;
  thumbnailPath?: string;
  notes?: string;
}

interface RuntimeConfigShape {
  version: number;
  generatedAt: string;
  cards: RuntimeCardDefinition[];
  cardsById: Record<string, RuntimeCardDefinition>;
  skillTemplates: Array<Record<string, unknown>>;
  cardSkills: Array<Record<string, unknown>>;
  modelProfiles: ModelProfile[];
  globalConfigMap: Record<string, number | string | boolean>;
  assetOptions?: {
    allAssets: string[];
    cardImages: string[];
    illustrations: string[];
    thumbnails: string[];
    modelPresetSources: string[];
  };
}

const config = runtimeConfig as RuntimeConfigShape;
const modelProfilesById = new Map(config.modelProfiles.map(profile => [profile.id, profile]));

export function getRuntimeConfig() {
  return config;
}

export function getRuntimeCardDefinition(cardId: string): RuntimeCardDefinition | null {
  return config.cardsById[cardId] ?? null;
}

export function getActionTargetModeFromConfig(cardId: string): 'none' | 'pet' | 'worker' | 'swap' {
  const card = getRuntimeCardDefinition(cardId);
  const skill = card?.skills?.find(binding => binding.trigger === 'on_play');
  if (!skill) return 'none';
  if (skill.targetMode === 'pet' || skill.targetMode === 'worker' || skill.targetMode === 'swap') {
    return skill.targetMode;
  }
  return 'none';
}

export function getCardModelProfile(cardId: string): ModelProfile | null {
  const card = getRuntimeCardDefinition(cardId);
  if (!card?.modelProfileId) return null;
  return modelProfilesById.get(card.modelProfileId) ?? null;
}
