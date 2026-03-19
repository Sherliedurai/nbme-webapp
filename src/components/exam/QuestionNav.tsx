import React, { useState } from 'react';
import { useExam } from '@/context/ExamContext';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const QuestionNav: React.FC = () => {
  const { state, dispatch, getBlockQuestions } = useExam();
  const [collapsed, setCollapsed] = useState(false);
  const questions = getBlockQuestions();
  const instantFeedback = state.instantFeedback;

  if (collapsed) {
    return (
      <div className="w-8 flex-shrink-0 bg-card border-r flex flex-col items-center pt-14">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCollapsed(false)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="w-48 flex-shrink-0 bg-card border-r pt-14 pb-14 overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase">Questions</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCollapsed(true)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-5 gap-1 px-3">
        {questions.map((item, idx) => {
          const qs = item.questionState;
          let cellClass = 'unvisited';
          if (idx === state.currentQuestionIndex) {
            cellClass = 'current';
          } else if (qs?.flagged) {
            cellClass = 'flagged';
          } else if (instantFeedback && qs?.locked && qs?.answer) {
            cellClass = qs.answer === item.question.correct ? 'answered' : 'incorrect';
          } else if (qs?.answer) {
            cellClass = 'answered';
          } else if (qs?.visited) {
            cellClass = 'unvisited';
          }

          return (
            <button
              key={item.question.id}
              className={`question-grid-cell ${cellClass}`}
              onClick={() => dispatch({ type: 'GO_TO_QUESTION', payload: idx })}
            >
              {idx + 1}
            </button>
          );
        })}
      </div>
      <div className="mt-4 px-3 space-y-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-muted border" /> Unvisited
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-primary" /> Current
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-success" /> {instantFeedback ? 'Correct' : 'Answered'}
        </div>
        {instantFeedback && (
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-destructive" /> Incorrect
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-warning" /> Flagged
        </div>
      </div>
    </div>
  );
};

export default QuestionNav;
