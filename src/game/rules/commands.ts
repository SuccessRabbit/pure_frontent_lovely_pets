import type { Card } from '../../types/card';
import type { DrawCardsMeta, GamePhase } from '../../store/gameStore';

export interface PlayCardCommand {
  type: 'play_card';
  cardIndex: number;
  targetRow?: number;
  targetCol?: number;
  targetRow2?: number;
  targetCol2?: number;
}

export interface DrawCardsCommand {
  type: 'draw_cards';
  count: number;
  meta?: DrawCardsMeta;
}

export interface SetPhaseCommand {
  type: 'set_phase';
  phase: GamePhase;
}

export interface NextPhaseCommand {
  type: 'next_phase';
}

export interface EndTurnCommand {
  type: 'end_turn';
}

export interface FinishHandTrimAndAdvanceTurnCommand {
  type: 'finish_hand_trim_and_advance_turn';
  drawMeta?: DrawCardsMeta;
}

export interface DiscardHandTrimCommand {
  type: 'discard_hand_trim';
  cardIndex: number;
}

export interface RemoveHandCardAfterPlayCommand {
  type: 'remove_hand_card_after_play';
  cardIndex: number;
}

export interface PlaceEntityCommand {
  type: 'place_entity';
  card: Card;
  row: number;
  col: number;
}

export interface RemoveEntityCommand {
  type: 'remove_entity';
  row: number;
  col: number;
}

export interface MoveEntityCommand {
  type: 'move_entity';
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
}

export interface AddStressCommand {
  type: 'add_stress';
  row: number;
  col: number;
  amount: number;
}

export interface TriggerMeltdownCommand {
  type: 'trigger_meltdown';
  row: number;
  col: number;
}

export interface RebuildCellCommand {
  type: 'rebuild_cell';
  row: number;
  col: number;
}

export interface InitGameCommand {
  type: 'init_game';
  initialDeck?: Card[];
}

export interface RestartRunCommand {
  type: 'restart_run';
  initialDeck: Card[];
}

export interface ResolveTurnSequenceCommand {
  type: 'resolve_turn_sequence';
}

export type GameCommand =
  | PlayCardCommand
  | DrawCardsCommand
  | SetPhaseCommand
  | NextPhaseCommand
  | EndTurnCommand
  | FinishHandTrimAndAdvanceTurnCommand
  | DiscardHandTrimCommand
  | RemoveHandCardAfterPlayCommand
  | PlaceEntityCommand
  | RemoveEntityCommand
  | MoveEntityCommand
  | AddStressCommand
  | TriggerMeltdownCommand
  | RebuildCellCommand
  | InitGameCommand
  | RestartRunCommand
  | ResolveTurnSequenceCommand;
