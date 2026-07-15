import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getUnhelpfulSet, setExplanationUnhelpful } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { ThumbsDown } from "lucide-react";

/**
 * The in-app "this explanation didn't help" flag. Toggles one row per
 * (user, question) in explanation_feedback — quality control as a byproduct of
 * use, so the owner can find the weakest enrichments without re-reading them all.
 */
export default function ExplanationFeedback({ questionId }: { questionId: string }) {
  const { user } = useAuth();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    let live = true;
    getUnhelpfulSet(user.id, [questionId])
      .then((s) => { if (live) setOn(s.has(questionId)); })
      .catch(() => {});
    return () => { live = false; };
  }, [user, questionId]);

  async function toggle() {
    if (!user || busy) return;
    const next = !on;
    setOn(next);
    setBusy(true);
    try {
      await setExplanationUnhelpful(user.id, questionId, next);
    } catch {
      setOn(!next); // roll back on write failure
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title="Flag this explanation as unhelpful — feeds the owner's quality review"
      className={cn(
        "ml-auto inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors disabled:opacity-60",
        on ? "border-amber-400 bg-amber-50 text-amber-800" : "border-border text-muted-foreground hover:bg-accent"
      )}
    >
      <ThumbsDown className={cn("size-3.5", on && "fill-current")} />
      {on ? "Marked: didn't help" : "This didn't help"}
    </button>
  );
}
