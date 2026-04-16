import type {
  CardRow,
  CardSkillRow,
  RawAdminDatasets,
  SkillTemplateRow,
  TemplateEditorModel,
  TemplateOperationDraft,
  TemplateParamFieldRow,
  TemplateValidationIssue,
} from './types';
import {
  TEMPLATE_TARGET_MODE_OPTIONS,
  TEMPLATE_TRIGGER_OPTIONS,
  buildBindingFieldDefinitions,
  buildOperationsFromRecipe,
  buildParamSchemaFromRecipe,
  extractTemplateVariables,
  getTemplateRecipe,
  mergeSchemaWithRecipe,
  parseJsonSafe,
  scopeIncludesCardType,
} from './templateSchema';

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
  const paramSchema = mergeSchemaWithRecipe(
    template.effectKind,
    parseJsonSafe<TemplateParamFieldRow[]>(template.paramSchemaJson, [])
  );
  const operationsSource = parseJsonSafe<Array<Record<string, unknown>>>(template.operationsJson, []);
  const operations =
    (operationsSource.length > 0 ? operationsSource : buildOperationsFromRecipe(template.effectKind)).map((operation, index) =>
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
  const effectKind = 'draw_cards';
  return {
    id: `template_${Date.now()}_${index}`,
    name: '新模板',
    description: '',
    scope: '',
    trigger: getTemplateRecipe(effectKind)?.recommendedTrigger ?? 'on_play',
    targetMode: 'none',
    effectKind,
    paramSchemaJson: JSON.stringify(buildParamSchemaFromRecipe(effectKind), null, 2),
    operationsJson: JSON.stringify(buildOperationsFromRecipe(effectKind), null, 2),
    summaryTemplate: getTemplateRecipe(effectKind)?.summaryTemplate ?? '',
    descriptionTemplate: getTemplateRecipe(effectKind)?.descriptionTemplate ?? '',
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
  return buildOperationsFromRecipe(effectKind);
}

function pushIssue(
  issues: TemplateValidationIssue[],
  issue: Omit<TemplateValidationIssue, 'severity' | 'blocking'> & { severity?: 'error' | 'warning'; blocking?: boolean }
) {
  issues.push({
    severity: issue.severity ?? 'error',
    blocking: issue.blocking ?? true,
    ...issue,
  });
}

function validateTemplateVariables(model: TemplateEditorModel, issues: TemplateValidationIssue[]) {
  const variables = new Set(model.paramSchema.map(field => field.name.trim()).filter(Boolean));
  for (const fieldName of ['summaryTemplate', 'descriptionTemplate'] as const) {
    const source = model[fieldName];
    for (const variable of extractTemplateVariables(source)) {
      if (!variables.has(variable)) {
        pushIssue(issues, {
          templateId: model.id,
          field: fieldName,
          message: `${fieldName} 使用了未定义变量 {${variable}}`,
        });
      }
    }
  }
}

function validateBindingParams(draft: RawAdminDatasets, issues: TemplateValidationIssue[]) {
  const templateMap = new Map(draft.skillTemplates.map(template => [template.id, template]));
  const cardMap = new Map(draft.cards.map(card => [card.id, card]));

  for (const binding of draft.cardSkills) {
    const template = templateMap.get(binding.templateId);
    if (!template) {
      pushIssue(issues, {
        templateId: binding.templateId,
        field: 'binding',
        bindingId: binding.id,
        message: `技能绑定 ${binding.id} 引用了不存在的模板 ${binding.templateId}`,
      });
      continue;
    }

    const card = cardMap.get(binding.cardId);
    if (!card) {
      pushIssue(issues, {
        templateId: template.id,
        field: 'binding',
        bindingId: binding.id,
        message: `技能绑定 ${binding.id} 引用了不存在的卡牌 ${binding.cardId}`,
      });
      continue;
    }

    if (!scopeIncludesCardType(template.scope, card.type)) {
      pushIssue(issues, {
        templateId: template.id,
        field: 'scope',
        bindingId: binding.id,
        message: `模板 ${template.name} 不支持卡牌类型 ${card.type}，但已绑定到 ${card.name}`,
      });
    }

    const params = parseJsonSafe<Record<string, unknown>>(binding.paramsJson, {});
    const fields = buildBindingFieldDefinitions(template);
    for (const field of fields) {
      const rawValue = params[field.name] ?? field.defaultValue;
      if (field.required && (rawValue === '' || rawValue == null)) {
        pushIssue(issues, {
          templateId: template.id,
          field: field.name,
          bindingId: binding.id,
          message: `绑定 ${binding.id} 缺少参数 ${field.label}`,
        });
        continue;
      }

      if (rawValue == null || rawValue === '') continue;

      if (field.type === 'number') {
        const numericValue = Number(rawValue);
        if (!Number.isFinite(numericValue)) {
          pushIssue(issues, {
            templateId: template.id,
            field: field.name,
            bindingId: binding.id,
            message: `绑定 ${binding.id} 的 ${field.label} 不是合法数字`,
          });
          continue;
        }
        if (field.min != null && numericValue < field.min) {
          pushIssue(issues, {
            templateId: template.id,
            field: field.name,
            bindingId: binding.id,
            message: `绑定 ${binding.id} 的 ${field.label} 不能小于 ${field.min}`,
          });
        }
        if (field.max != null && numericValue > field.max) {
          pushIssue(issues, {
            templateId: template.id,
            field: field.name,
            bindingId: binding.id,
            message: `绑定 ${binding.id} 的 ${field.label} 不能大于 ${field.max}`,
          });
        }
      }

      if (field.type === 'select' && field.options?.length && !field.options.includes(String(rawValue))) {
        pushIssue(issues, {
          templateId: template.id,
          field: field.name,
          bindingId: binding.id,
          message: `绑定 ${binding.id} 的 ${field.label} 不在可选范围内`,
        });
      }

      if (field.source === 'cards' && !draft.cards.some(cardItem => cardItem.id === String(rawValue))) {
        pushIssue(issues, {
          templateId: template.id,
          field: field.name,
          bindingId: binding.id,
          message: `绑定 ${binding.id} 的 ${field.label} 指向了不存在的卡牌 ${String(rawValue)}`,
        });
      }
    }
  }
}

export function validateTemplateEditorModels(
  models: TemplateEditorModel[],
  context?: { draft?: RawAdminDatasets }
): TemplateValidationIssue[] {
  const issues: TemplateValidationIssue[] = [];
  const ids = new Map<string, number>();
  const triggerValues = new Set(TEMPLATE_TRIGGER_OPTIONS.map(item => item.value));
  const targetValues = new Set(TEMPLATE_TARGET_MODE_OPTIONS.map(item => item.value));

  for (const model of models) {
    const id = model.id.trim();
    if (!id) {
      pushIssue(issues, { templateId: model.id, field: 'id', message: '模板 ID 不能为空' });
    } else {
      ids.set(id, (ids.get(id) ?? 0) + 1);
    }
    if (!model.name.trim()) {
      pushIssue(issues, { templateId: model.id, field: 'name', message: '模板名称不能为空' });
    }
    if (!model.trigger.trim()) {
      pushIssue(issues, { templateId: model.id, field: 'trigger', message: '触发时机不能为空' });
    }
    if (!model.targetMode.trim()) {
      pushIssue(issues, { templateId: model.id, field: 'targetMode', message: '目标模式不能为空' });
    }

    const recipeDefinition = getTemplateRecipe(model.effectKind);
    if (!recipeDefinition) {
      pushIssue(issues, {
        templateId: model.id,
        field: 'effectKind',
        message: `模板 ${model.name || model.id} 使用了未注册的 effectKind: ${model.effectKind}`,
        severity: 'warning',
        blocking: false,
      });
    } else {
      if (!recipeDefinition.allowedScopes.some(scope => model.scope.split('|').filter(Boolean).includes(scope))) {
        pushIssue(issues, {
          templateId: model.id,
          field: 'scope',
          message: `${recipeDefinition.label} 推荐作用于 ${recipeDefinition.allowedScopes.join(' / ')}`,
          severity: 'warning',
          blocking: false,
        });
      }
      if (model.supportsSecondTarget !== String(recipeDefinition.supportsSecondTarget)) {
        pushIssue(issues, {
          templateId: model.id,
          field: 'supportsSecondTarget',
          message: `${recipeDefinition.label} 的双目标配置应为 ${recipeDefinition.supportsSecondTarget ? '开启' : '关闭'}`,
        });
      }
    }

    if (!triggerValues.has(model.trigger.trim())) {
      pushIssue(issues, {
        templateId: model.id,
        field: 'trigger',
        message: `触发时机 ${model.trigger} 不在当前已知范围内`,
        severity: 'warning',
        blocking: false,
      });
    }
    if (!targetValues.has(model.targetMode.trim())) {
      pushIssue(issues, {
        templateId: model.id,
        field: 'targetMode',
        message: `目标模式 ${model.targetMode} 不在当前已知范围内`,
        severity: 'warning',
        blocking: false,
      });
    }
    for (const field of model.paramSchema) {
      if (!field.name.trim()) {
        pushIssue(issues, { templateId: model.id, field: 'paramSchema', message: '参数字段必须填写内部 name' });
      }
      if (!field.label.trim()) {
        pushIssue(issues, { templateId: model.id, field: 'paramSchema', message: '参数字段必须填写显示名称' });
      }
      if (field.type === 'select' && (!field.options || field.options.length === 0)) {
        pushIssue(issues, { templateId: model.id, field: 'paramSchema', message: `参数 ${field.label} 缺少可选项` });
      }
      if (field.type === 'number' && field.defaultValue != null && !Number.isFinite(Number(field.defaultValue))) {
        pushIssue(issues, { templateId: model.id, field: 'paramSchema', message: `参数 ${field.label} 的默认值不是合法数字` });
      }
    }
    for (const operation of model.operations) {
      if (!operation.kind.trim()) {
        pushIssue(issues, { templateId: model.id, field: 'operations', message: '每条 operation 都必须填写 kind' });
      }
      try {
        JSON.parse(operation.filtersJson || '{}');
      } catch {
        pushIssue(issues, { templateId: model.id, field: 'operations', message: `operation ${operation.kind || '未命名'} 的 filtersJson 不是合法 JSON` });
      }
      try {
        JSON.parse(operation.paramsJson || '{}');
      } catch {
        pushIssue(issues, { templateId: model.id, field: 'operations', message: `operation ${operation.kind || '未命名'} 的 paramsJson 不是合法 JSON` });
      }
    }
    validateTemplateVariables(model, issues);
  }

  for (const [id, count] of ids.entries()) {
    if (count > 1) {
      pushIssue(issues, { templateId: id, field: 'id', message: `模板 ID 重复: ${id}` });
    }
  }

  if (context?.draft) {
    validateBindingParams(context.draft, issues);
  }

  return issues;
}
