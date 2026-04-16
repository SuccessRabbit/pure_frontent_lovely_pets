import * as PIXI from 'pixi.js';
import { CardSprite } from '../../entities/CardSprite';
import type { ToastMessage } from '../../systems/ToastPresenter';
import { VfxQueue } from '../../systems/VfxQueue';
import { Tween, Easing } from '../../utils/Tween';
import { burstParticlesAtGlobal, PET_BURST_COLORS } from '../../utils/cardFx';
import type { Card } from '../../../types/card';
import type { DrawEvent } from '../../../store/gameStore';
import type { IsometricPetRenderer } from '../../renderers/IsometricPetRenderer';

const HAND_CARD_W = 200;
const HAND_CARD_H = 280;

function waitMs(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

export interface HandControllerStoreState {
  hand: Card[];
  lastDrawEvent: DrawEvent | null;
}

interface HandLayoutSlot {
  card: Card;
  index: number;
  x: number;
  y: number;
}

interface SyncHandCardsOptions {
  excludeCards?: Set<Card>;
  includeCards?: Set<Card>;
}

interface HandControllerDeps {
  handContainer: PIXI.Container;
  fxLayer: PIXI.Container;
  rootContainer: PIXI.Container;
  vfxQueue: VfxQueue;
  getPetRenderer: () => IsometricPetRenderer | null;
  getStoreState: () => HandControllerStoreState;
  isDragging: () => boolean;
  onStartDrag: (card: CardSprite, index: number) => void;
  showToast: (message: ToastMessage) => void;
  setDeckDisplayOverrideCount: (count: number | null) => void;
}

export class HandController {
  private readonly handContainer: PIXI.Container;
  private readonly fxLayer: PIXI.Container;
  private readonly rootContainer: PIXI.Container;
  private readonly vfxQueue: VfxQueue;
  private readonly getPetRenderer: () => IsometricPetRenderer | null;
  private readonly getStoreState: () => HandControllerStoreState;
  private readonly isDragging: () => boolean;
  private readonly onStartDrag: (card: CardSprite, index: number) => void;
  private readonly showToast: (message: ToastMessage) => void;
  private readonly setDeckDisplayOverrideCount: (count: number | null) => void;

  private handCards: CardSprite[] = [];
  private lastHandRef: Card[] | null = null;
  private hoveredHandCard: CardSprite | null = null;
  private handledDrawEventIds = new Set<number>();
  private queuedDrawEvents: DrawEvent[] = [];
  private drawEventFlushQueued = false;
  private pendingDrawCards = new Set<Card>();
  private pendingManualDrawCards = new Map<number, Set<Card>>();

  constructor(deps: HandControllerDeps) {
    this.handContainer = deps.handContainer;
    this.fxLayer = deps.fxLayer;
    this.rootContainer = deps.rootContainer;
    this.vfxQueue = deps.vfxQueue;
    this.getPetRenderer = deps.getPetRenderer;
    this.getStoreState = deps.getStoreState;
    this.isDragging = deps.isDragging;
    this.onStartDrag = deps.onStartDrag;
    this.showToast = deps.showToast;
    this.setDeckDisplayOverrideCount = deps.setDeckDisplayOverrideCount;
  }

  public initPosition() {
    this.handContainer.x = 0;
    this.handContainer.y = 850;
  }

  public getCards() {
    return this.handCards;
  }

  public async playManualDrawEvent(event: DrawEvent) {
    if (this.handledDrawEventIds.has(event.id)) return;
    this.handledDrawEventIds.add(event.id);
    event.drawnCards.forEach(card => this.pendingDrawCards.add(card));
    await this.playDrawEventAnimation(event);
  }

  public prepareManualDrawEvents(events: DrawEvent[]) {
    events.forEach(event => {
      event.drawnCards.forEach(card => this.pendingDrawCards.add(card));
      this.pendingManualDrawCards.set(event.id, new Set(event.drawnCards));
    });
  }

  public updateFromStore(state: HandControllerStoreState) {
    const hand = state.hand;
    const autoQueueAllowed =
      !!state.lastDrawEvent &&
      !this.pendingManualDrawCards.has(state.lastDrawEvent.id) &&
      !this.handledDrawEventIds.has(state.lastDrawEvent.id);
    const drawEventJustQueued =
      !!state.lastDrawEvent && autoQueueAllowed;
    if (drawEventJustQueued && state.lastDrawEvent) {
      this.queueDrawEvent(state.lastDrawEvent);
    } else {
      this.syncHandCards(hand, { excludeCards: this.pendingDrawCards });
    }

    // Only sync again if not handled by queueDrawEvent (which has its own sync inside)
    // and the hand actually changed (not just the same reference after queueDrawEvent's sync)
    if (
      !drawEventJustQueued &&
      (hand !== this.lastHandRef || hand.length !== this.handCards.length)
    ) {
      this.syncHandCards(hand, { excludeCards: this.pendingDrawCards });
    }
  }

  public resolveCardIndexInStore(card: CardSprite): number {
    const hand = this.getStoreState().hand;
    const byRef = hand.findIndex(c => c === card.cardData);
    if (byRef >= 0) return byRef;
    return hand.findIndex(
      c =>
        c.id === card.cardData.id &&
        c.type === card.cardData.type &&
        c.cost === card.cardData.cost
    );
  }

  public onHandCardPointerEnter(card: CardSprite) {
    if (this.isDragging() || card.isDragging || card.isResolving) return;
    this.hoveredHandCard = card;
    this.applyHandHoverLayout(card);
  }

  public onHandCardPointerLeave(card: CardSprite) {
    if (this.isDragging() || card.isDragging || card.isResolving) return;
    if (this.hoveredHandCard !== card) return;
    this.hoveredHandCard = null;
    this.clearHandHoverLayout();
  }

  public resetHandLayoutImmediate() {
    this.handCards.forEach(c => {
      if (c.isResolving) return;
      Tween.killTarget(c);
      Tween.killTarget(c.scale);
      c.position.set(c.originalX, c.originalY);
      c.rotation = c.handTilt;
      c.scale.set(1);
      c.zIndex = c.handZIndex;
    });
  }

  private buildHandLayout(hand: readonly Card[]): HandLayoutSlot[] {
    const cardSpacing = 220;
    const startX = 960 - (hand.length * cardSpacing) / 2;
    return hand.map((card, index) => ({
      card,
      index,
      x: startX + index * cardSpacing + HAND_CARD_W / 2,
      y: HAND_CARD_H / 2,
    }));
  }

  private createHandCardSprite(cardData: Card) {
    const card = new CardSprite(cardData);
    card.on('pointerdown', () => {
      const idx = this.handCards.indexOf(card);
      if (idx >= 0) {
        this.onStartDrag(card, idx);
      }
    });
    card.on('pointerenter', () => this.onHandCardPointerEnter(card));
    card.on('pointerleave', () => this.onHandCardPointerLeave(card));
    return card;
  }

  private consumeManualPendingCard(eventId: number, card: Card): boolean {
    const pending = this.pendingManualDrawCards.get(eventId);
    if (!pending) return false;
    if (!pending.delete(card)) return false;
    if (pending.size === 0) {
      this.pendingManualDrawCards.delete(eventId);
    }
    return true;
  }

  private isManualPendingCard(card: Card): boolean {
    for (const pending of this.pendingManualDrawCards.values()) {
      if (pending.has(card)) return true;
    }
    return false;
  }

  private buildVisibleHand(hand: readonly Card[], opts?: SyncHandCardsOptions): Card[] {
    const exclude = opts?.excludeCards ?? new Set<Card>();
    const include = opts?.includeCards ?? new Set<Card>();
    return hand.filter(card => {
      if (include.has(card)) return true;
      if (exclude.has(card)) return false;
      if (this.isManualPendingCard(card)) return false;
      return true;
    });
  }

  private syncHandCards(hand: Card[], opts?: SyncHandCardsOptions) {
    const exclude = opts?.excludeCards ?? new Set<Card>();
    const visibleHand = this.buildVisibleHand(hand, opts);
    const layout = this.buildHandLayout(visibleHand);
    const layoutByCard = new Map(layout.map(slot => [slot.card, slot]));
    const incomingKeys = new Set(visibleHand);

    this.hoveredHandCard = null;

    const oldByCard = new Map(this.handCards.map(card => [card.cardData, card]));
    this.handCards.forEach(card => {
      if (incomingKeys.has(card.cardData)) return;
      Tween.killTarget(card);
      Tween.killTarget(card.scale);
      card.destroy();
      oldByCard.delete(card.cardData);
    });

    const next: CardSprite[] = [];
    visibleHand.forEach(cardData => {
      const slot = layoutByCard.get(cardData);
      let card = oldByCard.get(cardData);
      if (!card && !exclude.has(cardData) && !this.isManualPendingCard(cardData)) {
        card = this.createHandCardSprite(cardData);
        if (slot) {
          card.position.set(slot.x, slot.y);
          card.originalX = slot.x;
          card.originalY = slot.y;
        }
        this.handContainer.addChild(card);
      }
      if (!card) return;
      next.push(card);
    });

    next.forEach((card, index) => {
      const slot = layoutByCard.get(card.cardData);
      if (!slot) return;
      card.handZIndex = index;
      if (!card.isDragging && !card.isResolving) {
        card.zIndex = index;
      }
      if (Number.isNaN(card.x) || Number.isNaN(card.y)) {
        card.position.set(slot.x, slot.y);
      }
      card.originalX = slot.x;
      card.originalY = slot.y;

      if (card.isDragging || card.isResolving) return;

      Tween.killTarget(card);
      Tween.killTarget(card.scale);
      Tween.to(card, { x: slot.x, y: slot.y, rotation: card.handTilt }, 260, Easing.easeOutCubic);
      Tween.to(card.scale, { x: 1, y: 1 }, 260, Easing.easeOutCubic);
    });

    this.handCards = next;
    this.lastHandRef = hand;
  }

  private queueDrawEvent(event: DrawEvent) {
    if (this.handledDrawEventIds.has(event.id)) return;
    if (this.queuedDrawEvents.some(e => e.id === event.id)) return;
    this.handledDrawEventIds.add(event.id);
    event.drawnCards.forEach(card => this.pendingDrawCards.add(card));
    this.queuedDrawEvents.push(event);
    this.syncHandCards(this.getStoreState().hand, { excludeCards: this.pendingDrawCards });
    this.flushQueuedDrawEventsSoon();
  }

  private flushQueuedDrawEventsSoon() {
    if (this.drawEventFlushQueued) return;
    this.drawEventFlushQueued = true;
    queueMicrotask(() => {
      this.drawEventFlushQueued = false;
      const queued = [...this.queuedDrawEvents].sort((a, b) => a.id - b.id);
      this.queuedDrawEvents = [];
      queued.forEach(event => {
        this.vfxQueue.enqueue(() => this.playDrawEventAnimation(event));
      });
    });
  }

  private getDeckDrawAnchorGlobal() {
    const designPoint = this.getPetRenderer()?.getDeckDrawAnchor();
    if (designPoint) {
      return this.rootContainer.toGlobal(new PIXI.Point(designPoint.x, designPoint.y));
    }
    return this.rootContainer.toGlobal(new PIXI.Point(250, 940));
  }

  private async playDrawEventAnimation(event: DrawEvent) {
    const liveHand = this.getStoreState().hand;
    const cards = event.drawnCards.filter(card => liveHand.includes(card));
    if (cards.length === 0) return;
    await this.playSequentialDrawEventAnimation(event, cards);
  }

  private async playSequentialDrawEventAnimation(event: DrawEvent, cards: Card[]) {
    if (event.reshuffled) {
      this.showToast({ text: '弃牌堆洗回牌库', tone: 'warning', color: 0xfff9c4 });
      await waitMs(260);
    }

    this.showToast({
      text: `${event.sourceLabel} +${cards.length} 张`,
      tone: 'success',
      color: 0xabebc6,
    });
    let deckDisplayCount = event.deckBefore;
    this.setDeckDisplayOverrideCount(deckDisplayCount);

    for (const cardData of cards) {
      const latestHand = this.getStoreState().hand;
      const includeCards = new Set<Card>([cardData]);
      const visibleHand = this.buildVisibleHand(latestHand, {
        excludeCards: this.pendingDrawCards,
        includeCards,
      });
      const slot = this.buildHandLayout(visibleHand).find(entry => entry.card === cardData);
      if (!slot) continue;

      this.getPetRenderer()?.pulseDeckDraw();
      const sourceGlobal = this.getDeckDrawAnchorGlobal();
      const sourceLocal = this.handContainer.toLocal(sourceGlobal);

      let card = this.handCards.find(entry => entry.cardData === cardData);
      if (!card) {
        card = this.createHandCardSprite(cardData);
        card.position.set(sourceLocal.x, sourceLocal.y);
        card.scale.set(0.42, 0.42);
        card.alpha = 0.96;
        card.rotation = -0.24;
        card.handZIndex = slot.index;
        card.originalX = slot.x;
        card.originalY = slot.y;
        this.handContainer.addChild(card);
        this.handCards.push(card);
      }

      card.isResolving = true;
      card.eventMode = 'none';
      card.zIndex = 1600 + slot.index;
      card.handZIndex = slot.index;
      card.originalX = slot.x;
      card.originalY = slot.y;

      this.syncHandCards(latestHand, {
        excludeCards: this.pendingDrawCards,
        includeCards,
      });

      burstParticlesAtGlobal(this.fxLayer, sourceGlobal.x, sourceGlobal.y, {
        count: 16,
        colors: PET_BURST_COLORS,
        spread: 48,
        durationMin: 280,
        durationMax: 520,
      });

      await Promise.all([
        new Promise<void>(resolve => {
          Tween.killTarget(card);
          Tween.to(
            card,
            { x: slot.x, y: slot.y, rotation: card.handTilt, alpha: 1 },
            250,
            Easing.easeOutBack,
            resolve
          );
        }),
        new Promise<void>(resolve => {
          Tween.killTarget(card.scale);
          Tween.to(card.scale, { x: 1, y: 1 }, 250, Easing.easeOutBack, resolve);
        }),
      ]);

      card.zIndex = card.handZIndex;
      card.isResolving = false;
      card.eventMode = 'static';
      this.pendingDrawCards.delete(cardData);
      this.consumeManualPendingCard(event.id, cardData);
      deckDisplayCount = Math.max(event.deckAfter, deckDisplayCount - 1);
      this.setDeckDisplayOverrideCount(deckDisplayCount);
      this.syncHandCards(this.getStoreState().hand, { excludeCards: this.pendingDrawCards });
      await waitMs(40);
    }

    this.setDeckDisplayOverrideCount(null);
    this.syncHandCards(this.getStoreState().hand, { excludeCards: this.pendingDrawCards });
  }

  private applyHandHoverLayout(hovered: CardSprite) {
    const idx = this.handCards.indexOf(hovered);
    if (idx < 0) return;

    const spreadNear = 48;
    const spreadMid = 24;
    const spreadFar = 12;

    this.handCards.forEach((c, j) => {
      if (c.isDragging || c.isResolving) return;
      Tween.killTarget(c);
      Tween.killTarget(c.scale);
      if (c === hovered) {
        c.playHandHoverLift();
        return;
      }
      const dist = Math.abs(j - idx);
      const dir = j > idx ? 1 : -1;
      const mag = dist === 1 ? spreadNear : dist === 2 ? spreadMid : dist > 2 ? spreadFar : 0;
      c.zIndex = c.handZIndex;
      Tween.to(c, { x: c.originalX + dir * mag, y: c.originalY, rotation: c.handTilt }, 260, Easing.easeOutCubic);
      Tween.to(c.scale, { x: 1, y: 1 }, 260, Easing.easeOutCubic);
    });
  }

  private clearHandHoverLayout() {
    this.handCards.forEach(c => {
      if (c.isDragging || c.isResolving) return;
      Tween.killTarget(c);
      Tween.killTarget(c.scale);
      c.zIndex = c.handZIndex;
      Tween.to(c, { x: c.originalX, y: c.originalY, rotation: c.handTilt }, 240, Easing.easeOutCubic);
      Tween.to(c.scale, { x: 1, y: 1 }, 240, Easing.easeOutCubic);
    });
  }
}
