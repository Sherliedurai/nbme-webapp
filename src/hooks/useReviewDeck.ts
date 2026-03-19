import { useState, useCallback } from 'react';
import { ReviewDeckItem } from '@/types/exam';

const REVIEW_DECK_KEY = 'nbme-review-deck';

function loadDeck(): ReviewDeckItem[] {
  try {
    return JSON.parse(localStorage.getItem(REVIEW_DECK_KEY) || '[]');
  } catch {
    return [];
  }
}

export function useReviewDeck() {
  const [deck, setDeck] = useState<ReviewDeckItem[]>(loadDeck);

  const addToDeck = useCallback((item: ReviewDeckItem) => {
    setDeck(prev => {
      const updated = [
        ...prev.filter(d => !(d.questionId === item.questionId && d.examName === item.examName)),
        item,
      ];
      localStorage.setItem(REVIEW_DECK_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const removeFromDeck = useCallback((questionId: number, examName: string) => {
    setDeck(prev => {
      const updated = prev.filter(d => !(d.questionId === questionId && d.examName === examName));
      localStorage.setItem(REVIEW_DECK_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const isInDeck = useCallback((questionId: number, examName: string) => {
    return deck.some(d => d.questionId === questionId && d.examName === examName);
  }, [deck]);

  const refresh = useCallback(() => {
    setDeck(loadDeck());
  }, []);

  return { deck, addToDeck, removeFromDeck, isInDeck, refresh };
}
