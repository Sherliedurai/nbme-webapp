import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getAttemptsWithQuestions } from "@/lib/queries";
import {
  ERROR_TAGS,
  ERROR_TAG_META,
  errorTypeDistribution,
  firstInstinct,
  pacingByPosition,
  staminaByBlock,
  type AnalyticsAttempt,
  type Bucket,
  type ErrorTag,
} from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AlertTriangle, ArrowLeft, Gauge, Repeat, Tags, TrendingDown } from "lucide-react";

export default function Analytics() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [attempts, setAttempts] = useState<AnalyticsAttempt[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getAttemptsWithQuestions(user.id).then(setAttempts).catch((e) => setError(e?.message ?? "Failed to load analytics."));
  }, [user]);

  const fi = useMemo(() => (attempts ? firstInstinct(attempts) : null), [attempts]);
  const byDiscipline = useMemo(
    () => (attempts ? errorTypeDistribution(attempts, (a) => a.discipline) : null),
    [attempts]
  );
  const pacing = useMemo(() => (attempts ? pacingByPosition(attempts) : []), [attempts]);
  const stamina = useMemo(() => (attempts ? staminaByBlock(attempts, true) : []), [attempts]);

  const contentVsProcess = useMemo(() => {
    if (!byDiscipline) return null;
    let content = 0, process = 0;
    for (const t of ERROR_TAGS) {
      (ERROR_TAG_META[t as ErrorTag].kind === "content" ? (content += byDiscipline.overall[t as ErrorTag]) : (process += byDiscipline.overall[t as ErrorTag]));
    }
    return { content, process, total: content + process };
  }, [byDiscipline]);

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between bg-navy px-6 py-3 text-navy-foreground">
        <div className="flex items-center gap-4">
          <Button variant="navy" size="sm" onClick={() => navigate("/")}><ArrowLeft className="size-4" /> Home</Button>
          <span className="text-sm font-semibold uppercase tracking-widest">Progress &amp; diagnostics</span>
        </div>
        <span className="text-xs text-navy-foreground/70">{user?.email}</span>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-6 py-8">
        {error && <p className="rounded-md bg-incorrect-soft px-4 py-3 text-sm text-incorrect">{error}</p>}
        {!attempts && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
        {attempts && attempts.length === 0 && (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
            No attempts recorded yet. Sit a block, then this dashboard fills in — first-instinct behavior, error types,
            pacing and stamina.
          </CardContent></Card>
        )}

        {attempts && attempts.length > 0 && fi && byDiscipline && (
          <>
            {/* ── 1. First instinct ─────────────────────────────────────────── */}
            <section>
              <SectionHead icon={Repeat} title="First-instinct tracker"
                sub="Reaching the right answer, then talking yourself out of it, is a near-free score gain." />

              {fi.overThreshold && (
                <div className="mb-4 flex items-start gap-3 rounded-lg border border-incorrect/40 bg-incorrect-soft px-4 py-3">
                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-incorrect" />
                  <div className="text-sm text-incorrect">
                    <strong>{pct(fi.costlyChangePct)}</strong> of answers were changed from <strong>correct → incorrect</strong> —
                    above the 15% action line. Trust the first read unless you find a concrete reason to switch.
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-3">
                <Stat label="Answers changed" value={pct(fi.changedPct)} sub={`${fi.changedCount} of ${fi.answered} answered`} />
                <Stat label="Correct → incorrect" value={String(fi.correctToIncorrect)} sub={`${pct(fi.costlyChangePct)} of answered · the leak`}
                  tone={fi.overThreshold ? "bad" : "warn"} />
                <Stat label="Incorrect → correct" value={String(fi.incorrectToCorrect)} sub="changes that helped" tone="good" />
              </div>

              <Card className="mt-4"><CardContent className="space-y-2 p-4">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Change outcomes</div>
                <BarRow label="Unchanged (kept first answer)" value={fi.unchanged} total={fi.answered} color="bg-slate-400" />
                <BarRow label="Incorrect → correct" value={fi.incorrectToCorrect} total={fi.answered} color="bg-correct" />
                <BarRow label="Wrong → still wrong" value={fi.wrongToWrong} total={fi.answered} color="bg-amber-400" />
                <BarRow label="Correct → incorrect (the killer)" value={fi.correctToIncorrect} total={fi.answered} color="bg-incorrect" />
              </CardContent></Card>
            </section>

            {/* ── 2. Error types ────────────────────────────────────────────── */}
            <section>
              <SectionHead icon={Tags} title="Error-type breakdown"
                sub="Tag each miss in review. This settles content-vs-process with data, not opinion." />

              {byDiscipline.untaggedMisses > 0 && (
                <p className="mb-3 text-xs text-muted-foreground">
                  {byDiscipline.untaggedMisses} missed question{byDiscipline.untaggedMisses === 1 ? "" : "s"} not yet tagged —
                  tag them in the review screen to sharpen this.
                </p>
              )}

              {contentVsProcess && contentVsProcess.total > 0 && (
                <div className="mb-4 grid gap-4 sm:grid-cols-2">
                  <Stat label="Content misses" value={String(contentVsProcess.content)}
                    sub="knowledge gap + primary–secondary" tone="warn" />
                  <Stat label="Process misses" value={String(contentVsProcess.process)}
                    sub="discriminator + process error" tone="warn" />
                </div>
              )}

              <Card><CardContent className="space-y-2 p-4">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">All tagged misses</div>
                {ERROR_TAGS.every((t) => byDiscipline.overall[t as ErrorTag] === 0) ? (
                  <p className="text-sm text-muted-foreground">No tags yet.</p>
                ) : (
                  ERROR_TAGS.map((t) => (
                    <BarRow key={t} label={ERROR_TAG_META[t as ErrorTag].label}
                      value={byDiscipline.overall[t as ErrorTag]}
                      total={totalTags(byDiscipline.overall)} color="bg-primary" />
                  ))
                )}
              </CardContent></Card>

              {byDiscipline.groups.length > 0 && (
                <Card className="mt-4"><CardContent className="p-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Misses by discipline</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground">
                          <th className="py-1 pr-3 font-medium">Discipline</th>
                          <th className="py-1 pr-3 font-medium">Misses</th>
                          {ERROR_TAGS.map((t) => (
                            <th key={t} className="py-1 pr-3 font-medium">{ERROR_TAG_META[t as ErrorTag].label}</th>
                          ))}
                          <th className="py-1 font-medium">Untagged</th>
                        </tr>
                      </thead>
                      <tbody>
                        {byDiscipline.groups.map((g) => (
                          <tr key={g.key} className="border-t">
                            <td className="py-1.5 pr-3 font-medium text-slate-700">{g.key}</td>
                            <td className="py-1.5 pr-3 tabular-nums">{g.total}</td>
                            {ERROR_TAGS.map((t) => (
                              <td key={t} className="py-1.5 pr-3 tabular-nums text-muted-foreground">{g.byTag[t as ErrorTag] || "·"}</td>
                            ))}
                            <td className="py-1.5 tabular-nums text-muted-foreground">{g.untagged || "·"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent></Card>
              )}
            </section>

            {/* ── 3. Pacing ─────────────────────────────────────────────────── */}
            <section>
              <SectionHead icon={Gauge} title="Pacing — accuracy by position in block"
                sub="A late-question dropoff means rushing the tail; an early one means a slow start." />
              <AccuracyBars buckets={pacing} />
            </section>

            {/* ── 4. Stamina ────────────────────────────────────────────────── */}
            <section>
              <SectionHead icon={TrendingDown} title="Stamina — accuracy by block (full exams)"
                sub="A steady decline across blocks is fatigue, not content." />
              {stamina.length === 0 ? (
                <Card><CardContent className="p-6 text-sm text-muted-foreground">
                  No full-exam sittings yet. Run a full exam and block-to-block stamina shows here.
                </CardContent></Card>
              ) : (
                <AccuracyBars buckets={stamina} />
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

// ── small presentational pieces ───────────────────────────────────────────────
function SectionHead({ icon: Icon, title, sub }: { icon: typeof Repeat; title: string; sub: string }) {
  return (
    <div className="mb-3 flex items-start gap-2.5">
      <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
      <div>
        <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
        <p className="text-sm text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone = "neutral" }: { label: string; value: string; sub?: string; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const toneCls = {
    neutral: "text-slate-800",
    good: "text-correct",
    warn: "text-amber-600",
    bad: "text-incorrect",
  }[tone];
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-3xl font-bold tabular-nums", toneCls)}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </CardContent></Card>
  );
}

function BarRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const w = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-56 shrink-0 truncate text-sm text-slate-700">{label}</div>
      <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
        <div className={cn("h-full rounded", color)} style={{ width: `${w}%` }} />
      </div>
      <div className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{value} · {w}%</div>
    </div>
  );
}

function AccuracyBars({ buckets }: { buckets: Bucket[] }) {
  return (
    <Card><CardContent className="space-y-2 p-4">
      {buckets.map((b) => {
        const w = Math.round(b.accuracy * 100);
        const color = w >= 70 ? "bg-correct" : w >= 55 ? "bg-amber-400" : "bg-incorrect";
        return (
          <div key={b.label} className="flex items-center gap-3">
            <div className="w-24 shrink-0 text-sm text-slate-700">{b.label}</div>
            <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
              <div className={cn("h-full rounded", color)} style={{ width: `${w}%` }} />
            </div>
            <div className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {b.total ? `${w}% · ${b.correct}/${b.total}` : "—"}
            </div>
          </div>
        );
      })}
    </CardContent></Card>
  );
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const totalTags = (o: Record<ErrorTag, number>) => ERROR_TAGS.reduce((s, t) => s + o[t as ErrorTag], 0);
