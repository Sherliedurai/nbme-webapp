import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  countAnsweredInSession, createBlockSession, getCompletedBlock, getFullQuestions,
  getUnfinishedBlock, loadBlockProgress,
} from "@/lib/queries";
import type { BlockProgressRow, FullQuestion } from "@/lib/types";
import PracticeRunner from "@/components/exam/PracticeRunner";
import ReviewQueue, { type ReviewAnswer } from "@/components/review/ReviewQueue";
import { Button } from "@/components/ui/button";

type Phase = "loading" | "active" | "completed" | "error";

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
  // A finished practice block opens READ-ONLY here (records nothing on view).
  const [completed, setCompleted] = useState<{ questions: FullQuestion[]; answers: ReviewAnswer[] } | null>(null);

  // The ONLY path to a fresh sitting — explicit + confirmed (never on plain re-entry).
  const startFresh = useCallback(async (qs: FullQuestion[]) => {
    if (!user) return;
    const session = await createBlockSession(user.id, form, blockNumber, "practice"); // untimed
    setSessionId(session.id);
    setAnswered({});
    setInitialIndex(0);
    setCompleted(null);
    setQuestions(qs);
    setPhase("active");
  }, [user, form, blockNumber]);

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
          // Resume the in-progress sitting: restore prior answers, land on the first
          // unanswered question. Never restarts, never re-records.
          const [progress, answeredCount] = await Promise.all([
            loadBlockProgress(existing.id),
            countAnsweredInSession(existing.id),
          ]);
          if (!active) return;
          const pos = Math.max(existing.current_index, progress.length, answeredCount);
          setSessionId(existing.id);
          setAnswered(Object.fromEntries(progress.map((p) => [p.question_id, p])));
          setInitialIndex(Math.min(pos, qs.length - 1));
          setQuestions(qs);
          setPhase("active");
          return;
        }

        // No in-progress sitting. Already FINISHED? Open it read-only for review —
        // do NOT spawn a new session (that would re-record her answers).
        const done = await getCompletedBlock(user.id, form, blockNumber, "practice");
        if (!active) return;
        if (done) { setCompleted({ questions: done.questions, answers: done.answers }); setPhase("completed"); return; }

        await startFresh(qs); // genuine first sitting
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

  // Completed → read-only review. Viewing records nothing; only re-tagging a miss
  // updates the ORIGINAL attempt. Retake is explicit + confirmed.
  if (phase === "completed" && completed)
    return (
      <ReviewQueue
        questions={completed.questions}
        answers={completed.answers}
        onExit={() => navigate("/")}
        exitLabel="Home"
        title={`Practice · NBME ${form} · Block ${blockNumber} — review`}
        defaultAllMode
        onRetake={() => {
          if (window.confirm("Retake this block from scratch? This starts a new, separate practice sitting — your recorded answers stay untouched."))
            void startFresh(completed.questions);
        }}
      />
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
