import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { AdminSelect } from './AdminSelect';
import {
  TEMPLATE_RECIPE_DEFINITIONS,
  TEMPLATE_TARGET_MODE_OPTIONS,
  TEMPLATE_TRIGGER_OPTIONS,
  applyTemplateText,
  buildOperationsFromRecipe,
  buildParamSchemaFromRecipe,
  formatCardTypeLabel,
  getScopeOptions,
  getTemplateRecipe,
  mergeSchemaWithRecipe,
  parseJsonSafe,
  readOperationsSummary,
  renderTemplateSummary,
} from './templateSchema';
import type {
  CardSkillRow,
  RawAdminDatasets,
  SkillTemplateRow,
  TemplateEditorModel,
  TemplateValidationIssue,
} from './types';
import {
  buildTemplateUsageMap,
  createOperationDraft,
  createTemplateEditorModel,
  createEmptyTemplate,
  serializeTemplateEditorModel,
  validateTemplateEditorModels,
} from './templateWorkspaceUtils';

interface TemplateWorkspaceProps {
  draft: RawAdminDatasets;
  canEdit: boolean;
  selectedTemplateId: string;
  onSelectTemplate: (templateId: string) => void;
  onDraftChange: (updater: (current: RawAdminDatasets) => RawAdminDatasets) => void;
  validationIssues: TemplateValidationIssue[];
}

const STEPS = [
  { key: 'recipe', label: '1. 模板类型' },
  { key: 'targeting', label: '2. 触发与目标' },
  { key: 'params', label: '3. 参数配置' },
  { key: 'preview', label: '4. 预览与检查' },
] as const;

function fieldCardStyle(active = false): CSSProperties {
  return {
    borderRadius: 18,
    border: `1px solid ${active ? 'rgba(255,210,133,0.28)' : 'rgba(255,255,255,0.08)'}`,
    background: active ? 'rgba(255,210,133,0.1)' : 'rgba(255,255,255,0.04)',
    padding: 16,
  };
}

function inputStyle(): CSSProperties {
  return {
    width: '100%',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(255,255,255,0.04)',
    color: '#fff8ef',
    padding: '10px 12px',
    boxSizing: 'border-box',
  };
}

function buttonStyle(disabled = false, active = false): CSSProperties {
  return {
    borderRadius: 12,
    border: `1px solid ${active ? 'rgba(255,210,133,0.28)' : 'rgba(255,255,255,0.12)'}`,
    background: disabled ? 'rgba(255,255,255,0.06)' : active ? 'rgba(255,210,133,0.14)' : 'rgba(255,255,255,0.04)',
    color: '#fff8ef',
    padding: '10px 12px',
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

function previewParamsForTemplate(template: SkillTemplateRow, bindings: CardSkillRow[]): Record<string, unknown> {
  if (bindings.length > 0) {
    return parseJsonSafe<Record<string, unknown>>(bindings[0].paramsJson, {});
  }

  const schema = parseJsonSafe<Array<{ name?: string; defaultValue?: unknown }>>(template.paramSchemaJson, []);
  return Object.fromEntries(schema.map(field => [String(field.name ?? ''), field.defaultValue ?? '']));
}

export function collectTemplateValidationIssues(draft: RawAdminDatasets): TemplateValidationIssue[] {
  const models = draft.skillTemplates.map(createTemplateEditorModel);
  return validateTemplateEditorModels(models, { draft });
}

function issueCountForTemplate(validationIssues: TemplateValidationIssue[], templateId: string) {
  return validationIssues.filter(issue => issue.templateId === templateId || issue.templateId === templateId.trim()).length;
}

function blockingIssueCount(validationIssues: TemplateValidationIssue[], templateId: string) {
  return validationIssues.filter(
    issue => (issue.templateId === templateId || issue.templateId === templateId.trim()) && issue.blocking
  ).length;
}

function buildOperationDrafts(effectKind: string) {
  return buildOperationsFromRecipe(effectKind).map((operation, index) => createOperationDraft(operation, index));
}

function applyRecipeToModel(model: TemplateEditorModel, effectKind: string): TemplateEditorModel {
  const recipe = getTemplateRecipe(effectKind);
  if (!recipe) {
    return { ...model, effectKind };
  }

  const nextScopeValues = model.scope
    .split('|')
    .map(item => item.trim())
    .filter(Boolean);
  const scope = nextScopeValues.length > 0 ? model.scope : recipe.allowedScopes.join('|');

  return {
    ...model,
    effectKind,
    trigger: recipe.recommendedTrigger,
    targetMode: recipe.recommendedTargetMode,
    supportsSecondTarget: recipe.supportsSecondTarget ? 'true' : 'false',
    scope,
    paramSchema: mergeSchemaWithRecipe(effectKind, model.paramSchema.length > 0 ? model.paramSchema : buildParamSchemaFromRecipe(effectKind)),
    operations: buildOperationDrafts(effectKind),
    summaryTemplate: model.summaryTemplate.trim() ? model.summaryTemplate : recipe.summaryTemplate,
    descriptionTemplate: model.descriptionTemplate.trim() ? model.descriptionTemplate : recipe.descriptionTemplate,
  };
}

export function TemplateWorkspace(props: TemplateWorkspaceProps) {
  const { draft, canEdit, selectedTemplateId, onSelectTemplate, onDraftChange, validationIssues } = props;
  const [search, setSearch] = useState('');
  const [triggerFilter, setTriggerFilter] = useState('all');
  const [effectFilter, setEffectFilter] = useState('all');
  const [stepIndex, setStepIndex] = useState(0);
  const [advancedMode, setAdvancedMode] = useState(false);

  const usageByTemplate = useMemo(
    () => buildTemplateUsageMap(draft.skillTemplates, draft.cards, draft.cardSkills),
    [draft.skillTemplates, draft.cards, draft.cardSkills]
  );

  const templates = useMemo(() => {
    const query = search.trim().toLowerCase();
    return draft.skillTemplates.filter(template => {
      const matchesQuery =
        !query ||
        `${template.id} ${template.name} ${template.description} ${template.effectKind} ${template.trigger} ${template.scope}`
          .toLowerCase()
          .includes(query);
      const matchesTrigger = triggerFilter === 'all' || template.trigger === triggerFilter;
      const matchesEffect = effectFilter === 'all' || template.effectKind === effectFilter;
      return matchesQuery && matchesTrigger && matchesEffect;
    });
  }, [draft.skillTemplates, effectFilter, search, triggerFilter]);

  const selectedTemplate =
    draft.skillTemplates.find(template => template.id === selectedTemplateId) ?? draft.skillTemplates[0] ?? null;

  useEffect(() => {
    if (!selectedTemplate && draft.skillTemplates[0]) {
      onSelectTemplate(draft.skillTemplates[0].id);
      return;
    }
    if (selectedTemplate && selectedTemplate.id !== selectedTemplateId) {
      onSelectTemplate(selectedTemplate.id);
    }
  }, [draft.skillTemplates, onSelectTemplate, selectedTemplate, selectedTemplateId]);

  useEffect(() => {
    setStepIndex(0);
  }, [selectedTemplateId]);

  const selectedModel = useMemo(
    () => (selectedTemplate ? createTemplateEditorModel(selectedTemplate) : null),
    [selectedTemplate]
  );
  const selectedRecipe = selectedModel ? getTemplateRecipe(selectedModel.effectKind) : undefined;
  const selectedUsage = selectedTemplate ? usageByTemplate[selectedTemplate.id] ?? [] : [];
  const templateIssues = selectedTemplate
    ? validationIssues.filter(issue => issue.templateId === selectedTemplate.id || issue.templateId === selectedTemplate.id.trim())
    : [];

  const triggerOptions = Array.from(
    new Set([...TEMPLATE_TRIGGER_OPTIONS.map(option => option.value), ...draft.skillTemplates.map(template => template.trigger)])
  ).sort();
  const effectOptions = Array.from(
    new Set([...draft.skillTemplates.map(template => template.effectKind), ...TEMPLATE_RECIPE_DEFINITIONS.map(template => template.effectKind)])
  ).sort();
  const targetModeOptions = Array.from(
    new Set([...TEMPLATE_TARGET_MODE_OPTIONS.map(option => option.value), ...draft.skillTemplates.map(template => template.targetMode)])
  ).sort();
  const scopeOptions = getScopeOptions(draft.cards);

  function commitModel(nextModel: TemplateEditorModel) {
    const serialized = serializeTemplateEditorModel(nextModel);
    onDraftChange(current => ({
      ...current,
      skillTemplates: current.skillTemplates.map(template => (template.id === selectedTemplateId ? serialized : template)),
    }));
    onSelectTemplate(serialized.id);
  }

  function updateField(field: keyof TemplateEditorModel, value: string) {
    if (!selectedModel || !canEdit) return;
    commitModel({ ...selectedModel, [field]: value });
  }

  function toggleScope(scope: string) {
    if (!selectedModel || !canEdit) return;
    const currentScopes = new Set(selectedModel.scope.split('|').map(item => item.trim()).filter(Boolean));
    if (currentScopes.has(scope)) {
      currentScopes.delete(scope);
    } else {
      currentScopes.add(scope);
    }
    commitModel({ ...selectedModel, scope: Array.from(currentScopes).join('|') });
  }

  function updateRecipeParam(index: number, field: 'label' | 'defaultValue', value: string) {
    if (!selectedModel || !canEdit) return;
    const next = [...selectedModel.paramSchema];
    const current = { ...next[index] };
    if (field === 'defaultValue') {
      current.defaultValue = current.type === 'number' ? Number(value || 0) : value;
    } else {
      current.label = value;
    }
    next[index] = current;
    commitModel({ ...selectedModel, paramSchema: next });
  }

  function updateOperation(index: number, field: 'kind' | 'selector' | 'filtersJson' | 'paramsJson', value: string) {
    if (!selectedModel || !canEdit) return;
    const next = [...selectedModel.operations];
    next[index] = { ...next[index], [field]: value };
    commitModel({ ...selectedModel, operations: next });
  }

  function addOperation() {
    if (!selectedModel || !canEdit) return;
    commitModel({
      ...selectedModel,
      operations: [...selectedModel.operations, createOperationDraft({ kind: '', selector: 'self', filters: {}, params: {} }, selectedModel.operations.length)],
    });
  }

  function removeOperation(index: number) {
    if (!selectedModel || !canEdit) return;
    commitModel({
      ...selectedModel,
      operations: selectedModel.operations.filter((_item, itemIndex) => itemIndex !== index),
    });
  }

  function addTemplate() {
    if (!canEdit) return;
    const next = createEmptyTemplate(draft.skillTemplates.length);
    onDraftChange(current => ({
      ...current,
      skillTemplates: [...current.skillTemplates, next],
    }));
    onSelectTemplate(next.id);
  }

  function deleteTemplate() {
    if (!canEdit || !selectedTemplate) return;
    onDraftChange(current => {
      const nextTemplates = current.skillTemplates.filter(template => template.id !== selectedTemplate.id);
      const fallbackId = nextTemplates[0]?.id ?? '';
      onSelectTemplate(fallbackId);
      return {
        ...current,
        skillTemplates: nextTemplates,
        cardSkills: current.cardSkills.filter(binding => binding.templateId !== selectedTemplate.id),
      };
    });
  }

  function resetRecipeDefaults() {
    if (!selectedModel || !canEdit) return;
    commitModel(applyRecipeToModel(selectedModel, selectedModel.effectKind));
  }

  function insertToken(field: 'summaryTemplate' | 'descriptionTemplate', token: string) {
    if (!selectedModel || !canEdit) return;
    const current = selectedModel[field];
    const nextValue = current.includes(`{${token}}`) ? current : `${current}${current ? ' ' : ''}{${token}}`;
    commitModel({ ...selectedModel, [field]: nextValue });
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '320px minmax(560px, 1fr) 380px',
        minHeight: '100%',
      }}
    >
      <section style={{ padding: 20, borderRight: '1px solid rgba(255,255,255,0.08)', overflow: 'auto' }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>模板工作台</div>
              <div style={{ fontSize: 13, opacity: 0.68 }}>用受控 recipe 生成模板，不再直接暴露底层 DSL。</div>
            </div>
            <button type="button" onClick={addTemplate} disabled={!canEdit} style={buttonStyle(!canEdit)}>
              新建模板
            </button>
          </div>

          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="搜索模板 ID / 名称 / effectKind"
            style={inputStyle()}
          />

          <AdminSelect
            value={triggerFilter}
            onChange={setTriggerFilter}
            options={[
              { value: 'all', label: '全部触发时机' },
              ...triggerOptions.map(option => {
                const builtin = TEMPLATE_TRIGGER_OPTIONS.find(item => item.value === option);
                return builtin ?? { value: option, label: option };
              }),
            ]}
          />

          <AdminSelect
            value={effectFilter}
            onChange={setEffectFilter}
            options={[
              { value: 'all', label: '全部效果 recipe' },
              ...effectOptions.map(option => {
                const recipe = getTemplateRecipe(option);
                return { value: option, label: recipe ? `${recipe.label} · ${option}` : option };
              }),
            ]}
          />

          <div style={{ display: 'grid', gap: 10 }}>
            {templates.map(template => {
              const active = selectedTemplate?.id === template.id;
              const count = usageByTemplate[template.id]?.length ?? 0;
              const allIssueCount = issueCountForTemplate(validationIssues, template.id);
              const blockingCount = blockingIssueCount(validationIssues, template.id);
              const recipe = getTemplateRecipe(template.effectKind);
              return (
                <button
                  type="button"
                  key={template.id}
                  onClick={() => onSelectTemplate(template.id)}
                  style={{ ...fieldCardStyle(active), textAlign: 'left', color: '#fff8ef', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ fontWeight: 700 }}>{template.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.72 }}>{count} 引用</div>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.62, marginTop: 4 }}>{template.id}</div>
                  <div style={{ fontSize: 12, opacity: 0.72, marginTop: 10 }}>
                    {recipe?.label ?? template.effectKind} / {template.trigger} / {template.targetMode}
                  </div>
                  {allIssueCount > 0 ? (
                    <div style={{ fontSize: 12, color: blockingCount > 0 ? '#ffb4b4' : '#ffd7a8', marginTop: 8 }}>
                      {blockingCount > 0 ? `阻断问题 ${blockingCount} 条` : '仅有警告'}，共 {allIssueCount} 条
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: '#d3f9c6', marginTop: 8 }}>结构与绑定校验通过</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section style={{ padding: 24, overflow: 'auto' }}>
        {selectedModel ? (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{selectedModel.name || '未命名模板'}</div>
                <div style={{ fontSize: 13, opacity: 0.68 }}>
                  {selectedRecipe?.label ?? '未注册 recipe'} · {selectedModel.id || '请填写模板 ID'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={resetRecipeDefaults} disabled={!canEdit} style={buttonStyle(!canEdit)}>
                  套用默认链
                </button>
                <button type="button" onClick={() => setAdvancedMode(current => !current)} style={buttonStyle(false, advancedMode)}>
                  {advancedMode ? '退出高级模式' : '高级模式'}
                </button>
                <button type="button" onClick={deleteTemplate} disabled={!canEdit} style={buttonStyle(!canEdit)}>
                  删除模板
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {STEPS.map((step, index) => (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => setStepIndex(index)}
                  style={buttonStyle(false, stepIndex === index)}
                >
                  {step.label}
                </button>
              ))}
            </div>

            {stepIndex === 0 ? (
              <div style={{ display: 'grid', gap: 16 }}>
                <div style={fieldCardStyle()}>
                  <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>先选效果模板</div>
                  <div style={{ fontSize: 13, opacity: 0.72, marginBottom: 12 }}>
                    这里选择的是业务意图，不是底层 operation。系统会自动生成参数 schema 和推荐执行链。
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                    {TEMPLATE_RECIPE_DEFINITIONS.map(recipe => {
                      const active = selectedModel.effectKind === recipe.effectKind;
                      return (
                        <button
                          key={recipe.effectKind}
                          type="button"
                          disabled={!canEdit}
                          onClick={() => commitModel(applyRecipeToModel(selectedModel, recipe.effectKind))}
                          style={{
                            ...fieldCardStyle(active),
                            textAlign: 'left',
                            color: '#fff8ef',
                            cursor: canEdit ? 'pointer' : 'not-allowed',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                            <div style={{ fontWeight: 700 }}>{recipe.label}</div>
                            <div style={{ fontSize: 12, opacity: 0.62 }}>{recipe.category}</div>
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.72, marginTop: 8 }}>{recipe.description}</div>
                          <div style={{ fontSize: 12, opacity: 0.64, marginTop: 10 }}>
                            推荐：{recipe.recommendedTrigger} / {recipe.recommendedTargetMode}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={fieldCardStyle()}>
                  <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>模板基础信息</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <input value={selectedModel.id} disabled={!canEdit} onChange={event => updateField('id', event.target.value)} placeholder="模板 ID" style={inputStyle()} />
                    <input value={selectedModel.name} disabled={!canEdit} onChange={event => updateField('name', event.target.value)} placeholder="模板名称" style={inputStyle()} />
                  </div>
                  <textarea
                    value={selectedModel.description}
                    disabled={!canEdit}
                    onChange={event => updateField('description', event.target.value)}
                    placeholder="给配置同学看的模板说明"
                    rows={3}
                    style={{ ...inputStyle(), marginTop: 12, resize: 'vertical' }}
                  />
                </div>
              </div>
            ) : null}

            {stepIndex === 1 ? (
              <div style={{ display: 'grid', gap: 16 }}>
                <div style={fieldCardStyle()}>
                  <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>触发与目标</div>
                  <div style={{ fontSize: 13, opacity: 0.72, marginBottom: 12 }}>
                    普通模式下优先遵循 recipe 推荐；高级模式才建议偏离推荐值。
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <AdminSelect
                      value={selectedModel.trigger}
                      disabled={!canEdit}
                      onChange={value => updateField('trigger', value)}
                      options={TEMPLATE_TRIGGER_OPTIONS}
                    />
                    <AdminSelect
                      value={selectedModel.targetMode}
                      disabled={!canEdit}
                      onChange={value => {
                        updateField('targetMode', value);
                        const selectedTarget = TEMPLATE_TARGET_MODE_OPTIONS.find(option => option.value === value);
                        if (selectedTarget?.supportsSecondTarget != null && selectedModel.supportsSecondTarget !== String(selectedTarget.supportsSecondTarget)) {
                          commitModel({ ...selectedModel, targetMode: value, supportsSecondTarget: selectedTarget.supportsSecondTarget ? 'true' : 'false' });
                        }
                      }}
                      options={targetModeOptions.map(option => {
                        const builtin = TEMPLATE_TARGET_MODE_OPTIONS.find(item => item.value === option);
                        return builtin ?? { value: option, label: option, description: option };
                      })}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, marginTop: 12 }}>
                    <div style={{ ...fieldCardStyle(false), padding: 12 }}>
                      <div style={{ fontSize: 13, opacity: 0.68 }}>双目标需求</div>
                      <div style={{ marginTop: 6, fontWeight: 700 }}>
                        {selectedModel.supportsSecondTarget === 'true' ? '需要第二目标' : '单目标或无目标'}
                      </div>
                    </div>
                    <button type="button" onClick={resetRecipeDefaults} disabled={!canEdit} style={buttonStyle(!canEdit)}>
                      重置为推荐配置
                    </button>
                  </div>
                </div>

                <div style={fieldCardStyle()}>
                  <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>可绑定的卡牌类型</div>
                  <div style={{ fontSize: 13, opacity: 0.72, marginBottom: 12 }}>
                    不再手输 `|` 分隔字符串，直接点选允许使用这个模板的卡牌类型。
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {scopeOptions.map(option => {
                      const selected = selectedModel.scope.split('|').map(item => item.trim()).filter(Boolean).includes(option.value);
                      return (
                        <button
                          key={option.value}
                          type="button"
                          disabled={!canEdit}
                          onClick={() => toggleScope(option.value)}
                          style={{
                            borderRadius: 999,
                            border: '1px solid rgba(255,255,255,0.12)',
                            background: selected ? 'rgba(255,210,133,0.18)' : 'rgba(255,255,255,0.04)',
                            color: '#fff8ef',
                            padding: '8px 12px',
                            cursor: canEdit ? 'pointer' : 'not-allowed',
                            fontSize: 13,
                          }}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}

            {stepIndex === 2 ? (
              <div style={{ display: 'grid', gap: 16 }}>
                <div style={fieldCardStyle()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>参数配置</div>
                      <div style={{ fontSize: 13, opacity: 0.72 }}>
                        已按 recipe 固定内部参数名，普通模式只改显示文案和默认值。
                      </div>
                    </div>
                    <button type="button" onClick={resetRecipeDefaults} disabled={!canEdit} style={buttonStyle(!canEdit)}>
                      同步 recipe
                    </button>
                  </div>

                  <div style={{ display: 'grid', gap: 10 }}>
                    {selectedModel.paramSchema.map((field, index) => {
                      const recipeField = selectedRecipe?.paramDefs.find(item => item.name === field.name);
                      return (
                        <div key={`${field.name}_${index}`} style={{ ...fieldCardStyle(), padding: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 8 }}>
                            <div style={{ fontWeight: 700 }}>{field.label}</div>
                            <div style={{ fontSize: 12, opacity: 0.62 }}>参数名 `{field.name}`</div>
                          </div>
                          {recipeField?.description ? (
                            <div style={{ fontSize: 13, opacity: 0.72, marginBottom: 10 }}>{recipeField.description}</div>
                          ) : null}
                          <div style={{ display: 'grid', gridTemplateColumns: advancedMode ? '1fr 1fr' : '1fr', gap: 8 }}>
                            <label>
                              <div style={{ fontSize: 12, opacity: 0.68, marginBottom: 6 }}>显示名称</div>
                              <input
                                value={field.label}
                                disabled={!canEdit}
                                onChange={event => updateRecipeParam(index, 'label', event.target.value)}
                                style={inputStyle()}
                              />
                            </label>
                            {advancedMode ? (
                              <div style={{ ...fieldCardStyle(), padding: 12 }}>
                                <div style={{ fontSize: 12, opacity: 0.68 }}>内部类型与选项</div>
                                <div style={{ marginTop: 6 }}>{field.type}</div>
                                {field.options?.length ? (
                                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.76 }}>{field.options.join(' / ')}</div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                          <label style={{ display: 'block', marginTop: 8 }}>
                            <div style={{ fontSize: 12, opacity: 0.68, marginBottom: 6 }}>默认值</div>
                            <input
                              value={field.defaultValue == null ? '' : String(field.defaultValue)}
                              disabled={!canEdit}
                              onChange={event => updateRecipeParam(index, 'defaultValue', event.target.value)}
                              style={inputStyle()}
                            />
                          </label>
                        </div>
                      );
                    })}
                    {selectedModel.paramSchema.length === 0 ? <div style={{ opacity: 0.68 }}>当前模板没有业务参数。</div> : null}
                  </div>
                </div>

                {advancedMode ? (
                  <div style={fieldCardStyle()}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>高级模式: Operation</div>
                        <div style={{ fontSize: 13, opacity: 0.72 }}>这里只给开发排查或做极少数高级覆写用。</div>
                      </div>
                      <button type="button" onClick={addOperation} disabled={!canEdit} style={buttonStyle(!canEdit)}>
                        新增 Operation
                      </button>
                    </div>
                    <div style={{ display: 'grid', gap: 12 }}>
                      {selectedModel.operations.map((operation, index) => (
                        <div key={operation.id} style={{ ...fieldCardStyle(), padding: 12 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px auto', gap: 8, alignItems: 'center' }}>
                            <input value={operation.kind} disabled={!canEdit} onChange={event => updateOperation(index, 'kind', event.target.value)} placeholder="kind" style={inputStyle()} />
                            <input value={operation.selector} disabled={!canEdit} onChange={event => updateOperation(index, 'selector', event.target.value)} placeholder="selector" style={inputStyle()} />
                            <button type="button" onClick={() => removeOperation(index)} disabled={!canEdit} style={buttonStyle(!canEdit)}>
                              删除
                            </button>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                            <textarea
                              value={operation.filtersJson}
                              disabled={!canEdit}
                              onChange={event => updateOperation(index, 'filtersJson', event.target.value)}
                              rows={7}
                              style={{ ...inputStyle(), resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                            />
                            <textarea
                              value={operation.paramsJson}
                              disabled={!canEdit}
                              onChange={event => updateOperation(index, 'paramsJson', event.target.value)}
                              rows={7}
                              style={{ ...inputStyle(), resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {stepIndex === 3 ? (
              <div style={{ display: 'grid', gap: 16 }}>
                <div style={fieldCardStyle()}>
                  <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>玩家可见文案</div>
                  <div style={{ fontSize: 13, opacity: 0.72, marginBottom: 12 }}>
                    点击变量 token 自动插入，不再手写容易出错的占位符。
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    {selectedModel.paramSchema.map(field => (
                      <button key={field.name} type="button" onClick={() => insertToken('summaryTemplate', field.name)} disabled={!canEdit} style={buttonStyle(!canEdit)}>
                        + {field.name}
                      </button>
                    ))}
                  </div>
                  <input
                    value={selectedModel.summaryTemplate}
                    disabled={!canEdit}
                    onChange={event => updateField('summaryTemplate', event.target.value)}
                    placeholder="summaryTemplate"
                    style={inputStyle()}
                  />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 12 }}>
                    {selectedModel.paramSchema.map(field => (
                      <button key={`${field.name}_desc`} type="button" onClick={() => insertToken('descriptionTemplate', field.name)} disabled={!canEdit} style={buttonStyle(!canEdit)}>
                        + {field.name}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={selectedModel.descriptionTemplate}
                    disabled={!canEdit}
                    onChange={event => updateField('descriptionTemplate', event.target.value)}
                    placeholder="descriptionTemplate"
                    rows={4}
                    style={{ ...inputStyle(), resize: 'vertical' }}
                  />
                </div>

                <div style={fieldCardStyle()}>
                  <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>当前预览</div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {(() => {
                      const params = selectedTemplate ? previewParamsForTemplate(selectedTemplate, selectedUsage.map(item => item.binding)) : {};
                      return (
                        <>
                          <div style={{ fontSize: 13, opacity: 0.68 }}>示例参数</div>
                          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12, opacity: 0.8 }}>{JSON.stringify(params, null, 2)}</pre>
                          <div style={{ fontSize: 13, opacity: 0.68 }}>玩家摘要</div>
                          <div>{applyTemplateText(selectedModel.summaryTemplate || selectedModel.name, params)}</div>
                          <div style={{ fontSize: 13, opacity: 0.68 }}>详细描述</div>
                          <div>{applyTemplateText(selectedModel.descriptionTemplate || selectedModel.description || selectedModel.name, params)}</div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div style={{ display: 'grid', placeItems: 'center', minHeight: '100%' }}>请选择一个模板。</div>
        )}
      </section>

      <section style={{ padding: 24, borderLeft: '1px solid rgba(255,255,255,0.08)', overflow: 'auto' }}>
        {selectedTemplate ? (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={fieldCardStyle()}>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>模板摘要</div>
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 13, opacity: 0.68 }}>Effect Recipe</div>
                <div>{selectedRecipe?.label ?? selectedTemplate.effectKind}</div>
                <div style={{ fontSize: 13, opacity: 0.68 }}>推荐执行链</div>
                <div>{readOperationsSummary(selectedTemplate).join(' -> ') || '当前没有 operation'}</div>
                <div style={{ fontSize: 13, opacity: 0.68 }}>可绑定类型</div>
                <div>
                  {selectedTemplate.scope
                    .split('|')
                    .filter(Boolean)
                    .map(formatCardTypeLabel)
                    .join(' / ') || '全部类型'}
                </div>
              </div>
            </div>

            <div style={fieldCardStyle()}>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>引用影响面</div>
              <div style={{ fontSize: 13, opacity: 0.72, marginBottom: 10 }}>当前模板被 {selectedUsage.length} 个卡牌绑定使用。</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {selectedUsage.map(({ binding, card }) => {
                  const params = parseJsonSafe<Record<string, unknown>>(binding.paramsJson, {});
                  return (
                    <div key={binding.id} style={{ ...fieldCardStyle(), padding: 12 }}>
                      <div style={{ fontWeight: 700 }}>{card?.name ?? binding.cardId}</div>
                      <div style={{ fontSize: 12, opacity: 0.62, marginTop: 4 }}>
                        {binding.cardId} / sortOrder {binding.sortOrder}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.76, marginTop: 8 }}>{renderTemplateSummary(selectedTemplate, params)}</div>
                    </div>
                  );
                })}
                {selectedUsage.length === 0 ? <div style={{ opacity: 0.68 }}>当前没有卡牌引用这个模板。</div> : null}
              </div>
            </div>

            <div style={fieldCardStyle(templateIssues.some(issue => issue.blocking))}>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>校验结果</div>
              {templateIssues.length > 0 ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {templateIssues.map((issue, index) => (
                    <div key={`${issue.field}_${index}`} style={{ color: issue.blocking ? '#ffcece' : '#ffd7a8' }}>
                      {issue.blocking ? '阻断' : '警告'} · {issue.message}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#d3f9c6' }}>当前模板和绑定前端校验通过。</div>
              )}
            </div>

            {advancedMode ? (
              <div style={fieldCardStyle()}>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>高级模式 JSON 预览</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 13, opacity: 0.68 }}>paramSchemaJson</div>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12 }}>{selectedTemplate.paramSchemaJson}</pre>
                  <div style={{ fontSize: 13, opacity: 0.68 }}>operationsJson</div>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12 }}>{selectedTemplate.operationsJson}</pre>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
