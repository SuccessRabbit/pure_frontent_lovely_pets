import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TemplateWorkspace, collectTemplateValidationIssues } from '../TemplateWorkspace';
import type { RawAdminDatasets } from '../types';

function createDraft(): RawAdminDatasets {
  return {
    cards: [
      {
        id: 'action_002',
        name: '画大饼',
        type: 'action_buff',
        cost: '2',
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
      },
    ],
    skillTemplates: [
      {
        id: 'action_income_multiplier_turn',
        name: '本回合收益倍率',
        description: '测试模板',
        scope: 'action_buff',
        trigger: 'on_play',
        targetMode: 'none',
        effectKind: 'income_multiplier_turn',
        paramSchemaJson: JSON.stringify([
          { name: 'entityType', label: '实体类型', type: 'select', defaultValue: 'worker', options: ['worker', 'pet'] },
          { name: 'multiplier', label: '倍率', type: 'number', defaultValue: 2 },
        ]),
        operationsJson: '[]',
        summaryTemplate: '{entityType} 收益 x{multiplier}',
        descriptionTemplate: '使 {entityType} 本回合收益翻倍',
        supportsSecondTarget: 'false',
      },
    ],
    cardSkills: [
      {
        id: 'binding_1',
        cardId: 'action_002',
        templateId: 'action_income_multiplier_turn',
        enabled: 'true',
        sortOrder: '1',
        paramsJson: JSON.stringify({ entityType: 'worker', multiplier: 2 }),
      },
    ],
    modelProfiles: [],
    globalConfig: [],
  };
}

describe('TemplateWorkspace', () => {
  it('shows template impact and preview text', () => {
    const draft = createDraft();
    render(
      <TemplateWorkspace
        draft={draft}
        canEdit
        selectedTemplateId="action_income_multiplier_turn"
        onSelectTemplate={vi.fn()}
        onDraftChange={vi.fn()}
        validationIssues={[]}
      />
    );

    expect(screen.getByText('模板工作台')).toBeTruthy();
    expect(screen.getByText('当前模板被 1 个卡牌绑定使用。')).toBeTruthy();
    expect(screen.getAllByText('worker 收益 x2').length).toBeGreaterThan(0);
  });

  it('filters templates by search', async () => {
    const user = userEvent.setup();
    const draft = createDraft();
    render(
      <TemplateWorkspace
        draft={draft}
        canEdit
        selectedTemplateId="action_income_multiplier_turn"
        onSelectTemplate={vi.fn()}
        onDraftChange={vi.fn()}
        validationIssues={[]}
      />
    );

    await user.type(screen.getByPlaceholderText('搜索模板 ID / 名称 / effectKind'), '不存在');

    expect(screen.queryByText('1 引用')).toBeNull();
  });

  it('resets operations from effect kind defaults', async () => {
    const user = userEvent.setup();
    const draft = createDraft();
    const handleDraftChange = vi.fn();

    render(
      <TemplateWorkspace
        draft={draft}
        canEdit
        selectedTemplateId="action_income_multiplier_turn"
        onSelectTemplate={vi.fn()}
        onDraftChange={handleDraftChange}
        validationIssues={[]}
      />
    );

    await user.click(screen.getByRole('button', { name: '套用默认链' }));

    expect(handleDraftChange).toHaveBeenCalledTimes(1);
  });

  it('collects validation issues for invalid operation json', () => {
    const draft = createDraft();
    draft.skillTemplates[0].operationsJson = JSON.stringify([
      {
        kind: '',
        selector: 'self',
        filters: {},
        params: {},
      },
    ]);
    const issues = collectTemplateValidationIssues(draft);

    expect(issues.some((issue: { field: string }) => issue.field === 'operations')).toBe(true);
  });
});
