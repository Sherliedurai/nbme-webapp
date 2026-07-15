import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { createBlockSession, getFullQuestions } from "@/lib/queries";
import type { FullQuestion } from "@/lib/types";
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

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const qs = await getFullQuestions(form, blockNumber);
        if (!active) return;
        if (qs.length === 0) { setErrorMsg(`No questions found for block ${blockNumber}.`); setPhase("error"); return; }
        const session = await createBlockSession(user.id, form, blockNumber, "practice");
        if (!active) return;
        setQuestions(qs);
        setSessionId(session.id);
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
      onExit={() => navigate("/")}
    />
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center bg-background p-6 text-muted-foreground">{children}</div>;
}
