import { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { buildShuffledStartingDeck } from '../utils/deckFactory';

export function useCardLoader() {
  const { deck, initGame } = useGameStore(state => ({
    deck: state.deck,
    initGame: state.initGame,
  }));

  useEffect(() => {
    if (deck.length === 0) {
      loadCards();
    }
  }, []);

  const loadCards = () => {
    const shuffledDeck = buildShuffledStartingDeck();
    console.log('Deck created:', shuffledDeck.length, 'cards');
    initGame(shuffledDeck);
  };

  return { loadCards };
}
