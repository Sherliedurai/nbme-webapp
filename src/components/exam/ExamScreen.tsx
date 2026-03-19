import React, { useEffect, useCallback, useState } from 'react';
import { useExam, QUESTIONS_PER_BLOCK } from '@/context/ExamContext';
import TopBar from './TopBar';
import QuestionNav from './QuestionNav';
import QuestionContent from './QuestionContent';
import ExplanationPanel from './ExplanationPanel';
import BottomBar from './BottomBar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const ExamScreen: React.FC = () => {
  const { state, dispatch, getBlockQuestions, getCurrentQuestion } = useExam();
  const [showEndWarning, setShowEndWarning] = useState(false);
  const isReview = state.phase === 'review';

  const current = getCurrentQuestion();
  const isLocked = current?.questionState?.locked || isReview;
  const hasAnswer = !!current?.questionState?.answer;
  const showExplanation = (state.instantFeedback && isLocked && hasAnswer) || isReview;

  const handleEndBlock = useCallback(() => {
    if (isReview) {
      dispatch({ type: 'VIEW_RESULTS' });
      return;
    }
    const questions = getBlockQuestions();
    const unanswered = questions.filter((q) => !q.questionState?.answer).length;
    if (unanswered > 0) {
      setShowEndWarning(true);
    } else {
      dispatch({ type: 'END_BLOCK' });
    }
  }, [isReview, dispatch, getBlockQuestions]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const current = (() => {
        if (!state.examData) return null;
        const blockStart = state.currentBlock * QUESTIONS_PER_BLOCK;
        const globalIdx = blockStart + state.currentQuestionIndex;
        return state.examData.questions[globalIdx];
      })();

      if (!current) return;

      switch (e.key.toLowerCase()) {
        case 'a': case 'b': case 'c': case 'd': case 'e':
          if (!isReview) {
            const key = e.key.toUpperCase();
            if (current.options[key]) {
              dispatch({ type: 'SET_ANSWER', payload: { questionId: current.id, answer: key } });
            }
          }
          break;
        case 'f':
          if (!isReview) dispatch({ type: 'TOGGLE_FLAG', payload: { questionId: current.id } });
          break;
        case 'arrowleft':
          e.preventDefault();
          dispatch({ type: 'PREV_QUESTION' });
          break;
        case 'arrowright':
          e.preventDefault();
          dispatch({ type: 'NEXT_QUESTION' });
          break;
        case 'p':
          if (!isReview) dispatch({ type: 'TOGGLE_PAUSE' });
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state, dispatch, isReview]);

  return (
    <div className="min-h-screen bg-background flex">
      <QuestionNav />
      <div className="flex-1 flex flex-col">
        <TopBar onEndBlock={handleEndBlock} />
        <div className="flex-1 flex pt-12 pb-12">
          <div className={`${showExplanation ? 'w-1/2 border-r border-border' : 'w-full'} overflow-y-auto transition-all duration-300`}>
            <QuestionContent />
          </div>
          {showExplanation && (
            <div className="w-1/2 overflow-y-auto bg-card">
              <ExplanationPanel />
            </div>
          )}
        </div>
        <BottomBar />
      </div>

      <Dialog open={showEndWarning} onOpenChange={setShowEndWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End Block?</DialogTitle>
            <DialogDescription>
              You have {getBlockQuestions().filter((q) => !q.questionState?.answer).length} unanswered
              questions. Are you sure you want to end this block?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEndWarning(false)}>
              Continue Working
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowEndWarning(false);
                dispatch({ type: 'END_BLOCK' });
              }}
            >
              End Block
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ExamScreen;
