import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { completeSession, createBlockSession, getFullQuestions, recordAttempt } from "@/lib/queries";
import type { FullQuestion } from "@/lib/types";
import VignettePanel from "@/components/exam/VignettePanel";
import ExplanationPanel from "@/components/review/ExplanationPanel";
import LabValuesModal from "@/components/exam/LabValuesModal";
import CalculatorModal from "@/components/exam/CalculatorModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Calculator, ChevronRight, FlaskConical, LogOut } from "lucide-react";

type Phase = "loading" | "active" | "done" | "error";

export default function Practice() {
  const { blockNumber: blockParam } = useParams();
  const blockNumber = Number(blockParam);
  const { user } = useAuth();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [questions, setQuestions] = useState<FullQuestion[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [firstLetter, setFirstLetter] = useState<string | null>(null);
  const [struck, setStruck] = useState<string[]>([]);
  const [highlightHtml, setHighlightHtml] = useState<string | null>(null);
  const [strikeMode, setStrikeMode] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState({ correct: 0, answered: 0 });
  const [modal, setModal] = useState<"lab" | "calc" | null>(null);

  const enterRef = useRef<number>(Date.now());
  const explRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const qs = await getFullQuestions(blockNumber);
        if (!active) return;
        if (qs.length === 0) {
          setErrorMsg(`No questions found for block ${blockNumber}.`);
          setPhase("error");
          return;
        }
        const session = await createBlockSession(user.id, blockNumber, "practice");
        if (!active) return;
        setQuestions(qs);
        setSessionId(session.id);
        enterRef.current = Date.now();
        setPhase("active");
      } catch (e: any) {
        if (active) {
          setErrorMsg(e?.message ?? "Failed to load practice.");
          setPhase("error");
        }
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, blockNumber]);

  const q = questions[index];

  const onCheck = useCallback(async () => {
    if (!q || selected == null || revealed || !user || !sessionId) return;
    const isCorrect = selected === q.correct_letter;
    const seconds = Math.round((Date.now() - enterRef.current) / 1000);
    setRevealed(true);
    setScore((s) => ({ correct: s.correct + (isCorrect ? 1 : 0), answered: s.answered + 1 }));
    // auto-scroll the reveal into view on stacked (mobile) layout
    if (window.innerWidth < 1024) {
      requestAnimationFrame(() => explRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
    try {
      await recordAttempt(user.id, sessionId, {
        question_id: q.id,
        selected_letter: selected,
        first_letter: firstLetter ?? selected,
        changed: firstLetter != null && firstLetter !== selected,
        is_correct: isCorrect,
        seconds_spent: seconds,
        flagged,
      });
    } catch {
      /* non-fatal in practice */
    }
  }, [q, selected, revealed, user, sessionId, flagged, firstLetter]);

  const onNext = useCallback(async () => {
    if (index + 1 >= questions.length) {
      if (sessionId) await completeSession(sessionId).catch(() => {});
      setPhase("done");
      return;
    }
    setIndex((i) => i + 1);
    setSelected(null);
    setFirstLetter(null);
    setStruck([]);
    setHighlightHtml(null);
    setStrikeMode(false);
    setFlagged(false);
    setRevealed(false);
    enterRef.current = Date.now();
  }, [index, questions.length, sessionId]);

  const toggleStrike = (letter: string) =>
    setStruck((cur) => (cur.includes(letter) ? cur.filter((l) => l !== letter) : [...cur, letter]));

  if (phase === "loading") return <Center>Loading practice…</Center>;
  if (phase === "error")
    return (
      <Center>
        <div className="space-y-3 text-center">
          <p className="text-incorrect">{errorMsg}</p>
          <Button variant="outline" onClick={() => navigate("/")}>Back to home</Button>
        </div>
      </Center>
    );
  if (phase === "done")
    return (
      <div className="grid min-h-screen place-items-center bg-background p-6">
        <Card className="w-full max-w-md text-center">
          <CardContent className="space-y-4 p-8">
            <div className="text-xs font-semibold uppercase tracking-widest text-primary">Practice complete</div>
            <div className="text-5xl font-bold tabular-nums text-slate-800">
              {score.correct}<span className="text-2xl text-muted-foreground">/{questions.length}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {Math.round((score.correct / questions.length) * 100)}% correct
            </div>
            <Button variant="outline" onClick={() => navigate("/")}>Back to home</Button>
          </CardContent>
        </Card>
      </div>
    );

  const last = index + 1 >= questions.length;

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center justify-between gap-4 bg-navy px-4 py-2.5 text-navy-foreground">
        <div className="flex items-center gap-5 text-sm">
          <span className="font-semibold uppercase tracking-widest">Practice</span>
          <span className="text-navy-foreground/80">Block <strong className="text-navy-foreground">{blockNumber}</strong></span>
          <span className="text-navy-foreground/80">Q <strong className="text-navy-foreground">{index + 1}</strong> of {questions.length}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-md bg-white/10 px-2.5 py-1 text-xs tabular-nums" title="Running score (answers are revealed in practice)">
            Score {score.correct}/{score.answered}
          </span>
          <Button variant="navy" size="sm" onClick={() => navigate("/")}>
            <LogOut className="size-4" /> Exit
          </Button>
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
              strikeMode={strikeMode}
              flagged={flagged}
              revealed={revealed}
              correctLetter={revealed ? q.correct_letter : null}
              onToggleStrikeMode={() => setStrikeMode((m) => !m)}
              onToggleFlag={() => setFlagged((f) => !f)}
              onSelect={(l) => { setSelected(l); setFirstLetter((f) => f ?? l); }}
              onToggleStrike={toggleStrike}
              onChangeHighlight={setHighlightHtml}
            />
          )}
        </section>

        {revealed && q && (
          <section ref={explRef} className="min-h-0 flex-1 overflow-y-auto border-t lg:w-1/2 lg:border-l lg:border-t-0">
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
          <Button size="sm" onClick={onNext}>
            {last ? "Finish" : "Next question"} <ChevronRight className="size-4" />
          </Button>
        )}
      </footer>

      <LabValuesModal open={modal === "lab"} onClose={() => setModal(null)} />
      <CalculatorModal open={modal === "calc"} onClose={() => setModal(null)} />
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center bg-background p-6 text-muted-foreground">{children}</div>;
}
