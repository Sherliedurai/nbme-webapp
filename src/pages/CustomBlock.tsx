import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  countQuestionsByFilter,
  createBlockSession,
  getFilterFacets,
  getQuestionsByFilter,
  type FilterFacets,
  type QuestionFilter,
} from "@/lib/queries";
import type { FullQuestion } from "@/lib/types";
import PracticeRunner from "@/components/exam/PracticeRunner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, PlayCircle, SlidersHorizontal } from "lucide-react";

const SIZES = [10, 20, 40];

export default function CustomBlock() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [facets, setFacets] = useState<FilterFacets | null>(null);
  const [filter, setFilter] = useState<QuestionFilter>({});
  const [size, setSize] = useState(20);
  const [count, setCount] = useState<number | null>(null);
  const [phase, setPhase] = useState<"build" | "loading" | "run" | "error">("build");
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<FullQuestion[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    getFilterFacets().then(setFacets).catch((e) => setError(e?.message ?? "Failed to load filters"));
  }, []);

  useEffect(() => {
    let live = true;
    countQuestionsByFilter(filter).then((c) => { if (live) setCount(c); }).catch(() => setCount(null));
    return () => { live = false; };
  }, [filter]);

  const take = useMemo(() => Math.min(size, count ?? size), [size, count]);

  async function start() {
    if (!user || !count) return;
    setPhase("loading");
    try {
      const [session, qs] = await Promise.all([
        createBlockSession(user.id, null, null, "custom"),
        getQuestionsByFilter(filter, take),
      ]);
      if (qs.length === 0) { setError("No questions match that filter."); setPhase("error"); return; }
      setSessionId(session.id);
      setQuestions(qs);
      setPhase("run");
    } catch (e: any) {
      setError(e?.message ?? "Failed to build the block."); setPhase("error");
    }
  }

  if (phase === "run" && sessionId) {
    return (
      <PracticeRunner
        questions={questions}
        userId={user!.id}
        sessionId={sessionId}
        title="Custom block"
        onExit={() => navigate("/")}
      />
    );
  }
  if (phase === "loading") return <Center>Building your block…</Center>;

  const label = (parts: (string | undefined)[]) => parts.filter(Boolean).join(" · ") || "All questions";

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between bg-navy px-6 py-3 text-navy-foreground">
        <div className="flex items-center gap-4">
          <Button variant="navy" size="sm" onClick={() => navigate("/")}><ArrowLeft className="size-4" /> Home</Button>
          <span className="text-sm font-semibold uppercase tracking-widest">Custom block</span>
        </div>
        <span className="text-xs text-navy-foreground/70">{user?.email}</span>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-4 flex items-start gap-2.5">
          <SlidersHorizontal className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">Build a targeted block</h1>
            <p className="text-sm text-muted-foreground">
              Filter to your weak areas — a Physiology-only block is worth more than a pile of random questions.
              Untimed; answer, then see the explanation.
            </p>
          </div>
        </div>

        {error && <p className="mb-4 rounded-md bg-incorrect-soft px-4 py-3 text-sm text-incorrect">{error}</p>}

        <Card><CardContent className="space-y-5 p-5">
          <Facet label="Discipline" options={facets?.discipline} value={filter.discipline}
            onChange={(v) => setFilter((f) => ({ ...f, discipline: v }))} />
          <Facet label="System" options={facets?.system} value={filter.system}
            onChange={(v) => setFilter((f) => ({ ...f, system: v }))} />
          <Facet label="Question type" options={facets?.questionType} value={filter.questionType}
            onChange={(v) => setFilter((f) => ({ ...f, questionType: v }))} />

          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Block size</div>
            <div className="flex gap-2">
              {SIZES.map((s) => (
                <button key={s} onClick={() => setSize(s)}
                  className={cnPill(size === s)}>up to {s}</button>
              ))}
            </div>
          </div>
        </CardContent></Card>

        <div className="mt-5 flex items-center justify-between rounded-lg border border-border bg-card px-5 py-4">
          <div className="text-sm text-slate-700">
            <span className="font-medium">{label([filter.discipline, filter.system, filter.questionType])}</span>
            <div className="text-xs text-muted-foreground">
              {count == null ? "…" : count === 0 ? "No questions match" : `${count} available · this block: ${take}`}
            </div>
          </div>
          <Button disabled={!count} onClick={start}>
            <PlayCircle className="size-4" /> Start block
          </Button>
        </div>
      </main>
    </div>
  );
}

function Facet({ label, options, value, onChange }: {
  label: string; options?: { value: string; count: number }[]; value?: string; onChange: (v: string | undefined) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => onChange(undefined)} className={cnPill(!value)}>Any</button>
        {(options ?? []).map((o) => (
          <button key={o.value} onClick={() => onChange(value === o.value ? undefined : o.value)} className={cnPill(value === o.value)}>
            {o.value} <span className="opacity-60">{o.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function cnPill(active: boolean): string {
  return [
    "rounded-full border px-3 py-1 text-sm transition-colors",
    active ? "border-primary bg-accent text-primary" : "border-border bg-card text-slate-700 hover:bg-accent",
  ].join(" ");
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center bg-background p-6 text-muted-foreground">{children}</div>;
}
