import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clearBlockProgress, completeSession, recordAttempt, saveBlockProgress, updateAttemptErrorTag, updateSessionIndex } from "@/lib/queries";
import type { BlockProgressRow, FullQuestion } from "@/lib/types";
import type { ErrorTag } from "@/lib/analytics";
import { formatDuration } from "@/lib/utils";
import VignettePanel from "@/components/exam/VignettePanel";
import QuestionNavigator, { type NavCell } from "@/components/exam/QuestionNavigator";
import ExplanationPanel from "@/components/review/ExplanationPanel";
import ErrorTagger from "@/components/review/ErrorTagger";
import LabValuesModal from "@/components/exam/LabValuesModal";
import CalculatorModal from "@/components/exam/CalculatorModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Calculator, CheckCircle2, ChevronLeft, ChevronRight, FlaskConical, Lock, LogOut, Pause, Timer } from "lucide-react";

interface Props {
  questions: FullQuestion[];
  userId: string;
  sessionId: string;
  title: string;
  /** Cold re-attempt from the review deck → attempts marked is_review (out of analytics). */
  isReview?: boolean;
  /** For review-deck misses: tag the ORIGINAL exam attempt, not the review one. */
  tagAttemptId?: (questionId: string) => string | null;
  /** Practice: persist progress to block_progress + current_index so it resumes. */
  persist?: boolean;
  /** Resume position (first unanswered question). */
  initialIndex?: number;
  /** Previously-answered questions (question_id → saved answer) — restored as committed. */
  initialAnswered?: Record<string, BlockProgressRow>;
  onExit: () => void;
}

/** Per-question state. `committed` = she Checked it → answer recorded and LOCKED. */
interface PQState {
  selected: string | null;
  firstLetter: string | null;
  struck: string[];
  highlightHtml: string | null;
  flagged: boolean;
  committed: boolean;
  attemptId: string | null;
  secondsSpent: number;
  firstAnswerSeconds: number | null;
}

function seedStates(questions: FullQuestion[], initialAnswered?: Record<string, BlockProgressRow>): PQState[] {
  return questions.map((q) => {
    const row = initialAnswered?.[q.id];
    if (row) {
      return {
        selected: row.selected_letter, firstLetter: row.first_letter, struck: row.struck_letters ?? [],
        highlightHtml: row.highlight_html ?? null, flagged: row.flagged, committed: true, attemptId: null,
        secondsSpent: row.seconds_spent ?? 0, firstAnswerSeconds: row.first_answer_seconds ?? null,
      };
    }
    return { selected: null, firstLetter: null, struck: [], highlightHtml: null, flagged: false,
      committed: false, attemptId: null, secondsSpent: 0, firstAnswerSeconds: null };
  });
}

/**
 * Answer-blind practice runner: pick → Check (records the attempt ONCE) → reveal
 * answer + explanation, tag a miss → move on. The navigator lets her jump to any
 * question; a question she's already Checked is READ-ONLY on revisit (view the
 * answer + explanation, cannot re-answer, records NOTHING new). Shared by Practice,
 * custom blocks, and the cold re-attempt review deck.
 */
export default function PracticeRunner({
  questions, userId, sessionId, title, isReview = false, tagAttemptId,
  persist = false, initialIndex = 0, initialAnswered, onExit,
}: Props) {
  const [states, setStates] = useState<PQState[]>(() => seedStates(questions, initialAnswered));
  const [index, setIndex] = useState(Math.min(Math.max(initialIndex, 0), Math.max(questions.length - 1, 0)));
  const [highlightMode, setHighlightMode] = useState(false);
  const [strikeMode, setStrikeMode] = useState(false);
  const [modal, setModal] = useState<"lab" | "calc" | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [done, setDone] = useState(false);
  const [, setTick] = useState(0); // drives the live-timer re-render

  const indexRef = useRef(index); indexRef.current = index;
  const statesRef = useRef(states); statesRef.current = states;
  const enterRef = useRef<number>(Date.now());
  const explRef = useRef<HTMLDivElement>(null);

  const q = questions[index];
  const cur = states[index];
  const committed = cur?.committed ?? false;
  const revealed = committed; // committed questions show the answer + explanation, read-only

  const score = useMemo(() => {
    let correct = 0, answered = 0;
    states.forEach((s, i) => { if (s.committed) { answered++; if (s.selected === questions[i].correct_letter) correct++; } });
    return { correct, answered };
  }, [states, questions]);

  // Live per-question timer — runs while the current question is uncommitted; it
  // freezes on Check (so reading the explanation never counts as answer time).
  useEffect(() => {
    if (committed || done) return;
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [committed, done, index]);
  const elapsedSec = committed
    ? Math.round(cur?.secondsSpent ?? 0)
    : Math.round((cur?.secondsSpent ?? 0) + (Date.now() - enterRef.current) / 1000);

  // Fold the time spent on the current question into its secondsSpent when leaving.
  const commitDwell = useCallback(() => {
    const i = indexRef.current;
    const s = statesRef.current[i];
    const delta = (Date.now() - enterRef.current) / 1000;
    enterRef.current = Date.now();
    if (!s || s.committed) return;
    setStates((prev) => prev.map((x, j) => (j === i ? { ...x, secondsSpent: x.secondsSpent + delta } : x)));
  }, []);

  const goTo = useCallback((target: number) => {
    if (target < 0 || target >= questions.length || target === indexRef.current) return;
    commitDwell();
    setIndex(target); indexRef.current = target;
    setHighlightMode(false); setStrikeMode(false);
    enterRef.current = Date.now();
    if (persist) void updateSessionIndex(sessionId, target).catch(() => {});
  }, [commitDwell, persist, sessionId, questions.length]);

  // ── Per-question mutations (all no-op once committed = read-only) ────────────
  const onSelect = useCallback((letter: string) => {
    setStates((prev) => prev.map((s, i) => {
      if (i !== indexRef.current || s.committed) return s;
      const firstAnswerSeconds = s.firstAnswerSeconds ?? s.secondsSpent + (Date.now() - enterRef.current) / 1000;
      return { ...s, selected: letter, firstLetter: s.firstLetter ?? letter, firstAnswerSeconds };
    }));
  }, []);
  const onToggleStrike = useCallback((letter: string) => {
    setStates((prev) => prev.map((s, i) => {
      if (i !== indexRef.current || s.committed) return s;
      const struck = s.struck.includes(letter) ? s.struck.filter((l) => l !== letter) : [...s.struck, letter];
      const selected = s.selected === letter && !s.struck.includes(letter) ? null : s.selected;
      return { ...s, struck, selected };
    }));
  }, []);
  const onToggleFlag = useCallback(() => {
    setStates((prev) => prev.map((s, i) => (i === indexRef.current && !s.committed ? { ...s, flagged: !s.flagged } : s)));
  }, []);
  const onChangeHighlight = useCallback((html: string | null) => {
    setStates((prev) => prev.map((s, i) => (i === indexRef.current && !s.committed ? { ...s, highlightHtml: html } : s)));
  }, []);

  // ── Check = commit the current question exactly once ─────────────────────────
  const onCheck = useCallback(async () => {
    const i = indexRef.current;
    const s = statesRef.current[i];
    const qq = questions[i];
    if (!s || !qq || s.committed || s.selected == null) return;
    const seconds = Math.round(s.secondsSpent + (Date.now() - enterRef.current) / 1000);
    const firstAnswer = Math.round(s.firstAnswerSeconds ?? seconds);
    const isCorrect = s.selected === qq.correct_letter;
    // Lock it immediately (freezes the timer, blocks re-answer) before the await.
    setStates((prev) => prev.map((x, j) => (j === i ? { ...x, committed: true, secondsSpent: seconds, firstAnswerSeconds: firstAnswer } : x)));
    enterRef.current = Date.now();
    if (window.innerWidth < 1024) requestAnimationFrame(() => explRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    try {
      const id = await recordAttempt(userId, sessionId, {
        question_id: qq.id, selected_letter: s.selected, first_letter: s.firstLetter ?? s.selected,
        changed: s.firstLetter != null && s.firstLetter !== s.selected, is_correct: isCorrect,
        seconds_spent: seconds, first_answer_seconds: firstAnswer, flagged: s.flagged, is_review: isReview,
      });
      if (id) setStates((prev) => prev.map((x, j) => (j === i ? { ...x, attemptId: id } : x)));
    } catch { /* non-fatal in practice */ }
    if (persist) {
      void saveBlockProgress(userId, sessionId, {
        question_id: qq.id, selected_letter: s.selected, first_letter: s.firstLetter ?? s.selected,
        first_answer_seconds: firstAnswer, seconds_spent: seconds, flagged: s.flagged,
        struck_letters: s.struck, highlight_html: s.highlightHtml,
      }).catch(() => {});
      void updateSessionIndex(sessionId, Math.min(i + 1, questions.length - 1)).catch(() => {});
    }
  }, [questions, userId, sessionId, isReview, persist]);

  const finish = useCallback(async () => {
    commitDwell();
    // Don't swallow a completion failure to nothing — if is_complete never lands
    // the block won't grey on Home. Surface it, but still finish the UI locally.
    await completeSession(sessionId).catch((e) => console.error("[nbme] completeSession failed:", e));
    if (persist) await clearBlockProgress(sessionId).catch(() => {});
    setDone(true);
  }, [commitDwell, sessionId, persist]);

  const uncommittedCount = states.filter((s) => !s.committed).length;
  const onFinishClick = useCallback(() => {
    if (uncommittedCount > 0 &&
      !window.confirm(`Finish practice now? ${uncommittedCount} question${uncommittedCount === 1 ? "" : "s"} still unanswered — they'll stay unanswered.`))
      return;
    void finish();
  }, [uncommittedCount, finish]);

  // ── Keyboard: ← / → move between questions (skip when typing in a control) ────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (e.key === "ArrowRight") { e.preventDefault(); goTo(indexRef.current + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); goTo(indexRef.current - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo]);

  const navCells: NavCell[] = useMemo(
    () => states.map((s) => ({ state: s.committed ? "answered" : "unvisited", flagged: s.flagged })),
    [states]
  );

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

  const isMiss = revealed && cur && cur.selected !== q?.correct_letter;
  const tagId = isReview ? (tagAttemptId?.(q?.id ?? "") ?? null) : cur?.attemptId ?? null;
  const isLast = index >= questions.length - 1;
  const allCommitted = uncommittedCount === 0;

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center justify-between gap-4 bg-navy px-4 py-2.5 text-navy-foreground">
        <div className="flex items-center gap-5 text-sm">
          <span className="font-semibold uppercase tracking-widest">{title}</span>
          <span className="text-navy-foreground/80">Q <strong className="text-navy-foreground">{index + 1}</strong> of {questions.length}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1 text-xs tabular-nums"
            title={revealed ? "Answered — locked. Timer shows your recorded time." : "Time on this question (reasoning, not reading the explanation)"}>
            {revealed ? <Pause className="size-3.5 text-amber-300" /> : <Timer className="size-3.5" />}
            {formatDuration(elapsedSec)}
          </span>
          <span className="rounded-md bg-white/10 px-2.5 py-1 text-xs tabular-nums" title="Running score">
            Score {score.correct}/{score.answered}
          </span>
          <Button variant="navy" size="sm" onClick={onFinishClick} title="Finish this practice block"><CheckCircle2 className="size-4" /> Finish</Button>
          <Button variant="navy" size="sm" onClick={onExit}><LogOut className="size-4" /> Exit</Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <QuestionNavigator cells={navCells} currentIndex={index} onJump={goTo}
          collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} mode="exam" />

        <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <section className="min-h-0 flex-1 overflow-y-auto lg:w-1/2">
            {q && cur && (
              <VignettePanel
                key={q.id}
                question={q}
                selectedLetter={cur.selected}
                struckLetters={cur.struck}
                highlightHtml={cur.highlightHtml}
                highlightMode={highlightMode}
                strikeMode={strikeMode}
                flagged={cur.flagged}
                revealed={revealed}
                correctLetter={revealed ? q.correct_letter : null}
                onToggleHighlightMode={() => { setHighlightMode((m) => !m); setStrikeMode(false); }}
                onToggleStrikeMode={() => { setStrikeMode((m) => !m); setHighlightMode(false); }}
                onToggleFlag={onToggleFlag}
                onSelect={onSelect}
                onToggleStrike={onToggleStrike}
                onChangeHighlight={onChangeHighlight}
              />
            )}
          </section>

          {revealed && q && (
            <section ref={explRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto border-t p-0 lg:w-1/2 lg:border-l lg:border-t-0">
              {isMiss && (
                <div className="px-4 pt-4">
                  <ErrorTagger key={q.id} value={null} disabled={!tagId} onTag={(tag: ErrorTag | null) => updateAttemptErrorTag(tagId!, tag)} />
                </div>
              )}
              <ExplanationPanel question={q} selectedLetter={cur?.selected ?? null} />
            </section>
          )}
        </main>
      </div>

      <footer className="flex items-center justify-between border-t bg-card px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setModal("lab")}><FlaskConical className="size-4" /> Lab Values</Button>
          <Button variant="ghost" size="sm" onClick={() => setModal("calc")}><Calculator className="size-4" /> Calculator</Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={index === 0} onClick={() => goTo(index - 1)}>
            <ChevronLeft className="size-4" /> Prev
          </Button>
          {revealed ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="This question is answered and locked">
              <Lock className="size-3.5" /> answered
            </span>
          ) : null}
          {!committed ? (
            <Button size="sm" disabled={cur?.selected == null} onClick={onCheck}>Check answer</Button>
          ) : allCommitted || isLast ? (
            <Button size="lg" className="min-w-32" onClick={onFinishClick}>Finish <ChevronRight className="size-4" /></Button>
          ) : (
            <Button size="lg" className="min-w-32" onClick={() => goTo(index + 1)}>Next question <ChevronRight className="size-4" /></Button>
          )}
        </div>
      </footer>

      <LabValuesModal open={modal === "lab"} onClose={() => setModal(null)} />
      <CalculatorModal open={modal === "calc"} onClose={() => setModal(null)} />
    </div>
  );
}
