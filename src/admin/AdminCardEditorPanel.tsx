import { AdminSelect } from './AdminSelect';
import { buildBindingFieldDefinitions, buildFieldOptions, parseJsonSafe, readOperationsSummary, renderTemplateSummary } from './templateSchema';
import { inputStyle, sectionTitle } from './adminShared';
import { isEntityCard, isStageEntityCardType } from './adminDomain';
import { ModelPreviewCanvas } from './ModelPreviewCanvas';
import type { CardEditorPanelProps } from './adminShared';

function ResourcePreview({
  label,
  src,
  fit = 'contain',
  scaleMode = 'fill',
}: {
  label: string;
  src: string;
  fit?: 'contain' | 'cover';
  scaleMode?: 'fill' | 'fit';
}) {
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

export function AdminCardEditorPanel({
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
            options={[{ value: '', label: '未绑定' }, ...cardImageOptions.map(option => ({ value: option, label: option }))]}
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
            options={[{ value: '', label: '未绑定' }, ...illustrationOptions.map(option => ({ value: option, label: option }))]}
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
                options={[{ value: '', label: '未绑定' }, ...draft.modelProfiles.map(profile => ({ value: profile.id, label: profile.name }))]}
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

      {isStageEntityCardType(selectedCard.type) ? (
        <>
          {sectionTitle('3D Preview')}
          <div
            style={{
              borderRadius: 16,
              padding: 12,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <ModelPreviewCanvas presetSource={selectedModelProfile?.source} />
          </div>
        </>
      ) : null}

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
                    {template?.trigger ?? 'unknown'} / {template?.targetMode ?? 'unknown'} / {template?.effectKind ?? 'unknown'}
                  </div>
                  {readOperationsSummary(template).length > 0 ? (
                    <div style={{ fontSize: 12, opacity: 0.56, marginTop: 4 }}>运行链: {readOperationsSummary(template).join(' -> ')}</div>
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
