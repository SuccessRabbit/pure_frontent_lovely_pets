import type { RuntimeSkillBinding } from '../../utils/runtimeConfig';
import { getRuntimeCardDefinition } from '../../utils/runtimeConfig';
import type { StatusInstance, StatusTheme, StatusVisualSpec } from './statusTypes';

const DEFAULT_STATUS_VISUALS: Record<StatusTheme, Omit<StatusVisualSpec, 'kind'>> = {
  buff: {
    title: '增益',
    shortLabel: '益',
    theme: 'buff',
    color: 0xf6c85f,
    symbol: '+',
    iconKey: 'buff',
    vfxKey: 'buff',
    priority: 30,
  },
  debuff: {
    title: '减益',
    shortLabel: '减',
    theme: 'debuff',
    color: 0xff7a7a,
    symbol: '!',
    iconKey: 'debuff',
    vfxKey: 'debuff',
    priority: 40,
  },
  passive: {
    title: '被动',
    shortLabel: '被',
    theme: 'passive',
    color: 0x8fe3cf,
    symbol: '*',
    iconKey: 'passive',
    vfxKey: 'passive',
    priority: 20,
  },
  utility: {
    title: '状态',
    shortLabel: '效',
    theme: 'utility',
    color: 0x9fc3ff,
    symbol: '=',
    iconKey: 'utility',
    vfxKey: 'utility',
    priority: 10,
  },
};

const STATUS_VISUALS: Record<string, StatusVisualSpec> = {
  worker_income_boost: {
    kind: 'worker_income_boost',
    title: '牛马收益提升',
    shortLabel: '工收',
    theme: 'buff',
    color: 0xf6c85f,
    symbol: '$',
    iconKey: 'worker_income_boost',
    vfxKey: 'income_boost',
    priority: 36,
  },
  pet_income_boost: {
    kind: 'pet_income_boost',
    title: '萌宠收益提升',
    shortLabel: '宠收',
    theme: 'buff',
    color: 0xffb347,
    symbol: '$',
    iconKey: 'pet_income_boost',
    vfxKey: 'income_boost',
    priority: 36,
  },
  queued_resentment: {
    kind: 'queued_resentment',
    title: '怨气埋伏',
    shortLabel: '怨',
    theme: 'debuff',
    color: 0xff8fa3,
    symbol: '?',
    iconKey: 'queued_resentment',
    vfxKey: 'queued_resentment',
    priority: 42,
  },
  stress_relief: {
    kind: 'stress_relief',
    title: '安抚减压',
    shortLabel: '缓',
    theme: 'buff',
    color: 0x89f0c3,
    symbol: '-',
    iconKey: 'stress_relief',
    vfxKey: 'stress_relief',
    priority: 28,
  },
  stress_pressure: {
    kind: 'stress_pressure',
    title: '压力提升',
    shortLabel: '压',
    theme: 'debuff',
    color: 0xff7a7a,
    symbol: '!',
    iconKey: 'stress_pressure',
    vfxKey: 'stress_pressure',
    priority: 44,
  },
  draw_engine: {
    kind: 'draw_engine',
    title: '抽牌引擎',
    shortLabel: '抽',
    theme: 'buff',
    color: 0x7bdff2,
    symbol: '+',
    iconKey: 'draw_engine',
    vfxKey: 'draw_engine',
    priority: 26,
  },
  pet_adjacent_pet_stress_each_turn: {
    kind: 'pet_adjacent_pet_stress_each_turn',
    title: '压力外溢',
    shortLabel: '压',
    theme: 'passive',
    color: 0xff9a62,
    symbol: '!',
    iconKey: 'pet_adjacent_pet_stress_each_turn',
    vfxKey: 'stress_pressure',
    priority: 18,
  },
  pet_ignore_adjacent_stress: {
    kind: 'pet_ignore_adjacent_stress',
    title: '压力免疫',
    shortLabel: '免',
    theme: 'passive',
    color: 0x8fe3cf,
    symbol: '#',
    iconKey: 'pet_ignore_adjacent_stress',
    vfxKey: 'calm_guard',
    priority: 18,
  },
  pet_draw_on_turn_start: {
    kind: 'pet_draw_on_turn_start',
    title: '开局抽牌',
    shortLabel: '抽',
    theme: 'passive',
    color: 0x7bdff2,
    symbol: '+',
    iconKey: 'pet_draw_on_turn_start',
    vfxKey: 'draw_engine',
    priority: 18,
  },
};

export function resolveStatusVisual(kind: string, fallbackTheme: StatusTheme = 'utility'): StatusVisualSpec {
  return STATUS_VISUALS[kind] ?? { kind, ...DEFAULT_STATUS_VISUALS[fallbackTheme] };
}

function createPassiveStatusFromSkill(cardId: string, skill: RuntimeSkillBinding): StatusInstance | null {
  const definition = getRuntimeCardDefinition(cardId);
  if (!definition) return null;

  const makePassive = (kind: string) => {
    const visual = resolveStatusVisual(kind, 'passive');
    return {
      id: `passive:${cardId}:${skill.id}`,
      kind,
      scope: 'entity' as const,
      sourceCardId: cardId,
      sourceSkillId: skill.id,
      title: visual.title,
      shortLabel: visual.shortLabel,
      theme: visual.theme,
      duration: 0,
      maxDuration: 0,
      durationUnit: 'turn' as const,
      stacks: 1,
      iconKey: visual.iconKey,
      vfxKey: visual.vfxKey,
      appliedTurn: 0,
      description:
        skill.descriptionPreview ||
        skill.summary ||
        definition.derivedDescription ||
        definition.description,
      params: {
        summary: skill.summary,
        descriptionPreview: skill.descriptionPreview,
        description: definition.derivedDescription ?? definition.description,
        ...skill.params,
      },
      isPassive: true,
    };
  };

  if (skill.templateId === 'pet_adjacent_pet_stress_each_turn') {
    return makePassive('pet_adjacent_pet_stress_each_turn');
  }
  if (skill.templateId === 'pet_ignore_adjacent_stress') {
    return makePassive('pet_ignore_adjacent_stress');
  }
  if (skill.templateId === 'pet_draw_on_turn_start') {
    return makePassive('pet_draw_on_turn_start');
  }
  return null;
}

export function getPassiveStatusesForCard(cardId: string): StatusInstance[] {
  const definition = getRuntimeCardDefinition(cardId);
  if (!definition?.skills?.length) return [];
  return definition.skills
    .map(skill => createPassiveStatusFromSkill(cardId, skill))
    .filter((status): status is StatusInstance => status !== null);
}
