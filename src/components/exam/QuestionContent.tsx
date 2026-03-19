import React, { useState, useRef, useCallback } from 'react';
import { useExam } from '@/context/ExamContext';
import { useReviewDeck } from '@/hooks/useReviewDeck';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Flag, StickyNote, ChevronDown, ChevronUp, AlertTriangle, Highlighter, Strikethrough, Eraser, Timer, Pin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ConfidenceBar from './ConfidenceBar';

type HighlightMode = 'highlight' | 'strikethrough' | null;

function renderHighlightedText(
  text: string,
  highlights: Array<{ start: number; end: number; type: 'highlight' | 'strikethrough' }>
): React.ReactNode {
  if (!highlights.length) return text;
  const sorted = [...highlights].sort((a, b) => a.start - b.start);
  const segments: React.ReactNode[] = [];
  let lastEnd = 0;
  sorted.forEach((h, i) => {
    if (h.start > lastEnd) segments.push(text.slice(lastEnd, h.start));
    const cls = h.type === 'highlight' ? 'nbme-highlight' : 'nbme-strikethrough';
    segments.push(<span key={i} className={cls}>{text.slice(h.start, h.end)}</span>);
    lastEnd = Math.max(lastEnd, h.end);
  });
  if (lastEnd < text.length) segments.push(text.slice(lastEnd));
  return <>{segments}</>;
}

const QuestionContent: React.FC = () => {
  const { state, dispatch, getCurrentQuestion } = useExam();
  const { addToDeck, isInDeck } = useReviewDeck();
  const current = getCurrentQuestion();
  const [showNotes, setShowNotes] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [highlightMode, setHighlightMode] = useState<HighlightMode>(null);
  const stemRef = useRef<HTMLDivElement>(null);
  const isReview = state.phase === 'review';
  const instantFeedback = state.instantFeedback;

  const question = current?.question;
  const questionState = current?.questionState;
  const optionKeys = question ? Object.keys(question.options).sort() : [];
  const isLocked = questionState?.locked || isReview;
  const hasAnswer = !!questionState?.answer;
  const showFeedback = (instantFeedback && isLocked && hasAnswer) || isReview;
  const isCorrectAnswer = questionState?.answer === question?.correct;

  // Confidence bar: show when answer set but not locked, in instant feedback + confidence mode
  const showConfidenceBar =
    instantFeedback && state.confidenceTracking && hasAnswer && !questionState?.locked && !isReview;

  const handleStemMouseUpCb = useCallback(() => {
    if (!highlightMode || !stemRef.current || !question) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!stemRef.current.contains(range.startContainer)) return;
    const preRange = document.createRange();
    preRange.selectNodeContents(stemRef.current);
    preRange.setEnd(range.startContainer, range.startOffset);
    const start = preRange.toString().length;
    const end = start + range.toString().length;
    if (end > start) {
      const existing = questionState?.highlights || [];
      const newHighlight = { start, end, type: highlightMode };
      dispatch({
        type: 'SET_HIGHLIGHTS',
        payload: { questionId: question.id, highlights: [...existing, newHighlight] },
      });
    }
    selection.removeAllRanges();
  }, [highlightMode, questionState, question, dispatch]);

  if (!question) return <div className="flex-1 flex items-center justify-center">No question loaded.</div>;

  const getOptionClass = (key: string) => {
    if (!showFeedback) {
      return questionState?.answer === key
        ? 'border-primary bg-primary/10'
        : 'border-border hover:border-primary/50 hover:bg-primary/5';
    }
    const isCorrect = key === question.correct;
    const isUserAnswer = questionState?.answer === key;
    if (isCorrect) return 'border-success bg-success/10';
    if (isUserAnswer && !isCorrect) return 'border-destructive bg-destructive/10';
    return 'border-border opacity-60';
  };

  const clearHighlights = () => {
    dispatch({ type: 'SET_HIGHLIGHTS', payload: { questionId: question.id, highlights: [] } });
  };

  const handleConfidence = (confidence: 'guessing' | 'unsure' | 'confident' | 'not_rated') => {
    dispatch({ type: 'SET_CONFIDENCE', payload: { questionId: question.id, confidence } });
  };

  const handleAddToReviewDeck = () => {
    if (!state.examData) return;
    addToDeck({
      questionId: question.id,
      examName: state.examData.exam_name,
      question,
      userAnswer: questionState?.answer || '',
      confidence: questionState?.confidence || null,
      addedAt: Date.now(),
    });
  };

  const inDeck = state.examData ? isInDeck(question.id, state.examData.exam_name) : false;

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 max-w-3xl mx-auto">
      {/* Stem Warning */}
      {question.stem_warning && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>⚠️ This question's text may be incomplete due to OCR issues. Please refer to the original PDF.</span>
        </div>
      )}

      {/* Highlight Toolbar */}
      {!isReview && (
        <div className="flex items-center gap-1 mb-3 pb-2 border-b border-border">
          <Button
            size="sm"
            variant={highlightMode === 'highlight' ? 'default' : 'outline'}
            onClick={() => setHighlightMode(highlightMode === 'highlight' ? null : 'highlight')}
            className="h-7 text-xs gap-1"
          >
            <Highlighter className="h-3 w-3" />
            Highlight
          </Button>
          <Button
            size="sm"
            variant={highlightMode === 'strikethrough' ? 'default' : 'outline'}
            onClick={() => setHighlightMode(highlightMode === 'strikethrough' ? null : 'strikethrough')}
            className="h-7 text-xs gap-1"
          >
            <Strikethrough className="h-3 w-3" />
            Strikethrough
          </Button>
          {(questionState?.highlights?.length ?? 0) > 0 && (
            <Button size="sm" variant="ghost" onClick={clearHighlights} className="h-7 text-xs gap-1 text-destructive">
              <Eraser className="h-3 w-3" />
              Clear
            </Button>
          )}
        </div>
      )}

      {/* Image */}
      {question.image && (
        <div className="mb-4 flex justify-center">
          <img
            src={question.image}
            alt="Question image"
            className="max-w-full max-h-[500px] object-contain cursor-pointer rounded border"
            onClick={() => setZoomedImage(question.image)}
          />
        </div>
      )}

      {/* Image Zoom */}
      {zoomedImage && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center cursor-pointer" onClick={() => setZoomedImage(null)}>
          <img src={zoomedImage} alt="Zoomed" className="max-w-[95vw] max-h-[95vh] object-contain" />
        </div>
      )}

      {/* Question Stem */}
      <div
        ref={stemRef}
        onMouseUp={handleStemMouseUpCb}
        className={`mb-4 text-base leading-relaxed whitespace-pre-wrap select-text ${highlightMode ? 'cursor-text' : ''}`}
      >
        {renderHighlightedText(question.stem, questionState?.highlights || [])}
      </div>

      {/* Options */}
      <div className="space-y-2 mb-4">
        {optionKeys.map((key) => (
          <button
            key={key}
            disabled={isLocked}
            onClick={() => !isLocked && dispatch({ type: 'SET_ANSWER', payload: { questionId: question.id, answer: key } })}
            className={`w-full text-left p-3 rounded-lg border-2 transition-colors flex items-start gap-3 ${getOptionClass(key)} ${
              isLocked ? 'select-text' : 'select-none'
            }`}
          >
            <span className="font-bold text-sm min-w-[1.5rem] h-6 flex items-center justify-center rounded-full bg-muted">
              {key}
            </span>
            <span className="text-sm flex-1">{question.options[key]}</span>
            {showFeedback && key === question.correct && (
              <span className="text-xs font-medium text-success">✓ Correct</span>
            )}
            {showFeedback && questionState?.answer === key && key !== question.correct && (
              <span className="text-xs font-medium text-destructive">✗ Your answer</span>
            )}
          </button>
        ))}
      </div>

      {/* Status Badge */}
      {showFeedback && (
        <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold mb-3 ${
          isCorrectAnswer ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'
        }`}>
          {isCorrectAnswer ? '✓ Correct!' : `✗ Incorrect — Answer: ${question.correct}`}
        </div>
      )}

      {/* Confidence Bar */}
      {showConfidenceBar && (
        <ConfidenceBar questionId={question.id} onSelect={handleConfidence} />
      )}

      {/* Time spent */}
      {state.timeTracking && isLocked && (questionState?.timeSpent ?? 0) > 0 && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
          <Timer className="h-3 w-3" />
          Time: {Math.floor((questionState?.timeSpent || 0) / 60)} min {(questionState?.timeSpent || 0) % 60} sec
        </div>
      )}

      {/* Add to Review Deck */}
      {showFeedback && !isCorrectAnswer && !isReview && (
        <Button
          size="sm"
          variant={inDeck ? 'secondary' : 'outline'}
          onClick={handleAddToReviewDeck}
          disabled={inDeck}
          className="h-7 text-xs gap-1 mb-3"
        >
          <Pin className="h-3 w-3" />
          {inDeck ? 'Added to Review Deck' : '📌 Add to Review Deck'}
        </Button>
      )}

      {/* Flag & Notes */}
      {!isReview && (
        <div className="mt-2 space-y-3">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <Checkbox
                checked={questionState?.flagged ?? false}
                onCheckedChange={() => dispatch({ type: 'TOGGLE_FLAG', payload: { questionId: question.id } })}
                className="data-[state=checked]:bg-warning data-[state=checked]:border-warning"
              />
              <Flag className="h-4 w-4 text-warning" />
              Flag for Review
            </label>
            <button
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setShowNotes(!showNotes)}
            >
              <StickyNote className="h-4 w-4" />
              Notes
              {showNotes ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </div>
          {showNotes && (
            <Textarea
              placeholder="Type your notes here..."
              value={questionState?.notes ?? ''}
              onChange={(e) =>
                dispatch({ type: 'SET_NOTES', payload: { questionId: question.id, notes: e.target.value } })
              }
              className="min-h-[80px]"
            />
          )}
        </div>
      )}
    </div>
  );
};

export default QuestionContent;
