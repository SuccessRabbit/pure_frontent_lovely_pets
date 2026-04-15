import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { AdminSelect } from './AdminSelect';
import type {
  CardSkillRow,
  RawAdminDatasets,
  SkillTemplateRow,
  TemplateEditorModel,
  TemplateValidationIssue,
} from './types';
import {
  applyTemplatePreview,
  buildTemplateUsageMap,
  createEmptyTemplate,
  createOperationDraft,
  createTemplateEditorModel,
  defaultOperationsForEffectKind,
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

function parseJsonSafe<T>(value: string, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

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

const BUILTIN_TRIGGER_OPTIONS = [
  {
    value: 'on_play',
    label: '打出时触发',
    description: '当卡牌被打出并开始结算时触发，适用于大多数行动牌效果。',
  },
  {
    value: 'turn_start',
    label: '回合开始时',
    description: '进入新回合准备阶段后触发，通常用于开局抽牌或回合开始增益。',
  },
  {
    value: 'turn_end',
    label: '回合结束时',
    description: '结算阶段末尾触发，常用于逐单位结算压力、回合末附加效果。',
  },
  {
    value: 'income_calc',
    label: '收益计算时',
    description: '收入阶段计算收益时触发，常用于收益倍率、收益增减或利息规则修正。',
  },
  {
    value: 'before_stress_apply',
    label: '压力施加前',
    description: '即将对单位施加压力前触发，可用于免疫、抵消或改写压力来源。',
  },
  {
    value: 'before_meltdown',
    label: '拆家前',
    description: '单位即将触发 meltdown 前触发，可用于阻止拆家或修改拆家半径。',
  },
  {
    value: 'after_meltdown',
    label: '拆家后',
    description: 'meltdown 结算完成后触发，常用于补偿、掉落或后续惩罚效果。',
  },
  {
    value: 'passive',
    label: '被动说明',
    description: '仅作为被动说明或静态标签使用，通常不直接驱动运行时触发。',
  },
];

const TARGET_MODE_LABELS: Record<string, string> = {
  adjacent_pets: '相邻萌宠',
  adjacent_workers: '相邻牛马',
  none: '无目标',
  pet: '萌宠目标',
  self: '自身',
  swap: '交换双目标',
  worker: '牛马目标',
};

const EFFECT_KIND_LABELS: Record<string, string> = {
  adjust_stress_all: '群体调整压力',
  draw_cards: '抽牌',
  income_multiplier_turn: '本回合收益倍率',
  passive_summary: '被动说明',
  queue_card_next_turn: '下回合塞牌',
  return_pet_to_hand: '回收萌宠',
  sacrifice_worker_reduce_adjacent_pet_stress: '献祭牛马并降低相邻萌宠压力',
  set_stress_value: '设置压力值',
  swap_positions: '交换位置',
};

const PARAM_TYPE_OPTIONS = [
  { value: 'text', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'select', label: '枚举' },
];

function formatValueOption(value: string, labels: Record<string, string>) {
  return {
    value,
    label: labels[value] ? `${labels[value]} · ${value}` : value,
  };
}

function buttonStyle(disabled = false): CSSProperties {
  return {
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.12)',
    background: disabled ? 'rgba(255,255,255,0.06)' : 'rgba(255,210,133,0.12)',
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
  return validateTemplateEditorModels(models);
}

export function TemplateWorkspace(props: TemplateWorkspaceProps) {
  const { draft, canEdit, selectedTemplateId, onSelectTemplate, onDraftChange, validationIssues } = props;
  const [search, setSearch] = useState('');
  const [triggerFilter, setTriggerFilter] = useState('all');
  const [effectFilter, setEffectFilter] = useState('all');

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
  }, [draft.skillTemplates, search, triggerFilter, effectFilter]);

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

  const selectedModel = useMemo(
    () => (selectedTemplate ? createTemplateEditorModel(selectedTemplate) : null),
    [selectedTemplate]
  );

  const selectedUsage = selectedTemplate ? usageByTemplate[selectedTemplate.id] ?? [] : [];
  const templateIssues = selectedTemplate
    ? validationIssues.filter(issue => issue.templateId === selectedTemplate.id || issue.templateId === selectedTemplate.id.trim())
    : [];

  const triggerOptions = Array.from(
    new Set([...BUILTIN_TRIGGER_OPTIONS.map(option => option.value), ...draft.skillTemplates.map(template => template.trigger)])
  ).sort();
  const effectOptions = Array.from(new Set(draft.skillTemplates.map(template => template.effectKind))).sort();
  const targetModeOptions = Array.from(new Set(draft.skillTemplates.map(template => template.targetMode))).sort();

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

  function updateParamField(
    index: number,
    field: 'name' | 'label' | 'type' | 'defaultValue' | 'options',
    value: string
  ) {
    if (!selectedModel || !canEdit) return;
    const next = [...selectedModel.paramSchema];
    const current = { ...next[index] };
    if (field === 'options') {
      current.options = value
        .split('|')
        .map(item => item.trim())
        .filter(Boolean);
    } else if (field === 'defaultValue') {
      current.defaultValue = current.type === 'number' ? Number(value || 0) : value;
    } else {
      current[field] = value as never;
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

  function addParamField() {
    if (!selectedModel || !canEdit) return;
    commitModel({
      ...selectedModel,
      paramSchema: [
        ...selectedModel.paramSchema,
        {
          name: `param_${selectedModel.paramSchema.length + 1}`,
          label: '新参数',
          type: 'text',
          defaultValue: '',
        },
      ],
    });
  }

  function removeParamField(index: number) {
    if (!selectedModel || !canEdit) return;
    commitModel({
      ...selectedModel,
      paramSchema: selectedModel.paramSchema.filter((_item, itemIndex) => itemIndex !== index),
    });
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

  function moveOperation(index: number, direction: -1 | 1) {
    if (!selectedModel || !canEdit) return;
    const target = index + direction;
    if (target < 0 || target >= selectedModel.operations.length) return;
    const next = [...selectedModel.operations];
    const [current] = next.splice(index, 1);
    next.splice(target, 0, current);
    commitModel({ ...selectedModel, operations: next });
  }

  function resetOperationsFromEffectKind() {
    if (!selectedModel || !canEdit) return;
    const defaults = defaultOperationsForEffectKind(selectedModel.effectKind).map((operation, index) =>
      createOperationDraft(operation, index)
    );
    commitModel({ ...selectedModel, operations: defaults });
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '320px minmax(520px, 1fr) 360px',
        minHeight: '100%',
      }}
    >
      <section style={{ padding: 20, borderRight: '1px solid rgba(255,255,255,0.08)', overflow: 'auto' }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>模板工作台</div>
              <div style={{ fontSize: 13, opacity: 0.68 }}>管理 `skillTemplates` 的结构化编排。</div>
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
              { value: 'all', label: '全部 trigger' },
              ...triggerOptions.map(option => {
                const builtin = BUILTIN_TRIGGER_OPTIONS.find(item => item.value === option);
                return builtin ?? { value: option, label: option };
              }),
            ]}
          />

          <AdminSelect
            value={effectFilter}
            onChange={setEffectFilter}
            options={[
              { value: 'all', label: '全部 effectKind' },
              ...effectOptions.map(option => formatValueOption(option, EFFECT_KIND_LABELS)),
            ]}
          />

          <div style={{ display: 'grid', gap: 10 }}>
            {templates.map(template => {
              const active = selectedTemplate?.id === template.id;
              const count = usageByTemplate[template.id]?.length ?? 0;
              const issueCount = validationIssues.filter(issue => issue.templateId === template.id || issue.templateId === template.id.trim()).length;
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
                    {template.trigger} / {template.targetMode} / {template.effectKind}
                  </div>
                  {issueCount > 0 ? (
                    <div style={{ fontSize: 12, color: '#ffb4b4', marginTop: 8 }}>校验问题 {issueCount} 条</div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section style={{ padding: 24, overflow: 'auto' }}>
        {selectedModel ? (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={fieldCardStyle()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{selectedModel.name || '未命名模板'}</div>
                  <div style={{ fontSize: 13, opacity: 0.68 }}>{selectedModel.id || '请填写模板 ID'}</div>
                </div>
                <button type="button" onClick={deleteTemplate} disabled={!canEdit} style={buttonStyle(!canEdit)}>
                  删除模板
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <input value={selectedModel.id} disabled={!canEdit} onChange={event => updateField('id', event.target.value)} placeholder="模板 ID" style={inputStyle()} />
                <input value={selectedModel.name} disabled={!canEdit} onChange={event => updateField('name', event.target.value)} placeholder="模板名称" style={inputStyle()} />
                <AdminSelect
                  value={selectedModel.trigger}
                  disabled={!canEdit}
                  onChange={value => updateField('trigger', value)}
                  options={BUILTIN_TRIGGER_OPTIONS}
                />
                <AdminSelect
                  value={selectedModel.targetMode}
                  disabled={!canEdit}
                  onChange={value => updateField('targetMode', value)}
                  options={targetModeOptions.map(option => formatValueOption(option, TARGET_MODE_LABELS))}
                />
                <AdminSelect
                  value={selectedModel.effectKind}
                  disabled={!canEdit}
                  onChange={value => updateField('effectKind', value)}
                  options={effectOptions.map(option => formatValueOption(option, EFFECT_KIND_LABELS))}
                />
                <AdminSelect
                  value={selectedModel.supportsSecondTarget}
                  disabled={!canEdit}
                  onChange={value => updateField('supportsSecondTarget', value)}
                  options={[
                    { value: 'false', label: '单目标' },
                    { value: 'true', label: '双目标' },
                  ]}
                />
              </div>

              <textarea
                value={selectedModel.description}
                disabled={!canEdit}
                onChange={event => updateField('description', event.target.value)}
                placeholder="模板描述"
                rows={3}
                style={{ ...inputStyle(), marginTop: 12, resize: 'vertical' }}
              />
              <input
                value={selectedModel.scope}
                disabled={!canEdit}
                onChange={event => updateField('scope', event.target.value)}
                placeholder="scope，多个类型用 | 分隔"
                style={{ ...inputStyle(), marginTop: 12 }}
              />
            </div>

            <div style={fieldCardStyle()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>参数 Schema</div>
                <button type="button" onClick={addParamField} disabled={!canEdit} style={buttonStyle(!canEdit)}>
                  新增参数
                </button>
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                {selectedModel.paramSchema.map((field, index) => (
                  <div key={`${field.name}_${index}`} style={{ ...fieldCardStyle(), padding: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 140px auto', gap: 8 }}>
                      <input value={field.name} disabled={!canEdit} onChange={event => updateParamField(index, 'name', event.target.value)} placeholder="name" style={inputStyle()} />
                      <input value={field.label} disabled={!canEdit} onChange={event => updateParamField(index, 'label', event.target.value)} placeholder="label" style={inputStyle()} />
                      <AdminSelect
                        value={field.type}
                        disabled={!canEdit}
                        onChange={value => updateParamField(index, 'type', value)}
                        options={PARAM_TYPE_OPTIONS}
                      />
                      <button type="button" onClick={() => removeParamField(index)} disabled={!canEdit} style={buttonStyle(!canEdit)}>
                        删除
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                      <input
                        value={field.defaultValue == null ? '' : String(field.defaultValue)}
                        disabled={!canEdit}
                        onChange={event => updateParamField(index, 'defaultValue', event.target.value)}
                        placeholder="defaultValue"
                        style={inputStyle()}
                      />
                      <input
                        value={field.options?.join('|') ?? ''}
                        disabled={!canEdit}
                        onChange={event => updateParamField(index, 'options', event.target.value)}
                        placeholder="options，多个用 | 分隔"
                        style={inputStyle()}
                      />
                    </div>
                  </div>
                ))}
                {selectedModel.paramSchema.length === 0 ? <div style={{ opacity: 0.68 }}>当前模板未定义参数。</div> : null}
              </div>
            </div>

            <div style={fieldCardStyle()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>Operations 编排器</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={resetOperationsFromEffectKind} disabled={!canEdit} style={buttonStyle(!canEdit)}>
                    套用默认链
                  </button>
                  <button type="button" onClick={addOperation} disabled={!canEdit} style={buttonStyle(!canEdit)}>
                    新增 Operation
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                {selectedModel.operations.map((operation, index) => (
                  <div key={operation.id} style={{ ...fieldCardStyle(), padding: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px auto auto auto', gap: 8, alignItems: 'center' }}>
                      <input value={operation.kind} disabled={!canEdit} onChange={event => updateOperation(index, 'kind', event.target.value)} placeholder="kind" style={inputStyle()} />
                      <input value={operation.selector} disabled={!canEdit} onChange={event => updateOperation(index, 'selector', event.target.value)} placeholder="selector" style={inputStyle()} />
                      <button type="button" onClick={() => moveOperation(index, -1)} disabled={!canEdit || index === 0} style={buttonStyle(!canEdit || index === 0)}>
                        上移
                      </button>
                      <button
                        type="button"
                        onClick={() => moveOperation(index, 1)}
                        disabled={!canEdit || index === selectedModel.operations.length - 1}
                        style={buttonStyle(!canEdit || index === selectedModel.operations.length - 1)}
                      >
                        下移
                      </button>
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
                {selectedModel.operations.length === 0 ? <div style={{ opacity: 0.68 }}>当前模板还没有 operation。</div> : null}
              </div>
            </div>

            <div style={fieldCardStyle()}>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>模板文案预览</div>
              <div style={{ display: 'grid', gap: 8 }}>
                <input
                  value={selectedModel.summaryTemplate}
                  disabled={!canEdit}
                  onChange={event => updateField('summaryTemplate', event.target.value)}
                  placeholder="summaryTemplate"
                  style={inputStyle()}
                />
                <textarea
                  value={selectedModel.descriptionTemplate}
                  disabled={!canEdit}
                  onChange={event => updateField('descriptionTemplate', event.target.value)}
                  placeholder="descriptionTemplate"
                  rows={4}
                  style={{ ...inputStyle(), resize: 'vertical' }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', placeItems: 'center', minHeight: '100%' }}>请选择一个模板。</div>
        )}
      </section>

      <section style={{ padding: 24, borderLeft: '1px solid rgba(255,255,255,0.08)', overflow: 'auto' }}>
        {selectedTemplate ? (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={fieldCardStyle()}>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>摘要与描述预览</div>
              {(() => {
                const params = previewParamsForTemplate(selectedTemplate, selectedUsage.map(item => item.binding));
                const preview = applyTemplatePreview(selectedTemplate, params);
                return (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ fontSize: 13, opacity: 0.68 }}>示例参数</div>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12, opacity: 0.8 }}>{JSON.stringify(params, null, 2)}</pre>
                    <div style={{ fontSize: 13, opacity: 0.68 }}>Summary</div>
                    <div>{preview.summary || '未配置 summaryTemplate'}</div>
                    <div style={{ fontSize: 13, opacity: 0.68 }}>Description</div>
                    <div>{preview.description || '未配置 descriptionTemplate'}</div>
                  </div>
                );
              })()}
            </div>

            <div style={fieldCardStyle()}>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>引用影响面</div>
              <div style={{ fontSize: 13, opacity: 0.72, marginBottom: 10 }}>当前模板被 {selectedUsage.length} 个卡牌绑定使用。</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {selectedUsage.map(({ binding, card }) => {
                  const preview = applyTemplatePreview(selectedTemplate, parseJsonSafe<Record<string, unknown>>(binding.paramsJson, {}));
                  return (
                    <div key={binding.id} style={{ ...fieldCardStyle(), padding: 12 }}>
                      <div style={{ fontWeight: 700 }}>{card?.name ?? binding.cardId}</div>
                      <div style={{ fontSize: 12, opacity: 0.62, marginTop: 4 }}>
                        {binding.cardId} / sortOrder {binding.sortOrder}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.76, marginTop: 8 }}>{preview.summary}</div>
                    </div>
                  );
                })}
                {selectedUsage.length === 0 ? <div style={{ opacity: 0.68 }}>当前没有卡牌引用这个模板。</div> : null}
              </div>
            </div>

            <div style={fieldCardStyle()}>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>结构化 JSON 预览</div>
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 13, opacity: 0.68 }}>paramSchemaJson</div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12 }}>{selectedTemplate.paramSchemaJson}</pre>
                <div style={{ fontSize: 13, opacity: 0.68 }}>operationsJson</div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12 }}>{selectedTemplate.operationsJson}</pre>
              </div>
            </div>

            <div style={fieldCardStyle(templateIssues.length > 0)}>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>校验结果</div>
              {templateIssues.length > 0 ? (
                <div style={{ display: 'grid', gap: 8, color: '#ffcece' }}>
                  {templateIssues.map((issue, index) => (
                    <div key={`${issue.field}_${index}`}>{issue.message}</div>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#d3f9c6' }}>当前模板前端结构校验通过。</div>
              )}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
