import { useCallback, useEffect, useRef, useState } from "react";
import { completeSession, recordAttempt, updateAttemptErrorTag } from "@/lib/queries";
import type { FullQuestion } from "@/lib/types";
import type { ErrorTag } from "@/lib/analytics";
import { formatDuration } from "@/lib/utils";
import VignettePanel from "@/components/exam/VignettePanel";
import ExplanationPanel from "@/components/review/ExplanationPanel";
import ErrorTagger from "@/components/review/ErrorTagger";
import LabValuesModal from "@/components/exam/LabValuesModal";
import CalculatorModal from "@/components/exam/CalculatorModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Calculator, ChevronRight, FlaskConical, LogOut, Pause, Timer } from "lucide-react";

interface Props {
  questions: FullQuestion[];
  userId: string;
  sessionId: string;
  title: string;
  /** Cold re-attempt from the review deck → attempts marked is_review (out of analytics). */
  isReview?: boolean;
  /** For review-deck misses: tag the ORIGINAL exam attempt, not the review one. */
  tagAttemptId?: (questionId: string) => string | null;
  onExit: () => void;
}

/**
 * Answer-blind practice runner: pick → Check (records the attempt) → reveal
 * answer + explanation, tag a miss → Next. Shared by Practice, custom blocks,
 * and the cold re-attempt review deck.
 */
export default function PracticeRunner({ questions, userId, sessionId, title, isReview = false, tagAttemptId, onExit }: Props) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [firstLetter, setFirstLetter] = useState<string | null>(null);
  const [struck, setStruck] = useState<string[]>([]);
  const [highlightHtml, setHighlightHtml] = useState<string | null>(null);
  const [highlightMode, setHighlightMode] = useState(false);
  const [strikeMode, setStrikeMode] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [score, setScore] = useState({ correct: 0, answered: 0 });
  const [modal, setModal] = useState<"lab" | "calc" | null>(null);
  const [done, setDone] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0); // running per-question timer (freezes on reveal)

  const enterRef = useRef<number>(Date.now());
  const firstAnswerRef = useRef<number | null>(null); // seconds to first commit (reasoning time)
  const explRef = useRef<HTMLDivElement>(null);
  const q = questions[index];

  // Running timer — advances while answering, AUTO-PAUSES once the explanation
  // is open (revealed), so explanation-reading time never counts as answer time.
  useEffect(() => {
    if (revealed || done) return;
    const id = setInterval(() => setElapsedSec(Math.floor((Date.now() - enterRef.current) / 1000)), 500);
    return () => clearInterval(id);
  }, [revealed, done, index]);

  const onCheck = useCallback(async () => {
    if (!q || selected == null || revealed) return;
    const isCorrect = selected === q.correct_letter;
    const seconds = Math.round((Date.now() - enterRef.current) / 1000); // total time on the question (excludes explanation)
    const firstAnswer = firstAnswerRef.current != null ? Math.round(firstAnswerRef.current) : seconds;
    setElapsedSec(seconds); // freeze the display at the final time
    setRevealed(true); // auto-pauses the timer (effect stops)
    setScore((s) => ({ correct: s.correct + (isCorrect ? 1 : 0), answered: s.answered + 1 }));
    if (window.innerWidth < 1024) {
      requestAnimationFrame(() => explRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
    try {
      const id = await recordAttempt(userId, sessionId, {
        question_id: q.id,
        selected_letter: selected,
        first_letter: firstLetter ?? selected,
        changed: firstLetter != null && firstLetter !== selected,
        is_correct: isCorrect,
        seconds_spent: seconds,
        first_answer_seconds: firstAnswer,
        flagged,
        is_review: isReview,
      });
      setAttemptId(id);
    } catch {
      /* non-fatal in practice */
    }
  }, [q, selected, revealed, userId, sessionId, firstLetter, flagged, isReview]);

  const onNext = useCallback(async () => {
    if (index + 1 >= questions.length) {
      await completeSession(sessionId).catch(() => {});
      setDone(true);
      return;
    }
    setIndex((i) => i + 1);
    setSelected(null); setFirstLetter(null); setStruck([]); setHighlightHtml(null);
    setHighlightMode(false); setStrikeMode(false); setFlagged(false); setRevealed(false); setAttemptId(null);
    enterRef.current = Date.now();
    firstAnswerRef.current = null;
    setElapsedSec(0);
  }, [index, questions.length, sessionId]);

  const toggleStrike = (letter: string) =>
    setStruck((cur) => (cur.includes(letter) ? cur.filter((l) => l !== letter) : [...cur, letter]));

  if (done) {
    const pct = questions.length ? Math.round((score.correct / questions.length) * 100) : 0;
    return (
      <div className="grid min-h-screen place-items-center bg-background p-6">
        <Card className="w-full max-w-md text-center">
          <CardContent className="space-y-4 p-8">
            <div className="text-xs font-semibold uppercase tracking-widest text-primary">{title} complete</div>
            <div className="text-5xl font-bold tabular-nums text-slate-800">
              {score.correct}<span className="text-2xl text-muted-foreground">/{questions.length}</span>
            </div>
            <div className="text-sm text-muted-foreground">{pct}% correct{isReview ? " · review re-attempt (kept out of your scores)" : ""}</div>
            <Button variant="outline" onClick={onExit}>Done</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const last = index + 1 >= questions.length;
  const isMiss = revealed && selected !== q?.correct_letter;
  const tagId = isReview ? (tagAttemptId?.(q?.id ?? "") ?? null) : attemptId;

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center justify-between gap-4 bg-navy px-4 py-2.5 text-navy-foreground">
        <div className="flex items-center gap-5 text-sm">
          <span className="font-semibold uppercase tracking-widest">{title}</span>
          <span className="text-navy-foreground/80">Q <strong className="text-navy-foreground">{index + 1}</strong> of {questions.length}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1 text-xs tabular-nums"
            title={revealed ? "Timer paused while the explanation is open" : "Time on this question (reasoning, not reading the explanation)"}>
            {revealed ? <Pause className="size-3.5 text-amber-300" /> : <Timer className="size-3.5" />}
            {formatDuration(elapsedSec)}
          </span>
          <span className="rounded-md bg-white/10 px-2.5 py-1 text-xs tabular-nums" title="Running score">
            Score {score.correct}/{score.answered}
          </span>
          <Button variant="navy" size="sm" onClick={onExit}><LogOut className="size-4" /> Exit</Button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="min-h-0 flex-1 overflow-y-auto lg:w-1/2">
          {q && (
            <VignettePanel
              key={q.id}
              question={q}
              selectedLetter={selected}
              struckLetters={struck}
              highlightHtml={highlightHtml}
              highlightMode={highlightMode}
              strikeMode={strikeMode}
              flagged={flagged}
              revealed={revealed}
              correctLetter={revealed ? q.correct_letter : null}
              onToggleHighlightMode={() => { setHighlightMode((m) => !m); setStrikeMode(false); }}
              onToggleStrikeMode={() => { setStrikeMode((m) => !m); setHighlightMode(false); }}
              onToggleFlag={() => setFlagged((f) => !f)}
              onSelect={(l) => {
                setSelected(l);
                setFirstLetter((f) => f ?? l);
                if (firstAnswerRef.current == null) firstAnswerRef.current = (Date.now() - enterRef.current) / 1000;
              }}
              onToggleStrike={toggleStrike}
              onChangeHighlight={setHighlightHtml}
            />
          )}
        </section>

        {revealed && q && (
          <section ref={explRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto border-t p-0 lg:w-1/2 lg:border-l lg:border-t-0">
            {isMiss && (
              <div className="px-4 pt-4">
                <ErrorTagger
                  key={q.id}
                  value={null}
                  disabled={!tagId}
                  onTag={(tag: ErrorTag | null) => updateAttemptErrorTag(tagId!, tag)}
                />
              </div>
            )}
            <ExplanationPanel question={q} selectedLetter={selected} />
          </section>
        )}
      </main>

      <footer className="flex items-center justify-between border-t bg-card px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setModal("lab")}><FlaskConical className="size-4" /> Lab Values</Button>
          <Button variant="ghost" size="sm" onClick={() => setModal("calc")}><Calculator className="size-4" /> Calculator</Button>
        </div>
        {!revealed ? (
          <Button size="sm" disabled={selected == null} onClick={onCheck}>Check answer</Button>
        ) : (
          <Button size="lg" className="min-w-32" onClick={onNext}>
            {last ? "Finish" : "Next question"} <ChevronRight className="size-4" />
          </Button>
        )}
      </footer>

      <LabValuesModal open={modal === "lab"} onClose={() => setModal(null)} />
      <CalculatorModal open={modal === "calc"} onClose={() => setModal(null)} />
    </div>
  );
}
