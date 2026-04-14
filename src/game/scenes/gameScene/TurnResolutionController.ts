import { snapshotGameState, useGameStore } from '../../../store/gameStore';
import type { DrawEvent } from '../../../store/gameStore';
import { runGameCommand, type ResolutionStep } from '../../rules/ResolutionEngine';
import type { PresentationEvent } from '../../rules/presentation';

const PHASE_GAP_MS = 380;

function waitMs(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

interface TurnResolutionControllerDeps {
  getRoundResolving: () => boolean;
  setRoundResolving: (value: boolean) => void;
  clearPendingActionPick: () => void;
  setEndTurnInteractable: (on: boolean) => void;
  showPhaseBanner: (title: string, holdMs: number) => Promise<void>;
  showEntityCue: (
    row: number,
    col: number,
    title: string,
    subtitle: string,
    color: number
  ) => Promise<void>;
  spawnIncomeFloat: (row: number, col: number, amount: number) => void;
  spawnHudFloat: (text: string, color: number) => void;
  syncGridFromStore: () => void;
  sync3DStressOverlays: () => void;
  pulseStressCell: (row: number, col: number) => void;
  playManualDrawEvent: (event: DrawEvent) => Promise<void>;
}

export class TurnResolutionController {
  private readonly getRoundResolving: () => boolean;
  private readonly setRoundResolving: (value: boolean) => void;
  private readonly clearPendingActionPick: () => void;
  private readonly setEndTurnInteractable: (on: boolean) => void;
  private readonly showPhaseBanner: (title: string, holdMs: number) => Promise<void>;
  private readonly showEntityCue: (
    row: number,
    col: number,
    title: string,
    subtitle: string,
    color: number
  ) => Promise<void>;
  private readonly spawnIncomeFloat: (row: number, col: number, amount: number) => void;
  private readonly spawnHudFloat: (text: string, color: number) => void;
  private readonly syncGridFromStore: () => void;
  private readonly sync3DStressOverlays: () => void;
  private readonly pulseStressCell: (row: number, col: number) => void;
  private readonly playManualDrawEvent: (event: DrawEvent) => Promise<void>;

  constructor(deps: TurnResolutionControllerDeps) {
    this.getRoundResolving = deps.getRoundResolving;
    this.setRoundResolving = deps.setRoundResolving;
    this.clearPendingActionPick = deps.clearPendingActionPick;
    this.setEndTurnInteractable = deps.setEndTurnInteractable;
    this.showPhaseBanner = deps.showPhaseBanner;
    this.showEntityCue = deps.showEntityCue;
    this.spawnIncomeFloat = deps.spawnIncomeFloat;
    this.spawnHudFloat = deps.spawnHudFloat;
    this.syncGridFromStore = deps.syncGridFromStore;
    this.sync3DStressOverlays = deps.sync3DStressOverlays;
    this.pulseStressCell = deps.pulseStressCell;
    this.playManualDrawEvent = deps.playManualDrawEvent;
  }

  public async runEndTurnSequence() {
    if (this.getRoundResolving()) return;

    this.clearPendingActionPick();
    const current = useGameStore.getState();
    if (current.gameStatus !== 'playing') return;
    if (current.phase !== 'preparation' && current.phase !== 'action') return;

    const result = runGameCommand(snapshotGameState(current), { type: 'resolve_turn_sequence' });
    if (!result.success) return;

    this.setRoundResolving(true);
    this.setEndTurnInteractable(false);

    try {
      for (const step of result.steps) {
        await this.applyResolutionStep(step);
        if (useGameStore.getState().gameStatus !== 'playing') {
          break;
        }
      }
    } finally {
      this.setRoundResolving(false);
      const playing = useGameStore.getState().gameStatus === 'playing';
      this.setEndTurnInteractable(playing);
    }
  }

  private async applyResolutionStep(step: ResolutionStep): Promise<void> {
    useGameStore.setState(step.state);
    this.syncGridFromStore();
    this.sync3DStressOverlays();
    await this.playPresentationEvents(step.presentation);
  }

  private async playPresentationEvents(events: PresentationEvent[]): Promise<void> {
    for (const event of events) {
      await this.playPresentationEvent(event);
    }
  }

  private async playPresentationEvent(event: PresentationEvent): Promise<void> {
    if (event.type === 'show_phase_banner') {
      await this.showPhaseBanner(event.title, event.holdMs);
      await waitMs(PHASE_GAP_MS);
      return;
    }

    if (event.type === 'show_entity_cue') {
      await this.showEntityCue(event.row, event.col, event.title, event.subtitle, event.color);
      return;
    }

    if (event.type === 'spawn_income_float') {
      this.spawnIncomeFloat(event.row, event.col, event.amount);
      await waitMs(320);
      return;
    }

    if (event.type === 'spawn_hud_float') {
      this.spawnHudFloat(event.text, event.color);
      await waitMs(360);
      return;
    }

    if (event.type === 'play_draw_event') {
      await this.playManualDrawEvent(event.event);
      return;
    }

    if (event.type === 'pulse_stress_cell') {
      this.pulseStressCell(event.row, event.col);
      await waitMs(240);
    }
  }
}
