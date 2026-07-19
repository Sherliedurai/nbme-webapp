import { useCallback, useEffect, useMemo, useState } from "react";
import type { FullQuestion, ReviewAnswer } from "@/lib/types";
import QuestionNavigator, { type NavCell } from "@/components/exam/QuestionNavigator";
import VignettePanel from "@/components/exam/VignettePanel";
import ExplanationPanel from "@/components/review/ExplanationPanel";
import ErrorTagger from "@/components/review/ErrorTagger";
import { updateAttemptErrorTag } from "@/lib/queries";
import type { ErrorTag } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, ChevronLeft, ChevronRight, LogOut, RotateCcw } from "lucide-react";

export type { ReviewAnswer } from "@/lib/types";

interface Props {
  questions: FullQuestion[];
  answers: ReviewAnswer[];
  onExit: () => void;
  title?: string;
  exitLabel?: string;
  /** Focus this question on open (its position in the active queue). */
  initialQuestionId?: string;
  /** Start walking every question rather than just the misses+flags. */
  defaultAllMode?: boolean;
  /** When set, show an explicit "Retake" action (the ONLY path to a fresh sitting). */
  onRetake?: () => void;
}

const noop = () => {};

export default function ReviewQueue({
  questions,
  answers,
  onExit,
  title = "Review",
  exitLabel = "Exit",
  initialQuestionId,
  defaultAllMode = false,
  onRetake,
}: Props) {
  // Local tag state so "Y tagged" updates live and survives navigation.
  const [tags, setTags] = useState<Record<number, ErrorTag | null>>(() => {
    const m: Record<number, ErrorTag | null> = {};
    answers.forEach((a, i) => { m[i] = a.errorTag ?? null; });
    return m;
  });

  const isCorrect = useCallback(
    (i: number) => answers[i].selectedLetter != null && answers[i].selectedLetter === questions[i].correct_letter,
    [answers, questions]
  );
  const isMiss = useCallback((i: number) => !isCorrect(i), [isCorrect]);
  // In the queue by default: everything missed OR flagged (the ones needing a tag / a look).
  const needsReview = useCallback((i: number) => isMiss(i) || answers[i].flagged, [isMiss, answers]);

  const allIdx = useMemo(() => questions.map((_, i) => i), [questions]);
  const reviewIdx = useMemo(() => allIdx.filter(needsReview), [allIdx, needsReview]);
  const [allMode, setAllMode] = useState(defaultAllMode || reviewIdx.length === 0);
  const queue = allMode ? allIdx : reviewIdx;

  // `current` is an index into questions[] — the source of truth for what's shown.
  const [current, setCurrent] = useState(() => {
    const start = queue.length ? queue[0] : 0;
    if (!initialQuestionId) return start;
    const qi = questions.findIndex((q) => q.id === initialQuestionId);
    return qi >= 0 ? qi : start;
  });
  const [done, setDone] = useState(false);

  // If the focused question isn't in the missed queue, widen to all so it's walkable.
  useEffect(() => {
    if (!initialQuestionId) return;
    const qi = questions.findIndex((q) => q.id === initialQuestionId);
    if (qi >= 0 && !reviewIdx.includes(qi)) setAllMode(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pos = queue.indexOf(current); // -1 if current fell outside the queue after a toggle
  const safePos = pos < 0 ? 0 : pos;
  // Keep `current` inside the queue when the mode toggles away from it.
  useEffect(() => {
    if (queue.length && !queue.includes(current)) setCurrent(queue[Math.min(safePos, queue.length - 1)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMode]);

  const taggable = useMemo(() => queue.filter(isMiss), [queue, isMiss]);
  const taggedCount = taggable.filter((i) => tags[i] != null).length;

  const goNext = useCallback(() => {
    const p = queue.indexOf(current);
    if (p < 0) { setCurrent(queue[0]); return; }
    if (p >= queue.length - 1) setDone(true);
    else setCurrent(queue[p + 1]);
  }, [queue, current]);
  const goPrev = useCallback(() => {
    if (done) { setDone(false); return; }
    const p = queue.indexOf(current);
    if (p > 0) setCurrent(queue[p - 1]);
  }, [queue, current, done]);

  // Right-arrow = Next, Left-arrow = Previous (skip when typing in a control).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev]);

  const cells: NavCell[] = useMemo(
    () => answers.map((a, i) => ({
      state: isCorrect(i) ? "correct" : "incorrect",
      flagged: a.flagged,
    })),
    [answers, isCorrect]
  );

  async function persistTag(i: number, tag: ErrorTag | null) {
    const id = answers[i].attemptId;
    if (id) await updateAttemptErrorTag(id, tag);
    setTags((prev) => ({ ...prev, [i]: tag }));
  }

  // ── End-of-queue confirmation ───────────────────────────────────────────────
  if (done) {
    const complete = taggable.length > 0 && taggedCount === taggable.length;
    return (
      <div className="flex h-screen flex-col bg-background">
        <Header title={title} onExit={onExit} exitLabel={exitLabel}
          progress={`Reviewed ${queue.length} question${queue.length === 1 ? "" : "s"}`} />
        <div className="grid flex-1 place-items-center p-6">
          <Card className="w-full max-w-md text-center">
            <CardContent className="space-y-4 p-8">
              <CheckCircle2 className={complete ? "mx-auto size-10 text-correct" : "mx-auto size-10 text-amber-500"} />
              <div className="text-lg font-semibold text-slate-800">
                {taggable.length === 0
                  ? "Nothing to tag here"
                  : complete
                    ? `All ${taggable.length} tagged`
                    : `${taggedCount} of ${taggable.length} tagged`}
              </div>
              {!complete && taggable.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {taggable.length - taggedCount} miss{taggable.length - taggedCount === 1 ? "" : "es"} still untagged — step back to finish, or move on.
                </p>
              )}
              <div className="flex flex-col gap-2 pt-1">
                <Button onClick={onExit}>{exitLabel}</Button>
                <Button variant="outline" onClick={() => { setDone(false); setCurrent(queue[0]); }}>Back to start</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const q = questions[current];
  const a = answers[current];
  const onLast = safePos >= queue.length - 1;

  return (
    <div className="flex h-screen flex-col bg-background">
      <Header
        title={title} onExit={onExit} exitLabel={exitLabel}
        extra={onRetake && (
          <Button variant="navy" size="sm" onClick={onRetake} title="Start a new, separate sitting of this block">
            <RotateCcw className="size-4" /> Retake
          </Button>
        )}
        progress={
          <span className="flex items-center gap-2">
            <span>Question <strong className="text-navy-foreground">{safePos + 1}</strong> of {queue.length}</span>
            {taggable.length > 0 && (
              <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs tabular-nums">
                {taggedCount}/{taggable.length} tagged
                {taggedCount === taggable.length && <CheckCircle2 className="ml-1 inline size-3.5 text-correct" />}
              </span>
            )}
          </span>
        }
        modeToggle={
          reviewIdx.length !== allIdx.length && reviewIdx.length > 0 ? (
            <div className="flex overflow-hidden rounded-md border border-white/20 text-xs">
              <button onClick={() => setAllMode(false)}
                className={allMode ? "px-2.5 py-1 text-navy-foreground/70 hover:bg-white/10" : "bg-white/15 px-2.5 py-1 font-medium"}>
                Misses &amp; flags ({reviewIdx.length})
              </button>
              <button onClick={() => setAllMode(true)}
                className={allMode ? "bg-white/15 px-2.5 py-1 font-medium" : "px-2.5 py-1 text-navy-foreground/70 hover:bg-white/10"}>
                All ({allIdx.length})
              </button>
            </div>
          ) : null
        }
      />

      <div className="flex min-h-0 flex-1">
        <QuestionNavigator
          cells={cells}
          currentIndex={current}
          onJump={(i) => { if (!queue.includes(i)) setAllMode(true); setCurrent(i); setDone(false); }}
          collapsed={false}
          onToggleCollapse={noop}
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
                highlightMode={false}
                strikeMode={false}
                flagged={a.flagged}
                revealed
                correctLetter={q.correct_letter}
                onToggleHighlightMode={noop}
                onToggleStrikeMode={noop}
                onToggleFlag={noop}
                onSelect={noop}
                onToggleStrike={noop}
                onChangeHighlight={noop}
              />
            )}
          </section>
          <section className="min-h-0 flex-1 space-y-4 overflow-y-auto border-t p-0 lg:w-1/2 lg:border-l lg:border-t-0">
            {q && isMiss(current) && (
              <div className="px-4 pt-4">
                <ErrorTagger
                  key={q.id}
                  value={tags[current] ?? null}
                  disabled={!a.attemptId}
                  onTag={(tag) => persistTag(current, tag)}
                />
              </div>
            )}
            {q && <ExplanationPanel question={q} selectedLetter={a.selectedLetter} secondsSpent={a.secondsSpent} />}
          </section>
        </main>
      </div>

      <footer className="flex items-center justify-between border-t bg-card px-4 py-2.5">
        <span className="hidden text-xs text-muted-foreground sm:block">
          {isMiss(current)
            ? tags[current]
              ? "Tagged. Read the explanation, then Next →"
              : "Tag why you missed it, read the explanation, then Next →"
            : "Correct — read, then Next →"}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={safePos === 0} onClick={goPrev}>
            <ChevronLeft className="size-4" /> Previous
          </Button>
          <Button size="lg" onClick={goNext} className="min-w-32">
            {onLast ? "Finish" : "Next"} <ChevronRight className="size-4" />
          </Button>
        </div>
      </footer>
    </div>
  );
}

function Header({ title, progress, onExit, exitLabel, modeToggle, extra }: {
  title: string; progress: React.ReactNode; onExit: () => void; exitLabel: string;
  modeToggle?: React.ReactNode; extra?: React.ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-4 bg-navy px-4 py-2.5 text-navy-foreground">
      <div className="flex items-center gap-5 text-sm">
        <span className="font-semibold uppercase tracking-widest">{title}</span>
        <span className="text-navy-foreground/85">{progress}</span>
      </div>
      <div className="flex items-center gap-3">
        {modeToggle}
        {extra}
        <Button variant="navy" size="sm" onClick={onExit}><LogOut className="size-4" /> {exitLabel}</Button>
      </div>
    </header>
  );
}
