import type {
  CardRow,
  RawAdminDatasets,
  SkillTemplateRow,
  TemplateParamFieldRow,
} from './types';

export interface TemplateChoiceOption {
  value: string;
  label: string;
  description: string;
}

export interface TemplateRecipeParamDefinition extends TemplateParamFieldRow {
  description?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  unit?: string;
  source?: 'cards' | 'entity_types';
  required?: boolean;
}

export interface TemplateRecipeDefinition {
  effectKind: string;
  label: string;
  description: string;
  category: string;
  recommendedTrigger: string;
  recommendedTargetMode: string;
  supportsSecondTarget: boolean;
  allowedScopes: string[];
  summaryTemplate: string;
  descriptionTemplate: string;
  paramDefs: TemplateRecipeParamDefinition[];
  operations: Array<Record<string, unknown>>;
  preserveExistingSchema?: boolean;
}

export const cardTypeLabels: Record<string, string> = {
  entity_pet: '萌宠',
  entity_worker: '员工',
  entity_facility: '设施',
  action_buff: '增益',
  action_debuff: '减益',
  action_utility: '功能',
  status_negative: '负面',
};

export const TEMPLATE_TRIGGER_OPTIONS: TemplateChoiceOption[] = [
  {
    value: 'on_play',
    label: '打出时触发',
    description: '当卡牌被打出并开始结算时触发，适用于大多数行动牌效果。',
  },
  {
    value: 'turn_start',
    label: '回合开始时',
    description: '进入新回合准备阶段后触发，适用于开局抽牌、回合初增益。',
  },
  {
    value: 'turn_end',
    label: '回合结束时',
    description: '回合末尾结算，适合持续压力变化或回合结束追加效果。',
  },
  {
    value: 'income_calc',
    label: '收益计算时',
    description: '收益阶段计算时触发，适用于收益倍率、利息规则修改。',
  },
  {
    value: 'before_stress_apply',
    label: '压力施加前',
    description: '单位即将受到压力影响前触发，适用于免疫或改写压力来源。',
  },
  {
    value: 'before_meltdown',
    label: '拆家前',
    description: '单位即将 meltdown 前触发，适用于阻止拆家或调整拆家范围。',
  },
  {
    value: 'after_meltdown',
    label: '拆家后',
    description: 'meltdown 结算后触发，适用于补偿、掉落或后续惩罚。',
  },
  {
    value: 'passive',
    label: '纯被动说明',
    description: '只作为静态说明，不主动驱动运行时事件。',
  },
];

export const TEMPLATE_TARGET_MODE_OPTIONS: Array<TemplateChoiceOption & { supportsSecondTarget?: boolean }> = [
  {
    value: 'none',
    label: '无显式目标',
    description: '打出后直接生效，无需额外选中单位。',
  },
  {
    value: 'self',
    label: '自身',
    description: '作用于打出者或拥有该技能的单位本身。',
  },
  {
    value: 'pet',
    label: '单个萌宠',
    description: '要求玩家在场上选择一个萌宠作为目标。',
  },
  {
    value: 'worker',
    label: '单个牛马',
    description: '要求玩家在场上选择一个牛马作为目标。',
  },
  {
    value: 'adjacent_pets',
    label: '相邻萌宠',
    description: '自动作用于相邻萌宠，不需要手动二次选择。',
  },
  {
    value: 'adjacent_workers',
    label: '相邻牛马',
    description: '自动作用于相邻牛马，不需要手动二次选择。',
  },
  {
    value: 'swap',
    label: '双目标交换',
    description: '需要依次选择两个单位，适用于位置交换类效果。',
    supportsSecondTarget: true,
  },
];

export function formatCardTypeLabel(cardType: string) {
  return cardTypeLabels[cardType] ?? cardType;
}

function recipe(
  definition: Omit<TemplateRecipeDefinition, 'effectKind'> & { effectKind: string }
): TemplateRecipeDefinition {
  return definition;
}

export const TEMPLATE_RECIPE_DEFINITIONS: TemplateRecipeDefinition[] = [
  recipe({
    effectKind: 'set_stress_value',
    label: '设置目标压力',
    description: '把单个目标萌宠的压力设置为固定值。',
    category: '行动牌',
    recommendedTrigger: 'on_play',
    recommendedTargetMode: 'pet',
    supportsSecondTarget: false,
    allowedScopes: ['action_debuff'],
    summaryTemplate: '目标萌宠压力设为 {value}',
    descriptionTemplate: '将目标萌宠压力调整到 {value}',
    paramDefs: [
      {
        name: 'value',
        label: '目标压力',
        description: '最终会把目标压力直接设置到这个值。',
        type: 'number',
        defaultValue: 0,
        min: 0,
        max: 20,
        step: 1,
        required: true,
      },
    ],
    operations: [{ kind: 'set_stress', selector: 'target', params: { value: '$value' } }],
  }),
  recipe({
    effectKind: 'income_multiplier_turn',
    label: '本回合收益倍率',
    description: '按单位类型提高或降低本回合收益。',
    category: '行动牌',
    recommendedTrigger: 'on_play',
    recommendedTargetMode: 'none',
    supportsSecondTarget: false,
    allowedScopes: ['action_buff', 'action_utility'],
    summaryTemplate: '本回合 {entityType} 收益 x{multiplier}',
    descriptionTemplate: '本回合所有 {entityType} 收益倍率变为 x{multiplier}',
    paramDefs: [
      {
        name: 'entityType',
        label: '作用单位',
        description: '选择要被整体影响的单位类型。',
        type: 'select',
        options: ['pet', 'worker'],
        defaultValue: 'worker',
        source: 'entity_types',
        required: true,
      },
      {
        name: 'multiplier',
        label: '倍率',
        description: '例如 2 表示翻倍。',
        type: 'number',
        defaultValue: 2,
        min: 1,
        max: 5,
        step: 1,
        required: true,
      },
    ],
    operations: [
      {
        kind: 'multiply_income_turn',
        selector: 'all_entities',
        filters: { entityType: '$entityType' },
        params: { multiplier: '$multiplier' },
      },
    ],
  }),
  recipe({
    effectKind: 'queue_card_next_turn',
    label: '下回合塞牌',
    description: '在下回合开始时向牌堆注入指定卡牌。',
    category: '行动牌',
    recommendedTrigger: 'on_play',
    recommendedTargetMode: 'none',
    supportsSecondTarget: false,
    allowedScopes: ['action_buff'],
    summaryTemplate: '下回合注入卡牌 {cardId}',
    descriptionTemplate: '下回合开始时加入 {cardId}',
    paramDefs: [
      {
        name: 'cardId',
        label: '目标卡牌',
        description: '从已有卡牌中选择要注入的卡牌。',
        type: 'text',
        defaultValue: '',
        source: 'cards',
        required: true,
      },
    ],
    operations: [{ kind: 'queue_card_next_turn', selector: 'self', params: { cardId: '$cardId' } }],
  }),
  recipe({
    effectKind: 'swap_positions',
    label: '交换单位位置',
    description: '选择两个单位并交换它们的位置。',
    category: '行动牌',
    recommendedTrigger: 'on_play',
    recommendedTargetMode: 'swap',
    supportsSecondTarget: true,
    allowedScopes: ['action_utility'],
    summaryTemplate: '交换两个单位的位置',
    descriptionTemplate: '交换场上两个单位的位置',
    paramDefs: [],
    operations: [{ kind: 'swap_entities', selector: 'target', params: {} }],
  }),
  recipe({
    effectKind: 'adjust_stress_all',
    label: '群体调整压力',
    description: '对某一类单位整体增减压力。',
    category: '行动牌',
    recommendedTrigger: 'on_play',
    recommendedTargetMode: 'none',
    supportsSecondTarget: false,
    allowedScopes: ['action_debuff', 'action_buff'],
    summaryTemplate: '全场 {entityType} 压力 {amount}',
    descriptionTemplate: '全场 {entityType} 压力变化 {amount}',
    paramDefs: [
      {
        name: 'entityType',
        label: '作用单位',
        description: '选择要整体作用的单位类型。',
        type: 'select',
        options: ['pet', 'worker'],
        defaultValue: 'pet',
        source: 'entity_types',
        required: true,
      },
      {
        name: 'amount',
        label: '压力变化',
        description: '负数代表减压，正数代表加压。',
        type: 'number',
        defaultValue: -2,
        min: -10,
        max: 10,
        step: 1,
        required: true,
      },
    ],
    operations: [
      {
        kind: 'adjust_stress_by_selector',
        selector: 'all_entities',
        filters: { entityType: '$entityType' },
        params: { amount: '$amount', reason: 'action' },
      },
    ],
  }),
  recipe({
    effectKind: 'sacrifice_worker_reduce_adjacent_pet_stress',
    label: '献祭牛马减压',
    description: '移除一个牛马后，降低相邻萌宠压力。',
    category: '行动牌',
    recommendedTrigger: 'on_play',
    recommendedTargetMode: 'worker',
    supportsSecondTarget: false,
    allowedScopes: ['action_utility'],
    summaryTemplate: '献祭牛马后相邻萌宠压力 {amount}',
    descriptionTemplate: '献祭一个牛马，降低相邻萌宠压力 {amount} 点',
    paramDefs: [
      {
        name: 'amount',
        label: '减压值',
        description: '对相邻萌宠施加的减压数值。',
        type: 'number',
        defaultValue: 2,
        min: 1,
        max: 10,
        step: 1,
        required: true,
      },
    ],
    operations: [
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
    ],
  }),
  recipe({
    effectKind: 'draw_cards',
    label: '抽牌',
    description: '立即抽取指定数量的卡牌。',
    category: '通用',
    recommendedTrigger: 'on_play',
    recommendedTargetMode: 'none',
    supportsSecondTarget: false,
    allowedScopes: ['action_utility', 'entity_pet'],
    summaryTemplate: '抽 {count} 张牌',
    descriptionTemplate: '抽取 {count} 张牌',
    paramDefs: [
      {
        name: 'count',
        label: '抽牌数',
        description: '一次性抽取的卡牌数量。',
        type: 'number',
        defaultValue: 2,
        min: 1,
        max: 10,
        step: 1,
        required: true,
      },
    ],
    operations: [{ kind: 'draw_cards', selector: 'self', params: { count: '$count' } }],
  }),
  recipe({
    effectKind: 'return_pet_to_hand',
    label: '回收萌宠',
    description: '把单个萌宠收回手牌。',
    category: '行动牌',
    recommendedTrigger: 'on_play',
    recommendedTargetMode: 'pet',
    supportsSecondTarget: false,
    allowedScopes: ['action_utility'],
    summaryTemplate: '将目标萌宠收回手牌',
    descriptionTemplate: '将一个萌宠收回手牌',
    paramDefs: [],
    operations: [{ kind: 'return_entity_to_hand', selector: 'target', filters: { entityType: 'pet' }, params: {} }],
  }),
  recipe({
    effectKind: 'passive_summary',
    label: '被动说明',
    description: '只做说明或复用已有被动链路，适用于宠物/员工被动。',
    category: '被动',
    recommendedTrigger: 'passive',
    recommendedTargetMode: 'self',
    supportsSecondTarget: false,
    allowedScopes: ['entity_pet', 'entity_worker', 'status_negative'],
    summaryTemplate: '{text}',
    descriptionTemplate: '{text}',
    preserveExistingSchema: true,
    paramDefs: [
      {
        name: 'text',
        label: '显示文案',
        description: '玩家在卡面和后台里看到的效果描述。',
        type: 'text',
        defaultValue: '',
        required: true,
        placeholder: '例如：不受压力传染影响',
      },
    ],
    operations: [],
  }),
];

const recipeMap = new Map(TEMPLATE_RECIPE_DEFINITIONS.map(item => [item.effectKind, item]));

export function getTemplateRecipe(effectKind: string) {
  return recipeMap.get(effectKind);
}

export function buildParamSchemaFromRecipe(effectKind: string): TemplateParamFieldRow[] {
  const definition = getTemplateRecipe(effectKind);
  if (!definition) return [];
  return definition.paramDefs.map(field => ({
    name: field.name,
    label: field.label,
    type: field.type,
    defaultValue: field.defaultValue,
    options: field.options ? [...field.options] : undefined,
  }));
}

export function buildOperationsFromRecipe(effectKind: string): Array<Record<string, unknown>> {
  const definition = getTemplateRecipe(effectKind);
  if (!definition) return [];
  return definition.operations.map(operation => JSON.parse(JSON.stringify(operation)) as Record<string, unknown>);
}

export function mergeSchemaWithRecipe(effectKind: string, schema: TemplateParamFieldRow[]) {
  const definition = getTemplateRecipe(effectKind);
  if (!definition) return schema;
  if (definition.preserveExistingSchema) {
    return schema;
  }
  const existingByName = new Map(schema.map(field => [field.name, field]));
  return definition.paramDefs.map(field => {
    const existing = existingByName.get(field.name);
    return {
      name: field.name,
      label: existing?.label?.trim() || field.label,
      type: field.type,
      defaultValue: existing?.defaultValue ?? field.defaultValue,
      options: field.options ? [...field.options] : undefined,
    };
  });
}

export function getTemplateVariables(template: Pick<SkillTemplateRow, 'paramSchemaJson'> | { paramSchemaJson?: string; paramSchema?: TemplateParamFieldRow[] }) {
  const schema = 'paramSchema' in template
    ? template.paramSchema ?? []
    : parseJsonSafe<TemplateParamFieldRow[]>(template.paramSchemaJson ?? '[]', []);
  return schema.map(field => field.name).filter(Boolean);
}

export function extractTemplateVariables(text: string) {
  return Array.from(new Set((text.match(/\{(\w+)\}/g) ?? []).map(token => token.slice(1, -1))));
}

export function parseJsonSafe<T>(value: string, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function readParamSchema(template: SkillTemplateRow | undefined): TemplateParamFieldRow[] {
  if (!template) return [];
  return parseJsonSafe<TemplateParamFieldRow[]>(template.paramSchemaJson, []);
}

export function readOperations(template: SkillTemplateRow | undefined) {
  if (!template) return [];
  return parseJsonSafe<Array<Record<string, unknown>>>(template.operationsJson, []);
}

export function readOperationsSummary(template: SkillTemplateRow | undefined) {
  return readOperations(template)
    .map(operation => String(operation.kind ?? '').trim())
    .filter(Boolean);
}

export function formatValueForTemplate(value: unknown) {
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (Array.isArray(value)) return value.join('、');
  return String(value ?? '');
}

export function applyTemplateText(source: string, params: Record<string, unknown>) {
  return String(source ?? '').replace(/\{(\w+)\}/g, (_match, key) => formatValueForTemplate(params[key]));
}

export function renderTemplateSummary(template: SkillTemplateRow | undefined, params: Record<string, unknown>) {
  if (!template) return '未匹配到技能模板';
  const summary = template.summaryTemplate || template.descriptionTemplate || template.name;
  return applyTemplateText(summary, params);
}

export function getScopeOptions(cards: CardRow[]) {
  return Array.from(new Set(cards.map(card => card.type)))
    .sort((a, b) => formatCardTypeLabel(a).localeCompare(formatCardTypeLabel(b), 'zh-Hans-CN'))
    .map(type => ({
      value: type,
      label: formatCardTypeLabel(type),
      description: type,
    }));
}

export function scopeIncludesCardType(scope: string, cardType: string) {
  const scopes = scope
    .split('|')
    .map(item => item.trim())
    .filter(Boolean);
  if (scopes.length === 0) return true;
  return scopes.includes(cardType);
}

export function buildBindingFieldDefinitions(template: SkillTemplateRow | undefined) {
  if (!template) return [];
  const recipeDefinition = getTemplateRecipe(template.effectKind);
  const schema = readParamSchema(template);
  if (!recipeDefinition) {
    return schema.map(field => ({ ...field, required: false })) as TemplateRecipeParamDefinition[];
  }
  if (recipeDefinition.preserveExistingSchema) {
    return schema.map(field => ({
      ...field,
      required: false,
      description: '该被动模板沿用当前已有参数结构。',
    })) as TemplateRecipeParamDefinition[];
  }

  const existingByName = new Map(schema.map(field => [field.name, field]));
  return recipeDefinition.paramDefs.map(field => {
    const existing = existingByName.get(field.name);
    return {
      ...field,
      label: existing?.label?.trim() || field.label,
      defaultValue: existing?.defaultValue ?? field.defaultValue,
      options: field.options ? [...field.options] : existing?.options,
    };
  });
}

export function buildFieldOptions(
  field: TemplateRecipeParamDefinition,
  draft: RawAdminDatasets,
  selectedCard: CardRow | null
) {
  if (field.source === 'cards') {
    return draft.cards
      .map(card => ({
        value: card.id,
        label: `${card.name} · ${card.id}`,
        description: card.type,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'));
  }

  if (field.source === 'entity_types') {
    return [
      { value: 'pet', label: '萌宠', description: '作用于所有萌宠' },
      { value: 'worker', label: '牛马', description: '作用于所有牛马' },
    ];
  }

  if (field.type === 'select') {
    return (field.options ?? []).map(option => ({
      value: option,
      label: option,
      description: option,
    }));
  }

  if (field.name === 'cardId' && selectedCard) {
    return draft.cards
      .filter(card => card.id !== selectedCard.id)
      .map(card => ({
        value: card.id,
        label: `${card.name} · ${card.id}`,
        description: card.type,
      }));
  }

  return [];
}
