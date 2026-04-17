import type { CSSProperties, ReactNode } from 'react';
import type {
  CardRow,
  CardSkillRow,
  GlobalConfigRow,
  ModelProfileRow,
  RawAdminDatasets,
  SkillTemplateRow,
} from './types';

export type AdminTab = 'cards' | 'templates' | 'global';
export type CardViewMode = 'detail' | 'table';
export type CardSortField =
  | 'type'
  | 'name'
  | 'id'
  | 'cost'
  | 'rarity'
  | 'income'
  | 'stress'
  | 'stressLimit'
  | 'canDiscard'
  | 'tags';
export type SortDirection = 'asc' | 'desc';

export interface CardSortState {
  field: CardSortField;
  direction: SortDirection;
}

export interface AssetOptions {
  allAssets: string[];
  cardImages: string[];
  illustrations: string[];
  thumbnails: string[];
  modelPresetSources: string[];
}

export interface CardEditorPanelProps {
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

export interface GlobalConfigEditorProps {
  draft: RawAdminDatasets;
  canEdit: boolean;
  updateGlobalConfigEntry: (key: string, patch: Partial<GlobalConfigRow>) => void;
}

export const shellStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'grid',
  gridTemplateColumns: '280px minmax(420px, 1fr) 420px',
  background:
    'radial-gradient(circle at top left, rgba(255,229,201,0.24), transparent 28%), linear-gradient(180deg, #1a1418 0%, #120f14 100%)',
  color: '#f8f4ed',
};

export const panelStyle: CSSProperties = {
  borderRight: '1px solid rgba(255,255,255,0.08)',
  overflow: 'auto',
};

export const RIGHT_PANEL_MIN_WIDTH = 320;
export const RIGHT_PANEL_MAX_WIDTH = 640;
export const RIGHT_PANEL_DEFAULT_WIDTH = 420;
export const RIGHT_PANEL_COLLAPSED_WIDTH = 0;
export const RIGHT_PANEL_HANDLE_WIDTH = 28;
export const RIGHT_PANEL_STORAGE_KEY = 'lovely-pets.admin.right-panel-width';
export const RIGHT_PANEL_COLLAPSED_STORAGE_KEY = 'lovely-pets.admin.right-panel-collapsed';
export const RIGHT_PANEL_AUTO_COLLAPSE_BREAKPOINT = 1480;

export function clampRightPanelWidth(width: number) {
  return Math.min(RIGHT_PANEL_MAX_WIDTH, Math.max(RIGHT_PANEL_MIN_WIDTH, width));
}

export function inputStyle(block = false): CSSProperties {
  return {
    width: '100%',
    display: block ? 'block' : 'inline-block',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(255,255,255,0.04)',
    color: '#fff8ef',
    padding: '10px 12px',
    boxSizing: 'border-box',
  };
}

export function softButtonStyle(disabled = false): CSSProperties {
  return {
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.12)',
    background: disabled ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.04)',
    color: '#fff8ef',
    padding: '10px 12px',
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

export function tableInputStyle(disabled = false): CSSProperties {
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

export const compactNumericColumnStyle: CSSProperties = {
  minWidth: 72,
  maxWidth: 92,
  width: '1%',
};

export const compactLimitColumnStyle: CSSProperties = {
  minWidth: 84,
  maxWidth: 108,
  width: '1%',
};

export const compactBooleanColumnStyle: CSSProperties = {
  minWidth: 96,
  maxWidth: 118,
  width: '1%',
};

export const compactHeaderTextStyle: CSSProperties = {
  whiteSpace: 'normal',
  overflowWrap: 'anywhere',
  lineHeight: 1.3,
};

export function sectionTitle(label: string) {
  return <div style={{ fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', opacity: 0.64 }}>{label}</div>;
}
