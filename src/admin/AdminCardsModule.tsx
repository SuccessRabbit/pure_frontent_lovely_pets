import type { ReactNode } from 'react';
import { AdminSelect } from './AdminSelect';
import { ModelPreviewCanvas } from './ModelPreviewCanvas';
import { formatCardTypeLabel, parseJsonSafe, readOperationsSummary, renderTemplateSummary } from './templateSchema';
import {
  buildCardTypeSummary,
  cardSummaryLabel,
  formatCardTypeOptionLabel,
  formatSortFieldLabel,
  isStageEntityCardType,
  tableSortFieldLabels,
} from './adminDomain';
import {
  type AssetOptions,
  compactBooleanColumnStyle,
  compactHeaderTextStyle,
  compactLimitColumnStyle,
  compactNumericColumnStyle,
  inputStyle,
  sectionTitle,
  tableInputStyle,
} from './adminShared';
import { AdminCardEditorPanel } from './AdminCardEditorPanel';
import type {
  CardSortField,
  CardSortState,
  CardViewMode,
} from './adminShared';
import type {
  CardRow,
  CardSkillRow,
  ModelProfileRow,
  RawAdminDatasets,
  SkillTemplateRow,
} from './types';

interface AdminCardsModuleProps {
  canEdit: boolean;
  draft: RawAdminDatasets;
  viewMode: CardViewMode;
  setViewMode: (mode: CardViewMode) => void;
  search: string;
  setSearch: (value: string) => void;
  cardTypeFilter: string;
  setCardTypeFilter: (value: string) => void;
  tableSort: CardSortState;
  setTableSort: (next: CardSortState | ((current: CardSortState) => CardSortState)) => void;
  selectedCard: CardRow | null;
  selectedCardId: string;
  setSelectedCardId: (cardId: string) => void;
  visibleCards: CardRow[];
  filteredCards: CardRow[];
  currentBindings: CardSkillRow[];
  availableTemplates: SkillTemplateRow[];
  selectedModelProfile: ModelProfileRow | null;
  assetOptions: AssetOptions;
  cardImageOptions: string[];
  illustrationOptions: string[];
  onCreateCard: () => void;
  onDuplicateCard: () => void;
  onDeleteCard: () => void;
  onOpenTableEditor: () => void;
  updateCardById: (cardId: string, patch: Partial<CardRow>) => void;
  updateCard: (patch: Partial<CardRow>) => void;
  updateBinding: (bindingId: string, patch: Partial<CardSkillRow>) => void;
  removeBinding: (bindingId: string) => void;
  addBinding: () => void;
  updateModelProfile: (profileId: string, patch: Partial<ModelProfileRow>) => void;
  tableEditorOpen: boolean;
  setTableEditorOpen: (open: boolean) => void;
}

function detailCardButton(card: CardRow, selectedCardId: string, setSelectedCardId: (cardId: string) => void) {
  return (
    <button
      key={card.id}
      onClick={() => setSelectedCardId(card.id)}
      style={{
        textAlign: 'left',
        borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.08)',
        background: selectedCardId === card.id ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
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
  );
}

function renderCardInspector(
  selectedCard: CardRow | null,
  draft: RawAdminDatasets,
  currentBindings: CardSkillRow[],
  selectedModelProfile: ModelProfileRow | null,
  viewMode: CardViewMode,
  onOpenTableEditor: () => void
) {
  return (
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
          {viewMode === 'table' && selectedCard ? (
            <button
              onClick={onOpenTableEditor}
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
            {selectedModelProfile ? `${selectedModelProfile.name} / ${selectedModelProfile.source}` : '当前卡牌未绑定 3D 模型配置'}
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
                    触发 {template?.trigger ?? '-'} {'->'} 目标 {template?.targetMode ?? '-'} {'->'} 效果 {template?.effectKind ?? '-'}
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
  );
}

function renderTable(
  visibleCards: CardRow[],
  selectedCardId: string,
  setSelectedCardId: (cardId: string) => void,
  onOpenTableEditor: (cardId: string) => void,
  tableSort: CardSortState,
  toggleTableSort: (field: CardSortField) => void,
  canEdit: boolean,
  updateCardById: (cardId: string, patch: Partial<CardRow>) => void
) {
  return (
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
            const entityCard = card.type.startsWith('entity_');
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
                <td style={{ padding: 12, borderBottom: '1px solid rgba(255,255,255,0.06)', minWidth: 220, maxWidth: 320 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{card.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{card.id}</div>
                  <div style={{ fontSize: 12, opacity: 0.58, marginTop: 6, lineHeight: 1.5 }}>{card.description || '未填写描述'}</div>
                </td>
                <td style={{ padding: 12, borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>
                  <div style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{formatCardTypeLabel(card.type)}</div>
                  <div style={{ fontSize: 11, opacity: 0.56, marginTop: 4, whiteSpace: 'nowrap' }}>{card.type}</div>
                </td>
                <td style={{ padding: 12, borderBottom: '1px solid rgba(255,255,255,0.06)', ...compactNumericColumnStyle }}>
                  <input
                    value={card.cost}
                    disabled={!canEdit}
                    onChange={event => updateCardById(card.id, { cost: event.target.value })}
                    style={tableInputStyle(!canEdit)}
                  />
                </td>
                <td style={{ padding: 12, borderBottom: '1px solid rgba(255,255,255,0.06)', minWidth: 126 }}>
                  <AdminSelect
                    value={card.rarity}
                    disabled={!canEdit}
                    compact
                    onChange={value => updateCardById(card.id, { rarity: value })}
                    options={['common', 'rare', 'epic', 'legendary'].map(option => ({ value: option, label: option }))}
                  />
                </td>
                <td style={{ padding: 12, borderBottom: '1px solid rgba(255,255,255,0.06)', ...compactNumericColumnStyle }}>
                  {entityCard ? (
                    <input
                      value={card.income}
                      disabled={!canEdit}
                      onChange={event => updateCardById(card.id, { income: event.target.value })}
                      style={tableInputStyle(!canEdit)}
                    />
                  ) : (
                    <div style={{ opacity: 0.34, textAlign: 'center', ...compactHeaderTextStyle }}>-</div>
                  )}
                </td>
                <td style={{ padding: 12, borderBottom: '1px solid rgba(255,255,255,0.06)', ...compactNumericColumnStyle }}>
                  {entityCard ? (
                    <input
                      value={card.stress}
                      disabled={!canEdit}
                      onChange={event => updateCardById(card.id, { stress: event.target.value })}
                      style={tableInputStyle(!canEdit)}
                    />
                  ) : (
                    <div style={{ opacity: 0.34, textAlign: 'center', ...compactHeaderTextStyle }}>-</div>
                  )}
                </td>
                <td style={{ padding: 12, borderBottom: '1px solid rgba(255,255,255,0.06)', ...compactLimitColumnStyle }}>
                  {entityCard ? (
                    <input
                      value={card.stressLimit}
                      disabled={!canEdit}
                      onChange={event => updateCardById(card.id, { stressLimit: event.target.value })}
                      style={tableInputStyle(!canEdit)}
                    />
                  ) : (
                    <div style={{ opacity: 0.34, textAlign: 'center', ...compactHeaderTextStyle }}>-</div>
                  )}
                </td>
                <td style={{ padding: 12, borderBottom: '1px solid rgba(255,255,255,0.06)', ...compactBooleanColumnStyle }}>
                  <AdminSelect
                    value={card.canDiscard}
                    disabled={!canEdit}
                    compact
                    onChange={value => updateCardById(card.id, { canDiscard: value })}
                    options={[
                      { value: 'true', label: '可弃置' },
                      { value: 'false', label: '不可弃置' },
                    ]}
                  />
                </td>
                <td style={{ padding: 12, borderBottom: '1px solid rgba(255,255,255,0.06)', minWidth: 140, maxWidth: 220 }}>
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
                      onOpenTableEditor(card.id);
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
              <td colSpan={10} style={{ padding: 28, textAlign: 'center', opacity: 0.7 }}>
                当前筛选下没有匹配的卡牌。
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function renderTableMain(
  canEdit: boolean,
  selectedCard: CardRow | null,
  visibleCards: CardRow[],
  cardTypeFilter: string,
  onOpenTableEditor: () => void,
  tableSort: CardSortState,
  toggleTableSort: (field: CardSortField) => void,
  updateCardById: (cardId: string, patch: Partial<CardRow>) => void,
  selectedCardId: string,
  setSelectedCardId: (cardId: string) => void,
  filteredCards: CardRow[]
) {
  const cardTypeSummary = buildCardTypeSummary(filteredCards);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minHeight: 0, height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, padding: 4 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>卡牌数值对比</div>
          <div style={{ fontSize: 13, opacity: 0.72, lineHeight: 1.6 }}>
            可按类型筛选，并按不同属性排序。实体卡的收益、初始压力、压力上限可直接内联调整，复杂字段通过“深度编辑”处理。
          </div>
        </div>
        {selectedCard ? (
          <button
            onClick={onOpenTableEditor}
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

      {renderTable(visibleCards, selectedCardId, setSelectedCardId, cardId => {
        setSelectedCardId(cardId);
        onOpenTableEditor();
      }, tableSort, toggleTableSort, canEdit, updateCardById)}

      <div style={{ display: 'grid', gap: 12 }}>
        <div
          style={{
            borderRadius: 16,
            padding: 14,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>当前筛选</div>
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
      </div>
    </div>
  );
}

function renderLeftSidebar(
  canEdit: boolean,
  selectedCard: CardRow | null,
  viewMode: CardViewMode,
  setViewMode: (mode: CardViewMode) => void,
  search: string,
  setSearch: (value: string) => void,
  cardTypeFilter: string,
  setCardTypeFilter: (value: string) => void,
  draft: RawAdminDatasets,
  visibleCards: CardRow[],
  selectedCardId: string,
  setSelectedCardId: (cardId: string) => void,
  cardTypeOptions: string[],
  tableSort: CardSortState,
  setTableSort: (next: CardSortState | ((current: CardSortState) => CardSortState)) => void,
  onCreateCard: () => void,
  onDuplicateCard: () => void,
  onDeleteCard: () => void,
  onOpenTableEditor: () => void
) {
  const allCardTypeSummary = buildCardTypeSummary(draft.cards);
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
        <button disabled={!canEdit} onClick={onCreateCard} style={{ ...inputStyle(true), cursor: canEdit ? 'pointer' : 'not-allowed' }}>
          新建
        </button>
        <button disabled={!canEdit || !selectedCard} onClick={onDuplicateCard} style={{ ...inputStyle(true), cursor: canEdit ? 'pointer' : 'not-allowed' }}>
          复制
        </button>
        <button
          disabled={!canEdit || !selectedCard}
          onClick={onDeleteCard}
          style={{ ...inputStyle(true), cursor: canEdit ? 'pointer' : 'not-allowed', color: '#ffcece' }}
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
            options={[{ value: 'all', label: '全部类型' }, ...cardTypeOptions.map(type => ({ value: type, label: formatCardTypeOptionLabel(type) }))]}
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
              onClick={() => {
                setSearch('');
                setCardTypeFilter('all');
              }}
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
              onChange={value => setTableSort({ field: value as CardSortField, direction: tableSort.direction })}
              options={Object.entries(tableSortFieldLabels).map(([field, label]) => ({ value: field, label }))}
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
          {visibleCards.map(card => detailCardButton(card, selectedCardId, setSelectedCardId))}
          {visibleCards.length === 0 ? <div style={{ opacity: 0.7, padding: '10px 2px' }}>没有匹配的卡牌。</div> : null}
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

          {selectedCard ? (
            <button
              onClick={onOpenTableEditor}
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
  );
}

export function AdminCardsModule(props: AdminCardsModuleProps) {
  const {
    canEdit,
    draft,
    viewMode,
    setViewMode,
    search,
    setSearch,
    cardTypeFilter,
    setCardTypeFilter,
    tableSort,
    setTableSort,
    selectedCard,
    selectedCardId,
    setSelectedCardId,
    visibleCards,
    filteredCards,
    currentBindings,
    availableTemplates,
    selectedModelProfile,
    assetOptions,
    cardImageOptions,
    illustrationOptions,
    onCreateCard,
    onDuplicateCard,
    onDeleteCard,
    onOpenTableEditor,
    updateCardById,
    updateCard,
    updateBinding,
    removeBinding,
    addBinding,
    updateModelProfile,
    tableEditorOpen,
    setTableEditorOpen,
  } = props;

  const cardTypeOptions = Object.keys(buildCardTypeSummary(draft.cards)).sort((a, b) =>
    formatCardTypeLabel(a).localeCompare(formatCardTypeLabel(b), 'zh-Hans-CN')
  );

  const leftSidebar = renderLeftSidebar(
    canEdit,
    selectedCard,
    viewMode,
    setViewMode,
    search,
    setSearch,
    cardTypeFilter,
    setCardTypeFilter,
    draft,
    visibleCards,
    selectedCardId,
    setSelectedCardId,
    cardTypeOptions,
    tableSort,
    setTableSort,
    onCreateCard,
    onDuplicateCard,
    onDeleteCard,
    onOpenTableEditor
  );

  const toggleTableSort = (field: CardSortField) => {
    setTableSort(current =>
      current.field === field
        ? { field, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { field, direction: 'asc' }
    );
  };

  const mainContent =
    viewMode === 'detail' ? (
      <AdminCardEditorPanel
        selectedCard={selectedCard}
        canEdit={canEdit}
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
      renderTableMain(
        canEdit,
        selectedCard,
        visibleCards,
        cardTypeFilter,
        onOpenTableEditor,
        tableSort,
        toggleTableSort,
        updateCardById,
        selectedCardId,
        setSelectedCardId,
        filteredCards
      )
    );

  const rightSidebar = renderCardInspector(selectedCard, draft, currentBindings, selectedModelProfile, viewMode, onOpenTableEditor);

  const overlay: ReactNode =
    viewMode === 'table' && tableEditorOpen && selectedCard ? (
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
              <div style={{ fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', opacity: 0.62 }}>Detail Drawer</div>
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
            <AdminCardEditorPanel
              selectedCard={selectedCard}
              canEdit={canEdit}
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
    ) : null;

  return { leftSidebar, mainContent, rightSidebar, overlay };
}
