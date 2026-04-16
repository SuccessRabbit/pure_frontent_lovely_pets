import type { Object3D } from 'three';

export const PICK_LAYERS = {
  GRID_CELL: 1,
  PET_VISUAL: 2,
} as const;

export type PickKind = 'grid-cell-hit' | 'pet-visual';

interface BasePickUserData extends Record<string, unknown> {
  pickKind: PickKind;
}

export interface GridCellPickUserData extends BasePickUserData {
  pickKind: 'grid-cell-hit';
  gridKey: string;
  row: number;
  col: number;
}

export interface PetPickUserData extends BasePickUserData {
  pickKind: 'pet-visual';
  gridKey: string;
  row: number;
  col: number;
  entityId: string;
  cardId: string;
}

export function readGridCellPickUserData(
  userData: Object3D['userData']
): GridCellPickUserData | null {
  if (
    userData?.pickKind === 'grid-cell-hit' &&
    typeof userData.gridKey === 'string' &&
    typeof userData.row === 'number' &&
    typeof userData.col === 'number'
  ) {
    return userData as GridCellPickUserData;
  }
  return null;
}

export function readPetPickUserData(userData: Object3D['userData']): PetPickUserData | null {
  if (
    userData?.pickKind === 'pet-visual' &&
    typeof userData.gridKey === 'string' &&
    typeof userData.row === 'number' &&
    typeof userData.col === 'number' &&
    typeof userData.entityId === 'string' &&
    typeof userData.cardId === 'string'
  ) {
    return userData as PetPickUserData;
  }
  return null;
}
