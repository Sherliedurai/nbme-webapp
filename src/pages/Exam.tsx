import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  createBlockSession,
  getAnswerKey,
  getBlockCount,
  getExamQuestions,
  getFullQuestions,
  submitBlock,
  type AttemptInput,
} from "@/lib/queries";
import type { ExamQuestion, FullQuestion, QuestionState } from "@/lib/types";
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

const BLOCK_MS = 30 * 60 * 1000;
const STORAGE_VERSION = "v1";

type Phase = "loading" | "active" | "submitting" | "report" | "review" | "error";

interface Persisted {
  sessionId: string;
  deadline: number;
  currentIndex: number;
  states: QuestionState[];
}

function freshStates(n: number): QuestionState[] {
  return Array.from({ length: n }, (_, i) => ({
    selectedLetter: null,
    firstLetter: null,
    struckLetters: [],
    flagged: false,
    secondsSpent: 0,
    visited: i === 0,
    highlightHtml: null,
  }));
}

export default function Exam() {
  const { form: formParam, blockNumber: blockParam } = useParams();
  const form = Number(formParam);
  const blockNumber = Number(blockParam);
  const { user } = useAuth();
  const navigate = useNavigate();
  const storageKey = `nbme:exam:${STORAGE_VERSION}:${user?.id}:${form}:${blockNumber}`;

  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [blockCount, setBlockCount] = useState(blockNumber);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<number>(() => Date.now() + BLOCK_MS);
  const [states, setStates] = useState<QuestionState[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [strikeMode, setStrikeMode] = useState(false);
  const [highlightMode, setHighlightMode] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [modal, setModal] = useState<"lab" | "calc" | null>(null);
  const [showSubmitReview, setShowSubmitReview] = useState(false);
  const [report, setReport] = useState<{ attempts: AnalyticsAttempt[]; timeUsedSec: number } | null>(null);
  const [reviewData, setReviewData] = useState<{ questions: FullQuestion[]; answers: ReviewAnswer[] } | null>(null);
  const [reviewFocus, setReviewFocus] = useState<{ focusId?: string; allMode: boolean }>({ allMode: false });

  const currentIndexRef = useRef(0);
  const enterRef = useRef<number>(Date.now());
  const submittingRef = useRef(false);
  const statesRef = useRef<QuestionState[]>([]);
  statesRef.current = states; // latest snapshot for use inside async submit
  const attemptIdsRef = useRef<Map<string, string>>(new Map()); // question_id → attempt_id (for review tagging)

  // ── Load: restore an in-progress block or start a new one ──────────────────
  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const [count, qs] = await Promise.all([getBlockCount(form), getExamQuestions(form, blockNumber)]);
        if (!active) return;
        if (qs.length === 0) {
          setErrorMsg(`No questions found for block ${blockNumber}.`);
          setPhase("error");
          return;
        }
        setBlockCount(count);
        setQuestions(qs);

        const saved = loadPersisted(storageKey);
        if (saved && saved.deadline > Date.now() && saved.states.length === qs.length) {
          setSessionId(saved.sessionId);
          setDeadline(saved.deadline);
          setStates(saved.states);
          setCurrentIndex(saved.currentIndex);
          currentIndexRef.current = saved.currentIndex;
        } else {
          const session = await createBlockSession(user.id, form, blockNumber, "block");
          if (!active) return;
          const dl = Date.now() + BLOCK_MS;
          setSessionId(session.id);
          setDeadline(dl);
          setStates(freshStates(qs.length));
          setCurrentIndex(0);
          currentIndexRef.current = 0;
        }
        enterRef.current = Date.now();
        setPhase("active");
      } catch (e: any) {
        if (active) {
          setErrorMsg(e?.message ?? "Failed to load the block.");
          setPhase("error");
        }
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, form, blockNumber]);

  // ── Persist in-progress state ──────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "active" || !sessionId) return;
    savePersisted(storageKey, { sessionId, deadline, currentIndex, states });
  }, [phase, sessionId, deadline, currentIndex, states, storageKey]);

  // ── Dwell time: fold elapsed time into the question we're leaving ──────────
  const commitDwell = useCallback(() => {
    const now = Date.now();
    const delta = (now - enterRef.current) / 1000;
    enterRef.current = now;
    const idx = currentIndexRef.current;
    setStates((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, secondsSpent: s.secondsSpent + delta } : s))
    );
  }, []);

  const goTo = useCallback(
    (target: number) => {
      if (target < 0 || target >= questions.length) return;
      commitDwell();
      currentIndexRef.current = target;
      setCurrentIndex(target);
      setStates((prev) => prev.map((s, i) => (i === target ? { ...s, visited: true } : s)));
    },
    [commitDwell, questions.length]
  );

  // ── Per-question mutations ─────────────────────────────────────────────────
  const patchCurrent = useCallback((patch: Partial<QuestionState>) => {
    const idx = currentIndexRef.current;
    setStates((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }, []);

  const onSelect = useCallback((letter: string) => {
    const idx = currentIndexRef.current;
    setStates((prev) =>
      prev.map((s, i) =>
        i === idx
          ? { ...s, selectedLetter: letter, firstLetter: s.firstLetter ?? letter } // capture first instinct once
          : s
      )
    );
  }, []);
  const onToggleStrike = useCallback(
    (letter: string) => {
      const idx = currentIndexRef.current;
      setStates((prev) =>
        prev.map((s, i) => {
          if (i !== idx) return s;
          const struck = s.struckLetters.includes(letter)
            ? s.struckLetters.filter((l) => l !== letter)
            : [...s.struckLetters, letter];
          // Striking your selected option clears the selection.
          const selectedLetter =
            s.selectedLetter === letter && !s.struckLetters.includes(letter)
              ? null
              : s.selectedLetter;
          return { ...s, struckLetters: struck, selectedLetter };
        })
      );
    },
    []
  );
  const onToggleFlag = useCallback(
    () => setStates((prev) => prev.map((s, i) => (i === currentIndexRef.current ? { ...s, flagged: !s.flagged } : s))),
    []
  );
  const onChangeHighlight = useCallback(
    (html: string | null) => patchCurrent({ highlightHtml: html }),
    [patchCurrent]
  );

  // ── Submit (manual, End Exam, or timer auto-submit) ────────────────────────
  const doSubmit = useCallback(
    async (after: "summary" | "home") => {
      if (submittingRef.current || !user || !sessionId) return;
      submittingRef.current = true;
      commitDwell();
      setPhase("submitting");
      try {
        const ids = questions.map((q) => q.id);
        const key = await getAnswerKey(ids);
        const snapshot = statesRef.current;
        const attempts: AttemptInput[] = questions.map((q, i) => {
          const s = snapshot[i];
          const selected = s.selectedLetter;
          const isCorrect = selected != null && selected === key.get(q.id);
          return {
            question_id: q.id,
            selected_letter: selected,
            first_letter: s.firstLetter,
            changed: s.firstLetter != null && s.firstLetter !== selected,
            is_correct: isCorrect,
            seconds_spent: Math.round(s.secondsSpent),
            flagged: s.flagged,
          };
        });
        attemptIdsRef.current = await submitBlock(user.id, sessionId, attempts);
        clearPersisted(storageKey);
        if (after === "home") {
          navigate("/", { replace: true });
          return;
        }
        // Assemble the block debrief from tags (on the question) + her answers.
        const nowIso = new Date().toISOString();
        const reportAttempts: AnalyticsAttempt[] = questions.map((q, i) => {
          const s = snapshot[i];
          return {
            questionId: q.id,
            attemptId: attemptIdsRef.current.get(q.id) ?? null,
            createdAt: nowIso,
            firstLetter: s.firstLetter,
            finalLetter: s.selectedLetter,
            correctLetter: key.get(q.id) ?? "",
            changed: s.firstLetter != null && s.firstLetter !== s.selectedLetter,
            errorTag: null,
            flagged: s.flagged,
            qNumber: q.q_number,
            nbmeForm: q.nbme_form,
            blockNumber: q.block_number,
            discipline: q.discipline_tag,
            system: q.system_tag,
            questionType: q.question_type,
            mode: "block",
            secondsSpent: Math.round(s.secondsSpent),
          };
        });
        const timeUsedSec = Math.min(BLOCK_MS / 1000, Math.max(0, Math.round((BLOCK_MS - (deadline - Date.now())) / 1000)));
        setReport({ attempts: reportAttempts, timeUsedSec });
        setPhase("report");
      } catch (e: any) {
        submittingRef.current = false;
        setErrorMsg(e?.message ?? "Submit failed. Your answers are saved locally — try again.");
        setPhase("error");
      }
    },
    [user, sessionId, questions, commitDwell, storageKey, navigate, deadline]
  );

  const onExpire = useCallback(() => {
    doSubmit("summary");
  }, [doSubmit]);

  const secondsRemaining = useBlockTimer(deadline, onExpire);

  // ── Derived ────────────────────────────────────────────────────────────────
  const answeredCount = useMemo(
    () => states.filter((s) => s.selectedLetter != null).length,
    [states]
  );
  const navCells: NavCell[] = useMemo(
    () =>
      states.map((s) => ({
        // Correctness is intentionally hidden during the block — only answered vs not.
        state: s.selectedLetter != null ? "answered" : "unvisited",
        flagged: s.flagged,
      })),
    [states]
  );

  // Fetch full questions (answers + enrichment) and enter review, aligning the
  // user's in-memory answers by question id.
  async function enterReview(focus: { focusId?: string; allMode?: boolean } = {}) {
    try {
      setReviewFocus({ focusId: focus.focusId, allMode: !!focus.allMode });
      const full = await getFullQuestions(form, blockNumber);
      const stateById = new Map(questions.map((qq, i) => [qq.id, statesRef.current[i]]));
      const answers: ReviewAnswer[] = full.map((fq) => {
        const s = stateById.get(fq.id);
        return {
          selectedLetter: s?.selectedLetter ?? null,
          secondsSpent: Math.round(s?.secondsSpent ?? 0),
          flagged: s?.flagged ?? false,
          attemptId: attemptIdsRef.current.get(fq.id) ?? null,
          errorTag: null,
        };
      });
      setReviewData({ questions: full, answers });
      setPhase("review");
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Failed to load review.");
      setPhase("error");
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (phase === "loading") {
    return <CenterMsg>Loading block {blockNumber}…</CenterMsg>;
  }
  if (phase === "review" && reviewData) {
    return (
      <ReviewQueue
        questions={reviewData.questions}
        answers={reviewData.answers}
        onExit={() => setPhase("report")}
        exitLabel="Back to report"
        initialQuestionId={reviewFocus.focusId}
        defaultAllMode={reviewFocus.allMode}
        title={`Review · NBME ${form} · Block ${blockNumber}`}
      />
    );
  }
  if (phase === "report" && report) {
    return (
      <BlockReport
        title={`NBME ${form} · Block ${blockNumber}`}
        attempts={report.attempts}
        timeUsedSec={report.timeUsedSec}
        onReviewAll={() => enterReview({ allMode: true })}
        onReviewQuestion={(qNumber) => enterReview({ focusId: questions.find((q) => q.q_number === qNumber)?.id, allMode: false })}
        onHome={() => navigate("/")}
      />
    );
  }
  if (phase === "error") {
    return (
      <CenterMsg>
        <div className="space-y-3 text-center">
          <p className="text-incorrect">{errorMsg}</p>
          <Button variant="outline" onClick={() => navigate("/")}>
            Back to blocks
          </Button>
        </div>
      </CenterMsg>
    );
  }
  const q = questions[currentIndex];
  const s = states[currentIndex];

  return (
    <div className="flex h-screen flex-col bg-background">
      <ExamTopBar
        blockNumber={blockNumber}
        blockCount={blockCount}
        currentIndex={currentIndex}
        total={questions.length}
        answeredCount={answeredCount}
        secondsRemaining={secondsRemaining}
        onEndBlock={() => setShowSubmitReview(true)}
        onEndExam={() => {
          if (window.confirm("End the exam? Your block will be submitted.")) doSubmit("home");
        }}
      />

      <div className="flex min-h-0 flex-1">
        <QuestionNavigator
          cells={navCells}
          currentIndex={currentIndex}
          onJump={goTo}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          mode="exam"
        />

        <main className="min-w-0 flex-1 overflow-y-auto">
          {q && s && (
            <VignettePanel
              key={q.id}
              question={q}
              selectedLetter={s.selectedLetter}
              struckLetters={s.struckLetters}
              highlightHtml={s.highlightHtml}
              highlightMode={highlightMode}
              strikeMode={strikeMode}
              flagged={s.flagged}
              onToggleHighlightMode={() => { setHighlightMode((m) => !m); setStrikeMode(false); }}
              onToggleStrikeMode={() => { setStrikeMode((m) => !m); setHighlightMode(false); }}
              onToggleFlag={onToggleFlag}
              onSelect={onSelect}
              onToggleStrike={onToggleStrike}
              onChangeHighlight={onChangeHighlight}
            />
          )}
        </main>
      </div>

      <ExamBottomBar
        canPrev={currentIndex > 0}
        canNext={currentIndex < questions.length - 1}
        onPrev={() => goTo(currentIndex - 1)}
        onNext={() => goTo(currentIndex + 1)}
        onSuspend={() => {
          commitDwell();
          navigate("/");
        }}
        onLabValues={() => setModal("lab")}
        onCalculator={() => setModal("calc")}
      />

      <LabValuesModal open={modal === "lab"} onClose={() => setModal(null)} />
      <CalculatorModal open={modal === "calc"} onClose={() => setModal(null)} />

      <SubmitReviewModal
        open={showSubmitReview}
        cells={states.map((s) => ({ answered: s.selectedLetter != null, flagged: s.flagged }))}
        onJump={(i) => {
          setShowSubmitReview(false);
          goTo(i);
        }}
        onSubmit={() => {
          setShowSubmitReview(false);
          doSubmit("summary");
        }}
        onClose={() => setShowSubmitReview(false)}
      />

      {phase === "submitting" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 text-sm text-white">
          Submitting…
        </div>
      )}
    </div>
  );
}

function CenterMsg({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center bg-background p-6 text-muted-foreground">{children}</div>;
}

// ── localStorage helpers ─────────────────────────────────────────────────────
function loadPersisted(key: string): Persisted | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Persisted) : null;
  } catch {
    return null;
  }
}
function savePersisted(key: string, data: Persisted) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    /* quota / private mode — non-fatal */
  }
}
function clearPersisted(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
