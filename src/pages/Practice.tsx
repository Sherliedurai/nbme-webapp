import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { countAnsweredInSession, createBlockSession, getFullQuestions, getUnfinishedBlock, loadBlockProgress } from "@/lib/queries";
import type { BlockProgressRow, FullQuestion } from "@/lib/types";
import PracticeRunner from "@/components/exam/PracticeRunner";
import { Button } from "@/components/ui/button";

type Phase = "loading" | "active" | "error";

export default function Practice() {
  const { form: formParam, blockNumber: blockParam } = useParams();
  const form = Number(formParam);
  const blockNumber = Number(blockParam);
  const { user } = useAuth();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [questions, setQuestions] = useState<FullQuestion[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [initialIndex, setInitialIndex] = useState(0);
  const [answered, setAnswered] = useState<Record<string, BlockProgressRow>>({});

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const [qs, existing] = await Promise.all([
          getFullQuestions(form, blockNumber),
          getUnfinishedBlock(user.id, form, blockNumber, "practice"),
        ]);
        if (!active) return;
        if (qs.length === 0) { setErrorMsg(`No questions found for block ${blockNumber}.`); setPhase("error"); return; }

        if (existing) {
          // Resume: reuse the session, restore prior answers, land on the first
          // unanswered question — do NOT restart. Position is the max of the saved
          // index, the block_progress count, and the authoritative answered-count
          // from attempts (covers sessions predating block_progress persistence).
          const [progress, answeredCount] = await Promise.all([
            loadBlockProgress(existing.id),
            countAnsweredInSession(existing.id),
          ]);
          if (!active) return;
          const pos = Math.max(existing.current_index, progress.length, answeredCount);
          setSessionId(existing.id);
          setAnswered(Object.fromEntries(progress.map((p) => [p.question_id, p])));
          setInitialIndex(Math.min(pos, qs.length - 1));
        } else {
          const session = await createBlockSession(user.id, form, blockNumber, "practice"); // untimed → no time limit
          if (!active) return;
          setSessionId(session.id);
          setAnswered({});
          setInitialIndex(0);
        }
        setQuestions(qs);
        setPhase("active");
      } catch (e: any) {
        if (active) { setErrorMsg(e?.message ?? "Failed to load practice."); setPhase("error"); }
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, form, blockNumber]);

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

  return (
    <PracticeRunner
      questions={questions}
      userId={user!.id}
      sessionId={sessionId!}
      title={`Practice · NBME ${form} · Block ${blockNumber}`}
      persist
      initialIndex={initialIndex}
      initialAnswered={answered}
      onExit={() => navigate("/")}
    />
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center bg-background p-6 text-muted-foreground">{children}</div>;
}
