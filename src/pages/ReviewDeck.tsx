import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { createBlockSession, getAttemptsWithQuestions, getReviewQueue } from "@/lib/queries";
import { reviewDeckRows } from "@/lib/analytics";
import type { FullQuestion } from "@/lib/types";
import PracticeRunner from "@/components/exam/PracticeRunner";
import { Button } from "@/components/ui/button";

/**
 * Cold re-attempt deck: her incorrect + flagged questions, OLDEST first, answered
 * blind (no explanation until she commits). Re-attempts are recorded with
 * is_review=true so they never touch her scores or trend — a re-attempt tests
 * whether she can now reason to it, it does not prove exam readiness. A miss can
 * still be re-tagged; that updates the ORIGINAL exam attempt, which analytics uses.
 */
export default function ReviewDeck() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"loading" | "run" | "empty" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<FullQuestion[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const origAttemptRef = useRef<Map<string, string | null>>(new Map());

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const attempts = await getAttemptsWithQuestions(user.id);
        // reviewDeckRows is newest-first; the deck drills oldest-first.
        const rows = reviewDeckRows(attempts).reverse();
        if (!active) return;
        if (rows.length === 0) { setPhase("empty"); return; }
        origAttemptRef.current = new Map(rows.map((r) => [r.questionId, r.attemptId]));
        const [session, queue] = await Promise.all([
          createBlockSession(user.id, null, null, "custom"),
          getReviewQueue(user.id, rows.map((r) => r.questionId)),
        ]);
        if (!active) return;
        if (queue.questions.length === 0) { setPhase("empty"); return; }
        setSessionId(session.id);
        setQuestions(queue.questions);
        setPhase("run");
      } catch (e: any) {
        if (active) { setError(e?.message ?? "Failed to load the review deck."); setPhase("error"); }
      }
    })();
    return () => { active = false; };
  }, [user]);

  if (phase === "loading") return <Center>Loading review deck…</Center>;
  if (phase === "error")
    return <Center><div className="space-y-3 text-center"><p className="text-incorrect">{error}</p>
      <Button variant="outline" onClick={() => navigate("/analytics")}>Back to progress</Button></div></Center>;
  if (phase === "empty")
    return <Center><div className="space-y-3 text-center">
      <p className="text-muted-foreground">Nothing to re-attempt — no incorrect or flagged questions yet.</p>
      <Button variant="outline" onClick={() => navigate("/analytics")}>Back to progress</Button></div></Center>;

  return (
    <PracticeRunner
      questions={questions}
      userId={user!.id}
      sessionId={sessionId!}
      title="Review deck · cold re-attempt"
      isReview
      tagAttemptId={(qid) => origAttemptRef.current.get(qid) ?? null}
      onExit={() => navigate("/analytics")}
    />
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center bg-background p-6 text-muted-foreground">{children}</div>;
}
