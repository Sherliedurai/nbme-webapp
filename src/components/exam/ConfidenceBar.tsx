import React, { useState, useEffect, useRef } from 'react';
import { ConfidenceLevel } from '@/types/exam';

const COUNTDOWN_SECONDS = 7;

interface ConfidenceBarProps {
  questionId: number;
  onSelect: (level: ConfidenceLevel) => void;
}

const ConfidenceBar: React.FC<ConfidenceBarProps> = ({ questionId, onSelect }) => {
  const [timeLeft, setTimeLeft] = useState(COUNTDOWN_SECONDS);
  const selectedRef = useRef(false);

  useEffect(() => {
    selectedRef.current = false;
    setTimeLeft(COUNTDOWN_SECONDS);
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        const next = Math.max(0, prev - 0.1);
        if (next <= 0 && !selectedRef.current) {
          selectedRef.current = true;
          setTimeout(() => onSelect('not_rated'), 0);
        }
        return next;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [questionId, onSelect]);

  const handleSelect = (level: ConfidenceLevel) => {
    if (selectedRef.current) return;
    selectedRef.current = true;
    onSelect(level);
  };

  const pct = (timeLeft / COUNTDOWN_SECONDS) * 100;

  return (
    <div className="mb-4 rounded-lg border border-border bg-muted/30 p-3 animate-slide-down">
      <p className="text-xs text-muted-foreground mb-2 font-medium">How confident are you?</p>
      <div className="flex gap-2 mb-2">
        <button
          onClick={() => handleSelect('guessing')}
          className="flex-1 px-3 py-2 rounded-md text-xs font-medium border border-border bg-card hover:bg-accent transition-colors"
        >
          <span className="block text-base mb-0.5">🎲</span>
          Guessing
        </button>
        <button
          onClick={() => handleSelect('unsure')}
          className="flex-1 px-3 py-2 rounded-md text-xs font-medium border border-border bg-card hover:bg-accent transition-colors"
        >
          <span className="block text-base mb-0.5">🤔</span>
          Unsure
        </button>
        <button
          onClick={() => handleSelect('confident')}
          className="flex-1 px-3 py-2 rounded-md text-xs font-medium border border-border bg-card hover:bg-accent transition-colors"
        >
          <span className="block text-base mb-0.5">💪</span>
          Confident
        </button>
      </div>
      {/* Countdown progress bar */}
      <div className="h-1 w-full bg-border rounded-full overflow-hidden">
        <div
          className="h-full bg-primary/60 transition-all duration-100 ease-linear rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

export default ConfidenceBar;
