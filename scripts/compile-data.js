import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ensureDir,
  parseBoolean,
  parseJsonCell,
  parseNumber,
  readCsvFile,
} from './csv-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const CONFIG_DIR = path.join(ROOT, 'config');
const TYPES_OUT = path.join(ROOT, 'src/types/cards.generated.ts');
const PUBLIC_ASSETS_DIR = path.join(ROOT, 'public', 'assets');

export const DATASET_FILES = {
  cards: 'cards.csv',
  skillTemplates: 'skill_templates.csv',
  cardSkills: 'card_skills.csv',
  modelProfiles: 'model_profiles.csv',
  globalConfig: 'global_config.csv',
};

const DATASET_HEADERS = {
  cards: [
    'id',
    'name',
    'type',
    'cost',
    'rarity',
    'description',
    'tags',
    'income',
    'stress',
    'stressLimit',
    'canDiscard',
    'cardImagePath',
    'illustrationPath',
    'imageFitMode',
    'imageAnchorPreset',
    'modelProfileId',
  ],
  skillTemplates: [
    'id',
    'name',
    'description',
    'scope',
    'trigger',
    'targetMode',
    'effectKind',
    'paramSchemaJson',
    'operationsJson',
    'summaryTemplate',
    'descriptionTemplate',
    'supportsSecondTarget',
  ],
  cardSkills: [
    'id',
    'cardId',
    'templateId',
    'enabled',
    'sortOrder',
    'paramsJson',
  ],
  modelProfiles: [
    'id',
    'name',
    'rendererType',
    'source',
    'scale',
    'rotationY',
    'offsetX',
    'offsetY',
    'offsetZ',
    'shadowSize',
    'thumbnailPath',
    'notes',
  ],
  globalConfig: ['module', 'key', 'value', 'valueType', 'description'],
};

function readDatasetFile(name) {
  const file = DATASET_FILES[name];
  return readCsvFile(path.join(DATA_DIR, file));
}

function formatValueForTemplate(value) {
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (Array.isArray(value)) return value.join('、');
  return String(value ?? '');
}

function applyTemplate(template, params) {
  return String(template ?? '').replace(/\{(\w+)\}/g, (_match, key) => formatValueForTemplate(params[key]));
}

function defaultOperationsForEffectKind(effectKind) {
  switch (effectKind) {
    case 'set_stress_value':
      return [{ kind: 'set_stress', selector: 'target', params: { value: '$value' } }];
    case 'income_multiplier_turn':
      return [
        {
          kind: 'multiply_income_turn',
          selector: 'all_entities',
          filters: { entityType: '$entityType' },
          params: { multiplier: '$multiplier' },
        },
      ];
    case 'queue_card_next_turn':
      return [{ kind: 'queue_card_next_turn', selector: 'self', params: { cardId: '$cardId' } }];
    case 'swap_positions':
      return [{ kind: 'swap_entities', selector: 'target', params: {} }];
    case 'adjust_stress_all':
      return [
        {
          kind: 'adjust_stress_by_selector',
          selector: 'all_entities',
          filters: { entityType: '$entityType' },
          params: { amount: '$amount', reason: 'action' },
        },
      ];
    case 'sacrifice_worker_reduce_adjacent_pet_stress':
      return [
        {
          kind: 'remove_entity',
          selector: 'target',
          filters: { entityType: 'worker' },
          params: { reason: 'action' },
        },
        {
          kind: 'adjust_stress_adjacent',
          selector: 'target',
          filters: { entityType: 'pet' },
          params: { amount: '-$amount', pattern: 'orthogonal', reason: 'skill_adjacent' },
        },
      ];
    case 'draw_cards':
      return [{ kind: 'draw_cards', selector: 'self', params: { count: '$count' } }];
    case 'return_pet_to_hand':
      return [{ kind: 'return_entity_to_hand', selector: 'target', filters: { entityType: 'pet' }, params: {} }];
    default:
      return [];
  }
}

function normalizeTags(tags) {
  if (!tags) return [];
  return String(tags)
    .split('|')
    .map(tag => tag.trim())
    .filter(Boolean);
}

function parseCardRow(row) {
  return {
    id: row.id.trim(),
    name: row.name.trim(),
    type: row.type.trim(),
    cost: parseNumber(row.cost),
    rarity: row.rarity.trim(),
    description: row.description.trim(),
    tags: normalizeTags(row.tags),
    income: row.income === '' ? undefined : parseNumber(row.income),
    stress: row.stress === '' ? undefined : parseNumber(row.stress),
    stressLimit: row.stressLimit === '' ? undefined : parseNumber(row.stressLimit),
    canDiscard: row.canDiscard === '' ? undefined : parseBoolean(row.canDiscard, true),
    image: row.cardImagePath.trim(),
    illustrationPath: row.illustrationPath.trim(),
    imageFitMode: row.imageFitMode.trim() || 'contain',
    imageAnchorPreset: row.imageAnchorPreset.trim() || 'center',
    modelProfileId: row.modelProfileId.trim() || undefined,
  };
}

function parseSkillTemplateRow(row) {
  const effectKind = row.effectKind.trim();
  const operations = parseJsonCell(row.operationsJson, []);
  return {
    id: row.id.trim(),
    name: row.name.trim(),
    description: row.description.trim(),
    scope: normalizeTags(row.scope),
    trigger: row.trigger.trim(),
    targetMode: row.targetMode.trim() || 'none',
    effectKind,
    paramSchema: parseJsonCell(row.paramSchemaJson, []),
    operations: operations.length > 0 ? operations : defaultOperationsForEffectKind(effectKind),
    summaryTemplate: row.summaryTemplate.trim(),
    descriptionTemplate: row.descriptionTemplate.trim(),
    supportsSecondTarget: parseBoolean(row.supportsSecondTarget, false),
  };
}

function parseCardSkillRow(row) {
  return {
    id: row.id.trim(),
    cardId: row.cardId.trim(),
    templateId: row.templateId.trim(),
    enabled: parseBoolean(row.enabled, true),
    sortOrder: parseNumber(row.sortOrder, 0),
    params: parseJsonCell(row.paramsJson, {}),
  };
}

function parseModelProfileRow(row) {
  return {
    id: row.id.trim(),
    name: row.name.trim(),
    rendererType: row.rendererType.trim(),
    source: row.source.trim(),
    scale: parseNumber(row.scale, 1),
    rotationY: parseNumber(row.rotationY, 0),
    offsetX: parseNumber(row.offsetX, 0),
    offsetY: parseNumber(row.offsetY, 0),
    offsetZ: parseNumber(row.offsetZ, 0),
    shadowSize: parseNumber(row.shadowSize, 1),
    thumbnailPath: row.thumbnailPath.trim(),
    notes: row.notes.trim(),
  };
}

function parseGlobalConfigRow(row) {
  const raw = row.value;
  let value = raw;
  if (row.valueType === 'number') value = parseNumber(raw);
  if (row.valueType === 'boolean') value = parseBoolean(raw, false);
  if (row.valueType === 'json') value = parseJsonCell(raw, []);
  return {
    module: row.module.trim(),
    key: row.key.trim(),
    value,
    valueType: row.valueType.trim(),
    description: row.description.trim(),
  };
}

function validateData(cards, skillTemplates, cardSkills, modelProfiles, globalConfig) {
  const cardIds = new Set();
  const skillTemplateIds = new Set(skillTemplates.map(template => template.id));
  const modelProfileIds = new Set(modelProfiles.map(profile => profile.id));
  const globalKeys = new Set();

  for (const card of cards) {
    if (!card.id) throw new Error('Card id is required');
    if (cardIds.has(card.id)) throw new Error(`Duplicate card id: ${card.id}`);
    cardIds.add(card.id);
    if (!card.name) throw new Error(`Card ${card.id} missing name`);
    if (!card.type) throw new Error(`Card ${card.id} missing type`);
    if (card.type === 'entity_pet' || card.type === 'entity_worker') {
      if (!card.modelProfileId) {
        throw new Error(`Stage entity ${card.id} is missing modelProfileId`);
      }
      if (!modelProfileIds.has(card.modelProfileId)) {
        throw new Error(`Card ${card.id} references unknown modelProfileId: ${card.modelProfileId}`);
      }
    }
  }

  for (const binding of cardSkills) {
    if (!cardIds.has(binding.cardId)) {
      throw new Error(`Card skill ${binding.id} references unknown cardId: ${binding.cardId}`);
    }
    if (!skillTemplateIds.has(binding.templateId)) {
      throw new Error(`Card skill ${binding.id} references unknown templateId: ${binding.templateId}`);
    }
  }

  for (const entry of globalConfig) {
    if (globalKeys.has(entry.key)) throw new Error(`Duplicate global config key: ${entry.key}`);
    globalKeys.add(entry.key);
  }
}

function scanAssetPaths(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const paths = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      paths.push(...scanAssetPaths(fullPath));
      continue;
    }
    if (entry.name.endsWith('.md')) continue;
    const relative = path.relative(path.join(ROOT, 'public'), fullPath).split(path.sep).join('/');
    paths.push(`/${relative}`);
  }

  return paths.sort();
}

function buildAssetOptions(parsed) {
  const allAssets = scanAssetPaths(PUBLIC_ASSETS_DIR);
  const cardImages = allAssets.filter(assetPath => assetPath.startsWith('/assets/cards/'));
  const illustrations = allAssets.filter(assetPath => assetPath.startsWith('/assets/illustrations/'));
  const thumbnails = [...new Set([...cardImages, ...illustrations])];
  const modelPresetSources = [...new Set(parsed.modelProfiles.map(profile => profile.source).filter(Boolean))].sort();

  return {
    allAssets,
    cardImages,
    illustrations,
    thumbnails,
    modelPresetSources,
  };
}

function buildCompiledConfig(parsed) {
  const templateMap = new Map(parsed.skillTemplates.map(template => [template.id, template]));
  const bindingsByCardId = new Map();
  const assetOptions = buildAssetOptions(parsed);

  for (const binding of parsed.cardSkills) {
    const list = bindingsByCardId.get(binding.cardId) ?? [];
    list.push(binding);
    bindingsByCardId.set(binding.cardId, list);
  }

  const compiledCards = parsed.cards.map(card => {
    const bindings = (bindingsByCardId.get(card.id) ?? [])
      .filter(binding => binding.enabled)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(binding => {
        const template = templateMap.get(binding.templateId);
        const summary = applyTemplate(template.summaryTemplate, binding.params);
        const descriptionPreview = applyTemplate(template.descriptionTemplate, binding.params);
        return {
          id: binding.id,
          templateId: template.id,
          templateName: template.name,
          trigger: template.trigger,
          targetMode: template.targetMode,
          effectKind: template.effectKind,
          operations: template.operations,
          supportsSecondTarget: template.supportsSecondTarget,
          params: binding.params,
          summary,
          descriptionPreview,
        };
      });

    const derivedDescription = bindings.map(binding => binding.descriptionPreview).filter(Boolean).join('；');

    return {
      ...card,
      description: card.description || derivedDescription,
      derivedDescription,
      skills: bindings,
    };
  });

  const cardsById = Object.fromEntries(compiledCards.map(card => [card.id, card]));
  const globalConfigMap = Object.fromEntries(parsed.globalConfig.map(entry => [entry.key, entry.value]));

  return {
    version: Date.now(),
    generatedAt: new Date().toISOString(),
    cards: compiledCards,
    cardsById,
    pets: compiledCards.filter(card => card.type === 'entity_pet'),
    workers: compiledCards.filter(card => card.type === 'entity_worker'),
    actions: compiledCards.filter(card => card.type.startsWith('action_')),
    skillTemplates: parsed.skillTemplates,
    cardSkills: parsed.cardSkills,
    modelProfiles: parsed.modelProfiles,
    globalConfigEntries: parsed.globalConfig,
    globalConfigMap,
    assetOptions,
  };
}

function writeJson(fileName, value) {
  fs.writeFileSync(path.join(CONFIG_DIR, fileName), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeGameRulesTs(globalConfig) {
  const lines = [
    '/** Auto-generated from data/global_config.csv. Do not edit manually. */',
  ];

  for (const entry of globalConfig) {
    const valueLiteral =
      typeof entry.value === 'string' ? JSON.stringify(entry.value) : JSON.stringify(entry.value);
    lines.push(`export const ${entry.key} = ${valueLiteral};`);
  }

  fs.writeFileSync(path.join(CONFIG_DIR, 'gameRules.ts'), `${lines.join('\n')}\n`, 'utf8');
}

function writeGeneratedTypes(compiledConfig) {
  const cardIds = compiledConfig.cards.map(card => `'${card.id}'`).join(' | ');
  const typeSource = `/**
 * Auto-generated from CSV datasets. Do not edit manually.
 */

export type CardId = ${cardIds || 'string'};

export interface CardSkillBinding {
  id: string;
  templateId: string;
  templateName: string;
  trigger: string;
  targetMode: string;
  effectKind: string;
  operations: Array<Record<string, unknown>>;
  supportsSecondTarget: boolean;
  params: Record<string, unknown>;
  summary: string;
  descriptionPreview: string;
}

export interface CardResourceConfig {
  image?: string;
  illustrationPath?: string;
  imageFitMode?: 'contain' | 'cover';
  imageAnchorPreset?: string;
  modelProfileId?: string;
}

export interface Card {
  id: CardId;
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
  skills?: CardSkillBinding[];
}
`;

  fs.writeFileSync(TYPES_OUT, typeSource, 'utf8');
}

export function readAllDatasets() {
  const parsed = {
    cards: readDatasetFile('cards'),
    skillTemplates: readDatasetFile('skillTemplates'),
    cardSkills: readDatasetFile('cardSkills'),
    modelProfiles: readDatasetFile('modelProfiles'),
    globalConfig: readDatasetFile('globalConfig'),
  };

  return {
    raw: parsed,
    parsed: {
      cards: parsed.cards.map(parseCardRow),
      skillTemplates: parsed.skillTemplates.map(parseSkillTemplateRow),
      cardSkills: parsed.cardSkills.map(parseCardSkillRow),
      modelProfiles: parsed.modelProfiles.map(parseModelProfileRow),
      globalConfig: parsed.globalConfig.map(parseGlobalConfigRow),
    },
  };
}

export function compileAllData() {
  ensureDir(DATA_DIR);
  ensureDir(CONFIG_DIR);

  const datasets = readAllDatasets();
  validateData(
    datasets.parsed.cards,
    datasets.parsed.skillTemplates,
    datasets.parsed.cardSkills,
    datasets.parsed.modelProfiles,
    datasets.parsed.globalConfig
  );

  const compiled = buildCompiledConfig(datasets.parsed);
  writeJson('pets.json', compiled.pets);
  writeJson('workers.json', compiled.workers);
  writeJson('actions.json', compiled.actions);
  writeJson('cards.json', compiled.cards);
  writeJson('runtimeConfig.json', compiled);
  writeGameRulesTs(datasets.parsed.globalConfig);
  writeGeneratedTypes(compiled);

  return {
    datasets,
    compiled,
    headers: DATASET_HEADERS,
  };
}

export function getDatasetHeaders() {
  return DATASET_HEADERS;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = compileAllData();
  console.log(
    `Compiled ${result.compiled.cards.length} cards, ${result.compiled.skillTemplates.length} templates, ${result.compiled.cardSkills.length} bindings.`
  );
}
