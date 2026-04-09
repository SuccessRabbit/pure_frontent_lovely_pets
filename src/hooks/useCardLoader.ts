import { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import type { Card } from '../types/card';

// 临时：加载卡牌配置
import petsConfig from '../../config/pets.json';
import workersConfig from '../../config/workers.json';
import actionsConfig from '../../config/actions.json';

export function useCardLoader() {
  const { deck, initGame } = useGameStore(state => ({
    deck: state.deck,
    initGame: state.initGame,
  }));

  useEffect(() => {
    // 只在首次加载时初始化
    if (deck.length === 0) {
      loadCards();
    }
  }, []);

  const loadCards = () => {
    const allCards: Card[] = [
      ...(petsConfig as any),
      ...(workersConfig as any),
      ...(actionsConfig as any),
    ] as Card[];

    console.log('Loading cards:', {
      pets: petsConfig.length,
      workers: workersConfig.length,
      actions: actionsConfig.length,
      total: allCards.length
    });

    // 规范化卡牌数据：将顶层的 income/stress/stressLimit 移到 attributes 中
    const normalizedCards = allCards.map(card => ({
      ...card,
      attributes: {
        income: card.income || 0,
        maxStress: card.stressLimit || 100,
        health: 100,
        attack: 0,
      }
    }));

    // 构建初始牌库（每张卡2份）
    const initialDeck: Card[] = [];
    normalizedCards.forEach(card => {
      for (let i = 0; i < 2; i++) {
        initialDeck.push({ ...card });
      }
    });

    // 洗牌
    const shuffledDeck = initialDeck.sort(() => Math.random() - 0.5);

    console.log('Deck created:', shuffledDeck.length, 'cards');

    // 直接用牌库初始化游戏
    initGame(shuffledDeck);
  };

  return { loadCards };
}
