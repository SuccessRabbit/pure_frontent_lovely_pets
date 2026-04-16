import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { loadAdminDatasets, saveAdminDatasets, subscribeToAdminEvents } from './api';
import { ModelPreviewCanvas } from './ModelPreviewCanvas';
import { AdminSelect } from './AdminSelect';
import { TemplateWorkspace, collectTemplateValidationIssues } from './TemplateWorkspace';
import {
  STARTING_DECK_CONFIG_KEY,
  buildDeckSummary,
  ensureStartingDeckConfigEntry,
  parseDeckConfigValue,
  serializeDeckConfigValue,
} from './globalConfigUtils';
import {
  buildBindingFieldDefinitions,
  buildFieldOptions,
  formatCardTypeLabel,
  parseJsonSafe,
  readOperationsSummary,
  renderTemplateSummary,
  scopeIncludesCardType,
} from './templateSchema';
import type {
  AdminDatasetResponse,
  CardRow,
  CardSkillRow,
  GlobalConfigRow,
  ModelProfileRow,
  RawAdminDatasets,
  SkillTemplateRow,
  TemplateValidationIssue,
} from './types';

type AdminTab = 'cards' | 'templates' | 'global';
type CardViewMode = 'detail' | 'table';
type CardSortField = 'type' | 'name' | 'id' | 'cost' | 'rarity' | 'income' | 'stress' | 'stressLimit' | 'canDiscard' | 'tags';
type SortDirection = 'asc' | 'desc';

interface CardSortState {
  field: CardSortField;
  direction: SortDirection;
}

interface AssetOptions {
  allAssets: string[];
  cardImages: string[];
  illustrations: string[];
  thumbnails: string[];
  modelPresetSources: string[];
}

interface CardEditorPanelProps {
  selectedCard: CardRow | null;
  canEdit: boolean;
  draft: RawAdminDatasets;
  currentBindings: CardSkillRow[];
  availableTemplates: SkillTemplateRow[];
  selectedModelProfile: ModelProfileRow | null;
  assetOptions: AssetOptions;
  cardImageOptions: string[];
  illustrationOptions: string[];
  updateCard: (patch: Partial<CardRow>) => void;
  updateBinding: (bindingId: string, patch: Partial<CardSkillRow>) => void;
  removeBinding: (bindingId: string) => void;
  addBinding: () => void;
  updateModelProfile: (profileId: string, patch: Partial<ModelProfileRow>) => void;
  emptyState?: ReactNode;
}

interface ResourcePreviewProps {
  label: string;
  src: string;
  fit?: 'contain' | 'cover';
  scaleMode?: 'fill' | 'fit';
}

interface GlobalConfigEditorProps {
  draft: RawAdminDatasets;
  canEdit: boolean;
  updateGlobalConfigEntry: (key: string, patch: Partial<GlobalConfigRow>) => void;
}

const shellStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'grid',
  gridTemplateColumns: '280px minmax(420px, 1fr) 420px',
  background:
    'radial-gradient(circle at top left, rgba(255,229,201,0.24), transparent 28%), linear-gradient(180deg, #1a1418 0%, #120f14 100%)',
  color: '#f8f4ed',
};

const panelStyle: CSSProperties = {
  borderRight: '1px solid rgba(255,255,255,0.08)',
  overflow: 'auto',
};

const RIGHT_PANEL_MIN_WIDTH = 320;
const RIGHT_PANEL_MAX_WIDTH = 640;
const RIGHT_PANEL_DEFAULT_WIDTH = 420;
const RIGHT_PANEL_COLLAPSED_WIDTH = 0;
const RIGHT_PANEL_HANDLE_WIDTH = 28;
const RIGHT_PANEL_STORAGE_KEY = 'lovely-pets.admin.right-panel-width';
const RIGHT_PANEL_COLLAPSED_STORAGE_KEY = 'lovely-pets.admin.right-panel-collapsed';
const RIGHT_PANEL_AUTO_COLLAPSE_BREAKPOINT = 1480;

function clampRightPanelWidth(width: number) {
  return Math.min(RIGHT_PANEL_MAX_WIDTH, Math.max(RIGHT_PANEL_MIN_WIDTH, width));
}

function cloneDatasets(raw: RawAdminDatasets): RawAdminDatasets {
  return {
    cards: raw.cards.map(item => ({ ...item })),
    skillTemplates: raw.skillTemplates.map(item => ({ ...item })),
    cardSkills: raw.cardSkills.map(item => ({ ...item })),
    modelProfiles: raw.modelProfiles.map(item => ({ ...item })),
    globalConfig: raw.globalConfig.map(item => ({ ...item })),
  };
}

function templateSupportsCard(template: SkillTemplateRow, cardType: string) {
  return scopeIncludesCardType(template.scope, cardType);
}

function cardSkillBindings(raw: RawAdminDatasets, cardId: string) {
  return raw.cardSkills
    .filter(binding => binding.cardId === cardId)
    .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
}

function buildNewSkillBinding(cardId: string, templateId: string, index: number): CardSkillRow {
  return {
    id: `${cardId}_skill_${Date.now()}_${index}`,
    cardId,
    templateId,
    enabled: 'true',
    sortOrder: String(index + 1),
    paramsJson: '{}',
  };
}

function inferAssetFolderFromCardType(cardType: string) {
  if (cardType.includes('pet')) return 'pets';
  if (cardType.includes('worker')) return 'workers';
  if (cardType.includes('action')) return 'actions';
  if (cardType.includes('facility')) return 'facilities';
  return '';
}

function filterAssetOptions(options: string[], cardType: string) {
  const folder = inferAssetFolderFromCardType(cardType);
  if (!folder) return options;
  return options.filter(option => option.includes(`/${folder}/`));
}

function inputStyle(block = false): CSSProperties {
  return {
    width: '100%',
    display: block ? 'block' : 'inline-block',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(255,255,255,0.04)',
    color: '#fff8ef',
    padding: '10px 12px',
    boxSizing: 'border-box' as const,
  };
}

function softButtonStyle(disabled = false): CSSProperties {
  return {
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.12)',
    background: disabled ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.04)',
    color: '#fff8ef',
    padding: '10px 12px',
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

function sectionTitle(label: string) {
  return <div style={{ fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', opacity: 0.64 }}>{label}</div>;
}

function isEntityCard(card: CardRow) {
  return card.type.startsWith('entity_');
}

function sortCardsForComparison(cards: CardRow[]) {
  return [...cards].sort(defaultCardCompare);
}

function sortCardsForTable(cards: CardRow[], sortState: CardSortState) {
  return [...cards].sort((a, b) => {
    let diff = 0;

    switch (sortState.field) {
      case 'type':
        diff = compareText(a.type, b.type, sortState.direction);
        break;
      case 'name':
        diff = compareText(a.name, b.name, sortState.direction);
        break;
      case 'id':
        diff = compareText(a.id, b.id, sortState.direction);
        break;
      case 'cost':
        diff = compareOptionalNumbers(a.cost, b.cost, sortState.direction);
        break;
      case 'rarity':
        diff = compareOrderedNumbers(
          rarityRank[a.rarity] ?? Number.MAX_SAFE_INTEGER,
          rarityRank[b.rarity] ?? Number.MAX_SAFE_INTEGER,
          sortState.direction
        );
        break;
      case 'income':
        diff = compareOptionalNumbers(a.income, b.income, sortState.direction);
        break;
      case 'stress':
        diff = compareOptionalNumbers(a.stress, b.stress, sortState.direction);
        break;
      case 'stressLimit':
        diff = compareOptionalNumbers(a.stressLimit, b.stressLimit, sortState.direction);
        break;
      case 'canDiscard':
        diff = compareOrderedNumbers(
          a.canDiscard === 'true' ? 1 : 0,
          b.canDiscard === 'true' ? 1 : 0,
          sortState.direction
        );
        break;
      case 'tags':
        diff = compareText(a.tags || '\uffff', b.tags || '\uffff', sortState.direction);
        break;
    }

    return diff !== 0 ? diff : defaultCardCompare(a, b);
  });
}

function buildCardTypeSummary(cards: CardRow[]) {
  return cards.reduce<Record<string, number>>((summary, card) => {
    summary[card.type] = (summary[card.type] ?? 0) + 1;
    return summary;
  }, {});
}

function cardSummaryLabel(card: CardRow) {
  if (isEntityCard(card)) {
    return `费用 ${card.cost} / 收益 ${card.income || '-'} / 压力 ${card.stress || '-'} / 上限 ${card.stressLimit || '-'}`;
  }

  return `费用 ${card.cost} / ${card.rarity}`;
}

function tableInputStyle(disabled = false): CSSProperties {
  return {
    width: '100%',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.14)',
    background: disabled ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.05)',
    color: '#fff8ef',
    padding: '8px 10px',
    boxSizing: 'border-box',
    opacity: disabled ? 0.5 : 1,
  };
}

const compactNumericColumnStyle: CSSProperties = {
  minWidth: 72,
  maxWidth: 92,
  width: '1%',
};

const compactLimitColumnStyle: CSSProperties = {
  minWidth: 84,
  maxWidth: 108,
  width: '1%',
};

const compactBooleanColumnStyle: CSSProperties = {
  minWidth: 96,
  maxWidth: 118,
  width: '1%',
};

const compactHeaderTextStyle: CSSProperties = {
  whiteSpace: 'normal',
  overflowWrap: 'anywhere',
  lineHeight: 1.3,
};

const rarityRank: Record<string, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
};

function isStageEntityCardType(type: string | null | undefined): boolean {
  return type === 'entity_pet' || type === 'entity_worker';
}

const tableSortFieldLabels: Record<CardSortField, string> = {
  type: '类型',
  name: '名称',
  id: 'ID',
  cost: '费用',
  rarity: '稀有度',
  income: '收益',
  stress: '压力',
  stressLimit: '压力上限',
  canDiscard: '可弃置',
  tags: '标签',
};

function compareTextValue(a: string, b: string) {
  return a.localeCompare(b, 'zh-Hans-CN');
}

function compareText(a: string, b: string, direction: SortDirection) {
  const diff = compareTextValue(a, b);
  return direction === 'asc' ? diff : -diff;
}

function parseOptionalNumber(value: string) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function compareOptionalNumbers(a: string, b: string, direction: SortDirection) {
  const aValue = parseOptionalNumber(a);
  const bValue = parseOptionalNumber(b);

  if (aValue == null && bValue == null) return 0;
  if (aValue == null) return 1;
  if (bValue == null) return -1;

  return direction === 'asc' ? aValue - bValue : bValue - aValue;
}

function compareOrderedNumbers(a: number, b: number, direction: SortDirection) {
  return direction === 'asc' ? a - b : b - a;
}

function defaultCardCompare(a: CardRow, b: CardRow) {
  const typeDiff = compareTextValue(a.type, b.type);
  if (typeDiff !== 0) return typeDiff;

  const aCost = parseOptionalNumber(a.cost);
  const bCost = parseOptionalNumber(b.cost);
  const normalizedACost = aCost == null ? Number.MAX_SAFE_INTEGER : aCost;
  const normalizedBCost = bCost == null ? Number.MAX_SAFE_INTEGER : bCost;
  if (normalizedACost !== normalizedBCost) return normalizedACost - normalizedBCost;

  return compareTextValue(a.id, b.id);
}

function formatCardTypeOptionLabel(cardType: string) {
  const label = formatCardTypeLabel(cardType);
  return label === cardType ? cardType : `${label} · ${cardType}`;
}

function formatSortFieldLabel(field: CardSortField) {
  return tableSortFieldLabels[field];
}

function CardEditorPanel({
  selectedCard,
  canEdit,
  draft,
  currentBindings,
  availableTemplates,
  selectedModelProfile,
  assetOptions,
  cardImageOptions,
  illustrationOptions,
  updateCard,
  updateBinding,
  removeBinding,
  addBinding,
  updateModelProfile,
  emptyState,
}: CardEditorPanelProps) {
  if (!selectedCard) {
    return emptyState ?? <div style={{ display: 'grid', placeItems: 'center', minHeight: '100%' }}>选择卡牌开始编辑</div>;
  }

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      {sectionTitle('Card Basics')}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label>
          <div style={{ marginBottom: 6 }}>卡牌 ID</div>
          <input value={selectedCard.id} disabled style={inputStyle(true)} />
        </label>
        <label>
          <div style={{ marginBottom: 6 }}>名称</div>
          <input
            value={selectedCard.name}
            disabled={!canEdit}
            onChange={event => updateCard({ name: event.target.value })}
            style={inputStyle(true)}
          />
        </label>
        <label>
          <div style={{ marginBottom: 6 }}>类型</div>
          <input value={selectedCard.type} disabled style={inputStyle(true)} />
        </label>
        <label>
          <div style={{ marginBottom: 6 }}>稀有度</div>
          <AdminSelect
            value={selectedCard.rarity}
            disabled={!canEdit}
            onChange={value => updateCard({ rarity: value })}
            options={['common', 'rare', 'epic', 'legendary'].map(option => ({ value: option, label: option }))}
          />
        </label>
        <label>
          <div style={{ marginBottom: 6 }}>费用</div>
          <input
            value={selectedCard.cost}
            disabled={!canEdit}
            onChange={event => updateCard({ cost: event.target.value })}
            style={inputStyle(true)}
          />
        </label>
        <label>
          <div style={{ marginBottom: 6 }}>标签</div>
          <input
            value={selectedCard.tags}
            disabled={!canEdit}
            onChange={event => updateCard({ tags: event.target.value })}
            style={inputStyle(true)}
          />
        </label>
      </div>

      <label>
        <div style={{ marginBottom: 6 }}>描述</div>
        <textarea
          value={selectedCard.description}
          disabled={!canEdit}
          onChange={event => updateCard({ description: event.target.value })}
          rows={3}
          style={inputStyle(true)}
        />
      </label>

      {isEntityCard(selectedCard) ? (
        <>
          {sectionTitle('Entity Stats')}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <label>
              <div style={{ marginBottom: 6 }}>收益</div>
              <input
                value={selectedCard.income}
                disabled={!canEdit}
                onChange={event => updateCard({ income: event.target.value })}
                style={inputStyle(true)}
              />
            </label>
            <label>
              <div style={{ marginBottom: 6 }}>初始压力</div>
              <input
                value={selectedCard.stress}
                disabled={!canEdit}
                onChange={event => updateCard({ stress: event.target.value })}
                style={inputStyle(true)}
              />
            </label>
            <label>
              <div style={{ marginBottom: 6 }}>压力上限</div>
              <input
                value={selectedCard.stressLimit}
                disabled={!canEdit}
                onChange={event => updateCard({ stressLimit: event.target.value })}
                style={inputStyle(true)}
              />
            </label>
          </div>
        </>
      ) : null}

      {sectionTitle('Resources')}
      <div style={{ display: 'grid', gap: 12 }}>
        <label>
          <div style={{ marginBottom: 6 }}>卡面图片资源</div>
          <AdminSelect
            value={selectedCard.cardImagePath}
            disabled={!canEdit}
            onChange={value => updateCard({ cardImagePath: value })}
            options={[
              { value: '', label: '未绑定' },
              ...cardImageOptions.map(option => ({ value: option, label: option })),
            ]}
          />
        </label>
        <ResourcePreview
          label="卡面预览"
          src={selectedCard.cardImagePath}
          fit={(selectedCard.imageFitMode || 'contain') as 'contain' | 'cover'}
          scaleMode="fit"
        />
        <label>
          <div style={{ marginBottom: 6 }}>插画资源</div>
          <AdminSelect
            value={selectedCard.illustrationPath}
            disabled={!canEdit}
            onChange={value => updateCard({ illustrationPath: value })}
            options={[
              { value: '', label: '未绑定' },
              ...illustrationOptions.map(option => ({ value: option, label: option })),
            ]}
          />
        </label>
        <ResourcePreview label="插画预览" src={selectedCard.illustrationPath} fit="contain" scaleMode="fit" />
        {isStageEntityCardType(selectedCard.type) ? (
          <>
            <label>
              <div style={{ marginBottom: 6 }}>3D 模型配置</div>
              <AdminSelect
                value={selectedCard.modelProfileId}
                disabled={!canEdit}
                onChange={value => updateCard({ modelProfileId: value })}
                options={[
                  { value: '', label: '未绑定' },
                  ...draft.modelProfiles.map(profile => ({ value: profile.id, label: profile.name })),
                ]}
              />
            </label>
            {selectedModelProfile ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                  padding: 14,
                  borderRadius: 16,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <label>
                  <div style={{ marginBottom: 6 }}>模型预设 source</div>
                  <AdminSelect
                    value={selectedModelProfile.source}
                    disabled={!canEdit}
                    onChange={value => updateModelProfile(selectedModelProfile.id, { source: value })}
                    options={assetOptions.modelPresetSources.map(option => ({ value: option, label: option }))}
                  />
                </label>
                <label>
                  <div style={{ marginBottom: 6 }}>缩放</div>
                  <input
                    value={selectedModelProfile.scale}
                    disabled={!canEdit}
                    onChange={event => updateModelProfile(selectedModelProfile.id, { scale: event.target.value })}
                    style={inputStyle(true)}
                  />
                </label>
                <label>
                  <div style={{ marginBottom: 6 }}>旋转 Y</div>
                  <input
                    value={selectedModelProfile.rotationY}
                    disabled={!canEdit}
                    onChange={event => updateModelProfile(selectedModelProfile.id, { rotationY: event.target.value })}
                    style={inputStyle(true)}
                  />
                </label>
                <label>
                  <div style={{ marginBottom: 6 }}>阴影倍率</div>
                  <input
                    value={selectedModelProfile.shadowSize}
                    disabled={!canEdit}
                    onChange={event => updateModelProfile(selectedModelProfile.id, { shadowSize: event.target.value })}
                    style={inputStyle(true)}
                  />
                </label>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {sectionTitle('Skills')}
      <div style={{ display: 'grid', gap: 12 }}>
        {currentBindings.map(binding => {
          const template = draft.skillTemplates.find(item => item.id === binding.templateId);
          const fieldDefinitions = buildBindingFieldDefinitions(template);
          const params = parseJsonSafe<Record<string, string | number>>(binding.paramsJson, {});
          const missingRequiredCount = fieldDefinitions.filter(field => {
            const value = params[field.name] ?? field.defaultValue;
            return field.required && (value == null || value === '');
          }).length;

          return (
            <div
              key={binding.id}
              style={{
                borderRadius: 16,
                padding: 14,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{template?.name ?? binding.templateId}</div>
                  <div style={{ fontSize: 12, opacity: 0.66 }}>
                    {template?.trigger ?? 'unknown'} / {template?.targetMode ?? 'unknown'} /{' '}
                    {template?.effectKind ?? 'unknown'}
                  </div>
                  {readOperationsSummary(template).length > 0 ? (
                    <div style={{ fontSize: 12, opacity: 0.56, marginTop: 4 }}>
                      运行链: {readOperationsSummary(template).join(' -> ')}
                    </div>
                  ) : null}
                  {missingRequiredCount > 0 ? (
                    <div style={{ fontSize: 12, color: '#ffcece', marginTop: 6 }}>还有 {missingRequiredCount} 个必填参数未完成</div>
                  ) : null}
                </div>
                <button
                  disabled={!canEdit}
                  onClick={() => removeBinding(binding.id)}
                  style={{
                    border: 0,
                    borderRadius: 999,
                    background: 'rgba(255,130,130,0.18)',
                    color: '#ffdede',
                    padding: '8px 12px',
                    cursor: canEdit ? 'pointer' : 'not-allowed',
                  }}
                >
                  删除
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px', gap: 10, marginBottom: 12 }}>
                <AdminSelect
                  value={binding.templateId}
                  disabled={!canEdit}
                  onChange={value => {
                    const nextTemplate = draft.skillTemplates.find(item => item.id === value);
                    const defaults = Object.fromEntries(
                      buildBindingFieldDefinitions(nextTemplate).map(field => [field.name, field.defaultValue ?? ''])
                    );
                    updateBinding(binding.id, {
                      templateId: value,
                      paramsJson: JSON.stringify(defaults),
                    });
                  }}
                  options={availableTemplates.map(option => ({
                    value: option.id,
                    label: `${option.name} · ${option.trigger} / ${option.targetMode}`,
                  }))}
                />
                <input
                  value={binding.sortOrder}
                  disabled={!canEdit}
                  onChange={event => updateBinding(binding.id, { sortOrder: event.target.value })}
                  style={inputStyle(true)}
                />
                <AdminSelect
                  value={binding.enabled}
                  disabled={!canEdit}
                  onChange={value => updateBinding(binding.id, { enabled: value })}
                  options={[
                    { value: 'true', label: '启用' },
                    { value: 'false', label: '停用' },
                  ]}
                />
              </div>

              <div
                style={{
                  borderRadius: 12,
                  padding: 12,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  marginBottom: 12,
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.66, marginBottom: 6 }}>目标选择说明</div>
                <div style={{ fontSize: 13 }}>
                  {template?.supportsSecondTarget === 'true'
                    ? '该技能在游戏内需要依次选择两个目标。'
                    : template?.targetMode === 'none'
                      ? '该技能打出后直接生效，不需要手动选目标。'
                      : `该技能在游戏内需要选择：${template?.targetMode ?? '未知目标模式'}`}
                </div>
              </div>

              {fieldDefinitions.length > 0 ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  {fieldDefinitions.map(field => {
                    const options = buildFieldOptions(field, draft, selectedCard);
                    const currentValue = params[field.name] ?? field.defaultValue ?? '';
                    const helperText = field.description
                      ? `${field.description}${field.min != null || field.max != null ? ` 范围 ${field.min ?? '-∞'} ~ ${field.max ?? '∞'}` : ''}`
                      : field.min != null || field.max != null
                        ? `范围 ${field.min ?? '-∞'} ~ ${field.max ?? '∞'}`
                        : '';
                    return (
                    <label key={field.name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                        <div>{field.label}</div>
                        {field.required ? <div style={{ fontSize: 12, opacity: 0.66 }}>必填</div> : null}
                      </div>
                      {helperText ? <div style={{ fontSize: 12, opacity: 0.62, marginBottom: 6 }}>{helperText}</div> : null}
                      {field.type === 'select' || options.length > 0 ? (
                        <AdminSelect
                          value={String(currentValue)}
                          disabled={!canEdit}
                          onChange={value => {
                            const nextParams = { ...params, [field.name]: value };
                            updateBinding(binding.id, { paramsJson: JSON.stringify(nextParams) });
                          }}
                          options={options}
                        />
                      ) : (
                        <input
                          type={field.type === 'number' ? 'number' : 'text'}
                          min={field.type === 'number' ? field.min : undefined}
                          max={field.type === 'number' ? field.max : undefined}
                          step={field.type === 'number' ? field.step ?? 1 : undefined}
                          value={String(currentValue)}
                          disabled={!canEdit}
                          onChange={event => {
                            const value = field.type === 'number' ? Number(event.target.value) : event.target.value;
                            const nextParams = { ...params, [field.name]: value };
                            updateBinding(binding.id, { paramsJson: JSON.stringify(nextParams) });
                          }}
                          placeholder={field.placeholder}
                          style={inputStyle(true)}
                        />
                      )}
                    </label>
                    );
                  })}
                </div>
              ) : null}

              <div
                style={{
                  marginTop: 12,
                  borderRadius: 12,
                  padding: 12,
                  background: 'rgba(255,226,175,0.08)',
                  border: '1px solid rgba(255,226,175,0.12)',
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.66, marginBottom: 4 }}>玩家可见摘要</div>
                <div>{renderTemplateSummary(template, params)}</div>
              </div>

              <div
                style={{
                  marginTop: 12,
                  borderRadius: 12,
                  padding: 12,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.66, marginBottom: 4 }}>运行时说明</div>
                <div style={{ fontSize: 13, opacity: 0.82 }}>
                  触发 {template?.trigger ?? '-'}，目标 {template?.targetMode ?? '-'}，效果 {template?.effectKind ?? '-'}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={addBinding}
        disabled={!canEdit || availableTemplates.length === 0}
        style={{
          borderRadius: 14,
          border: '1px dashed rgba(255,255,255,0.16)',
          background: 'transparent',
          color: '#fff8ef',
          padding: '12px 14px',
          cursor: canEdit ? 'pointer' : 'not-allowed',
        }}
      >
        添加技能绑定
      </button>
    </div>
  );
}

function ResourcePreview({ label, src, fit = 'contain', scaleMode = 'fill' }: ResourcePreviewProps) {
  return (
    <div
      style={{
        borderRadius: 16,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.03)',
      }}
    >
      <div
        style={{
          padding: '10px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          fontSize: 12,
          opacity: 0.72,
        }}
      >
        {label}
      </div>
      <div
        style={{
          minHeight: 240,
          maxHeight: 300,
          height: 'min(400px, 42vw)',
          display: 'grid',
          placeItems: 'center',
          background: 'linear-gradient(180deg, rgba(25,20,24,0.92) 0%, rgba(17,14,18,0.98) 100%)',
        }}
      >
        {src ? (
          <img
            src={src}
            alt={label}
            style={{
              width: scaleMode === 'fill' ? '100%' : 'auto',
              height: scaleMode === 'fill' ? '100%' : 'auto',
              maxWidth: scaleMode === 'fill' ? '100%' : '84%',
              maxHeight: scaleMode === 'fill' ? '300px' : 'calc(300px - 64px)',
              objectFit: fit,
            }}
          />
        ) : (
          <div style={{ fontSize: 13, opacity: 0.52 }}>未绑定资源</div>
        )}
      </div>
      <div
        style={{
          padding: '10px 12px',
          fontSize: 12,
          opacity: src ? 0.64 : 0.44,
          whiteSpace: 'normal',
          overflowWrap: 'anywhere',
        }}
      >
        {src || '请选择资源文件'}
      </div>
    </div>
  );
}

function deckCardPreviewStyle(active = false): CSSProperties {
  return {
    borderRadius: 18,
    padding: 14,
    background: active ? 'rgba(255,210,133,0.08)' : 'rgba(255,255,255,0.04)',
    border: `1px solid ${active ? 'rgba(255,210,133,0.22)' : 'rgba(255,255,255,0.08)'}`,
  };
}

function GlobalConfigEditor({ draft, canEdit, updateGlobalConfigEntry }: GlobalConfigEditorProps) {
  const [selectedDeckCardId, setSelectedDeckCardId] = useState('');
  const globalConfigEntries = draft.globalConfig;
  const startingDeckEntry = globalConfigEntries.find(entry => entry.key === STARTING_DECK_CONFIG_KEY) ?? null;
  const genericEntries = globalConfigEntries.filter(entry => entry.key !== STARTING_DECK_CONFIG_KEY);
  const startingDeckItems = parseDeckConfigValue(startingDeckEntry?.value ?? '[]');
  const cardsById = useMemo(() => new Map(draft.cards.map(card => [card.id, card])), [draft.cards]);
  const deckSummary = useMemo(() => buildDeckSummary(startingDeckItems, draft.cards), [draft.cards, startingDeckItems]);
  const cardOptions = useMemo(
    () =>
      [...draft.cards]
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
        .map(card => ({
          value: card.id,
          label: `${card.name} · ${formatCardTypeLabel(card.type)} · ${card.id}`,
        })),
    [draft.cards]
  );

  useEffect(() => {
    if (!selectedDeckCardId && cardOptions[0]) {
      setSelectedDeckCardId(cardOptions[0].value);
    }
  }, [cardOptions, selectedDeckCardId]);

  const selectedDeckCard = selectedDeckCardId ? cardsById.get(selectedDeckCardId) ?? null : null;

  function commitDeckItems(
    updater: (current: Array<{ cardId: string; count: number }>) => Array<{ cardId: string; count: number }>
  ) {
    if (!startingDeckEntry) return;
    const next = updater(startingDeckItems);
    updateGlobalConfigEntry(startingDeckEntry.key, {
      value: serializeDeckConfigValue(next),
      valueType: 'json',
    });
  }

  function addDeckCard() {
    if (!selectedDeckCardId) return;
    commitDeckItems(current => {
      const existing = current.find(item => item.cardId === selectedDeckCardId);
      if (existing) {
        return current.map(item =>
          item.cardId === selectedDeckCardId ? { ...item, count: item.count + 1 } : item
        );
      }
      return [...current, { cardId: selectedDeckCardId, count: 1 }];
    });
  }

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      {sectionTitle('Global Config')}
      <div
        style={{
          borderRadius: 20,
          padding: 18,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>全局参数配置</div>
        <div style={{ fontSize: 13, opacity: 0.74, lineHeight: 1.6 }}>
          通用规则参数和牌堆配置都在这里编辑。牌堆配置会直接影响开局初始化，不再需要手动改代码。
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {genericEntries.map(entry => (
          <div
            key={entry.key}
            style={{
              borderRadius: 18,
              padding: 16,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 700 }}>{entry.key}</div>
                <div style={{ fontSize: 12, opacity: 0.62 }}>{entry.module}</div>
              </div>
              <div style={{ fontSize: 12, opacity: 0.68 }}>{entry.valueType}</div>
            </div>
            <div style={{ fontSize: 13, opacity: 0.72, marginBottom: 10 }}>{entry.description}</div>
            {entry.valueType === 'boolean' ? (
              <AdminSelect
                value={entry.value}
                disabled={!canEdit}
                onChange={value => updateGlobalConfigEntry(entry.key, { value })}
                options={[
                  { value: 'true', label: '开启' },
                  { value: 'false', label: '关闭' },
                ]}
              />
            ) : entry.valueType === 'number' ? (
              <input
                type="number"
                disabled={!canEdit}
                value={entry.value}
                onChange={event => updateGlobalConfigEntry(entry.key, { value: event.target.value })}
                style={inputStyle(true)}
              />
            ) : (
              <input
                disabled={!canEdit}
                value={entry.value}
                onChange={event => updateGlobalConfigEntry(entry.key, { value: event.target.value })}
                style={inputStyle(true)}
              />
            )}
          </div>
        ))}
      </div>

      <div
        style={{
          borderRadius: 20,
          padding: 18,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>起始牌堆配置</div>
            <div style={{ fontSize: 13, opacity: 0.72, marginTop: 6 }}>
              通过卡牌预览和数量设置自定义开始牌堆。若牌堆为空，则运行时回退为“全卡各 2 张”。
            </div>
          </div>
          <div style={{ display: 'grid', gap: 6, textAlign: 'right' }}>
            <div style={{ fontSize: 12, opacity: 0.64 }}>总张数</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{deckSummary.totalCards}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 16, alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ ...deckCardPreviewStyle(), display: 'grid', gap: 12 }}>
              <div style={{ fontWeight: 700 }}>添加卡牌到牌堆</div>
              <AdminSelect
                value={selectedDeckCardId}
                disabled={!canEdit || cardOptions.length === 0}
                onChange={setSelectedDeckCardId}
                options={cardOptions}
              />
              {selectedDeckCard ? (
                <div style={{ ...deckCardPreviewStyle(true), display: 'grid', gridTemplateColumns: '112px minmax(0, 1fr)', gap: 14 }}>
                  <div
                    style={{
                      borderRadius: 14,
                      overflow: 'hidden',
                      aspectRatio: '3 / 4',
                      background: 'rgba(255,255,255,0.04)',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    {selectedDeckCard.cardImagePath ? (
                      <img
                        src={selectedDeckCard.cardImagePath}
                        alt={selectedDeckCard.name}
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      />
                    ) : (
                      <div style={{ fontSize: 12, opacity: 0.56 }}>无卡面</div>
                    )}
                  </div>
                  <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
                    <div>
                      <div style={{ fontSize: 12, opacity: 0.6 }}>{formatCardTypeLabel(selectedDeckCard.type)}</div>
                      <div style={{ fontSize: 20, fontWeight: 700 }}>{selectedDeckCard.name}</div>
                      <div style={{ fontSize: 12, opacity: 0.64 }}>{selectedDeckCard.id}</div>
                    </div>
                    <div style={{ fontSize: 13, opacity: 0.76 }}>{cardSummaryLabel(selectedDeckCard)}</div>
                    <button
                      type="button"
                      onClick={addDeckCard}
                      disabled={!canEdit}
                      style={{
                        borderRadius: 12,
                        border: '1px solid rgba(255,210,133,0.22)',
                        background: 'rgba(255,210,133,0.12)',
                        color: '#fff8ef',
                        padding: '10px 12px',
                        cursor: canEdit ? 'pointer' : 'not-allowed',
                        fontWeight: 700,
                      }}
                    >
                      添加这张卡
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              {startingDeckItems.map(item => {
                const card = cardsById.get(item.cardId) ?? null;
                return (
                  <div key={item.cardId} style={{ ...deckCardPreviewStyle(), display: 'grid', gridTemplateColumns: '92px minmax(0, 1fr) auto', gap: 14, alignItems: 'center' }}>
                    <div
                      style={{
                        borderRadius: 12,
                        overflow: 'hidden',
                        aspectRatio: '3 / 4',
                        background: 'rgba(255,255,255,0.04)',
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      {card?.cardImagePath ? (
                        <img
                          src={card.cardImagePath}
                          alt={card.name}
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        />
                      ) : (
                        <div style={{ fontSize: 12, opacity: 0.56 }}>{card ? '无卡面' : '缺失卡牌'}</div>
                      )}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{card?.name ?? item.cardId}</div>
                      <div style={{ fontSize: 12, opacity: 0.64, marginTop: 4 }}>
                        {card ? `${formatCardTypeLabel(card.type)} · ${card.id}` : `缺失引用 · ${item.cardId}`}
                      </div>
                      {card?.description ? (
                        <div style={{ fontSize: 12, opacity: 0.68, marginTop: 8, lineHeight: 1.5 }}>{card.description}</div>
                      ) : null}
                    </div>
                    <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() =>
                            commitDeckItems(current =>
                              current
                                .map(currentItem =>
                                  currentItem.cardId === item.cardId
                                    ? { ...currentItem, count: Math.max(1, currentItem.count - 1) }
                                    : currentItem
                                )
                            )
                          }
                          style={softButtonStyle(!canEdit)}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={1}
                          disabled={!canEdit}
                          value={item.count}
                          onChange={event => {
                            const nextCount = Number(event.target.value);
                            commitDeckItems(current =>
                              current.map(currentItem =>
                                currentItem.cardId === item.cardId
                                  ? { ...currentItem, count: Number.isFinite(nextCount) ? Math.max(1, Math.floor(nextCount)) : 1 }
                                  : currentItem
                              )
                            );
                          }}
                          style={{ ...inputStyle(), width: 88, textAlign: 'center' }}
                        />
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() =>
                            commitDeckItems(current =>
                              current.map(currentItem =>
                                currentItem.cardId === item.cardId
                                  ? { ...currentItem, count: currentItem.count + 1 }
                                  : currentItem
                              )
                            )
                          }
                          style={softButtonStyle(!canEdit)}
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => commitDeckItems(current => current.filter(currentItem => currentItem.cardId !== item.cardId))}
                        style={{
                          borderRadius: 999,
                          border: '1px solid rgba(255,130,130,0.16)',
                          background: 'rgba(255,130,130,0.12)',
                          color: '#ffdede',
                          padding: '8px 12px',
                          cursor: canEdit ? 'pointer' : 'not-allowed',
                        }}
                      >
                        移除
                      </button>
                    </div>
                  </div>
                );
              })}
              {startingDeckItems.length === 0 ? (
                <div style={{ opacity: 0.72, padding: '8px 2px' }}>当前未配置自定义牌堆，运行时会自动使用默认全卡各 2 张。</div>
              ) : null}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            <div style={deckCardPreviewStyle()}>
              <div style={{ fontWeight: 700, marginBottom: 10 }}>牌堆概览</div>
              <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
                <div>唯一卡牌数 {deckSummary.uniqueCards}</div>
                <div>总张数 {deckSummary.totalCards}</div>
                <div style={{ color: deckSummary.missingCards > 0 ? '#ffcece' : '#d3f9c6' }}>
                  {deckSummary.missingCards > 0 ? `存在 ${deckSummary.missingCards} 张失效引用` : '卡牌引用有效'}
                </div>
              </div>
            </div>

            <div style={deckCardPreviewStyle()}>
              <div style={{ fontWeight: 700, marginBottom: 10 }}>按类型统计</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {Object.entries(deckSummary.byType).map(([type, count]) => (
                  <div
                    key={type}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      fontSize: 13,
                    }}
                  >
                    <span>{formatCardTypeLabel(type)}</span>
                    <span>{count}</span>
                  </div>
                ))}
                {Object.keys(deckSummary.byType).length === 0 ? <div style={{ opacity: 0.64 }}>暂无统计</div> : null}
              </div>
            </div>

            {startingDeckEntry ? (
              <div style={deckCardPreviewStyle()}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>原始配置</div>
                <div style={{ fontSize: 12, opacity: 0.68, marginBottom: 6 }}>{startingDeckEntry.description}</div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12, opacity: 0.84 }}>{startingDeckEntry.value}</pre>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminPage() {
  const [response, setResponse] = useState<AdminDatasetResponse | null>(null);
  const [draft, setDraft] = useState<RawAdminDatasets | null>(null);
  const [tab, setTab] = useState<AdminTab>('cards');
  const [viewMode, setViewMode] = useState<CardViewMode>('detail');
  const [selectedCardId, setSelectedCardId] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [tableEditorOpen, setTableEditorOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [cardTypeFilter, setCardTypeFilter] = useState<string>('all');
  const [tableSort, setTableSort] = useState<CardSortState>({ field: 'type', direction: 'asc' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [templateIssues, setTemplateIssues] = useState<TemplateValidationIssue[]>([]);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [rightPanelWidth, setRightPanelWidth] = useState(RIGHT_PANEL_DEFAULT_WIDTH);
  const [rightPanelDragging, setRightPanelDragging] = useState(false);
  const canEdit = response?.canEdit ?? false;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedWidth = window.localStorage.getItem(RIGHT_PANEL_STORAGE_KEY);
    const savedCollapsed = window.localStorage.getItem(RIGHT_PANEL_COLLAPSED_STORAGE_KEY);

    if (savedWidth) {
      const numericWidth = Number(savedWidth);
      if (Number.isFinite(numericWidth)) {
        setRightPanelWidth(clampRightPanelWidth(numericWidth));
      }
    }

    if (savedCollapsed === 'true' || savedCollapsed === 'false') {
      setRightPanelCollapsed(savedCollapsed === 'true');
      return;
    }

    if (window.innerWidth < RIGHT_PANEL_AUTO_COLLAPSE_BREAKPOINT) {
      setRightPanelCollapsed(true);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const payload = await loadAdminDatasets();
      setResponse(payload);
      setDraft(cloneDatasets(payload.raw));
      setSelectedCardId(payload.raw.cards[0]?.id ?? '');
      setSelectedTemplateId(payload.raw.skillTemplates[0]?.id ?? '');
    })();
  }, []);

  useEffect(() => {
    return subscribeToAdminEvents(() => {
      setInfo('配置已在其他窗口更新，当前页面可刷新后同步。');
    });
  }, []);

  useEffect(() => {
    if (tab !== 'cards' || viewMode !== 'table') {
      setTableEditorOpen(false);
    }
  }, [tab, viewMode]);

  useEffect(() => {
    setDraft(current => {
      if (!current) return current;
      const nextGlobalConfig = ensureStartingDeckConfigEntry(current.globalConfig);
      if (nextGlobalConfig === current.globalConfig) return current;
      return { ...current, globalConfig: nextGlobalConfig };
    });
  }, [draft?.globalConfig.length]);

  useEffect(() => {
    if (!rightPanelDragging) return undefined;

    function handlePointerMove(event: PointerEvent) {
      const nextWidth = clampRightPanelWidth(window.innerWidth - event.clientX);
      setRightPanelWidth(nextWidth);
    }

    function handlePointerUp() {
      setRightPanelDragging(false);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [rightPanelDragging]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(RIGHT_PANEL_STORAGE_KEY, String(rightPanelWidth));
  }, [rightPanelWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(RIGHT_PANEL_COLLAPSED_STORAGE_KEY, String(rightPanelCollapsed));
  }, [rightPanelCollapsed]);

  const selectedCard = useMemo(
    () => draft?.cards.find(card => card.id === selectedCardId) ?? null,
    [draft, selectedCardId]
  );

  useEffect(() => {
    if (!selectedCard) {
      setTableEditorOpen(false);
    }
  }, [selectedCard]);

  const selectedModelProfile = useMemo(() => {
    if (!selectedCard || !draft) return null;
    return draft.modelProfiles.find(profile => profile.id === selectedCard.modelProfileId) ?? null;
  }, [draft, selectedCard]);

  const cardTypeOptions = useMemo(() => {
    if (!draft) return [];
    return Object.keys(buildCardTypeSummary(draft.cards)).sort((a, b) => {
      const labelDiff = compareTextValue(formatCardTypeLabel(a), formatCardTypeLabel(b));
      return labelDiff !== 0 ? labelDiff : compareTextValue(a, b);
    });
  }, [draft]);

  const allCardTypeSummary = useMemo(() => {
    if (!draft) return {};
    return buildCardTypeSummary(draft.cards);
  }, [draft]);

  const filteredCards = useMemo(() => {
    if (!draft) return [];
    const query = search.trim().toLowerCase();
    return draft.cards.filter(card => {
      const matchesQuery =
        !query || `${card.id} ${card.name} ${card.type} ${card.rarity} ${card.tags}`.toLowerCase().includes(query);
      const matchesType = cardTypeFilter === 'all' || card.type === cardTypeFilter;
      return matchesQuery && matchesType;
    });
  }, [draft, search, cardTypeFilter]);

  const visibleCards = useMemo(() => {
    if (viewMode === 'table') {
      return sortCardsForTable(filteredCards, tableSort);
    }
    return sortCardsForComparison(filteredCards);
  }, [filteredCards, tableSort, viewMode]);

  const currentBindings = useMemo(() => {
    if (!draft || !selectedCard) return [];
    return cardSkillBindings(draft, selectedCard.id);
  }, [draft, selectedCard]);

  useEffect(() => {
    if (!draft) {
      setTemplateIssues([]);
      return;
    }
    setTemplateIssues(collectTemplateValidationIssues(draft));
  }, [draft]);

  const availableTemplates = useMemo(() => {
    if (!draft || !selectedCard) return [];
    return draft.skillTemplates.filter(template => templateSupportsCard(template, selectedCard.type));
  }, [draft, selectedCard]);

  const cardTypeSummary = useMemo(() => buildCardTypeSummary(filteredCards), [filteredCards]);

  useEffect(() => {
    if (tab !== 'cards') return;
    if (visibleCards.some(card => card.id === selectedCardId)) return;
    setSelectedCardId(visibleCards[0]?.id ?? '');
  }, [tab, visibleCards, selectedCardId]);

  if (!response || !draft) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#fff8ef' }}>
        正在加载 Admin 数据...
      </div>
    );
  }

  const assetOptions: AssetOptions = response.compiled.assetOptions ?? {
    allAssets: [],
    cardImages: [],
    illustrations: [],
    thumbnails: [],
    modelPresetSources: [],
  };
  const leftPanelWidth = tab === 'cards' && viewMode === 'table' ? 320 : 280;
  const mainPanelMinWidth = tab === 'cards' && viewMode === 'table' ? 760 : 420;
  const activeRightPanelWidth = rightPanelCollapsed ? RIGHT_PANEL_COLLAPSED_WIDTH : rightPanelWidth;
  const activeShellStyle: CSSProperties = {
    ...shellStyle,
    gridTemplateColumns: `${leftPanelWidth}px minmax(${mainPanelMinWidth}px, 1fr) ${RIGHT_PANEL_HANDLE_WIDTH}px ${activeRightPanelWidth}px`,
    transition: rightPanelDragging ? undefined : 'grid-template-columns 180ms ease',
  };
  const cardImageOptions = selectedCard
    ? filterAssetOptions(assetOptions.cardImages, selectedCard.type)
    : assetOptions.cardImages;
  const illustrationOptions = selectedCard
    ? filterAssetOptions(assetOptions.illustrations, selectedCard.type)
    : assetOptions.illustrations;

  function toggleRightPanel() {
    setRightPanelCollapsed(current => !current);
  }

  function handleRightPanelResizeStart(event: ReactPointerEvent<HTMLDivElement>) {
    if (rightPanelCollapsed) return;
    event.preventDefault();
    setRightPanelDragging(true);
  }

  function updateCardById(cardId: string, patch: Partial<CardRow>) {
    setDraft(current => {
      if (!current) return current;
      return {
        ...current,
        cards: current.cards.map(card => (card.id === cardId ? { ...card, ...patch } : card)),
      };
    });
  }

  function updateCard(patch: Partial<CardRow>) {
    if (!selectedCard) return;
    updateCardById(selectedCard.id, patch);
  }

  function updateBinding(bindingId: string, patch: Partial<CardSkillRow>) {
    setDraft(current => {
      if (!current) return current;
      return {
        ...current,
        cardSkills: current.cardSkills.map(binding =>
          binding.id === bindingId ? { ...binding, ...patch } : binding
        ),
      };
    });
  }

  function removeBinding(bindingId: string) {
    setDraft(current => {
      if (!current) return current;
      return {
        ...current,
        cardSkills: current.cardSkills.filter(binding => binding.id !== bindingId),
      };
    });
  }

  function addBinding() {
    if (!draft || !selectedCard || availableTemplates.length === 0) return;
    const next = buildNewSkillBinding(selectedCard.id, availableTemplates[0].id, currentBindings.length);
    setDraft({
      ...draft,
      cardSkills: [...draft.cardSkills, next],
    });
  }

  function updateModelProfile(profileId: string, patch: Partial<ModelProfileRow>) {
    setDraft(current => {
      if (!current) return current;
      return {
        ...current,
        modelProfiles: current.modelProfiles.map(profile =>
          profile.id === profileId ? { ...profile, ...patch } : profile
        ),
      };
    });
  }

  function updateGlobalConfigEntry(key: string, patch: Partial<GlobalConfigRow>) {
    setDraft(current => {
      if (!current) return current;
      return {
        ...current,
        globalConfig: current.globalConfig.map(entry =>
          entry.key === key ? { ...entry, ...patch } : entry
        ),
      };
    });
  }

  function duplicateSelectedCard() {
    if (!draft || !selectedCard || !canEdit) return;
    const nextId = `${selectedCard.id}_copy_${draft.cards.length + 1}`;
    const duplicatedCard = { ...selectedCard, id: nextId, name: `${selectedCard.name} 复制` };
    const duplicatedBindings = currentBindings.map((binding, index) => ({
      ...binding,
      id: `${nextId}_skill_${index + 1}`,
      cardId: nextId,
    }));
    setDraft({
      ...draft,
      cards: [...draft.cards, duplicatedCard],
      cardSkills: [...draft.cardSkills, ...duplicatedBindings],
    });
    setSelectedCardId(nextId);
  }

  function createBlankCard() {
    if (!draft || !canEdit) return;
    const nextId = `card_${Date.now()}`;
    const nextCard: CardRow = {
      id: nextId,
      name: '新卡牌',
      type: cardTypeFilter === 'all' ? 'action_utility' : cardTypeFilter,
      cost: '1',
      rarity: 'common',
      description: '',
      tags: '',
      income: '',
      stress: '',
      stressLimit: '',
      canDiscard: 'true',
      cardImagePath: '',
      illustrationPath: '',
      imageFitMode: 'contain',
      imageAnchorPreset: 'center',
      modelProfileId: '',
    };
    setDraft({
      ...draft,
      cards: [...draft.cards, nextCard],
    });
    setSelectedCardId(nextId);
  }

  function deleteSelectedCard() {
    if (!draft || !selectedCard || !canEdit) return;
    const remainingCards = draft.cards.filter(card => card.id !== selectedCard.id);
    const remainingBindings = draft.cardSkills.filter(binding => binding.cardId !== selectedCard.id);
    setDraft({
      ...draft,
      cards: remainingCards,
      cardSkills: remainingBindings,
    });
    setTableEditorOpen(false);
    setSelectedCardId(remainingCards[0]?.id ?? '');
  }

  async function handleSave() {
    if (!canEdit || !draft) return;
    const issues = collectTemplateValidationIssues(draft);
    setTemplateIssues(issues);
    const blockingIssues = issues.filter(issue => issue.blocking);
    if (blockingIssues.length > 0) {
      setError(`模板工作台存在 ${blockingIssues.length} 条阻断问题，请先修复后再保存。`);
      setInfo('');
      if (blockingIssues[0]?.templateId) {
        setSelectedTemplateId(blockingIssues[0].templateId);
        setTab('templates');
      }
      return;
    }
    setSaving(true);
    setError('');
    setInfo('');
    try {
      const next = await saveAdminDatasets(draft);
      setResponse(next);
      setDraft(cloneDatasets(next.raw));
      setTemplateIssues(collectTemplateValidationIssues(next.raw));
      const warningCount = issues.filter(issue => !issue.blocking).length;
      setInfo(
        warningCount > 0
          ? `CSV 已保存并重新编译，仍有 ${warningCount} 条警告可继续处理。`
          : 'CSV 已保存并重新编译，游戏页会在本地热更新时刷新。'
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  }

  function clearCardFilters() {
    setSearch('');
    setCardTypeFilter('all');
  }

  function toggleTableSort(field: CardSortField) {
    setTableSort(current =>
      current.field === field
        ? { field, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { field, direction: 'asc' }
    );
  }

  return (
    <div style={activeShellStyle}>
      <aside style={{ ...panelStyle, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>Admin</div>
            <div style={{ opacity: 0.64, fontSize: 13 }}>
              {response.canEdit ? '本地 CSV 编辑模式' : '只读模式'}
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={!response.canEdit || saving}
            style={{
              border: 0,
              borderRadius: 999,
              padding: '10px 16px',
              background: response.canEdit ? '#ffd280' : 'rgba(255,255,255,0.12)',
              color: '#241719',
              fontWeight: 700,
              cursor: response.canEdit ? 'pointer' : 'not-allowed',
            }}
          >
            {saving ? '保存中...' : '保存 CSV'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['cards', 'templates', 'global'] as AdminTab[]).map(item => (
            <button
              key={item}
              onClick={() => setTab(item)}
              style={{
                flex: 1,
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.12)',
                padding: '10px 12px',
                background: tab === item ? 'rgba(255,210,133,0.18)' : 'transparent',
                color: '#fff8ef',
                cursor: 'pointer',
              }}
            >
              {item === 'cards' ? '卡牌与技能' : item === 'templates' ? '模板工作台' : '全局参数'}
            </button>
          ))}
        </div>

        {error ? <div style={{ color: '#ffb4b4', marginBottom: 12 }}>{error}</div> : null}
        {info ? <div style={{ color: '#d3f9c6', marginBottom: 12 }}>{info}</div> : null}
        {!response.canEdit ? (
          <div style={{ color: '#ffd9a5', marginBottom: 12 }}>
            当前环境未连接本地 Admin API，线上仅提供只读预览。
          </div>
        ) : null}
        {templateIssues.length > 0 ? (
          <div style={{ color: '#ffcfaa', marginBottom: 12 }}>
            模板工作台有 {templateIssues.length} 条待修复校验问题。
          </div>
        ) : null}

        {tab === 'cards' ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
              <button
                disabled={!response.canEdit}
                onClick={createBlankCard}
                style={{ ...inputStyle(true), cursor: response.canEdit ? 'pointer' : 'not-allowed' }}
              >
                新建
              </button>
              <button
                disabled={!response.canEdit || !selectedCard}
                onClick={duplicateSelectedCard}
                style={{ ...inputStyle(true), cursor: response.canEdit ? 'pointer' : 'not-allowed' }}
              >
                复制
              </button>
              <button
                disabled={!response.canEdit || !selectedCard}
                onClick={deleteSelectedCard}
                style={{
                  ...inputStyle(true),
                  cursor: response.canEdit ? 'pointer' : 'not-allowed',
                  color: '#ffcece',
                }}
              >
                删除
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              {([
                ['detail', '原有布局'],
                ['table', '列表布局'],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  style={{
                    ...inputStyle(true),
                    cursor: 'pointer',
                    borderColor: viewMode === mode ? 'rgba(255,210,133,0.38)' : 'rgba(255,255,255,0.14)',
                    background: viewMode === mode ? 'rgba(255,210,133,0.12)' : 'rgba(255,255,255,0.04)',
                    fontWeight: viewMode === mode ? 700 : 500,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div
              style={{
                display: 'grid',
                gap: 12,
                marginBottom: 14,
                padding: 14,
                borderRadius: 18,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontWeight: 700 }}>筛选卡牌</div>
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="搜索 ID / 名称 / 标签 / 稀有度"
                  style={inputStyle(true)}
                />
                <AdminSelect
                  value={cardTypeFilter}
                  onChange={value => setCardTypeFilter(value)}
                  options={[
                    { value: 'all', label: '全部类型' },
                    ...cardTypeOptions.map(type => ({
                      value: type,
                      label: formatCardTypeOptionLabel(type),
                    })),
                  ]}
                />
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button
                  onClick={() => setCardTypeFilter('all')}
                  style={{
                    borderRadius: 999,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: cardTypeFilter === 'all' ? 'rgba(255,210,133,0.18)' : 'rgba(255,255,255,0.04)',
                    color: '#fff8ef',
                    padding: '8px 12px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  全部 · {draft.cards.length}
                </button>
                {cardTypeOptions.map(type => (
                  <button
                    key={type}
                    onClick={() => setCardTypeFilter(type)}
                    style={{
                      borderRadius: 999,
                      border: '1px solid rgba(255,255,255,0.12)',
                      background: cardTypeFilter === type ? 'rgba(255,210,133,0.18)' : 'rgba(255,255,255,0.04)',
                      color: '#fff8ef',
                      padding: '8px 12px',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    {formatCardTypeLabel(type)} · {allCardTypeSummary[type] ?? 0}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <div style={{ fontSize: 13, opacity: 0.76 }}>
                  命中 {visibleCards.length} 张卡牌
                  {cardTypeFilter !== 'all' ? `，类型 ${formatCardTypeLabel(cardTypeFilter)}` : ''}
                </div>
                {(search || cardTypeFilter !== 'all') ? (
                  <button
                    onClick={clearCardFilters}
                    style={{
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 999,
                      background: 'transparent',
                      color: '#fff8ef',
                      padding: '8px 12px',
                      cursor: 'pointer',
                    }}
                  >
                    清空筛选
                  </button>
                ) : null}
              </div>
            </div>
            {viewMode === 'table' ? (
              <div
                style={{
                  display: 'grid',
                  gap: 10,
                  marginBottom: 14,
                  padding: 14,
                  borderRadius: 18,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div style={{ fontWeight: 700 }}>列表排序</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                  <AdminSelect
                    value={tableSort.field}
                    onChange={value =>
                      setTableSort({
                        field: value as CardSortField,
                        direction: tableSort.direction,
                      })
                    }
                    options={Object.entries(tableSortFieldLabels).map(([field, label]) => ({
                      value: field,
                      label,
                    }))}
                  />
                  <button
                    onClick={() =>
                      setTableSort(current => ({
                        ...current,
                        direction: current.direction === 'asc' ? 'desc' : 'asc',
                      }))
                    }
                    style={{
                      borderRadius: 12,
                      border: '1px solid rgba(255,255,255,0.14)',
                      background: 'rgba(255,255,255,0.04)',
                      color: '#fff8ef',
                      padding: '10px 12px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {tableSort.direction === 'asc' ? '升序' : '降序'}
                  </button>
                </div>
                <div style={{ fontSize: 12, opacity: 0.72 }}>
                  当前按 {formatSortFieldLabel(tableSort.field)}
                  {tableSort.direction === 'asc' ? '升序' : '降序'} 排列，也可以直接点击表头切换。
                </div>
              </div>
            ) : null}
            {viewMode === 'detail' ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {visibleCards.map(card => (
                  <button
                    key={card.id}
                    onClick={() => setSelectedCardId(card.id)}
                    style={{
                      textAlign: 'left',
                      borderRadius: 14,
                      border: '1px solid rgba(255,255,255,0.08)',
                      background:
                        selectedCardId === card.id ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
                      color: '#fff8ef',
                      padding: 12,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                      <div style={{ fontWeight: 700 }}>{card.name}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>{card.rarity}</div>
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{card.id}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{card.type}</div>
                    <div style={{ fontSize: 12, opacity: 0.72, marginTop: 6 }}>{cardSummaryLabel(card)}</div>
                  </button>
                ))}
                {visibleCards.length === 0 ? (
                  <div style={{ opacity: 0.7, padding: '10px 2px' }}>没有匹配的卡牌。</div>
                ) : null}
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                <div
                  style={{
                    borderRadius: 16,
                    padding: 14,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>列表布局说明</div>
                  <div style={{ fontSize: 13, opacity: 0.76, lineHeight: 1.6 }}>
                    中间区域用于横向对比关键数值。数值列可直接编辑，描述、资源、技能等复杂配置通过右侧“深度编辑”进入。
                  </div>
                </div>

                <div
                  style={{
                    borderRadius: 16,
                    padding: 14,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 10 }}>当前筛选</div>
                  <div style={{ fontSize: 13, opacity: 0.76, marginBottom: 12 }}>
                    共 {visibleCards.length} 张卡牌
                    {selectedCard ? `，当前选中 ${selectedCard.name}` : ''}
                    {cardTypeFilter !== 'all' ? `，类型 ${formatCardTypeLabel(cardTypeFilter)}` : ''}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {Object.entries(cardTypeSummary).map(([type, count]) => (
                      <div
                        key={type}
                        style={{
                          borderRadius: 999,
                          padding: '6px 10px',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          fontSize: 12,
                        }}
                      >
                        {formatCardTypeLabel(type)} · {count}
                      </div>
                    ))}
                  </div>
                </div>

                {selectedCard ? (
                  <button
                    onClick={() => setTableEditorOpen(true)}
                    style={{
                      textAlign: 'left',
                      borderRadius: 16,
                      border: '1px solid rgba(255,210,133,0.18)',
                      background: 'rgba(255,210,133,0.08)',
                      color: '#fff8ef',
                      padding: 14,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>{selectedCard.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 4 }}>{selectedCard.id}</div>
                    <div style={{ fontSize: 12, opacity: 0.72 }}>{cardSummaryLabel(selectedCard)}</div>
                    <div style={{ fontSize: 12, opacity: 0.84, marginTop: 10 }}>点击进入深度编辑</div>
                  </button>
                ) : (
                  <div style={{ opacity: 0.7, padding: '10px 2px' }}>请在中间表格中选择一张卡牌。</div>
                )}
              </div>
            )}
          </>
        ) : tab === 'templates' ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <div
              style={{
                borderRadius: 14,
                padding: 12,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>模板工作台说明</div>
              <div style={{ fontSize: 13, opacity: 0.74, lineHeight: 1.6 }}>
                这里维护 `skillTemplates` 的参数 schema、operations 编排链、模板文案和引用影响面。
              </div>
            </div>
            <div
              style={{
                borderRadius: 14,
                padding: 12,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>当前状态</div>
              <div style={{ fontSize: 13, opacity: 0.74 }}>模板总数 {draft.skillTemplates.length}</div>
              <div style={{ fontSize: 13, opacity: 0.74 }}>绑定总数 {draft.cardSkills.length}</div>
              <div style={{ fontSize: 13, opacity: 0.74 }}>前端校验问题 {templateIssues.length}</div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            <div
              style={{
                borderRadius: 14,
                padding: 12,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>全局配置说明</div>
              <div style={{ fontSize: 13, opacity: 0.74, lineHeight: 1.6 }}>
                全局参数与起始牌堆编辑已移动到中间主区域，左侧这里只保留概览。
              </div>
            </div>
            <div
              style={{
                borderRadius: 14,
                padding: 12,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>当前状态</div>
              <div style={{ fontSize: 13, opacity: 0.74 }}>配置项总数 {draft.globalConfig.length}</div>
              <div style={{ fontSize: 13, opacity: 0.74 }}>
                牌堆条目数 {parseDeckConfigValue(draft.globalConfig.find(entry => entry.key === STARTING_DECK_CONFIG_KEY)?.value ?? '[]').length}
              </div>
            </div>
          </div>
        )}
      </aside>

      <main
        style={{
          ...panelStyle,
          padding: tab === 'cards' && viewMode === 'table' ? 16 : 24,
          overflow: tab === 'cards' && viewMode === 'table' ? 'hidden' : panelStyle.overflow,
          display: tab === 'cards' && viewMode === 'table' ? 'flex' : undefined,
          flexDirection: tab === 'cards' && viewMode === 'table' ? 'column' : undefined,
          minHeight: 0,
          boxSizing: 'border-box',
        }}
      >
        {tab === 'cards' ? (
          viewMode === 'detail' ? (
            <CardEditorPanel
              selectedCard={selectedCard}
              canEdit={response.canEdit}
              draft={draft}
              currentBindings={currentBindings}
              availableTemplates={availableTemplates}
              selectedModelProfile={selectedModelProfile}
              assetOptions={assetOptions}
              cardImageOptions={cardImageOptions}
              illustrationOptions={illustrationOptions}
              updateCard={updateCard}
              updateBinding={updateBinding}
              removeBinding={removeBinding}
              addBinding={addBinding}
              updateModelProfile={updateModelProfile}
              emptyState={<div style={{ display: 'grid', placeItems: 'center', minHeight: '100%' }}>选择左侧卡牌开始编辑</div>}
            />
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                flex: 1,
                minHeight: 0,
                height: '100%',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 16,
                  padding: 4,
                }}
              >
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>卡牌数值对比</div>
                  <div style={{ fontSize: 13, opacity: 0.72, lineHeight: 1.6 }}>
                    可按类型筛选，并按不同属性排序。实体卡的收益、初始压力、压力上限可直接内联调整，复杂字段通过“深度编辑”处理。
                  </div>
                </div>
                {selectedCard ? (
                  <button
                    onClick={() => setTableEditorOpen(true)}
                    style={{
                      border: 0,
                      borderRadius: 999,
                      padding: '10px 16px',
                      background: 'rgba(255,210,133,0.18)',
                      color: '#fff8ef',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    深度编辑当前卡牌
                  </button>
                ) : null}
              </div>

              <div
                style={{
                  borderRadius: 18,
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.03)',
                  overflowX: 'auto',
                  overflowY: 'auto',
                  minHeight: 0,
                  flex: 1,
                }}
              >
                <table
                  style={{
                    width: 'max-content',
                    minWidth: '100%',
                    borderCollapse: 'separate',
                    borderSpacing: 0,
                    tableLayout: 'auto',
                  }}
                >
                  <thead>
                    <tr>
                      {[
                        { label: '卡牌', field: 'name' as CardSortField },
                        { label: '类型', field: 'type' as CardSortField },
                        { label: '费用', field: 'cost' as CardSortField },
                        { label: '稀有度', field: 'rarity' as CardSortField },
                        { label: '收益', field: 'income' as CardSortField },
                        { label: '压力', field: 'stress' as CardSortField },
                        { label: '压力上限', field: 'stressLimit' as CardSortField },
                        { label: '可弃置', field: 'canDiscard' as CardSortField },
                        { label: '标签', field: 'tags' as CardSortField },
                        { label: '操作', field: null },
                      ].map(column => (
                        <th
                          key={column.label}
                          style={{
                            position: 'sticky',
                            top: 0,
                            zIndex: 1,
                            textAlign: 'left',
                            padding: '14px 12px',
                            background: '#1b171c',
                            borderBottom: '1px solid rgba(255,255,255,0.08)',
                            boxShadow: '0 1px 0 rgba(255,255,255,0.06)',
                            fontSize: 12,
                            letterSpacing: 0.8,
                            textTransform: 'uppercase',
                            opacity: 0.74,
                            ...(column.label === '费用' || column.label === '收益' || column.label === '压力'
                              ? compactNumericColumnStyle
                              : column.label === '压力上限'
                                ? compactLimitColumnStyle
                                : column.label === '可弃置'
                                  ? compactBooleanColumnStyle
                                  : null),
                            ...(column.label === '卡牌' ? { minWidth: 220, maxWidth: 320 } : null),
                            ...(column.label === '标签' ? { minWidth: 120, maxWidth: 180 } : null),
                            ...(column.label === '操作' ? { minWidth: 116, maxWidth: 132, width: '1%' } : null),
                            ...compactHeaderTextStyle,
                          }}
                        >
                          {column.field ? (
                            <button
                              onClick={() => toggleTableSort(column.field)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                border: 0,
                                background: 'transparent',
                                color: '#fff8ef',
                                padding: 0,
                                font: 'inherit',
                                textTransform: 'inherit',
                                letterSpacing: 'inherit',
                                cursor: 'pointer',
                              }}
                            >
                              <span>{column.label}</span>
                              <span style={{ opacity: tableSort.field === column.field ? 1 : 0.45 }}>
                                {tableSort.field === column.field ? (tableSort.direction === 'asc' ? '↑' : '↓') : '↕'}
                              </span>
                            </button>
                          ) : (
                            column.label
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCards.map(card => {
                      const entityCard = isEntityCard(card);
                      const selected = selectedCardId === card.id;

                      return (
                        <tr
                          key={card.id}
                          onClick={() => setSelectedCardId(card.id)}
                          style={{
                            background: selected ? 'rgba(255,210,133,0.09)' : 'transparent',
                            cursor: 'pointer',
                          }}
                        >
                          <td
                            style={{
                              padding: 12,
                              borderBottom: '1px solid rgba(255,255,255,0.06)',
                              minWidth: 220,
                              maxWidth: 320,
                            }}
                          >
                            <div style={{ fontWeight: 700, marginBottom: 4 }}>{card.name}</div>
                            <div style={{ fontSize: 12, opacity: 0.7 }}>{card.id}</div>
                            <div style={{ fontSize: 12, opacity: 0.58, marginTop: 6, lineHeight: 1.5 }}>
                              {card.description || '未填写描述'}
                            </div>
                          </td>
                          <td style={{ padding: 12, borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>
                            <div style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{formatCardTypeLabel(card.type)}</div>
                            <div style={{ fontSize: 11, opacity: 0.56, marginTop: 4, whiteSpace: 'nowrap' }}>{card.type}</div>
                          </td>
                          <td
                            style={{
                              padding: 12,
                              borderBottom: '1px solid rgba(255,255,255,0.06)',
                              ...compactNumericColumnStyle,
                            }}
                          >
                            <input
                              value={card.cost}
                              disabled={!response.canEdit}
                              onChange={event => updateCardById(card.id, { cost: event.target.value })}
                              style={tableInputStyle(!response.canEdit)}
                            />
                          </td>
                          <td style={{ padding: 12, borderBottom: '1px solid rgba(255,255,255,0.06)', minWidth: 126 }}>
                            <AdminSelect
                              value={card.rarity}
                              disabled={!response.canEdit}
                              compact
                              onChange={value => updateCardById(card.id, { rarity: value })}
                              options={['common', 'rare', 'epic', 'legendary'].map(option => ({
                                value: option,
                                label: option,
                              }))}
                            />
                          </td>
                          <td
                            style={{
                              padding: 12,
                              borderBottom: '1px solid rgba(255,255,255,0.06)',
                              ...compactNumericColumnStyle,
                            }}
                          >
                            {entityCard ? (
                              <input
                                value={card.income}
                                disabled={!response.canEdit}
                                onChange={event => updateCardById(card.id, { income: event.target.value })}
                                style={tableInputStyle(!response.canEdit)}
                              />
                            ) : (
                              <div style={{ opacity: 0.34, textAlign: 'center', ...compactHeaderTextStyle }}>-</div>
                            )}
                          </td>
                          <td
                            style={{
                              padding: 12,
                              borderBottom: '1px solid rgba(255,255,255,0.06)',
                              ...compactNumericColumnStyle,
                            }}
                          >
                            {entityCard ? (
                              <input
                                value={card.stress}
                                disabled={!response.canEdit}
                                onChange={event => updateCardById(card.id, { stress: event.target.value })}
                                style={tableInputStyle(!response.canEdit)}
                              />
                            ) : (
                              <div style={{ opacity: 0.34, textAlign: 'center', ...compactHeaderTextStyle }}>-</div>
                            )}
                          </td>
                          <td
                            style={{
                              padding: 12,
                              borderBottom: '1px solid rgba(255,255,255,0.06)',
                              ...compactLimitColumnStyle,
                            }}
                          >
                            {entityCard ? (
                              <input
                                value={card.stressLimit}
                                disabled={!response.canEdit}
                                onChange={event => updateCardById(card.id, { stressLimit: event.target.value })}
                                style={tableInputStyle(!response.canEdit)}
                              />
                            ) : (
                              <div style={{ opacity: 0.34, textAlign: 'center', ...compactHeaderTextStyle }}>-</div>
                            )}
                          </td>
                          <td
                            style={{
                              padding: 12,
                              borderBottom: '1px solid rgba(255,255,255,0.06)',
                              ...compactBooleanColumnStyle,
                            }}
                          >
                            <AdminSelect
                              value={card.canDiscard}
                              disabled={!response.canEdit}
                              compact
                              onChange={value => updateCardById(card.id, { canDiscard: value })}
                              options={[
                                { value: 'true', label: '可弃置' },
                                { value: 'false', label: '不可弃置' },
                              ]}
                            />
                          </td>
                          <td
                            style={{
                              padding: 12,
                              borderBottom: '1px solid rgba(255,255,255,0.06)',
                              minWidth: 140,
                              maxWidth: 220,
                            }}
                          >
                            <div
                              style={{
                                fontSize: 13,
                                opacity: card.tags ? 0.92 : 0.48,
                                whiteSpace: 'normal',
                                overflowWrap: 'anywhere',
                              }}
                            >
                              {card.tags || '—'}
                            </div>
                          </td>
                          <td style={{ padding: 12, borderBottom: '1px solid rgba(255,255,255,0.06)', minWidth: 132 }}>
                            <button
                              onClick={event => {
                                event.stopPropagation();
                                setSelectedCardId(card.id);
                                setTableEditorOpen(true);
                              }}
                              style={{
                                ...tableInputStyle(false),
                                cursor: 'pointer',
                                background: 'rgba(255,210,133,0.12)',
                                borderColor: 'rgba(255,210,133,0.24)',
                                fontWeight: 700,
                              }}
                            >
                              深度编辑
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {visibleCards.length === 0 ? (
                      <tr>
                        <td
                          colSpan={10}
                          style={{
                            padding: 28,
                            textAlign: 'center',
                            opacity: 0.7,
                          }}
                        >
                          当前筛选下没有匹配的卡牌。
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : tab === 'templates' ? (
          <div style={{ minHeight: '100%' }}>
            <TemplateWorkspace
              draft={draft}
              canEdit={response.canEdit}
              selectedTemplateId={selectedTemplateId}
              onSelectTemplate={setSelectedTemplateId}
              validationIssues={templateIssues}
              onDraftChange={(updater: (current: RawAdminDatasets) => RawAdminDatasets) => {
                setDraft(current => (current ? updater(current) : current));
              }}
            />
          </div>
        ) : tab === 'global' ? (
          <div style={{ minHeight: '100%' }}>
            <GlobalConfigEditor
              draft={draft}
              canEdit={response.canEdit}
              updateGlobalConfigEntry={updateGlobalConfigEntry}
            />
          </div>
        ) : (
          <div style={{ display: 'grid', placeItems: 'center', minHeight: '100%' }}>选择左侧卡牌开始编辑</div>
        )}
      </main>

      <div
        onPointerDown={handleRightPanelResizeStart}
        style={{
          position: 'relative',
          borderRight: rightPanelCollapsed ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(255,255,255,0.05)',
          borderLeft: '1px solid rgba(255,255,255,0.05)',
          background: rightPanelDragging ? 'rgba(255,210,133,0.14)' : 'rgba(255,255,255,0.02)',
          cursor: rightPanelCollapsed ? 'default' : 'col-resize',
          userSelect: 'none',
        }}
      >
        <button
          type="button"
          onClick={toggleRightPanel}
          title={rightPanelCollapsed ? '展开右侧信息列' : '折叠右侧信息列'}
          style={{
            position: 'absolute',
            top: 18,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 18,
            height: 64,
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.12)',
            background: rightPanelCollapsed ? 'rgba(255,210,133,0.18)' : 'rgba(255,255,255,0.05)',
            color: '#fff8ef',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {rightPanelCollapsed ? '‹' : '›'}
        </button>
        {!rightPanelCollapsed ? (
          <div
            style={{
              position: 'absolute',
              inset: '96px 50% 24px auto',
              width: 2,
              borderRadius: 999,
              background: rightPanelDragging ? 'rgba(255,210,133,0.9)' : 'rgba(255,255,255,0.14)',
              transform: 'translateX(50%)',
            }}
          />
        ) : null}
      </div>

      <aside
        style={{
          padding: rightPanelCollapsed ? 0 : 24,
          overflow: rightPanelCollapsed ? 'hidden' : 'auto',
          opacity: rightPanelCollapsed ? 0 : 1,
          pointerEvents: rightPanelCollapsed ? 'none' : 'auto',
          minWidth: 0,
          transition: rightPanelDragging ? undefined : 'opacity 140ms ease, padding 140ms ease',
        }}
      >
        {tab === 'templates' ? (
          <div style={{ display: 'grid', gap: 18 }}>
            <div
              style={{
                borderRadius: 20,
                padding: 18,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {sectionTitle('Template Status')}
              <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                  结构化编排结果会在中间工作台实时更新。保存时仍以 CSV 编译链作为最终权威校验。
                </div>
                <div style={{ fontSize: 13, opacity: 0.72 }}>当前模板数 {draft.skillTemplates.length}</div>
                <div style={{ fontSize: 13, opacity: 0.72 }}>当前绑定数 {draft.cardSkills.length}</div>
                <div style={{ fontSize: 13, opacity: templateIssues.length > 0 ? 1 : 0.72, color: templateIssues.length > 0 ? '#ffcece' : '#d3f9c6' }}>
                  {templateIssues.length > 0 ? `前端校验问题 ${templateIssues.length} 条` : '前端结构校验通过'}
                </div>
              </div>
            </div>
          </div>
        ) : tab === 'global' ? (
          <div style={{ display: 'grid', gap: 18 }}>
            <div
              style={{
                borderRadius: 20,
                padding: 18,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {sectionTitle('Global Summary')}
              {(() => {
                const deckItems = parseDeckConfigValue(
                  draft.globalConfig.find(entry => entry.key === STARTING_DECK_CONFIG_KEY)?.value ?? '[]'
                );
                const summary = buildDeckSummary(deckItems, draft.cards);
                return (
                  <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                    <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                      通用规则参数与起始牌堆都已搬到中间主编辑区，右侧只展示配置概览。
                    </div>
                    <div style={{ fontSize: 13, opacity: 0.72 }}>全局配置项 {draft.globalConfig.length}</div>
                    <div style={{ fontSize: 13, opacity: 0.72 }}>起始牌堆条目 {deckItems.length}</div>
                    <div style={{ fontSize: 13, opacity: 0.72 }}>起始牌堆总张数 {summary.totalCards}</div>
                    <div style={{ fontSize: 13, opacity: summary.missingCards > 0 ? 1 : 0.72, color: summary.missingCards > 0 ? '#ffcece' : '#d3f9c6' }}>
                      {summary.missingCards > 0 ? `存在 ${summary.missingCards} 条失效卡牌引用` : '牌堆引用有效'}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        ) : (
        <div style={{ display: 'grid', gap: 18 }}>
          <div
            style={{
              borderRadius: 20,
              padding: 18,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              {sectionTitle(viewMode === 'table' ? 'Selected Card' : 'Card Preview')}
              {tab === 'cards' && viewMode === 'table' && selectedCard ? (
                <button
                  onClick={() => setTableEditorOpen(true)}
                  style={{
                    border: 0,
                    borderRadius: 999,
                    padding: '8px 12px',
                    background: 'rgba(255,210,133,0.18)',
                    color: '#fff8ef',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  深度编辑
                </button>
              ) : null}
            </div>
            {selectedCard ? (
              <>
                <div
                  style={{
                    marginTop: 12,
                    borderRadius: 24,
                    padding: 18,
                    background: 'linear-gradient(180deg, rgba(255,248,238,0.92) 0%, rgba(255,234,206,0.88) 100%)',
                    color: '#2a1b1e',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 12, letterSpacing: 1.3, textTransform: 'uppercase', opacity: 0.56 }}>
                        {selectedCard.rarity}
                      </div>
                      <div style={{ fontSize: 26, fontWeight: 800 }}>{selectedCard.name}</div>
                    </div>
                    <div
                      style={{
                        minWidth: 48,
                        height: 48,
                        borderRadius: 999,
                        display: 'grid',
                        placeItems: 'center',
                        background: '#2a1b1e',
                        color: '#fff8ef',
                        fontWeight: 700,
                      }}
                    >
                      {selectedCard.cost}
                    </div>
                  </div>
                  <div
                    style={{
                      borderRadius: 18,
                      overflow: 'hidden',
                      background: '#25171a',
                      aspectRatio: '16 / 10',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    {selectedCard.cardImagePath ? (
                        <img
                          src={selectedCard.cardImagePath}
                          alt={selectedCard.name}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: (selectedCard.imageFitMode || 'contain') as 'contain' | 'cover',
                          }}
                        />
                    ) : (
                      <div>未配置卡面资源</div>
                    )}
                  </div>
                  <div style={{ marginTop: 14, fontSize: 14, lineHeight: 1.5 }}>{selectedCard.description}</div>
                  {currentBindings.length > 0 ? (
                    <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                      {currentBindings.map(binding => {
                        const template = draft.skillTemplates.find(item => item.id === binding.templateId);
                        const params = parseJsonSafe<Record<string, unknown>>(binding.paramsJson, {});
                        return (
                          <div key={binding.id} style={{ fontSize: 13, opacity: 0.8 }}>
                            {renderTemplateSummary(template, params)}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <div style={{ marginTop: 12, opacity: 0.7 }}>选择一张卡牌以查看预览。</div>
            )}
          </div>

          {isStageEntityCardType(selectedCard?.type) ? (
            <div
              style={{
                borderRadius: 20,
                padding: 18,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {sectionTitle('3D Preview')}
              <div style={{ marginTop: 12 }}>
                <ModelPreviewCanvas presetSource={selectedModelProfile?.source} />
              </div>
              <div style={{ marginTop: 12, fontSize: 13, opacity: 0.72 }}>
                {selectedModelProfile
                  ? `${selectedModelProfile.name} / ${selectedModelProfile.source}`
                  : '当前卡牌未绑定 3D 模型配置'}
              </div>
            </div>
          ) : null}

          <div
            style={{
              borderRadius: 20,
              padding: 18,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {sectionTitle('Skill Flow')}
            {currentBindings.length > 0 ? (
              <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                {currentBindings.map(binding => {
                  const template = draft.skillTemplates.find(item => item.id === binding.templateId);
                  const params = parseJsonSafe<Record<string, unknown>>(binding.paramsJson, {});
                  return (
                    <div
                      key={binding.id}
                      style={{
                        borderRadius: 14,
                        padding: 12,
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>{template?.name ?? binding.templateId}</div>
                      <div style={{ fontSize: 12, opacity: 0.66, marginBottom: 8 }}>
                        触发 {template?.trigger ?? '-'} {'->'} 目标 {template?.targetMode ?? '-'} {'->'} 效果{' '}
                        {template?.effectKind ?? '-'}
                      </div>
                      {readOperationsSummary(template).length > 0 ? (
                        <div style={{ fontSize: 12, opacity: 0.56, marginBottom: 8 }}>
                          执行链 {readOperationsSummary(template).join(' -> ')}
                        </div>
                      ) : null}
                      <div>{renderTemplateSummary(template, params)}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ marginTop: 12, opacity: 0.7 }}>当前卡牌尚未绑定技能模板。</div>
            )}
          </div>
        </div>
        )}
      </aside>

      {tab === 'cards' && viewMode === 'table' && tableEditorOpen && selectedCard ? (
        <div
          onClick={() => setTableEditorOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(10, 8, 11, 0.58)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            justifyContent: 'flex-end',
            zIndex: 20,
          }}
        >
          <div
            onClick={event => event.stopPropagation()}
            style={{
              width: 'min(680px, 100vw)',
              height: '100%',
              background: 'linear-gradient(180deg, #171218 0%, #120f14 100%)',
              borderLeft: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '-24px 0 48px rgba(0,0,0,0.32)',
              display: 'grid',
              gridTemplateRows: 'auto 1fr',
            }}
          >
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 16,
              }}
            >
              <div>
                <div style={{ fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', opacity: 0.62 }}>
                  Detail Drawer
                </div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{selectedCard.name}</div>
              </div>
              <button
                onClick={() => setTableEditorOpen(false)}
                style={{
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 999,
                  padding: '10px 14px',
                  background: 'rgba(255,255,255,0.04)',
                  color: '#fff8ef',
                  cursor: 'pointer',
                }}
              >
                关闭
              </button>
            </div>

            <div style={{ overflow: 'auto', padding: 24 }}>
              <CardEditorPanel
                selectedCard={selectedCard}
                canEdit={response.canEdit}
                draft={draft}
                currentBindings={currentBindings}
                availableTemplates={availableTemplates}
                selectedModelProfile={selectedModelProfile}
                assetOptions={assetOptions}
                cardImageOptions={cardImageOptions}
                illustrationOptions={illustrationOptions}
                updateCard={updateCard}
                updateBinding={updateBinding}
                removeBinding={removeBinding}
                addBinding={addBinding}
                updateModelProfile={updateModelProfile}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
