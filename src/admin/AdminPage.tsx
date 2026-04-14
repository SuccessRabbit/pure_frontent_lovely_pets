import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { loadAdminDatasets, saveAdminDatasets, subscribeToAdminEvents } from './api';
import { ModelPreviewCanvas } from './ModelPreviewCanvas';
import type {
  AdminDatasetResponse,
  CardRow,
  CardSkillRow,
  ModelProfileRow,
  RawAdminDatasets,
  SkillTemplateRow,
} from './types';

type AdminTab = 'cards' | 'global';
type CardViewMode = 'detail' | 'table';

interface ParamSchemaField {
  name: string;
  label: string;
  type: 'number' | 'text' | 'select';
  defaultValue?: number | string;
  options?: string[];
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

function parseJsonSafe<T>(value: string, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
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
  const scopes = template.scope.split('|').filter(Boolean);
  if (scopes.length === 0) return true;
  return scopes.includes(cardType);
}

function renderBindingSummary(template: SkillTemplateRow | undefined, binding: CardSkillRow) {
  if (!template) return '未匹配到技能模板';
  const params = parseJsonSafe<Record<string, unknown>>(binding.paramsJson, {});
  const summary = template.summaryTemplate || template.descriptionTemplate || template.name;
  return summary.replace(/\{(\w+)\}/g, (_match, key) => String(params[key] ?? ''));
}

function readParamSchema(template: SkillTemplateRow | undefined): ParamSchemaField[] {
  if (!template) return [];
  return parseJsonSafe<ParamSchemaField[]>(template.paramSchemaJson, []);
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

function sectionTitle(label: string) {
  return <div style={{ fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', opacity: 0.64 }}>{label}</div>;
}

function isEntityCard(card: CardRow) {
  return card.type.startsWith('entity_');
}

function sortCardsForComparison(cards: CardRow[]) {
  return [...cards].sort((a, b) => {
    const typeDiff = a.type.localeCompare(b.type);
    if (typeDiff !== 0) return typeDiff;

    const aCost = Number(a.cost);
    const bCost = Number(b.cost);
    const normalizedACost = Number.isFinite(aCost) ? aCost : Number.MAX_SAFE_INTEGER;
    const normalizedBCost = Number.isFinite(bCost) ? bCost : Number.MAX_SAFE_INTEGER;
    if (normalizedACost !== normalizedBCost) return normalizedACost - normalizedBCost;

    return a.id.localeCompare(b.id);
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
          <select
            value={selectedCard.rarity}
            disabled={!canEdit}
            onChange={event => updateCard({ rarity: event.target.value })}
            style={inputStyle(true)}
          >
            {['common', 'rare', 'epic', 'legendary'].map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
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
          <select
            value={selectedCard.cardImagePath}
            disabled={!canEdit}
            onChange={event => updateCard({ cardImagePath: event.target.value })}
            style={inputStyle(true)}
          >
            <option value="">未绑定</option>
            {cardImageOptions.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label>
          <div style={{ marginBottom: 6 }}>插画资源</div>
          <select
            value={selectedCard.illustrationPath}
            disabled={!canEdit}
            onChange={event => updateCard({ illustrationPath: event.target.value })}
            style={inputStyle(true)}
          >
            <option value="">未绑定</option>
            {illustrationOptions.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        {selectedCard.type === 'entity_pet' ? (
          <>
            <label>
              <div style={{ marginBottom: 6 }}>3D 模型配置</div>
              <select
                value={selectedCard.modelProfileId}
                disabled={!canEdit}
                onChange={event => updateCard({ modelProfileId: event.target.value })}
                style={inputStyle(true)}
              >
                <option value="">未绑定</option>
                {draft.modelProfiles.map(profile => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
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
                  <select
                    value={selectedModelProfile.source}
                    disabled={!canEdit}
                    onChange={event => updateModelProfile(selectedModelProfile.id, { source: event.target.value })}
                    style={inputStyle(true)}
                  >
                    {assetOptions.modelPresetSources.map(option => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
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
          const schema = readParamSchema(template);
          const params = parseJsonSafe<Record<string, string | number>>(binding.paramsJson, {});

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
                <select
                  value={binding.templateId}
                  disabled={!canEdit}
                  onChange={event => updateBinding(binding.id, { templateId: event.target.value })}
                  style={inputStyle(true)}
                >
                  {availableTemplates.map(option => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
                <input
                  value={binding.sortOrder}
                  disabled={!canEdit}
                  onChange={event => updateBinding(binding.id, { sortOrder: event.target.value })}
                  style={inputStyle(true)}
                />
                <select
                  value={binding.enabled}
                  disabled={!canEdit}
                  onChange={event => updateBinding(binding.id, { enabled: event.target.value })}
                  style={inputStyle(true)}
                >
                  <option value="true">启用</option>
                  <option value="false">停用</option>
                </select>
              </div>

              {schema.length > 0 ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  {schema.map(field => (
                    <label key={field.name}>
                      <div style={{ marginBottom: 6 }}>{field.label}</div>
                      {field.type === 'select' ? (
                        <select
                          value={String(params[field.name] ?? field.defaultValue ?? '')}
                          disabled={!canEdit}
                          onChange={event => {
                            const nextParams = { ...params, [field.name]: event.target.value };
                            updateBinding(binding.id, { paramsJson: JSON.stringify(nextParams) });
                          }}
                          style={inputStyle(true)}
                        >
                          {(field.options ?? []).map(option => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={String(params[field.name] ?? field.defaultValue ?? '')}
                          disabled={!canEdit}
                          onChange={event => {
                            const value = field.type === 'number' ? Number(event.target.value) : event.target.value;
                            const nextParams = { ...params, [field.name]: value };
                            updateBinding(binding.id, { paramsJson: JSON.stringify(nextParams) });
                          }}
                          style={inputStyle(true)}
                        />
                      )}
                    </label>
                  ))}
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
                <div style={{ fontSize: 12, opacity: 0.66, marginBottom: 4 }}>规则摘要</div>
                <div>{renderBindingSummary(template, binding)}</div>
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

export function AdminPage() {
  const [response, setResponse] = useState<AdminDatasetResponse | null>(null);
  const [draft, setDraft] = useState<RawAdminDatasets | null>(null);
  const [tab, setTab] = useState<AdminTab>('cards');
  const [viewMode, setViewMode] = useState<CardViewMode>('detail');
  const [selectedCardId, setSelectedCardId] = useState<string>('');
  const [tableEditorOpen, setTableEditorOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const canEdit = response?.canEdit ?? false;

  useEffect(() => {
    void (async () => {
      const payload = await loadAdminDatasets();
      setResponse(payload);
      setDraft(cloneDatasets(payload.raw));
      setSelectedCardId(payload.raw.cards[0]?.id ?? '');
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

  const visibleCards = useMemo(() => {
    if (!draft) return [];
    const query = search.trim().toLowerCase();
    const filtered = !query
      ? draft.cards
      : draft.cards.filter(card => `${card.id} ${card.name} ${card.type}`.toLowerCase().includes(query));
    return sortCardsForComparison(filtered);
  }, [draft, search]);

  const currentBindings = useMemo(() => {
    if (!draft || !selectedCard) return [];
    return cardSkillBindings(draft, selectedCard.id);
  }, [draft, selectedCard]);

  const availableTemplates = useMemo(() => {
    if (!draft || !selectedCard) return [];
    return draft.skillTemplates.filter(template => templateSupportsCard(template, selectedCard.type));
  }, [draft, selectedCard]);

  const cardTypeSummary = useMemo(() => buildCardTypeSummary(visibleCards), [visibleCards]);

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
  const activeShellStyle: CSSProperties =
    tab === 'cards' && viewMode === 'table'
      ? { ...shellStyle, gridTemplateColumns: '320px minmax(760px, 1fr) 420px' }
      : shellStyle;
  const cardImageOptions = selectedCard
    ? filterAssetOptions(assetOptions.cardImages, selectedCard.type)
    : assetOptions.cardImages;
  const illustrationOptions = selectedCard
    ? filterAssetOptions(assetOptions.illustrations, selectedCard.type)
    : assetOptions.illustrations;

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
      type: 'action_utility',
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
    setSaving(true);
    setError('');
    setInfo('');
    try {
      const next = await saveAdminDatasets(draft);
      setResponse(next);
      setDraft(cloneDatasets(next.raw));
      setInfo('CSV 已保存并重新编译，游戏页会在本地热更新时刷新。');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
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
          {(['cards', 'global'] as AdminTab[]).map(item => (
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
              {item === 'cards' ? '卡牌与技能' : '全局参数'}
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
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="搜索卡牌 ID / 名称"
              style={{ ...inputStyle(true), marginBottom: 14 }}
            />
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
                        {type} · {count}
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
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {draft.globalConfig.map((entry, index) => (
              <div
                key={entry.key}
                style={{
                  borderRadius: 14,
                  padding: 12,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div style={{ fontWeight: 700 }}>{entry.key}</div>
                <div style={{ fontSize: 12, opacity: 0.64, marginBottom: 8 }}>{entry.description}</div>
                <input
                  disabled={!response.canEdit}
                  value={entry.value}
                  onChange={event => {
                    const value = event.target.value;
                    setDraft(current => {
                      if (!current) return current;
                      const next = [...current.globalConfig];
                      next[index] = { ...next[index], value };
                      return { ...current, globalConfig: next };
                    });
                  }}
                  style={inputStyle(true)}
                />
              </div>
            ))}
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
                    列表按类型、费用、ID 排序。实体卡的收益、初始压力、压力上限可直接内联调整，复杂字段通过“深度编辑”处理。
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
                      {['卡牌', '类型', '费用', '稀有度', '收益', '压力', '压力上限', '可弃置', '标签', '操作'].map(label => (
                        <th
                          key={label}
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
                            ...(label === '费用' || label === '收益' || label === '压力'
                              ? compactNumericColumnStyle
                              : label === '压力上限'
                                ? compactLimitColumnStyle
                                : label === '可弃置'
                                  ? compactBooleanColumnStyle
                                  : null),
                            ...(label === '卡牌' ? { minWidth: 220, maxWidth: 320 } : null),
                            ...(label === '标签' ? { minWidth: 120, maxWidth: 180 } : null),
                            ...(label === '操作' ? { minWidth: 116, maxWidth: 132, width: '1%' } : null),
                            ...compactHeaderTextStyle,
                          }}
                        >
                          {label}
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
                            <div style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{card.type}</div>
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
                            <select
                              value={card.rarity}
                              disabled={!response.canEdit}
                              onChange={event => updateCardById(card.id, { rarity: event.target.value })}
                              style={tableInputStyle(!response.canEdit)}
                            >
                              {['common', 'rare', 'epic', 'legendary'].map(option => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
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
                            <select
                              value={card.canDiscard}
                              disabled={!response.canEdit}
                              onChange={event => updateCardById(card.id, { canDiscard: event.target.value })}
                              style={tableInputStyle(!response.canEdit)}
                            >
                              <option value="true">可弃置</option>
                              <option value="false">不可弃置</option>
                            </select>
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
        ) : (
          <div style={{ display: 'grid', placeItems: 'center', minHeight: '100%' }}>选择左侧卡牌开始编辑</div>
        )}
      </main>

      <aside style={{ padding: 24, overflow: 'auto' }}>
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
                        return (
                          <div key={binding.id} style={{ fontSize: 13, opacity: 0.8 }}>
                            {renderBindingSummary(template, binding)}
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

          {selectedCard?.type === 'entity_pet' ? (
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
                      <div>{renderBindingSummary(template, binding)}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ marginTop: 12, opacity: 0.7 }}>当前卡牌尚未绑定技能模板。</div>
            )}
          </div>
        </div>
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
