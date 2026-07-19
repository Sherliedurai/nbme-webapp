import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  createBlockSession,
  getAnswerKey,
  getBlockCount,
  getCompletedBlock,
  getExamQuestions,
  getFullQuestions,
  getUnfinishedBlock,
  loadBlockProgress,
  pauseSession,
  resumeSession,
  saveBlockProgress,
  submitBlock,
  updateSessionIndex,
  type AttemptInput,
} from "@/lib/queries";
import type { BlockSession, ExamQuestion, FullQuestion, QuestionState } from "@/lib/types";
import type { AnalyticsAttempt } from "@/lib/analytics";
import { useBlockTimer } from "@/hooks/useBlockTimer";
import ReviewQueue, { type ReviewAnswer } from "@/components/review/ReviewQueue";
import BlockReport from "@/components/review/BlockReport";
import ExamTopBar from "@/components/exam/ExamTopBar";
import QuestionNavigator, { type NavCell } from "@/components/exam/QuestionNavigator";
import VignettePanel from "@/components/exam/VignettePanel";
import ExamBottomBar from "@/components/exam/ExamBottomBar";
import LabValuesModal from "@/components/exam/LabValuesModal";
import CalculatorModal from "@/components/exam/CalculatorModal";
import SubmitReviewModal from "@/components/exam/SubmitReviewModal";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

const BLOCK_SECONDS = 30 * 60;

type Phase = "loading" | "active" | "submitting" | "report" | "review" | "completed" | "error";

function freshStates(n: number): QuestionState[] {
  return Array.from({ length: n }, (_, i) => ({
    selectedLetter: null, firstLetter: null, struckLetters: [], flagged: false,
    secondsSpent: 0, visited: i === 0, highlightHtml: null,
  }));
}

/** Remaining seconds from the server clock. Frozen while paused. */
function remainingSeconds(s: BlockSession, nowMs: number): number {
  if (s.time_limit_seconds == null) return BLOCK_SECONDS;
  const started = Date.parse(s.started_at);
  const ref = s.paused_at ? Date.parse(s.paused_at) : nowMs;
  const elapsedActive = (ref - started) / 1000 - s.total_paused_seconds;
  return Math.max(0, Math.round(s.time_limit_seconds - elapsedActive));
}

export default function Exam() {
  const { form: formParam, blockNumber: blockParam } = useParams();
  const form = Number(formParam);
  const blockNumber = Number(blockParam);
  const { user } = useAuth();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [blockCount, setBlockCount] = useState(blockNumber);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<number>(() => Date.now() + BLOCK_SECONDS * 1000);
  const [states, setStates] = useState<QuestionState[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [interrupted, setInterrupted] = useState(false);
  const [strikeMode, setStrikeMode] = useState(false);
  const [highlightMode, setHighlightMode] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [modal, setModal] = useState<"lab" | "calc" | null>(null);
  const [showSubmitReview, setShowSubmitReview] = useState(false);
  const [report, setReport] = useState<{ attempts: AnalyticsAttempt[]; timeUsedSec: number } | null>(null);
  const [reviewData, setReviewData] = useState<{ questions: FullQuestion[]; answers: ReviewAnswer[] } | null>(null);
  const [reviewFocus, setReviewFocus] = useState<{ focusId?: string; allMode: boolean }>({ allMode: false });
  const [completed, setCompleted] = useState<{ questions: FullQuestion[]; answers: ReviewAnswer[] } | null>(null);

  const currentIndexRef = useRef(0);
  const enterRef = useRef<number>(Date.now());
  const submittingRef = useRef(false);
  const finalizedRef = useRef(false);
  const statesRef = useRef<QuestionState[]>([]);
  statesRef.current = states;
  const questionsRef = useRef<ExamQuestion[]>([]);
  questionsRef.current = questions;
  const sessionIdRef = useRef<string | null>(null);
  sessionIdRef.current = sessionId;
  const attemptIdsRef = useRef<Map<string, string>>(new Map());

  // Start a brand-new sitting (first attempt, or an EXPLICIT retake). This is the
  // ONLY place a timed session is created — never on re-entering a finished block.
  const startFresh = useCallback(async (qs?: ExamQuestion[]) => {
    if (!user) return;
    const list = qs ?? questionsRef.current;
    const session = await createBlockSession(user.id, form, blockNumber, "block", BLOCK_SECONDS);
    setSessionId(session.id);
    setDeadline(Date.now() + BLOCK_SECONDS * 1000);
    setStates(freshStates(list.length));
    setCurrentIndex(0);
    currentIndexRef.current = 0;
    setInterrupted(false);
    setCompleted(null);
    enterRef.current = Date.now();
    finalizedRef.current = false;
    submittingRef.current = false;
    setPhase("active");
  }, [user, form, blockNumber]);

  // ── Load: resume an in-progress block, show a finished one, or start fresh ──
  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const [count, qs, existing] = await Promise.all([
          getBlockCount(form),
          getExamQuestions(form, blockNumber),
          getUnfinishedBlock(user.id, form, blockNumber),
        ]);
        if (!active) return;
        if (qs.length === 0) { setErrorMsg(`No questions found for block ${blockNumber}.`); setPhase("error"); return; }
        setBlockCount(count);
        setQuestions(qs);
        questionsRef.current = qs;

        if (existing) {
          // Resume: unfreeze the clock, restore answers + position.
          const session = existing.paused_at ? await resumeSession(existing.id) : existing;
          const progress = await loadBlockProgress(existing.id);
          if (!active) return;
          const byQ = new Map(progress.map((p) => [p.question_id, p]));
          const base = qs.map((q, i): QuestionState => {
            const p = byQ.get(q.id);
            return p
              ? { selectedLetter: p.selected_letter, firstLetter: p.first_letter, struckLetters: p.struck_letters,
                  flagged: p.flagged, secondsSpent: p.seconds_spent, visited: true, highlightHtml: p.highlight_html }
              : { selectedLetter: null, firstLetter: null, struckLetters: [], flagged: false, secondsSpent: 0, visited: i === 0, highlightHtml: null };
          });
          const index = Math.min(Math.max(session.current_index, 0), qs.length - 1);
          base[index] = { ...base[index], visited: true };
          setInterrupted(!!session.paused);
          setSessionId(session.id);
          setDeadline(Date.now() + remainingSeconds(session, Date.now()) * 1000);
          setStates(base);
          setCurrentIndex(index);
          currentIndexRef.current = index;
          enterRef.current = Date.now();
          setPhase("active");
          return;
        }

        // No in-progress block. Is it already FINISHED? If so, show it as completed
        // (review / explicit retake) — do NOT spawn a new empty session.
        const done = await getCompletedBlock(user.id, form, blockNumber);
        if (!active) return;
        if (done) { setCompleted(done); setPhase("completed"); return; }

        await startFresh(qs); // genuine first attempt
      } catch (e: any) {
        if (active) { setErrorMsg(e?.message ?? "Failed to load the block."); setPhase("error"); }
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, form, blockNumber]);

  // ── Dwell time: fold elapsed into the question we're leaving ────────────────
  const commitDwell = useCallback(() => {
    const now = Date.now();
    const delta = (now - enterRef.current) / 1000;
    enterRef.current = now;
    const idx = currentIndexRef.current;
    setStates((prev) => prev.map((s, i) => (i === idx ? { ...s, secondsSpent: s.secondsSpent + delta } : s)));
  }, []);

  // ── Persist one question's in-progress answer to Supabase ──────────────────
  const saveQuestion = useCallback((idx: number) => {
    const sid = sessionIdRef.current;
    if (!user || !sid) return;
    const s = statesRef.current[idx];
    const q = questionsRef.current[idx];
    if (!s || !q) return;
    void saveBlockProgress(user.id, sid, {
      question_id: q.id,
      selected_letter: s.selectedLetter,
      first_letter: s.firstLetter,
      first_answer_seconds: null,
      seconds_spent: Math.round(s.secondsSpent),
      flagged: s.flagged,
      struck_letters: s.struckLetters,
      highlight_html: s.highlightHtml,
    }).catch(() => {});
  }, [user]);

  // Debounced save of the current question whenever its state changes.
  useEffect(() => {
    if (phase !== "active") return;
    const t = setTimeout(() => saveQuestion(currentIndexRef.current), 700);
    return () => clearTimeout(t);
  }, [states, phase, saveQuestion]);

  const goTo = useCallback(
    (target: number) => {
      if (target < 0 || target >= questionsRef.current.length) return;
      commitDwell();
      saveQuestion(currentIndexRef.current); // flush the question we're leaving
      currentIndexRef.current = target;
      setCurrentIndex(target);
      setStates((prev) => prev.map((s, i) => (i === target ? { ...s, visited: true } : s)));
      if (sessionIdRef.current) void updateSessionIndex(sessionIdRef.current, target);
    },
    [commitDwell, saveQuestion]
  );

  // ── Keyboard: ← / → move between questions (skip when typing in a control) ──
  useEffect(() => {
    if (phase !== "active") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (e.key === "ArrowRight") { e.preventDefault(); goTo(currentIndexRef.current + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); goTo(currentIndexRef.current - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, goTo]);

  // ── Suspend / leave → freeze the clock server-side (interrupted) ───────────
  const leaveInterrupted = useCallback(async () => {
    if (finalizedRef.current || !sessionIdRef.current) return;
    commitDwell();
    saveQuestion(currentIndexRef.current);
    try { await pauseSession(sessionIdRef.current); } catch { /* best effort */ }
  }, [commitDwell, saveQuestion]);
  const leaveRef = useRef(leaveInterrupted);
  leaveRef.current = leaveInterrupted;

  // Any unmount that isn't a submit = an interruption. Fire-and-forget pause.
  useEffect(() => {
    return () => { if (!finalizedRef.current) void leaveRef.current(); };
  }, []);

  // ── Per-question mutations ─────────────────────────────────────────────────
  const patchCurrent = useCallback((patch: Partial<QuestionState>) => {
    const idx = currentIndexRef.current;
    setStates((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }, []);
  const onSelect = useCallback((letter: string) => {
    const idx = currentIndexRef.current;
    setStates((prev) => prev.map((s, i) =>
      i === idx ? { ...s, selectedLetter: letter, firstLetter: s.firstLetter ?? letter } : s));
  }, []);
  const onToggleStrike = useCallback((letter: string) => {
    const idx = currentIndexRef.current;
    setStates((prev) => prev.map((s, i) => {
      if (i !== idx) return s;
      const struck = s.struckLetters.includes(letter) ? s.struckLetters.filter((l) => l !== letter) : [...s.struckLetters, letter];
      const selectedLetter = s.selectedLetter === letter && !s.struckLetters.includes(letter) ? null : s.selectedLetter;
      return { ...s, struckLetters: struck, selectedLetter };
    }));
  }, []);
  const onToggleFlag = useCallback(
    () => setStates((prev) => prev.map((s, i) => (i === currentIndexRef.current ? { ...s, flagged: !s.flagged } : s))), []);
  const onChangeHighlight = useCallback((html: string | null) => patchCurrent({ highlightHtml: html }), [patchCurrent]);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const doSubmit = useCallback(
    async (after: "summary" | "home") => {
      if (submittingRef.current || !user || !sessionId) return;
      submittingRef.current = true;
      finalizedRef.current = true; // stop the unmount-pause from firing
      commitDwell();
      setPhase("submitting");
      try {
        const ids = questions.map((q) => q.id);
        const key = await getAnswerKey(ids);
        const snapshot = statesRef.current;
        const attempts: AttemptInput[] = questions.map((q, i) => {
          const s = snapshot[i];
          const selected = s.selectedLetter;
          return {
            question_id: q.id,
            selected_letter: selected,
            first_letter: s.firstLetter,
            changed: s.firstLetter != null && s.firstLetter !== selected,
            is_correct: selected != null && selected === key.get(q.id),
            seconds_spent: Math.round(s.secondsSpent),
            flagged: s.flagged,
          };
        });
        attemptIdsRef.current = await submitBlock(user.id, sessionId, attempts);
        if (after === "home") { navigate("/", { replace: true }); return; }
        const nowIso = new Date().toISOString();
        const reportAttempts: AnalyticsAttempt[] = questions.map((q, i) => {
          const s = snapshot[i];
          return {
            questionId: q.id, attemptId: attemptIdsRef.current.get(q.id) ?? null, createdAt: nowIso,
            firstLetter: s.firstLetter, finalLetter: s.selectedLetter, correctLetter: key.get(q.id) ?? "",
            changed: s.firstLetter != null && s.firstLetter !== s.selectedLetter, errorTag: null, flagged: s.flagged,
            qNumber: q.q_number, nbmeForm: q.nbme_form, blockNumber: q.block_number,
            discipline: q.discipline_tag, system: q.system_tag, questionType: q.question_type,
            mode: "block", paused: interrupted, secondsSpent: Math.round(s.secondsSpent), firstAnswerSeconds: null,
          };
        });
        const timeUsedSec = Math.min(BLOCK_SECONDS, Math.max(0, Math.round(BLOCK_SECONDS - (deadline - Date.now()) / 1000)));
        setReport({ attempts: reportAttempts, timeUsedSec });
        setPhase("report");
      } catch (e: any) {
        submittingRef.current = false;
        finalizedRef.current = false;
        setErrorMsg(e?.message ?? "Submit failed. Your progress is saved — try again.");
        setPhase("error");
      }
    },
    [user, sessionId, questions, commitDwell, navigate, deadline, interrupted]
  );

  const onExpire = useCallback(() => { doSubmit("summary"); }, [doSubmit]);
  const secondsRemaining = useBlockTimer(deadline, onExpire);

  const answeredCount = useMemo(() => states.filter((s) => s.selectedLetter != null).length, [states]);
  const flaggedCount = useMemo(() => states.filter((s) => s.flagged).length, [states]);
  const navCells: NavCell[] = useMemo(
    () => states.map((s) => ({ state: s.selectedLetter != null ? "answered" : "unvisited", flagged: s.flagged })),
    [states]
  );

  async function enterReview(focus: { focusId?: string; allMode?: boolean } = {}) {
    try {
      setReviewFocus({ focusId: focus.focusId, allMode: !!focus.allMode });
      const full = await getFullQuestions(form, blockNumber);
      const stateById = new Map(questions.map((qq, i) => [qq.id, statesRef.current[i]]));
      const answers: ReviewAnswer[] = full.map((fq) => {
        const s = stateById.get(fq.id);
        return { selectedLetter: s?.selectedLetter ?? null, secondsSpent: Math.round(s?.secondsSpent ?? 0),
          flagged: s?.flagged ?? false, attemptId: attemptIdsRef.current.get(fq.id) ?? null, errorTag: null };
      });
      setReviewData({ questions: full, answers });
      setPhase("review");
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Failed to load review.");
      setPhase("error");
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (phase === "loading") return <CenterMsg>Loading block {blockNumber}…</CenterMsg>;
  if (phase === "review" && reviewData) {
    return (
      <ReviewQueue
        questions={reviewData.questions} answers={reviewData.answers}
        onExit={() => setPhase(completed ? "completed" : "report")} exitLabel={completed ? "Back" : "Back to report"}
        initialQuestionId={reviewFocus.focusId} defaultAllMode={reviewFocus.allMode}
        title={`Review · NBME ${form} · Block ${blockNumber}`}
      />
    );
  }
  if (phase === "report" && report) {
    return (
      <BlockReport
        title={`NBME ${form} · Block ${blockNumber}`}
        attempts={report.attempts} timeUsedSec={report.timeUsedSec} interrupted={interrupted}
        onReviewAll={() => enterReview({ allMode: true })}
        onReviewQuestion={(qNumber) => enterReview({ focusId: questions.find((q) => q.q_number === qNumber)?.id, allMode: false })}
        onHome={() => navigate("/")}
      />
    );
  }
  if (phase === "completed" && completed) {
    // Re-entering a finished block opens READ-ONLY review — viewing records nothing;
    // only re-tagging a miss updates the ORIGINAL attempt. Retake is explicit + confirmed.
    return (
      <ReviewQueue
        questions={completed.questions}
        answers={completed.answers}
        onExit={() => navigate("/")}
        exitLabel="Home"
        title={`NBME ${form} · Block ${blockNumber} — review`}
        defaultAllMode
        onRetake={() => {
          if (window.confirm("Retake this block from scratch? This starts a new, separate sitting — your recorded answers stay untouched."))
            void startFresh();
        }}
      />
    );
  }
  if (phase === "error") {
    return (
      <CenterMsg>
        <div className="space-y-3 text-center">
          <p className="text-incorrect">{errorMsg}</p>
          <Button variant="outline" onClick={() => navigate("/")}>Back to blocks</Button>
        </div>
      </CenterMsg>
    );
  }
  const q = questions[currentIndex];
  const s = states[currentIndex];

  return (
    <div className="flex h-screen flex-col bg-background">
      <ExamTopBar
        blockNumber={blockNumber} blockCount={blockCount} currentIndex={currentIndex} total={questions.length}
        answeredCount={answeredCount} flaggedCount={flaggedCount} secondsRemaining={secondsRemaining}
        onEndBlock={() => setShowSubmitReview(true)}
        onEndExam={() => { if (window.confirm("End the exam? Your block will be submitted.")) doSubmit("home"); }}
      />

      {interrupted && (
        <div className="flex items-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-1.5 text-xs text-amber-800">
          <AlertTriangle className="size-3.5 shrink-0" />
          Resumed — this block was interrupted, so it won't count as a clean timing sample (pacing/stamina excluded). Score still counts.
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <QuestionNavigator cells={navCells} currentIndex={currentIndex} onJump={goTo}
          collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} mode="exam" />
        <main className="min-w-0 flex-1 overflow-y-auto">
          {q && s && (
            <VignettePanel key={q.id} question={q} selectedLetter={s.selectedLetter} struckLetters={s.struckLetters}
              highlightHtml={s.highlightHtml} highlightMode={highlightMode} strikeMode={strikeMode} flagged={s.flagged}
              onToggleHighlightMode={() => { setHighlightMode((m) => !m); setStrikeMode(false); }}
              onToggleStrikeMode={() => { setStrikeMode((m) => !m); setHighlightMode(false); }}
              onToggleFlag={onToggleFlag} onSelect={onSelect} onToggleStrike={onToggleStrike} onChangeHighlight={onChangeHighlight} />
          )}
        </main>
      </div>

      <ExamBottomBar
        canPrev={currentIndex > 0} canNext={currentIndex < questions.length - 1}
        onPrev={() => goTo(currentIndex - 1)} onNext={() => goTo(currentIndex + 1)}
        onSuspend={async () => { await leaveInterrupted(); navigate("/"); }}
        onLabValues={() => setModal("lab")} onCalculator={() => setModal("calc")} />

      <LabValuesModal open={modal === "lab"} onClose={() => setModal(null)} />
      <CalculatorModal open={modal === "calc"} onClose={() => setModal(null)} />

      <SubmitReviewModal
        open={showSubmitReview}
        cells={states.map((st) => ({ answered: st.selectedLetter != null, flagged: st.flagged }))}
        onJump={(i) => { setShowSubmitReview(false); goTo(i); }}
        onSubmit={() => { setShowSubmitReview(false); doSubmit("summary"); }}
        onClose={() => setShowSubmitReview(false)} />

      {phase === "submitting" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 text-sm text-white">Submitting…</div>
      )}
    </div>
  );
}

function CenterMsg({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center bg-background p-6 text-muted-foreground">{children}</div>;
}
