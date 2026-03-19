import React, { useState } from 'react';
import { useExam } from '@/context/ExamContext';
import { Button } from '@/components/ui/button';
import { Clock, StopCircle, XCircle, Home, BarChart3, CheckCircle } from 'lucide-react';
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
  const { state, dispatch, totalBlocks, getBlockSize, getRunningStats } = useExam();
  const block = state.blocks[state.currentBlock];
  const isReview = state.phase === 'review';
  const stats = getRunningStats();

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-40 bg-navy text-navy-foreground h-12 flex items-center px-4 justify-between text-sm">
      <div className="flex items-center gap-4">
        <span className="font-medium">
          Block {state.currentBlock + 1} of {totalBlocks}
        </span>
        <span className="font-medium">
          Q {state.currentQuestionIndex + 1} of {getBlockSize()}
        </span>
      </div>

      {/* Quick Stats */}
      {!isReview && stats.answered > 0 && (
        <div className="flex items-center gap-1 text-xs opacity-80">
          <CheckCircle className="h-3 w-3" />
          <span>
            {stats.correct}/{stats.answered} ({stats.answered > 0 ? Math.round((stats.correct / stats.answered) * 100) : 0}%)
          </span>
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
          {/* Timer */}
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
    </div>
  );
};

export default TopBar;
