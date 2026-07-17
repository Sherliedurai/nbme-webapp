import { useMemo } from "react";
import {
  accuracyByTag,
  firstInstinct,
  pacingByPosition,
  type AnalyticsAttempt,
  type Bucket,
} from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AlertTriangle, ChevronRight, Gauge, Home, Layers, ListChecks, Repeat } from "lucide-react";

interface Props {
  title: string;
  /** This block's attempts, each carrying tags + correctness. */
  attempts: AnalyticsAttempt[];
  /** Wall-clock seconds used of the 30:00 budget. */
  timeUsedSec: number;
  /** The block was paused/resumed — its timing isn't a clean sample. */
  interrupted?: boolean;
  onReviewQuestion: (qNumber: number) => void;
  onReviewAll: () => void;
  onHome: () => void;
}

export default function BlockReport({ title, attempts, timeUsedSec, interrupted = false, onReviewQuestion, onReviewAll, onHome }: Props) {
  const total = attempts.length;
  const correct = useMemo(() => attempts.filter((a) => a.finalLetter != null && a.finalLetter === a.correctLetter).length, [attempts]);
  const fi = useMemo(() => firstInstinct(attempts), [attempts]);
  const pacing = useMemo(() => pacingByPosition(attempts), [attempts]);
  const bySystem = useMemo(() => accuracyByTag(attempts, (a) => a.system), [attempts]);
  const byDiscipline = useMemo(() => accuracyByTag(attempts, (a) => a.discipline), [attempts]);
  const byType = useMemo(() => accuracyByTag(attempts, (a) => a.questionType), [attempts]);
  const missed = useMemo(
    () => attempts.filter((a) => !(a.finalLetter != null && a.finalLetter === a.correctLetter)).sort((x, y) => x.qNumber - y.qNumber),
    [attempts]
  );

  const pctScore = total ? Math.round((correct / total) * 100) : 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between bg-navy px-6 py-3 text-navy-foreground">
        <div className="flex items-center gap-3">
          <Button variant="navy" size="sm" onClick={onHome}><Home className="size-4" /> Home</Button>
          <span className="text-sm font-semibold uppercase tracking-widest">{title} · report</span>
        </div>
        <Button variant="navy" size="sm" onClick={onReviewAll}>Review all questions <ChevronRight className="size-4" /></Button>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-6 py-8">
        {/* ── Score + time ─────────────────────────────────────────────────── */}
        <section className="grid gap-4 sm:grid-cols-3">
          <Card><CardContent className="p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Score</div>
            <div className="mt-1 text-4xl font-bold tabular-nums text-slate-800">{correct}<span className="text-2xl text-muted-foreground">/{total}</span></div>
            <div className="mt-0.5 text-sm text-muted-foreground">{pctScore}% correct</div>
          </CardContent></Card>
          <Card><CardContent className="p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Time used</div>
            <div className="mt-1 text-4xl font-bold tabular-nums text-slate-800">{mmss(timeUsedSec)}</div>
            <div className="mt-0.5 text-sm text-muted-foreground">of 30:00 · {perQ(timeUsedSec, total)}/question</div>
          </CardContent></Card>
          <Card><CardContent className="p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">First-instinct</div>
            <div className={cn("mt-1 text-4xl font-bold tabular-nums", fi.correctToIncorrect > 0 ? "text-incorrect" : "text-slate-800")}>
              {fi.correctToIncorrect}
            </div>
            <div className="mt-0.5 text-sm text-muted-foreground">right→wrong · {fi.changedCount} changed of {fi.answered}</div>
          </CardContent></Card>
        </section>

        {fi.correctToIncorrect > 0 && (
          <div className="-mt-4 flex items-start gap-3 rounded-lg border border-incorrect/40 bg-incorrect-soft px-4 py-3">
            <Repeat className="mt-0.5 size-5 shrink-0 text-incorrect" />
            <div className="text-sm text-incorrect">
              You changed <strong>{fi.correctToIncorrect}</strong> answer{fi.correctToIncorrect === 1 ? "" : "s"} from
              <strong> right to wrong</strong> this block. Those are the cheapest points on the exam — trust the first read unless you find a concrete reason to switch.
            </div>
          </div>
        )}

        {/* ── Strong / weak by tag ─────────────────────────────────────────── */}
        <section>
          <SectionHead icon={Layers} title="Strong & weak — this block"
            sub="Accuracy per tag that appeared, weakest first. Raw counts, no percentiles (there's no norm to compare against)." />
          <div className="grid gap-4 md:grid-cols-3">
            <TagCard heading="By discipline" rows={byDiscipline} />
            <TagCard heading="By system" rows={bySystem} />
            <TagCard heading="By question type" rows={byType} />
          </div>
        </section>

        {/* ── Pacing ───────────────────────────────────────────────────────── */}
        <section>
          <SectionHead icon={Gauge} title="Pacing — accuracy by position"
            sub="A dropoff in Q16–20 means you rushed the tail." />
          {interrupted ? (
            <Card><CardContent className="flex items-start gap-3 p-4 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              This block was paused/resumed — pacing isn't a clean timing sample, so it's excluded here and from your stamina trend. Score still counts.
            </CardContent></Card>
          ) : (
            <AccuracyBars buckets={pacing} />
          )}
        </section>

        {/* ── Missed questions ─────────────────────────────────────────────── */}
        <section>
          <SectionHead icon={ListChecks} title={`Missed questions (${missed.length})`}
            sub="Tap any one to open it with the full explanation, then tag why you missed it." />
          {missed.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-correct">Clean block — nothing missed. 🎯</CardContent></Card>
          ) : (
            <Card><CardContent className="p-0">
              <ul className="divide-y">
                {missed.map((a) => (
                  <li key={a.qNumber}>
                    <button onClick={() => onReviewQuestion(a.qNumber)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full border border-incorrect/40 bg-incorrect-soft text-xs font-semibold tabular-nums text-incorrect">
                        {posInBlock(a.qNumber)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800">{a.discipline} · {a.system}</span>
                        <span className="block text-xs text-muted-foreground">{a.questionType}</span>
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        You <span className="font-semibold text-incorrect">{a.finalLetter ?? "—"}</span>
                        <span className="mx-1">·</span>
                        Correct <span className="font-semibold text-correct">{a.correctLetter}</span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-slate-400" />
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent></Card>
          )}
        </section>

        {missed.length > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-accent px-4 py-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="text-sm text-slate-700">
              After reading each explanation, <strong>tag why you missed it</strong> (knowledge gap · discriminator · primary–secondary · process).
              That tag is what turns "physiology is weak" into a specific, fixable pattern on your dashboard.
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ── pieces ────────────────────────────────────────────────────────────────
function SectionHead({ icon: Icon, title, sub }: { icon: typeof Gauge; title: string; sub: string }) {
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

function TagCard({ heading, rows }: { heading: string; rows: Bucket[] }) {
  return (
    <Card><CardContent className="p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{heading}</div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const w = Math.round(r.accuracy * 100);
            const tone = w >= 70 ? "text-correct" : w >= 50 ? "text-amber-600" : "text-incorrect";
            return (
              <li key={r.label} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-slate-700">{r.label}</span>
                <span className={cn("shrink-0 font-semibold tabular-nums", tone)}>{r.correct}/{r.total}</span>
              </li>
            );
          })}
        </ul>
      )}
    </CardContent></Card>
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
            <div className="w-20 shrink-0 text-sm text-slate-700">{b.label}</div>
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

// Position within the block (1..20) from the form-wide q_number.
const posInBlock = (qNumber: number) => ((qNumber - 1) % 20) + 1;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const perQ = (s: number, n: number) => (n ? `${Math.round(s / n)}s` : "—");
