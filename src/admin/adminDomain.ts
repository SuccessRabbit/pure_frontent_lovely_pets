import { formatCardTypeLabel, scopeIncludesCardType } from './templateSchema';
import type {
  CardRow,
  CardSkillRow,
  RawAdminDatasets,
  SkillTemplateRow,
} from './types';
import type { CardSortField, CardSortState, SortDirection } from './adminShared';

const rarityRank: Record<string, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
};

export const tableSortFieldLabels: Record<CardSortField, string> = {
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

export function cloneDatasets(raw: RawAdminDatasets): RawAdminDatasets {
  return {
    cards: raw.cards.map(item => ({ ...item })),
    skillTemplates: raw.skillTemplates.map(item => ({ ...item })),
    cardSkills: raw.cardSkills.map(item => ({ ...item })),
    modelProfiles: raw.modelProfiles.map(item => ({ ...item })),
    globalConfig: raw.globalConfig.map(item => ({ ...item })),
  };
}

export function templateSupportsCard(template: SkillTemplateRow, cardType: string) {
  return scopeIncludesCardType(template.scope, cardType);
}

export function cardSkillBindings(raw: RawAdminDatasets, cardId: string) {
  return raw.cardSkills
    .filter(binding => binding.cardId === cardId)
    .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
}

export function buildNewSkillBinding(cardId: string, templateId: string, index: number): CardSkillRow {
  return {
    id: `${cardId}_skill_${Date.now()}_${index}`,
    cardId,
    templateId,
    enabled: 'true',
    sortOrder: String(index + 1),
    paramsJson: '{}',
  };
}

export function inferAssetFolderFromCardType(cardType: string) {
  if (cardType.includes('pet')) return 'pets';
  if (cardType.includes('worker')) return 'workers';
  if (cardType.includes('action')) return 'actions';
  if (cardType.includes('facility')) return 'facilities';
  return '';
}

export function filterAssetOptions(options: string[], cardType: string) {
  const folder = inferAssetFolderFromCardType(cardType);
  if (!folder) return options;
  return options.filter(option => option.includes(`/${folder}/`));
}

export function isEntityCard(card: CardRow) {
  return card.type.startsWith('entity_');
}

export function buildCardTypeSummary(cards: CardRow[]) {
  return cards.reduce<Record<string, number>>((summary, card) => {
    summary[card.type] = (summary[card.type] ?? 0) + 1;
    return summary;
  }, {});
}

export function cardSummaryLabel(card: CardRow) {
  if (isEntityCard(card)) {
    return `费用 ${card.cost} / 收益 ${card.income || '-'} / 压力 ${card.stress || '-'} / 上限 ${card.stressLimit || '-'}`;
  }

  return `费用 ${card.cost} / ${card.rarity}`;
}

export function isStageEntityCardType(type: string | null | undefined): boolean {
  return type === 'entity_pet' || type === 'entity_worker';
}

export function compareTextValue(a: string, b: string) {
  return a.localeCompare(b, 'zh-Hans-CN');
}

export function compareText(a: string, b: string, direction: SortDirection) {
  const diff = compareTextValue(a, b);
  return direction === 'asc' ? diff : -diff;
}

export function parseOptionalNumber(value: string) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

export function compareOptionalNumbers(a: string, b: string, direction: SortDirection) {
  const aValue = parseOptionalNumber(a);
  const bValue = parseOptionalNumber(b);

  if (aValue == null && bValue == null) return 0;
  if (aValue == null) return 1;
  if (bValue == null) return -1;

  return direction === 'asc' ? aValue - bValue : bValue - aValue;
}

export function compareOrderedNumbers(a: number, b: number, direction: SortDirection) {
  return direction === 'asc' ? a - b : b - a;
}

export function defaultCardCompare(a: CardRow, b: CardRow) {
  const typeDiff = compareTextValue(a.type, b.type);
  if (typeDiff !== 0) return typeDiff;

  const aCost = parseOptionalNumber(a.cost);
  const bCost = parseOptionalNumber(b.cost);
  const normalizedACost = aCost == null ? Number.MAX_SAFE_INTEGER : aCost;
  const normalizedBCost = bCost == null ? Number.MAX_SAFE_INTEGER : bCost;
  if (normalizedACost !== normalizedBCost) return normalizedACost - normalizedBCost;

  return compareTextValue(a.id, b.id);
}

export function sortCardsForComparison(cards: CardRow[]) {
  return [...cards].sort(defaultCardCompare);
}

export function sortCardsForTable(cards: CardRow[], sortState: CardSortState) {
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

export function formatCardTypeOptionLabel(cardType: string) {
  const label = formatCardTypeLabel(cardType);
  return label === cardType ? cardType : `${label} · ${cardType}`;
}

export function formatSortFieldLabel(field: CardSortField) {
  return tableSortFieldLabels[field];
}
