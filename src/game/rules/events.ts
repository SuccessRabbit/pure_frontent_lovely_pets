import type { DrawCardsMeta, DrawEvent, GamePhase } from '../../store/gameStore';
import type { StatusInstance } from '../status/statusTypes';

export type DomainEvent =
  | { type: 'phase_started'; phase: GamePhase }
  | {
      type: 'card_played';
      cardId: string;
      cardType: string;
      cardIndex: number;
      targetRow?: number;
      targetCol?: number;
      targetRow2?: number;
      targetCol2?: number;
    }
  | {
      type: 'entity_placed';
      row: number;
      col: number;
      entityId: string;
      cardId: string;
    }
  | {
      type: 'entity_removed';
      row: number;
      col: number;
      entityId: string;
      cardId: string;
      reason: 'action' | 'meltdown' | 'movement' | 'replacement';
    }
  | {
      type: 'entity_moved';
      fromRow: number;
      fromCol: number;
      toRow: number;
      toCol: number;
      entityId: string;
    }
  | { type: 'cards_draw_requested'; count: number; meta?: DrawCardsMeta }
  | { type: 'cards_drawn'; event: DrawEvent }
  | {
      type: 'income_resolved';
      row: number;
      col: number;
      entityId: string;
      cardId: string;
      entityType: 'pet' | 'worker';
      amount: number;
    }
  | {
      type: 'stress_applied';
      row: number;
      col: number;
      entityId: string;
      cardId: string;
      stress: number;
      maxStress: number;
    }
  | {
      type: 'stress_capped';
      row: number;
      col: number;
      entityId: string;
      cardId: string;
    }
  | {
      type: 'meltdown_triggered';
      row: number;
      col: number;
      entityId: string;
      cardId: string;
      success: boolean;
    }
  | {
      type: 'status_added';
      status: StatusInstance;
      targetRow?: number;
      targetCol?: number;
    }
  | {
      type: 'status_updated';
      status: StatusInstance;
      targetRow?: number;
      targetCol?: number;
    }
  | {
      type: 'status_removed';
      statusId: string;
      statusKind: string;
      targetEntityId?: string;
      targetRow?: number;
      targetCol?: number;
      reason: 'expired' | 'entity_removed' | 'consumed' | 'replaced';
    }
  | {
      type: 'status_triggered';
      statusId: string;
      statusKind: string;
      targetEntityId?: string;
      targetRow?: number;
      targetCol?: number;
      sourceCardId: string;
    }
  | { type: 'turn_started'; turn: number }
  | { type: 'turn_ended'; turn: number }
  | { type: 'game_ended'; status: 'won' | 'lost'; reason: 'hp' | 'grid' | 'hearts' | null };
