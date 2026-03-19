import React, { useState, useEffect } from 'react';
import { useExam, BREAK_TIME_SECONDS, QUESTIONS_PER_BLOCK } from '@/context/ExamContext';
import { Button } from '@/components/ui/button';
import { Coffee, ArrowRight, RotateCcw } from 'lucide-react';

const BreakScreen: React.FC = () => {
  const { state, dispatch } = useExam();
  const [breakTime, setBreakTime] = useState(BREAK_TIME_SECONDS);

  const block = state.blocks[state.currentBlock];
  const blockQuestions = (() => {
    if (!state.examData) return [];
    const start = state.currentBlock * QUESTIONS_PER_BLOCK;
    const end = Math.min(start + QUESTIONS_PER_BLOCK, state.examData.questions.length);
    return state.examData.questions.slice(start, end);
  })();

  const answered = blockQuestions.filter((q) => block?.questionStates[q.id]?.answer).length;
  const unanswered = blockQuestions.length - answered;
  const flagged = blockQuestions.filter((q) => block?.questionStates[q.id]?.flagged).length;

  // Instant feedback stats
  const correct = blockQuestions.filter(
    (q) => block?.questionStates[q.id]?.answer === q.correct
  ).length;
  const incorrect = answered - correct;
  const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;

  useEffect(() => {
    const interval = setInterval(() => {
      setBreakTime((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center max-w-md mx-auto p-8">
        <div className="bg-navy text-navy-foreground rounded-lg p-6 mb-6">
          <Coffee className="h-10 w-10 mx-auto mb-3" />
          <h1 className="text-2xl font-bold">Block {state.currentBlock + 1} Complete</h1>
        </div>

        <div className="bg-card rounded-lg border p-6 space-y-3 mb-6 text-left">
          {state.instantFeedback ? (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Correct</span>
                <span className="font-semibold text-success">{correct}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Incorrect</span>
                <span className="font-semibold text-destructive">{incorrect}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unanswered</span>
                <span className="font-semibold text-muted-foreground">{unanswered}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Flagged</span>
                <span className="font-semibold text-warning">{flagged}</span>
              </div>
              <div className="border-t pt-3 flex justify-between">
                <span className="text-muted-foreground font-medium">Accuracy</span>
                <span className={`font-bold ${accuracy >= 70 ? 'text-success' : 'text-destructive'}`}>
                  {accuracy}%
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Answered</span>
                <span className="font-semibold text-success">{answered}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unanswered</span>
                <span className="font-semibold text-destructive">{unanswered}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Flagged</span>
                <span className="font-semibold text-warning">{flagged}</span>
              </div>
            </>
          )}
        </div>

        <div className="mb-6 text-sm text-muted-foreground">
          Break time remaining: <span className="font-mono font-semibold">{formatTime(breakTime)}</span>
        </div>

        <div className="space-y-3">
          <Button
            size="lg"
            onClick={() => dispatch({ type: 'CONTINUE_NEXT_BLOCK' })}
            className="w-full gap-2"
          >
            <ArrowRight className="h-5 w-5" />
            Continue to Next Block
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => dispatch({ type: 'REVIEW_BLOCK' })}
            className="w-full gap-2"
          >
            <RotateCcw className="h-5 w-5" />
            Review Block
          </Button>
        </div>
      </div>
    </div>
  );
};

export default BreakScreen;
