import type { DrawEvent } from '../../store/gameStore';

export type PresentationEvent =
  | { type: 'show_phase_banner'; title: string; holdMs: number }
  | {
      type: 'show_entity_cue';
      row: number;
      col: number;
      title: string;
      subtitle: string;
      color: number;
    }
  | { type: 'spawn_income_float'; row: number; col: number; amount: number }
  | { type: 'spawn_hud_float'; text: string; color: number }
  | { type: 'play_draw_event'; event: DrawEvent }
  | { type: 'pulse_stress_cell'; row: number; col: number };
