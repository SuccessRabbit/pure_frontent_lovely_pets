import type {
  CardRow,
  CardSkillRow,
  SkillTemplateRow,
  TemplateEditorModel,
  TemplateOperationDraft,
  TemplateParamFieldRow,
  TemplateValidationIssue,
} from './types';

function parseJsonSafe<T>(value: string, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function createOperationDraft(operation: Record<string, unknown>, index: number): TemplateOperationDraft {
  return {
    id: `operation_${index}_${String(operation.kind ?? 'draft')}`,
    kind: String(operation.kind ?? ''),
    selector: String(operation.selector ?? 'self'),
    filtersJson: JSON.stringify(operation.filters ?? {}, null, 2),
    paramsJson: JSON.stringify(operation.params ?? {}, null, 2),
  };
}

export function createTemplateEditorModel(template: SkillTemplateRow): TemplateEditorModel {
  const paramSchema = parseJsonSafe<TemplateParamFieldRow[]>(template.paramSchemaJson, []);
  const operations = parseJsonSafe<Array<Record<string, unknown>>>(template.operationsJson, []).map((operation, index) =>
    createOperationDraft(operation, index)
  );

  return {
    id: template.id,
    name: template.name,
    description: template.description,
    scope: template.scope,
    trigger: template.trigger,
    targetMode: template.targetMode,
    effectKind: template.effectKind,
    summaryTemplate: template.summaryTemplate,
    descriptionTemplate: template.descriptionTemplate,
    supportsSecondTarget: template.supportsSecondTarget,
    paramSchema,
    operations,
  };
}

export function serializeTemplateEditorModel(model: TemplateEditorModel): SkillTemplateRow {
  return {
    id: model.id.trim(),
    name: model.name.trim(),
    description: model.description.trim(),
    scope: model.scope.trim(),
    trigger: model.trigger.trim(),
    targetMode: model.targetMode.trim(),
    effectKind: model.effectKind.trim(),
    paramSchemaJson: JSON.stringify(model.paramSchema, null, 2),
    operationsJson: JSON.stringify(
      model.operations.map(operation => ({
        kind: operation.kind.trim(),
        selector: operation.selector.trim() || 'self',
        filters: parseJsonSafe<Record<string, unknown>>(operation.filtersJson, {}),
        params: parseJsonSafe<Record<string, unknown>>(operation.paramsJson, {}),
      })),
      null,
      2
    ),
    summaryTemplate: model.summaryTemplate.trim(),
    descriptionTemplate: model.descriptionTemplate.trim(),
    supportsSecondTarget: model.supportsSecondTarget === 'true' ? 'true' : 'false',
  };
}

export function createEmptyTemplate(index: number): SkillTemplateRow {
  return {
    id: `template_${Date.now()}_${index}`,
    name: '新模板',
    description: '',
    scope: '',
    trigger: 'on_play',
    targetMode: 'none',
    effectKind: 'custom',
    paramSchemaJson: '[]',
    operationsJson: '[]',
    summaryTemplate: '',
    descriptionTemplate: '',
    supportsSecondTarget: 'false',
  };
}

export function buildTemplateUsageMap(
  templates: SkillTemplateRow[],
  cards: CardRow[],
  bindings: CardSkillRow[]
): Record<string, Array<{ binding: CardSkillRow; card: CardRow | null }>> {
  const cardsById = new Map(cards.map(card => [card.id, card]));
  const usage: Record<string, Array<{ binding: CardSkillRow; card: CardRow | null }>> = Object.fromEntries(
    templates.map(template => [template.id, []])
  );

  for (const binding of bindings) {
    if (!usage[binding.templateId]) usage[binding.templateId] = [];
    usage[binding.templateId].push({
      binding,
      card: cardsById.get(binding.cardId) ?? null,
    });
  }

  return usage;
}

export function applyTemplatePreview(template: SkillTemplateRow, params: Record<string, unknown>): { summary: string; description: string } {
  const apply = (source: string) =>
    String(source ?? '').replace(/\{(\w+)\}/g, (_match, key) => String(params[key] ?? ''));

  return {
    summary: apply(template.summaryTemplate || template.name),
    description: apply(template.descriptionTemplate || template.description || template.name),
  };
}

export function defaultOperationsForEffectKind(effectKind: string): Array<Record<string, unknown>> {
  switch (effectKind) {
    case 'set_stress_value':
      return [{ kind: 'set_stress', selector: 'target', filters: {}, params: { value: '$value' } }];
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
      return [{ kind: 'queue_card_next_turn', selector: 'self', filters: {}, params: { cardId: '$cardId' } }];
    case 'swap_positions':
      return [{ kind: 'swap_entities', selector: 'target', filters: {}, params: {} }];
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
      return [{ kind: 'draw_cards', selector: 'self', filters: {}, params: { count: '$count' } }];
    case 'return_pet_to_hand':
      return [{ kind: 'return_entity_to_hand', selector: 'target', filters: { entityType: 'pet' }, params: {} }];
    default:
      return [];
  }
}

export function validateTemplateEditorModels(models: TemplateEditorModel[]): TemplateValidationIssue[] {
  const issues: TemplateValidationIssue[] = [];
  const ids = new Map<string, number>();

  for (const model of models) {
    const id = model.id.trim();
    if (!id) {
      issues.push({ templateId: model.id, field: 'id', message: '模板 ID 不能为空' });
    } else {
      ids.set(id, (ids.get(id) ?? 0) + 1);
    }
    if (!model.name.trim()) {
      issues.push({ templateId: model.id, field: 'name', message: '模板名称不能为空' });
    }
    if (!model.trigger.trim()) {
      issues.push({ templateId: model.id, field: 'trigger', message: '触发时机不能为空' });
    }
    if (!model.targetMode.trim()) {
      issues.push({ templateId: model.id, field: 'targetMode', message: '目标模式不能为空' });
    }
    for (const field of model.paramSchema) {
      if (!field.name.trim()) {
        issues.push({ templateId: model.id, field: 'paramSchema', message: '参数字段必须填写 name' });
      }
      if (!field.label.trim()) {
        issues.push({ templateId: model.id, field: 'paramSchema', message: '参数字段必须填写 label' });
      }
    }
    for (const operation of model.operations) {
      if (!operation.kind.trim()) {
        issues.push({ templateId: model.id, field: 'operations', message: '每条 operation 都必须填写 kind' });
      }
      try {
        JSON.parse(operation.filtersJson || '{}');
      } catch {
        issues.push({ templateId: model.id, field: 'operations', message: `operation ${operation.kind || '未命名'} 的 filtersJson 不是合法 JSON` });
      }
      try {
        JSON.parse(operation.paramsJson || '{}');
      } catch {
        issues.push({ templateId: model.id, field: 'operations', message: `operation ${operation.kind || '未命名'} 的 paramsJson 不是合法 JSON` });
      }
    }
  }

  for (const [id, count] of ids.entries()) {
    if (count > 1) {
      issues.push({ templateId: id, field: 'id', message: `模板 ID 重复: ${id}` });
    }
  }

  return issues;
}
