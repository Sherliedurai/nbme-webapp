import React, { useState } from 'react';
import { useExam } from '@/context/ExamContext';
import { useReviewDeck } from '@/hooks/useReviewDeck';
import { ReviewDeckItem } from '@/types/exam';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Home, Trash2, Pin } from 'lucide-react';
import ExplanationPanel from './ExplanationPanel';

function renderFormattedText(text: string): React.ReactNode {
  const parts = text.split(/(".*?")/g);
  return parts.map((part, i) => {
    if (part.startsWith('"') && part.endsWith('"')) {
      return <strong key={i}>{part.slice(1, -1)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

const ReviewDeckScreen: React.FC = () => {
  const { dispatch } = useExam();
  const { deck, removeFromDeck, refresh } = useReviewDeck();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showExplanation, setShowExplanation] = useState(false);

  // Sort: confident-but-wrong first, then by addedAt (oldest first)
  const sorted = [...deck].sort((a, b) => {
    const aConf = a.confidence === 'confident' ? 0 : 1;
    const bConf = b.confidence === 'confident' ? 0 : 1;
    if (aConf !== bConf) return aConf - bConf;
    return a.addedAt - b.addedAt;
  });

  if (sorted.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md p-8">
          <Pin className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h1 className="text-2xl font-bold mb-2">Review Deck Empty</h1>
          <p className="text-muted-foreground mb-6">
            Add questions to your review deck after answering them incorrectly during an exam.
          </p>
          <Button onClick={() => dispatch({ type: 'RESET_EXAM' })}>
            <Home className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  const item = sorted[Math.min(currentIdx, sorted.length - 1)];
  const { question } = item;
  const optionKeys = Object.keys(question.options).sort();

  const handleRemove = () => {
    removeFromDeck(item.questionId, item.examName);
    refresh();
    if (currentIdx >= sorted.length - 1 && currentIdx > 0) {
      setCurrentIdx(currentIdx - 1);
    }
  };

  const hasExplanation = !!(question.explanation_structured || question.explanation_full);

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-navy text-navy-foreground h-12 flex items-center px-4 justify-between text-sm">
        <span className="font-medium">
          📌 Review Deck — {currentIdx + 1} of {sorted.length}
        </span>
        <div className="flex items-center gap-2">
          {item.confidence === 'confident' && (
            <span className="text-xs bg-destructive/20 text-destructive px-2 py-0.5 rounded-full">
              ⚠ Overconfident
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => dispatch({ type: 'RESET_EXAM' })}
            className="h-7 text-xs bg-transparent border-navy-foreground/30 text-navy-foreground hover:bg-navy-foreground/10"
          >
            <Home className="h-3 w-3 mr-1" />
            Home
          </Button>
        </div>
      </div>

      <div className="flex pt-12 pb-12" style={{ minHeight: 'calc(100vh - 6rem)' }}>
        {/* Left panel - question */}
        <div className={`${showExplanation ? 'w-1/2 border-r border-border' : 'w-full'} overflow-y-auto px-6 py-4 max-w-3xl mx-auto`}>
          <div className="text-xs text-muted-foreground mb-2">
            {item.examName} • Q{item.questionId}
          </div>
          <div className="mb-4 text-base leading-relaxed whitespace-pre-wrap select-text">
            {question.stem}
          </div>
          <div className="space-y-2 mb-4">
            {optionKeys.map(key => {
              const isCorrect = key === question.correct;
              const isUserAnswer = key === item.userAnswer;
              let cls = 'border-border opacity-60';
              if (isCorrect) cls = 'border-success bg-success/10';
              if (isUserAnswer && !isCorrect) cls = 'border-destructive bg-destructive/10';
              return (
                <div key={key} className={`w-full text-left p-3 rounded-lg border-2 flex items-start gap-3 select-text ${cls}`}>
                  <span className="font-bold text-sm min-w-[1.5rem] h-6 flex items-center justify-center rounded-full bg-muted">{key}</span>
                  <span className="text-sm flex-1">{question.options[key]}</span>
                  {isCorrect && <span className="text-xs font-medium text-success">✓ Correct</span>}
                  {isUserAnswer && !isCorrect && <span className="text-xs font-medium text-destructive">✗ Your answer</span>}
                </div>
              );
            })}
          </div>

          {hasExplanation && !showExplanation && (
            <Button size="sm" variant="outline" onClick={() => setShowExplanation(true)} className="gap-1 text-xs">
              Show Explanation <ChevronRight className="h-3 w-3" />
            </Button>
          )}

          <div className="mt-4">
            <Button size="sm" variant="ghost" className="text-xs text-destructive gap-1" onClick={handleRemove}>
              <Trash2 className="h-3 w-3" />
              Remove from Deck
            </Button>
          </div>
        </div>

        {/* Right panel - explanation */}
        {showExplanation && hasExplanation && (
          <div className="w-1/2 overflow-y-auto bg-card">
            <div className="sticky top-0 z-10 bg-navy text-navy-foreground px-4 py-2 text-sm font-semibold border-b border-border flex justify-between items-center">
              Explanation
              <button onClick={() => setShowExplanation(false)} className="text-xs opacity-70 hover:opacity-100">
                Hide
              </button>
            </div>
            <div className="p-5 space-y-5">
              {question.explanation_structured?.bottom_line && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">🎯 Bottom Line</h3>
                  <p className="text-sm font-semibold text-foreground leading-relaxed">
                    {renderFormattedText(question.explanation_structured.bottom_line)}
                  </p>
                </div>
              )}
              {question.explanation_structured?.remember_as && (
                <div className="pl-3 border-l-2 border-primary/30">
                  <h3 className="text-sm font-semibold mb-2">🧠 Remember It As</h3>
                  <p className="text-sm italic text-muted-foreground">{question.explanation_structured.remember_as}</p>
                </div>
              )}
              {(question.explanation_structured?.watch_out?.length ?? 0) > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">⚠️ Watch Out For</h3>
                  <ul className="list-disc list-inside space-y-1">
                    {question.explanation_structured!.watch_out.map((item, idx) => (
                      <li key={idx} className="text-sm text-muted-foreground">{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {question.explanation_full && (
                <div className="pt-3 border-t border-border">
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed select-text">
                    {renderFormattedText(question.explanation_full)}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-navy text-navy-foreground h-12 flex items-center px-4 justify-center gap-4 text-sm">
        <Button
          size="sm"
          variant="outline"
          disabled={currentIdx === 0}
          onClick={() => { setCurrentIdx(currentIdx - 1); setShowExplanation(false); }}
          className="h-7 text-xs bg-transparent border-navy-foreground/30 text-navy-foreground hover:bg-navy-foreground/10"
        >
          <ChevronLeft className="h-3 w-3 mr-1" /> Previous
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={currentIdx >= sorted.length - 1}
          onClick={() => { setCurrentIdx(currentIdx + 1); setShowExplanation(false); }}
          className="h-7 text-xs bg-transparent border-navy-foreground/30 text-navy-foreground hover:bg-navy-foreground/10"
        >
          Next <ChevronRight className="h-3 w-3 ml-1" />
        </Button>
      </div>
    </div>
  );
};

export default ReviewDeckScreen;
