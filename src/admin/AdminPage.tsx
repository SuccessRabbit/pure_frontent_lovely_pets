import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { loadAdminDatasets, saveAdminDatasets, subscribeToAdminEvents } from './api';
import { collectTemplateValidationIssues } from './TemplateWorkspace';
import { ensureStartingDeckConfigEntry } from './globalConfigUtils';
import { AdminCardsModule } from './AdminCardsModule';
import { AdminTemplatesModule } from './AdminTemplatesModule';
import { AdminGlobalModule } from './AdminGlobalModule';
import { AdminWikiModal } from './AdminWikiModal';
import {
  type AdminTab,
  type AssetOptions,
  type CardSortState,
  type CardViewMode,
  RIGHT_PANEL_AUTO_COLLAPSE_BREAKPOINT,
  RIGHT_PANEL_COLLAPSED_STORAGE_KEY,
  RIGHT_PANEL_COLLAPSED_WIDTH,
  RIGHT_PANEL_DEFAULT_WIDTH,
  RIGHT_PANEL_HANDLE_WIDTH,
  RIGHT_PANEL_STORAGE_KEY,
  clampRightPanelWidth,
  inputStyle,
  panelStyle,
  shellStyle,
} from './adminShared';
import {
  buildNewSkillBinding,
  cardSkillBindings,
  cloneDatasets,
  filterAssetOptions,
  sortCardsForComparison,
  sortCardsForTable,
  templateSupportsCard,
} from './adminDomain';
import type {
  AdminDatasetResponse,
  CardRow,
  CardSkillRow,
  GlobalConfigRow,
  ModelProfileRow,
  RawAdminDatasets,
  TemplateValidationIssue,
} from './types';

function toAssetOptions(response: AdminDatasetResponse | null): AssetOptions {
  return response?.compiled.assetOptions ?? {
    allAssets: [],
    cardImages: [],
    illustrations: [],
    thumbnails: [],
    modelPresetSources: [],
  };
}

export function AdminPage() {
  const [response, setResponse] = useState<AdminDatasetResponse | null>(null);
  const [draft, setDraft] = useState<RawAdminDatasets | null>(null);
  const [tab, setTab] = useState<AdminTab>('cards');
  const [viewMode, setViewMode] = useState<CardViewMode>('detail');
  const [selectedCardId, setSelectedCardId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [tableEditorOpen, setTableEditorOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [cardTypeFilter, setCardTypeFilter] = useState('all');
  const [tableSort, setTableSort] = useState<CardSortState>({ field: 'type', direction: 'asc' });
  const [saving, setSaving] = useState(false);
  const [wikiOpen, setWikiOpen] = useState(false);
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

  useEffect(() => subscribeToAdminEvents(() => setInfo('配置已在其他窗口更新，当前页面可刷新后同步。')), []);

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
    if (!draft || !selectedCard) return null;
    return draft.modelProfiles.find(profile => profile.id === selectedCard.modelProfileId) ?? null;
  }, [draft, selectedCard]);

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

  const assetOptions = toAssetOptions(response);
  const cardImageOptions = selectedCard ? filterAssetOptions(assetOptions.cardImages, selectedCard.type) : assetOptions.cardImages;
  const illustrationOptions = selectedCard
    ? filterAssetOptions(assetOptions.illustrations, selectedCard.type)
    : assetOptions.illustrations;
  const leftPanelWidth = tab === 'cards' && viewMode === 'table' ? 320 : 280;
  const mainPanelMinWidth = tab === 'cards' && viewMode === 'table' ? 760 : 420;
  const activeRightPanelWidth = rightPanelCollapsed ? RIGHT_PANEL_COLLAPSED_WIDTH : rightPanelWidth;
  const activeShellStyle: CSSProperties = {
    ...shellStyle,
    gridTemplateColumns: `${leftPanelWidth}px minmax(${mainPanelMinWidth}px, 1fr) ${RIGHT_PANEL_HANDLE_WIDTH}px ${activeRightPanelWidth}px`,
    transition: rightPanelDragging ? undefined : 'grid-template-columns 180ms ease',
  };

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
        cardSkills: current.cardSkills.map(binding => (binding.id === bindingId ? { ...binding, ...patch } : binding)),
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
    if (!selectedCard || availableTemplates.length === 0) return;
    setDraft(current => {
      if (!current) return current;
      const next = buildNewSkillBinding(selectedCard.id, availableTemplates[0].id, currentBindings.length);
      return {
        ...current,
        cardSkills: [...current.cardSkills, next],
      };
    });
  }

  function updateModelProfile(profileId: string, patch: Partial<ModelProfileRow>) {
    setDraft(current => {
      if (!current) return current;
      return {
        ...current,
        modelProfiles: current.modelProfiles.map(profile => (profile.id === profileId ? { ...profile, ...patch } : profile)),
      };
    });
  }

  function updateGlobalConfigEntry(key: string, patch: Partial<GlobalConfigRow>) {
    setDraft(current => {
      if (!current) return current;
      return {
        ...current,
        globalConfig: current.globalConfig.map(entry => (entry.key === key ? { ...entry, ...patch } : entry)),
      };
    });
  }

  function duplicateSelectedCard() {
    if (!selectedCard || !canEdit) return;
    setDraft(current => {
      if (!current) return current;
      const nextId = `${selectedCard.id}_copy_${current.cards.length + 1}`;
      const duplicatedCard = { ...selectedCard, id: nextId, name: `${selectedCard.name} 复制` };
      const duplicatedBindings = currentBindings.map((binding, index) => ({
        ...binding,
        id: `${nextId}_skill_${index + 1}`,
        cardId: nextId,
      }));
      setSelectedCardId(nextId);
      return {
        ...current,
        cards: [...current.cards, duplicatedCard],
        cardSkills: [...current.cardSkills, ...duplicatedBindings],
      };
    });
  }

  function createBlankCard() {
    if (!canEdit) return;
    setDraft(current => {
      if (!current) return current;
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
      setSelectedCardId(nextId);
      return {
        ...current,
        cards: [...current.cards, nextCard],
      };
    });
  }

  function deleteSelectedCard() {
    if (!selectedCard || !canEdit) return;
    setDraft(current => {
      if (!current) return current;
      const remainingCards = current.cards.filter(card => card.id !== selectedCard.id);
      const remainingBindings = current.cardSkills.filter(binding => binding.cardId !== selectedCard.id);
      setTableEditorOpen(false);
      setSelectedCardId(remainingCards[0]?.id ?? '');
      return {
        ...current,
        cards: remainingCards,
        cardSkills: remainingBindings,
      };
    });
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

  const cardsModule = AdminCardsModule({
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
    onCreateCard: createBlankCard,
    onDuplicateCard: duplicateSelectedCard,
    onDeleteCard: deleteSelectedCard,
    onOpenTableEditor: () => setTableEditorOpen(true),
    updateCardById,
    updateCard,
    updateBinding,
    removeBinding,
    addBinding,
    updateModelProfile,
    tableEditorOpen,
    setTableEditorOpen,
  });

  const templatesModule = AdminTemplatesModule({
    draft,
    canEdit,
    selectedTemplateId,
    onSelectTemplate: setSelectedTemplateId,
    validationIssues: templateIssues,
    onDraftChange: updater => {
      setDraft(current => (current ? updater(current) : current));
    },
  });

  const globalModule = AdminGlobalModule({
    draft,
    canEdit,
    updateGlobalConfigEntry,
  });

  const activeModule = tab === 'cards' ? cardsModule : tab === 'templates' ? templatesModule : globalModule;

  return (
    <div style={activeShellStyle}>
      <aside style={{ ...panelStyle, padding: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, marginBottom: 16, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>Admin 工作台</div>
            <div style={{ fontSize: 13, opacity: 0.7 }}>按功能模块拆分的配置后台。保存后统一回写 CSV 并触发编译。</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => setWikiOpen(true)}
              style={{
                ...inputStyle(true),
                width: 'auto',
                cursor: 'pointer',
                fontWeight: 700,
                background: 'rgba(255,255,255,0.06)',
              }}
            >
              Wiki
            </button>
            <button
              onClick={handleSave}
              disabled={!canEdit || saving}
              style={{
                ...inputStyle(true),
                width: 'auto',
                cursor: canEdit ? 'pointer' : 'not-allowed',
                fontWeight: 700,
                background: saving ? 'rgba(255,255,255,0.08)' : 'rgba(255,210,133,0.12)',
              }}
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
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
        {!response.canEdit ? <div style={{ color: '#ffd9a5', marginBottom: 12 }}>当前环境未连接本地 Admin API，线上仅提供只读预览。</div> : null}
        {templateIssues.length > 0 ? <div style={{ color: '#ffcfaa', marginBottom: 12 }}>模板工作台有 {templateIssues.length} 条待修复校验问题。</div> : null}

        {activeModule.leftSidebar}
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
        {activeModule.mainContent}
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
        {activeModule.rightSidebar}
      </aside>

      {tab === 'cards' ? cardsModule.overlay : null}
      <AdminWikiModal open={wikiOpen} onClose={() => setWikiOpen(false)} />
    </div>
  );
}
