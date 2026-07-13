import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  completeSession,
  createBlockSession,
  getAnswerKey,
  getBlockCount,
  getExamQuestions,
  getFullQuestions,
  recordAttempt,
} from "@/lib/queries";
import type { ExamQuestion, FullQuestion, QuestionState } from "@/lib/types";
import { useBlockTimer } from "@/hooks/useBlockTimer";
import ExamTopBar from "@/components/exam/ExamTopBar";
import QuestionNavigator, { type NavCell } from "@/components/exam/QuestionNavigator";
import VignettePanel from "@/components/exam/VignettePanel";
import ExamBottomBar from "@/components/exam/ExamBottomBar";
import LabValuesModal from "@/components/exam/LabValuesModal";
import CalculatorModal from "@/components/exam/CalculatorModal";
import SubmitReviewModal from "@/components/exam/SubmitReviewModal";
import BlockReview, { type ReviewAnswer } from "@/components/review/BlockReview";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Coffee } from "lucide-react";

const BLOCK_MS = 30 * 60 * 1000;
type Phase = "loading" | "active" | "break" | "submitting" | "review" | "error";

interface Collected {
  question: ExamQuestion;
  selectedLetter: string | null;
  secondsSpent: number;
  flagged: boolean;
}

function freshStates(n: number): QuestionState[] {
  return Array.from({ length: n }, (_, i) => ({
    selectedLetter: null, struckLetters: [], flagged: false, secondsSpent: 0, visited: i === 0, highlightHtml: null,
  }));
}

export default function FullExam() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<number[]>([]);
  const [blockIdx, setBlockIdx] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [states, setStates] = useState<QuestionState[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [deadline, setDeadline] = useState<number>(() => Date.now() + BLOCK_MS);
  const [strikeMode, setStrikeMode] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [modal, setModal] = useState<"lab" | "calc" | null>(null);
  const [showSubmitReview, setShowSubmitReview] = useState(false);
  const [reviewData, setReviewData] = useState<{ questions: FullQuestion[]; answers: ReviewAnswer[] } | null>(null);

  const collectedRef = useRef<Collected[]>([]);
  const statesRef = useRef<QuestionState[]>([]);
  statesRef.current = states;
  const questionsRef = useRef<ExamQuestion[]>([]);
  questionsRef.current = questions;
  const currentIndexRef = useRef(0);
  const enterRef = useRef<number>(Date.now());
  const phaseRef = useRef<Phase>("loading");
  phaseRef.current = phase;
  const endingRef = useRef(false);

  const loadBlock = useCallback(async (n: number) => {
    const qs = await getExamQuestions(n);
    setQuestions(qs);
    setStates(freshStates(qs.length));
    setCurrentIndex(0);
    currentIndexRef.current = 0;
    setStrikeMode(false);
    enterRef.current = Date.now();
    endingRef.current = false;
    setDeadline(Date.now() + BLOCK_MS);
    setPhase("active");
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const count = await getBlockCount();
        if (!active) return;
        if (count < 1) { setErrorMsg("No blocks found."); setPhase("error"); return; }
        const session = await createBlockSession(user.id, 0, "full_exam"); // block_number ignored; whole-exam run
        if (!active) return;
        setBlocks(Array.from({ length: count }, (_, i) => i + 1));
        setSessionId(session.id);
        setBlockIdx(0);
        await loadBlock(1);
      } catch (e: any) {
        if (active) { setErrorMsg(e?.message ?? "Failed to load exam."); setPhase("error"); }
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const commitDwell = useCallback(() => {
    const now = Date.now();
    const delta = (now - enterRef.current) / 1000;
    enterRef.current = now;
    const idx = currentIndexRef.current;
    setStates((prev) => prev.map((s, i) => (i === idx ? { ...s, secondsSpent: s.secondsSpent + delta } : s)));
  }, []);

  const goTo = useCallback((target: number) => {
    if (target < 0 || target >= questionsRef.current.length) return;
    commitDwell();
    currentIndexRef.current = target;
    setCurrentIndex(target);
    setStates((prev) => prev.map((s, i) => (i === target ? { ...s, visited: true } : s)));
  }, [commitDwell]);

  const patchCurrent = useCallback((patch: Partial<QuestionState>) => {
    const idx = currentIndexRef.current;
    setStates((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
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
  const onToggleFlag = useCallback(() =>
    setStates((prev) => prev.map((s, i) => (i === currentIndexRef.current ? { ...s, flagged: !s.flagged } : s))), []);

  // End the current block: collect answers, then break (or finish after the last).
  const endBlock = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    commitDwell();
    const collected: Collected[] = questionsRef.current.map((q, i) => {
      const s = statesRef.current[i];
      return { question: q, selectedLetter: s.selectedLetter, secondsSpent: Math.round(s.secondsSpent), flagged: s.flagged };
    });
    collectedRef.current = [...collectedRef.current, ...collected];

    if (blockIdx + 1 >= blocks.length) {
      await finishExam();
    } else {
      setPhase("break");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockIdx, blocks.length, commitDwell]);

  async function finishExam() {
    if (!user || !sessionId) return;
    setPhase("submitting");
    try {
      const all = collectedRef.current;
      const key = await getAnswerKey(all.map((c) => c.question.id));
      for (const c of all) {
        await recordAttempt(user.id, sessionId, {
          question_id: c.question.id,
          selected_letter: c.selectedLetter,
          is_correct: c.selectedLetter != null && c.selectedLetter === key.get(c.question.id),
          seconds_spent: c.secondsSpent,
          flagged: c.flagged,
        });
      }
      await completeSession(sessionId);
      // Build review across all blocks
      const fullByBlock = await Promise.all(blocks.map((n) => getFullQuestions(n)));
      const full = fullByBlock.flat();
      const byId = new Map(full.map((f) => [f.id, f]));
      const orderedFull: FullQuestion[] = [];
      const answers: ReviewAnswer[] = [];
      for (const c of all) {
        const f = byId.get(c.question.id);
        if (!f) continue;
        orderedFull.push(f);
        answers.push({ selectedLetter: c.selectedLetter, secondsSpent: c.secondsSpent, flagged: c.flagged });
      }
      setReviewData({ questions: orderedFull, answers });
      setPhase("review");
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Failed to submit exam. Your progress is in memory — retry.");
      setPhase("error");
    }
  }

  const onExpire = useCallback(() => {
    if (phaseRef.current === "active") endBlock();
  }, [endBlock]);
  const secondsRemaining = useBlockTimer(deadline, onExpire);

  const answeredCount = useMemo(() => states.filter((s) => s.selectedLetter != null).length, [states]);
  const navCells: NavCell[] = useMemo(
    () => states.map((s) => ({ state: s.selectedLetter != null ? "answered" : "unvisited", flagged: s.flagged })),
    [states]
  );

  if (phase === "loading") return <Center>Loading full exam…</Center>;
  if (phase === "submitting") return <Center>Submitting exam…</Center>;
  if (phase === "error")
    return <Center><div className="space-y-3 text-center"><p className="text-incorrect">{errorMsg}</p>
      <Button variant="outline" onClick={() => navigate("/")}>Back to home</Button></div></Center>;

  if (phase === "review" && reviewData)
    return <BlockReview questions={reviewData.questions} answers={reviewData.answers} onExit={() => navigate("/")} title="Full exam review" />;

  if (phase === "break")
    return (
      <div className="grid min-h-screen place-items-center bg-background p-6">
        <Card className="w-full max-w-md text-center">
          <CardContent className="space-y-4 p-8">
            <Coffee className="mx-auto size-8 text-primary" />
            <div className="text-lg font-semibold text-slate-800">Break — Block {blocks[blockIdx]} complete</div>
            <p className="text-sm text-muted-foreground">
              {blockIdx + 1} of {blocks.length} blocks done. Rest, then start the next block. The timer resets to 30:00.
              Explanations show after the whole exam.
            </p>
            <Button onClick={() => { const next = blockIdx + 1; setBlockIdx(next); loadBlock(blocks[next]); }}>
              Start Block {blocks[blockIdx + 1]}
            </Button>
          </CardContent>
        </Card>
      </div>
    );

  // ── active block ──
  const q = questions[currentIndex];
  const s = states[currentIndex];
  return (
    <div className="flex h-screen flex-col bg-background">
      <ExamTopBar
        blockNumber={blocks[blockIdx]}
        blockCount={blocks.length}
        currentIndex={currentIndex}
        total={questions.length}
        answeredCount={answeredCount}
        secondsRemaining={secondsRemaining}
        onEndBlock={() => setShowSubmitReview(true)}
        onEndExam={() => { if (window.confirm("Abandon the full exam? Progress is lost.")) navigate("/"); }}
      />
      <div className="flex min-h-0 flex-1">
        <QuestionNavigator cells={navCells} currentIndex={currentIndex} onJump={goTo}
          collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} mode="exam" />
        <main className="min-w-0 flex-1 overflow-y-auto">
          {q && s && (
            <VignettePanel key={q.id} question={q} selectedLetter={s.selectedLetter} struckLetters={s.struckLetters}
              highlightHtml={s.highlightHtml} strikeMode={strikeMode} flagged={s.flagged}
              onToggleStrikeMode={() => setStrikeMode((m) => !m)} onToggleFlag={onToggleFlag}
              onSelect={(l) => patchCurrent({ selectedLetter: l })} onToggleStrike={onToggleStrike}
              onChangeHighlight={(h) => patchCurrent({ highlightHtml: h })} />
          )}
        </main>
      </div>
      <ExamBottomBar canPrev={currentIndex > 0} canNext={currentIndex < questions.length - 1}
        onPrev={() => goTo(currentIndex - 1)} onNext={() => goTo(currentIndex + 1)}
        onSuspend={() => { if (window.confirm("Leave the exam? Progress is lost.")) navigate("/"); }}
        onLabValues={() => setModal("lab")} onCalculator={() => setModal("calc")} />

      <LabValuesModal open={modal === "lab"} onClose={() => setModal(null)} />
      <CalculatorModal open={modal === "calc"} onClose={() => setModal(null)} />
      <SubmitReviewModal open={showSubmitReview}
        cells={states.map((st) => ({ answered: st.selectedLetter != null, flagged: st.flagged }))}
        onJump={(i) => { setShowSubmitReview(false); goTo(i); }}
        onSubmit={() => { setShowSubmitReview(false); endBlock(); }}
        onClose={() => setShowSubmitReview(false)}
        submitLabel={blockIdx + 1 >= blocks.length ? "Submit exam" : "End block"} />
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center bg-background p-6 text-muted-foreground">{children}</div>;
}
