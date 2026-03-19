import React, { useState } from 'react';
import { useExam } from '@/context/ExamContext';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, FlaskConical, Calculator, Keyboard, Pause, Play } from 'lucide-react';
import LabValuesModal from './LabValuesModal';
import CalculatorModal from './CalculatorModal';

const BottomBar: React.FC = () => {
  const { state, dispatch, getBlockSize, getCurrentQuestion } = useExam();
  const [showLabs, setShowLabs] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const isReview = state.phase === 'review';
  const blockSize = getBlockSize();

  const current = getCurrentQuestion();
  const isLocked = state.instantFeedback && current?.questionState?.locked;

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-navy text-navy-foreground h-12 flex items-center px-4 justify-between text-sm">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={state.currentQuestionIndex === 0}
            onClick={() => dispatch({ type: 'PREV_QUESTION' })}
            className="h-7 text-xs bg-transparent border-navy-foreground/30 text-navy-foreground hover:bg-navy-foreground/10"
          >
            <ChevronLeft className="h-3 w-3 mr-1" />
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={state.currentQuestionIndex >= blockSize - 1}
            onClick={() => dispatch({ type: 'NEXT_QUESTION' })}
            className={`h-7 text-xs bg-transparent border-navy-foreground/30 text-navy-foreground hover:bg-navy-foreground/10 ${
              isLocked ? 'animate-pulse ring-2 ring-primary/60' : ''
            }`}
          >
            Next
            <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {/* Pause/Suspend */}
          {!isReview && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => dispatch({ type: 'TOGGLE_PAUSE' })}
              className={`h-7 text-xs bg-transparent border-navy-foreground/30 text-navy-foreground hover:bg-navy-foreground/10 ${
                state.paused ? 'border-warning text-warning' : ''
              }`}
            >
              {state.paused ? (
                <>
                  <Play className="h-3 w-3 mr-1" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="h-3 w-3 mr-1" />
                  Suspend
                </>
              )}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowLabs(true)}
            className="h-7 text-xs bg-transparent border-navy-foreground/30 text-navy-foreground hover:bg-navy-foreground/10"
          >
            <FlaskConical className="h-3 w-3 mr-1" />
            Lab Values
          </Button>
          {!isReview && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCalc(true)}
              className="h-7 text-xs bg-transparent border-navy-foreground/30 text-navy-foreground hover:bg-navy-foreground/10"
            >
              <Calculator className="h-3 w-3 mr-1" />
              Calculator
            </Button>
          )}
        </div>

        <div className="hidden md:flex items-center gap-1 text-xs opacity-60">
          <Keyboard className="h-3 w-3" />
          A-E select • F flag • ←→ nav • P pause
        </div>
      </div>

      <LabValuesModal open={showLabs} onClose={() => setShowLabs(false)} />
      <CalculatorModal open={showCalc} onClose={() => setShowCalc(false)} />
    </>
  );
};

export default BottomBar;
