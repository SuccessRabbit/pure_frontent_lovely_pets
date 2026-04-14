export interface CardRow {
  id: string;
  name: string;
  type: string;
  cost: string;
  rarity: string;
  description: string;
  tags: string;
  income: string;
  stress: string;
  stressLimit: string;
  canDiscard: string;
  cardImagePath: string;
  illustrationPath: string;
  imageFitMode: string;
  imageAnchorPreset: string;
  modelProfileId: string;
}

export interface SkillTemplateRow {
  id: string;
  name: string;
  description: string;
  scope: string;
  trigger: string;
  targetMode: string;
  effectKind: string;
  paramSchemaJson: string;
  summaryTemplate: string;
  descriptionTemplate: string;
  supportsSecondTarget: string;
}

export interface CardSkillRow {
  id: string;
  cardId: string;
  templateId: string;
  enabled: string;
  sortOrder: string;
  paramsJson: string;
}

export interface ModelProfileRow {
  id: string;
  name: string;
  rendererType: string;
  source: string;
  scale: string;
  rotationY: string;
  offsetX: string;
  offsetY: string;
  offsetZ: string;
  shadowSize: string;
  thumbnailPath: string;
  notes: string;
}

export interface GlobalConfigRow {
  module: string;
  key: string;
  value: string;
  valueType: string;
  description: string;
}

export interface RawAdminDatasets {
  cards: CardRow[];
  skillTemplates: SkillTemplateRow[];
  cardSkills: CardSkillRow[];
  modelProfiles: ModelProfileRow[];
  globalConfig: GlobalConfigRow[];
}

export interface AdminDatasetResponse {
  canEdit: boolean;
  headers: Record<string, string[]>;
  raw: RawAdminDatasets;
  compiled: {
    assetOptions?: {
      allAssets: string[];
      cardImages: string[];
      illustrations: string[];
      thumbnails: string[];
      modelPresetSources: string[];
    };
    [key: string]: unknown;
  };
}
