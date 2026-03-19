import React, { useState } from 'react';
import { useExam } from '@/context/ExamContext';
import { ChevronDown, ChevronUp } from 'lucide-react';

function renderFormattedText(text: string): React.ReactNode {
  const parts = text.split(/(".*?")/g);
  return parts.map((part, i) => {
    if (part.startsWith('"') && part.endsWith('"')) {
      return <strong key={i} className="text-foreground">{part.slice(1, -1)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

function renderWatchOutItem(text: string): React.ReactNode {
  const arrowIdx = text.indexOf('→');
  if (arrowIdx > 0) {
    const before = text.slice(0, arrowIdx).trim();
    const after = text.slice(arrowIdx + 1).trim();
    return <><strong className="text-foreground">{before}</strong> → {after}</>;
  }
  const match = text.match(/^([^,.]+)/);
  if (match) {
    return <><strong className="text-foreground">{match[1]}</strong>{text.slice(match[1].length)}</>;
  }
  return text;
}

const ExplanationPanel: React.FC = () => {
  const { getCurrentQuestion } = useExam();
  const current = getCurrentQuestion();
  const [showFullExplanation, setShowFullExplanation] = useState(false);
  const [showHowElseTested, setShowHowElseTested] = useState(false);

  if (!current) return null;
  const { question } = current;

  const hasBottomLine = !!question.explanation_structured?.bottom_line;
  const hasRememberAs = !!question.explanation_structured?.remember_as;
  const hasWatchOut = (question.explanation_structured?.watch_out?.length ?? 0) > 0;
  const hasHighYield = (question.explanation_structured?.high_yield?.length ?? 0) > 0;
  const hasHowElseTested = (question.explanation_structured?.how_else_tested?.length ?? 0) > 0;
  const hasFullExplanation = !!question.explanation_full;
  const hasAny = hasBottomLine || hasRememberAs || hasWatchOut || hasHighYield || hasHowElseTested || hasFullExplanation;

  if (!hasAny) {
    return (
      <div className="p-6 text-muted-foreground text-sm">
        No explanation available for this question.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="sticky top-0 z-10 bg-navy text-navy-foreground px-4 py-2 text-sm font-semibold border-b border-border">
        Explanation
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5 max-h-[calc(100vh-8rem)]">
        {/* Bottom Line */}
        {hasBottomLine && (
          <div className="explanation-section">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              🎯 <span>Bottom Line</span>
            </h3>
            <p className="text-sm font-semibold text-foreground leading-relaxed">
              {renderFormattedText(question.explanation_structured!.bottom_line)}
            </p>
          </div>
        )}

        {/* Remember It As */}
        {hasRememberAs && (
          <div className="explanation-section pl-3 border-l-2 border-primary/30 bg-muted/30 rounded-r-md py-2 pr-3">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              🧠 <span>Remember It As</span>
            </h3>
            <p className="text-sm italic text-muted-foreground leading-relaxed">
              {question.explanation_structured!.remember_as}
            </p>
          </div>
        )}

        {/* Watch Out For */}
        {hasWatchOut && (
          <div className="explanation-section">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              ⚠️ <span>Watch Out For</span>
            </h3>
            <ul className="list-disc list-inside space-y-1.5">
              {question.explanation_structured!.watch_out.map((item, idx) => (
                <li key={idx} className="text-sm text-muted-foreground leading-relaxed">
                  {renderWatchOutItem(item)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* High Yield */}
        {hasHighYield && (
          <div className="explanation-section">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              🔑 <span>High Yield</span>
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {question.explanation_structured!.high_yield!.map((tag, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* How Else They Test This */}
        {hasHowElseTested && (
          <div className="explanation-section pt-3 border-t border-border">
            <button
              onClick={() => setShowHowElseTested(!showHowElseTested)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              🔄 {showHowElseTested ? 'Hide how else they test this' : 'How Else They Test This'}
              {showHowElseTested ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {showHowElseTested && (
              <div className="mt-3 space-y-2">
                {question.explanation_structured!.how_else_tested!.map((item, idx) => (
                  <p key={idx} className="text-sm text-muted-foreground leading-relaxed pl-3 border-l-2 border-accent/50">
                    {renderFormattedText(item)}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Full Explanation */}
        {hasFullExplanation && (
          <div className="explanation-section pt-3 border-t border-border">
            <button
              onClick={() => setShowFullExplanation(!showFullExplanation)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              📖 {showFullExplanation ? 'Hide full explanation' : 'Show full explanation'}
              {showFullExplanation ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {showFullExplanation && (
              <div className="mt-3 text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed select-text">
                {renderFormattedText(question.explanation_full!)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ExplanationPanel;
