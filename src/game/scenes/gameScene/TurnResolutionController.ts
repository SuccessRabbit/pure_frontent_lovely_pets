import {
  HAND_SIZE_MAX,
  HEARTS_ENTITY_INCOME_MULTIPLIER,
} from '@config/gameRules';
import { useGameStore } from '../../../store/gameStore';
import type { DrawEvent, StressResolutionResult } from '../../../store/gameStore';

const PHASE_GAP_MS = 380;
const POST_INCOME_MS = 520;
const POST_STRESS_MS = 820;

function waitMs(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

interface ResolutionUnit {
  row: number;
  col: number;
  entityId: string;
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

    const get = useGameStore.getState;
    if (get().gameStatus !== 'playing') return;

    const phase = get().phase;
    if (phase !== 'preparation' && phase !== 'action') return;

    this.setRoundResolving(true);
    this.setEndTurnInteractable(false);

    try {
      if (get().phase === 'preparation') {
        get().setPhase('action');
        await this.showPhaseBanner('行动阶段', 420);
        await waitMs(PHASE_GAP_MS);
      }

      if (get().phase === 'action') {
        get().setPhase('income');
        await this.showPhaseBanner('收入阶段', 480);
        await waitMs(300);
        await this.resolveIncomePhaseSequential();
        if (get().gameStatus !== 'playing') return;
        await waitMs(POST_INCOME_MS);
      }

      get().setPhase('end');
      await this.showPhaseBanner('结算阶段 · 逐个结算暴躁度', 500);
      await waitMs(280);

      await this.resolveStressPhaseSequential();
      await waitMs(POST_STRESS_MS);

      if (get().gameStatus !== 'playing') return;

      get().endTurn();
      if (get().gameStatus !== 'playing') return;

      if (get().awaitingHandTrim) {
        this.spawnHudFloat(
          `手牌超过 ${HAND_SIZE_MAX} 张，请打出或将可弃牌拖向屏幕底边红区弃牌`,
          0xfff9c4
        );
        return;
      }

      const turn = get().turn;
      await this.showPhaseBanner(`第 ${turn} 回合 · 准备阶段`, 520);
      await waitMs(PHASE_GAP_MS);
    } finally {
      this.setRoundResolving(false);
      const playing = useGameStore.getState().gameStatus === 'playing';
      this.setEndTurnInteractable(playing);
    }
  }

  private getResolutionOrderSnapshot(): ResolutionUnit[] {
    const { grid } = useGameStore.getState();
    const order: ResolutionUnit[] = [];
    grid.forEach((row, rowIndex) => {
      row.forEach((entity, colIndex) => {
        if (!entity) return;
        order.push({
          row: rowIndex,
          col: colIndex,
          entityId: entity.id,
        });
      });
    });
    return order;
  }

  private async resolveIncomePhaseSequential() {
    const get = useGameStore.getState;
    get().calculateInterest();
    const breakdown = get().getIncomeBreakdown();
    const incomeByCell = new Map(
      breakdown.entities.map(ent => [`${ent.row}|${ent.col}`, ent] as const)
    );

    let entityIncomeSum = 0;
    const order = this.getResolutionOrderSnapshot();
    for (const unit of order) {
      const entry = incomeByCell.get(`${unit.row}|${unit.col}`);
      const liveEntity = get().grid[unit.row][unit.col];
      if (!entry || !liveEntity || liveEntity.id !== unit.entityId) continue;

      await this.showEntityCue(unit.row, unit.col, liveEntity.name, '收益结算', 0xffe082);
      this.spawnIncomeFloat(unit.row, unit.col, entry.income);
      get().addCans(entry.income);
      entityIncomeSum += entry.income;
      await waitMs(320);
      await this.resolveEntityIncomeTrigger(unit);
      if (get().gameStatus !== 'playing') return;
    }

    if (breakdown.interest > 0) {
      this.spawnHudFloat(`利息 +${breakdown.interest}`, 0xfff9c4);
      get().addCans(breakdown.interest);
      await waitMs(360);
    }
    if (breakdown.streakBonus > 0) {
      this.spawnHudFloat(`连胜 +${breakdown.streakBonus}`, 0xabebc6);
      get().addCans(breakdown.streakBonus);
      await waitMs(360);
    }

    const heartsGain = Math.floor(entityIncomeSum * HEARTS_ENTITY_INCOME_MULTIPLIER);
    if (heartsGain > 0) {
      get().addHearts(heartsGain);
      this.spawnHudFloat(`人气 +${heartsGain}`, 0xffd6e8);
      await waitMs(360);
    }
  }

  private async resolveEntityIncomeTrigger(unit: ResolutionUnit) {
    const live = useGameStore.getState().grid[unit.row][unit.col];
    if (!live || live.id !== unit.entityId) return;

    if (live.type === 'pet' && live.cardId === 'pet_006') {
      await this.showEntityCue(unit.row, unit.col, '永动机猫', '技能触发：抽 1 张牌', 0xffd54f);
      const event = useGameStore.getState().drawCards(1, {
        source: 'skill',
        sourceLabel: '永动机猫',
        sourceCardId: live.cardId,
        sourceEntityId: live.id,
        sourceRow: unit.row,
        sourceCol: unit.col,
        uiMode: 'manual',
      });
      if (event) {
        await this.playManualDrawEvent(event);
      }
    }
  }

  private async resolveStressPhaseSequential() {
    const order = this.getResolutionOrderSnapshot();
    for (const unit of order) {
      const live = useGameStore.getState().grid[unit.row][unit.col];
      if (!live || live.id !== unit.entityId) continue;

      await this.showEntityCue(unit.row, unit.col, live.name, '暴躁 +1', 0xffb74d);
      const result = useGameStore.getState().addStress(unit.row, unit.col, 1);
      this.syncGridFromStore();
      this.sync3DStressOverlays();
      this.pulseStressCell(unit.row, unit.col);

      if (!result) {
        await waitMs(160);
        continue;
      }

      await this.resolveStressOutcome(result);
      if (useGameStore.getState().gameStatus !== 'playing') return;
    }
  }

  private async resolveStressOutcome(result: StressResolutionResult) {
    if (result.outcome === 'applied') {
      await waitMs(240);
      return;
    }

    if (result.outcome === 'black_red') {
      if (result.bonusIncome && result.bonusIncome > 0) {
        this.spawnIncomeFloat(result.row, result.col, result.bonusIncome);
      }
      await this.showEntityCue(
        result.row,
        result.col,
        '黑红暴走',
        `额外收益 +${result.bonusIncome ?? 0}`,
        0xff6f61
      );
      return;
    }

    await this.showEntityCue(result.row, result.col, '彻底拆家', '工位耐久受损，店长掉血', 0xff8a80);
  }
}
