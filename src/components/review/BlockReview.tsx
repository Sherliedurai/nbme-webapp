import { useMemo, useState } from "react";
import type { FullQuestion } from "@/lib/types";
import QuestionNavigator, { type NavCell } from "@/components/exam/QuestionNavigator";
import VignettePanel from "@/components/exam/VignettePanel";
import ExplanationPanel from "@/components/review/ExplanationPanel";
import ErrorTagger from "@/components/review/ErrorTagger";
import { updateAttemptErrorTag } from "@/lib/queries";
import type { ErrorTag } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, LogOut } from "lucide-react";

export interface ReviewAnswer {
  selectedLetter: string | null;
  secondsSpent: number;
  flagged: boolean;
  attemptId?: string | null; // for one-tap error tagging of misses
  errorTag?: ErrorTag | null;
}

interface Props {
  questions: FullQuestion[];
  answers: ReviewAnswer[];
  onExit: () => void;
  title?: string;
}

const noop = () => {};

export default function BlockReview({ questions, answers, onExit, title = "Review" }: Props) {
  const [idx, setIdx] = useState(0);
  const [collapsed, setCollapsed] = useState(false);

  const score = useMemo(
    () => answers.filter((a, i) => a.selectedLetter === questions[i].correct_letter).length,
    [answers, questions]
  );
  const cells: NavCell[] = useMemo(
    () =>
      answers.map((a, i) => ({
        state: a.selectedLetter == null
          ? "incorrect"
          : a.selectedLetter === questions[i].correct_letter
            ? "correct"
            : "incorrect",
        flagged: a.flagged,
      })),
    [answers, questions]
  );

  const q = questions[idx];
  const a = answers[idx];

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center justify-between gap-4 bg-navy px-4 py-2.5 text-navy-foreground">
        <div className="flex items-center gap-5 text-sm">
          <span className="font-semibold uppercase tracking-widest">{title}</span>
          <span className="text-navy-foreground/80">Q <strong className="text-navy-foreground">{idx + 1}</strong> of {questions.length}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-md bg-white/10 px-2.5 py-1 text-xs tabular-nums">
            Score {score}/{questions.length} ({Math.round((score / questions.length) * 100)}%)
          </span>
          <Button variant="navy" size="sm" onClick={onExit}><LogOut className="size-4" /> Exit</Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <QuestionNavigator
          cells={cells}
          currentIndex={idx}
          onJump={setIdx}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          mode="review"
        />

        <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <section className="min-h-0 flex-1 overflow-y-auto lg:w-1/2">
            {q && (
              <VignettePanel
                key={q.id}
                question={q}
                selectedLetter={a.selectedLetter}
                struckLetters={[]}
                highlightHtml={null}
                strikeMode={false}
                flagged={a.flagged}
                revealed
                correctLetter={q.correct_letter}
                onToggleStrikeMode={noop}
                onToggleFlag={noop}
                onSelect={noop}
                onToggleStrike={noop}
                onChangeHighlight={noop}
              />
            )}
          </section>
          <section className="min-h-0 flex-1 space-y-4 overflow-y-auto border-t p-0 lg:w-1/2 lg:border-l lg:border-t-0">
            {q && a.selectedLetter !== q.correct_letter && (
              <div className="px-4 pt-4">
                <ErrorTagger
                  key={q.id}
                  value={a.errorTag ?? null}
                  disabled={!a.attemptId}
                  onTag={(tag) => updateAttemptErrorTag(a.attemptId!, tag)}
                />
              </div>
            )}
            {q && <ExplanationPanel question={q} selectedLetter={a.selectedLetter} secondsSpent={a.secondsSpent} />}
          </section>
        </main>
      </div>

      <footer className="flex items-center justify-between border-t bg-card px-4 py-2.5">
        <span className="text-xs text-muted-foreground">Reviewing all {questions.length} questions</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={idx === 0} onClick={() => setIdx((i) => i - 1)}>
            <ChevronLeft className="size-4" /> Previous
          </Button>
          <Button size="sm" disabled={idx >= questions.length - 1} onClick={() => setIdx((i) => i + 1)}>
            Next <ChevronRight className="size-4" />
          </Button>
        </div>
      </footer>
    </div>
  );
}
