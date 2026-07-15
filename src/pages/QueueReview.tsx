import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getReviewQueue } from "@/lib/queries";
import type { FullQuestion, ReviewAnswer } from "@/lib/types";
import ReviewQueue from "@/components/review/ReviewQueue";
import { Button } from "@/components/ui/button";

interface QueueState {
  questionIds: string[];
  focusId?: string;
  title?: string;
}

/**
 * Review queue reached from the dashboard's wrong-answer filter. The filtered
 * question ids arrive via router state; on a cold load (state lost to refresh)
 * we bounce back to the dashboard rather than guess.
 */
export default function QueueReview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as QueueState | null;
  const [data, setData] = useState<{ questions: FullQuestion[]; answers: ReviewAnswer[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (!state?.questionIds?.length) { navigate("/analytics", { replace: true }); return; }
    getReviewQueue(user.id, state.questionIds).then(setData).catch((e) => setError(e?.message ?? "Failed to load review queue."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (error) return <Center><div className="space-y-3 text-center"><p className="text-incorrect">{error}</p>
    <Button variant="outline" onClick={() => navigate("/analytics")}>Back to progress</Button></div></Center>;
  if (!data) return <Center>Loading review…</Center>;
  if (data.questions.length === 0) return <Center><div className="space-y-3 text-center">
    <p className="text-muted-foreground">Nothing to review in this set.</p>
    <Button variant="outline" onClick={() => navigate("/analytics")}>Back to progress</Button></div></Center>;

  return (
    <ReviewQueue
      questions={data.questions}
      answers={data.answers}
      title={state?.title ?? "Wrong-answer review"}
      initialQuestionId={state?.focusId}
      defaultAllMode
      exitLabel="Back to progress"
      onExit={() => navigate("/analytics")}
    />
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center bg-background p-6 text-muted-foreground">{children}</div>;
}
