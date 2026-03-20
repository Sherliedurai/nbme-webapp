import React, { useState } from 'react';
import { useExam, QUESTIONS_PER_BLOCK } from '@/context/ExamContext';
import { Button } from '@/components/ui/button';
import { Clock, StopCircle, XCircle, Home, BarChart3, CheckCircle, Flame } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

const TopBar: React.FC<{ onEndBlock: () => void }> = ({ onEndBlock }) => {
  const [showEndExam, setShowEndExam] = useState(false);
  const { state, dispatch, totalBlocks, getBlockSize, getRunningStats, getBlockQuestions } = useExam();
  const block = state.blocks[state.currentBlock];
  const isReview = state.phase === 'review';
  const stats = getRunningStats();

  // Streak counter
  const streak = (() => {
    if (!state.examData || !state.instantFeedback) return 0;
    let count = 0;
    // Walk backwards from the latest answered question
    for (let bi = state.currentBlock; bi >= 0; bi--) {
      const blk = state.blocks[bi];
      if (!blk) break;
      const start = bi * QUESTIONS_PER_BLOCK;
      const end = Math.min(start + QUESTIONS_PER_BLOCK, state.examData.questions.length);
      const qs = state.examData.questions.slice(start, end);
      const startIdx = bi === state.currentBlock ? state.currentQuestionIndex : qs.length - 1;
      for (let qi = startIdx; qi >= 0; qi--) {
        const q = qs[qi];
        const qState = blk.questionStates[q.id];
        if (!qState?.answer) continue;
        if (qState.answer === q.correct) count++;
        else return count;
      }
    }
    return count;
  })();

  // Progress bar segments
  const blockQuestions = getBlockQuestions();

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-40 bg-navy text-navy-foreground h-12 flex items-center px-4 justify-between text-sm">
        <div className="flex items-center gap-4">
          <span className="font-medium">
            Block {state.currentBlock + 1} of {totalBlocks}
          </span>
          <span className="font-medium">
            Q {state.currentQuestionIndex + 1} of {getBlockSize()}
          </span>
        </div>

        {/* Quick Stats + Streak */}
        {!isReview && (
          <div className="flex items-center gap-3">
            {stats.answered > 0 && (
              <div className="flex items-center gap-1 text-xs opacity-80">
                <CheckCircle className="h-3 w-3" />
                <span>
                  {stats.correct}/{stats.answered} ({Math.round((stats.correct / stats.answered) * 100)}%)
                </span>
              </div>
            )}
            {state.instantFeedback && streak >= 2 && (
              <div className="flex items-center gap-0.5 text-xs font-semibold text-warning">
                <Flame className="h-3.5 w-3.5" />
                {streak}
              </div>
            )}
          </div>
        )}

        {isReview ? (
          <div className="flex items-center gap-2">
            <span className="text-warning font-medium mr-2">Review Mode</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => dispatch({ type: 'VIEW_RESULTS' })}
              className="h-7 text-xs bg-transparent border-navy-foreground/30 text-navy-foreground hover:bg-navy-foreground/10"
            >
              <BarChart3 className="h-3 w-3 mr-1" />
              Score
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => dispatch({ type: 'RESET_KEEP_EXAM' })}
              className="h-7 text-xs bg-transparent border-navy-foreground/30 text-navy-foreground hover:bg-navy-foreground/10"
            >
              <Home className="h-3 w-3 mr-1" />
              Home
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              {state.paused ? (
                <span className="text-warning font-mono font-semibold">⏸ PAUSED</span>
              ) : (
                <>
                  <Clock className="h-4 w-4" />
                  <span className={`font-mono ${block?.timeRemaining < 300 ? 'text-destructive' : ''}`}>
                    {formatTime(block?.timeRemaining ?? 0)}
                  </span>
                </>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={onEndBlock}
              className="h-7 text-xs bg-transparent border-navy-foreground/30 text-navy-foreground hover:bg-navy-foreground/10"
            >
              <StopCircle className="h-3 w-3 mr-1" />
              End Block
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowEndExam(true)}
              className="h-7 text-xs bg-transparent border-destructive/50 text-destructive hover:bg-destructive/10"
            >
              <XCircle className="h-3 w-3 mr-1" />
              End Exam
            </Button>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      {!isReview && state.instantFeedback && (
        <div className="fixed top-12 left-0 right-0 z-39 h-1.5 flex bg-muted">
          {blockQuestions.map((item, idx) => {
            const qs = item.questionState;
            let color = 'bg-muted-foreground/20'; // unanswered
            if (qs?.locked && qs?.answer) {
              color = qs.answer === item.question.correct ? 'bg-success' : 'bg-destructive';
            } else if (qs?.answer) {
              color = 'bg-primary/50';
            }
            return <div key={idx} className={`flex-1 ${color} ${idx > 0 ? 'border-l border-background/50' : ''}`} />;
          })}
        </div>
      )}

      <Dialog open={showEndExam} onOpenChange={setShowEndExam}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End Entire Exam?</DialogTitle>
            <DialogDescription>
              Are you sure you want to end the entire exam? This will submit all your answers and show results.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEndExam(false)}>
              Continue Exam
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowEndExam(false);
                dispatch({ type: 'END_EXAM_EARLY' });
              }}
            >
              End Exam
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TopBar;
