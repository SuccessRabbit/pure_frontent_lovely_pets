import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { AdminSelect } from './AdminSelect';
import { STARTING_DECK_CONFIG_KEY, buildDeckSummary, parseDeckConfigValue, serializeDeckConfigValue } from './globalConfigUtils';
import { formatCardTypeLabel } from './templateSchema';
import { cardSummaryLabel } from './adminDomain';
import { inputStyle, sectionTitle, softButtonStyle } from './adminShared';
import type { GlobalConfigEditorProps } from './adminShared';

function deckCardPreviewStyle(active = false): CSSProperties {
  return {
    borderRadius: 18,
    padding: 14,
    background: active ? 'rgba(255,210,133,0.08)' : 'rgba(255,255,255,0.04)',
    border: `1px solid ${active ? 'rgba(255,210,133,0.22)' : 'rgba(255,255,255,0.08)'}`,
  };
}

export function AdminGlobalConfigEditor({ draft, canEdit, updateGlobalConfigEntry }: GlobalConfigEditorProps) {
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
                              current.map(currentItem =>
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
