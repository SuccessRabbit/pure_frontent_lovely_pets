import { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { buildShuffledStartingDeck } from '../utils/deckFactory';

export function useCardLoader(enabled = true) {
  const { deck, initGame } = useGameStore(state => ({
    deck: state.deck,
    initGame: state.initGame,
  }));

  useEffect(() => {
    if (!enabled) return;
    if (deck.length === 0) {
      loadCards();
    }
  }, [enabled, deck.length]);

  const loadCards = () => {
    const shuffledDeck = buildShuffledStartingDeck();
    console.log('Deck created:', shuffledDeck.length, 'cards');
    initGame(shuffledDeck);
  };

  return { loadCards };
}
