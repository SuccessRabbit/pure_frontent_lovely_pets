import type { DrawEvent } from '../../store/gameStore';
import type { StatusTheme } from '../status/statusTypes';
import type { ToastTone } from './toast';

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
  | { type: 'spawn_hud_float'; text: string; tone: ToastTone; color?: number }
  | { type: 'play_draw_event'; event: DrawEvent }
  | { type: 'pulse_stress_cell'; row: number; col: number }
  | {
      type: 'status_burst';
      statusKind: string;
      theme: StatusTheme;
      title: string;
      subtitle: string;
      color: number;
      row?: number;
      col?: number;
      global?: boolean;
    };
