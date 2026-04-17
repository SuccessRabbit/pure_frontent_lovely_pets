import { STARTING_DECK_CONFIG_KEY, buildDeckSummary, parseDeckConfigValue } from './globalConfigUtils';
import { sectionTitle } from './adminShared';
import { AdminGlobalConfigEditor } from './AdminGlobalConfigEditor';
import type { RawAdminDatasets } from './types';

interface AdminGlobalModuleProps {
  draft: RawAdminDatasets;
  canEdit: boolean;
  updateGlobalConfigEntry: (key: string, patch: { value?: string; valueType?: string }) => void;
}

export function AdminGlobalModule({ draft, canEdit, updateGlobalConfigEntry }: AdminGlobalModuleProps) {
  const deckItems = parseDeckConfigValue(draft.globalConfig.find(entry => entry.key === STARTING_DECK_CONFIG_KEY)?.value ?? '[]');
  const summary = buildDeckSummary(deckItems, draft.cards);

  return {
    leftSidebar: (
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
          <div style={{ fontSize: 13, opacity: 0.74 }}>牌堆条目数 {deckItems.length}</div>
        </div>
      </div>
    ),
    mainContent: (
      <div style={{ minHeight: '100%' }}>
        <AdminGlobalConfigEditor draft={draft} canEdit={canEdit} updateGlobalConfigEntry={updateGlobalConfigEntry} />
      </div>
    ),
    rightSidebar: (
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
          <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 14, lineHeight: 1.6 }}>
              通用规则参数与起始牌堆都已搬到中间主编辑区，右侧只展示配置概览。
            </div>
            <div style={{ fontSize: 13, opacity: 0.72 }}>全局配置项 {draft.globalConfig.length}</div>
            <div style={{ fontSize: 13, opacity: 0.72 }}>起始牌堆条目 {deckItems.length}</div>
            <div style={{ fontSize: 13, opacity: 0.72 }}>起始牌堆总张数 {summary.totalCards}</div>
            <div
              style={{
                fontSize: 13,
                opacity: summary.missingCards > 0 ? 1 : 0.72,
                color: summary.missingCards > 0 ? '#ffcece' : '#d3f9c6',
              }}
            >
              {summary.missingCards > 0 ? `存在 ${summary.missingCards} 条失效卡牌引用` : '牌堆引用有效'}
            </div>
          </div>
        </div>
      </div>
    ),
  };
}
