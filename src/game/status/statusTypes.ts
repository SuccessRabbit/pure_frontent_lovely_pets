export type StatusScope = 'entity' | 'global';
export type StatusTheme = 'buff' | 'debuff' | 'passive' | 'utility';
export type StatusDurationUnit = 'turn';

export interface StatusInstance {
  id: string;
  kind: string;
  scope: StatusScope;
  sourceCardId: string;
  sourceSkillId?: string;
  targetEntityId?: string;
  title: string;
  shortLabel: string;
  theme: StatusTheme;
  duration: number;
  maxDuration: number;
  durationUnit: StatusDurationUnit;
  stacks: number;
  iconKey: string;
  vfxKey: string;
  appliedTurn: number;
  params: Record<string, unknown>;
  description?: string;
  isPassive?: boolean;
}

export interface StatusVisualSpec {
  kind: string;
  title: string;
  shortLabel: string;
  theme: StatusTheme;
  color: number;
  symbol: string;
  iconKey: string;
  vfxKey: string;
  priority: number;
}
