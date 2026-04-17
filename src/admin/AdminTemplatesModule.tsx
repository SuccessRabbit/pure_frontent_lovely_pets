import { TemplateWorkspace } from './TemplateWorkspace';
import { sectionTitle } from './adminShared';
import type { RawAdminDatasets, TemplateValidationIssue } from './types';

interface AdminTemplatesModuleProps {
  draft: RawAdminDatasets;
  canEdit: boolean;
  selectedTemplateId: string;
  onSelectTemplate: (templateId: string) => void;
  validationIssues: TemplateValidationIssue[];
  onDraftChange: (updater: (current: RawAdminDatasets) => RawAdminDatasets) => void;
}

export function AdminTemplatesModule(props: AdminTemplatesModuleProps) {
  const { draft, canEdit, selectedTemplateId, onSelectTemplate, validationIssues, onDraftChange } = props;

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
          <div style={{ fontSize: 13, opacity: 0.74 }}>前端校验问题 {validationIssues.length}</div>
        </div>
      </div>
    ),
    mainContent: (
      <div style={{ minHeight: '100%' }}>
        <TemplateWorkspace
          draft={draft}
          canEdit={canEdit}
          selectedTemplateId={selectedTemplateId}
          onSelectTemplate={onSelectTemplate}
          validationIssues={validationIssues}
          onDraftChange={onDraftChange}
        />
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
          {sectionTitle('Template Status')}
          <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 14, lineHeight: 1.6 }}>
              结构化编排结果会在中间工作台实时更新。保存时仍以 CSV 编译链作为最终权威校验。
            </div>
            <div style={{ fontSize: 13, opacity: 0.72 }}>当前模板数 {draft.skillTemplates.length}</div>
            <div style={{ fontSize: 13, opacity: 0.72 }}>当前绑定数 {draft.cardSkills.length}</div>
            <div
              style={{
                fontSize: 13,
                opacity: validationIssues.length > 0 ? 1 : 0.72,
                color: validationIssues.length > 0 ? '#ffcece' : '#d3f9c6',
              }}
            >
              {validationIssues.length > 0 ? `前端校验问题 ${validationIssues.length} 条` : '前端结构校验通过'}
            </div>
          </div>
        </div>
      </div>
    ),
  };
}
