import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getAttemptsWithQuestions, getReviewQueue } from "@/lib/queries";
import {
  ERROR_TAGS,
  ERROR_TAG_META,
  accuracyByTag,
  blocksForForm,
  errorTypeDistribution,
  firstInstinct,
  pacingByPosition,
  questionsForBlock,
  reviewDeckRows,
  scoresByForm,
  staminaByBlock,
  tagTrendByForm,
  wrongAnswers,
  type AnalyticsAttempt,
  type Bucket,
  type ErrorTag,
  type QDrillRow,
  type WrongRow,
} from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AlertTriangle, ArrowLeft, ChevronRight, Download, FileText, FolderTree, Gauge, Layers, LineChart, ListChecks, Repeat, Tags, TrendingDown } from "lucide-react";

export default function Analytics() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [attempts, setAttempts] = useState<AnalyticsAttempt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // null = all forms; otherwise scope the whole dashboard to one form.
  const [formFilter, setFormFilter] = useState<number | null>(null);
  const [drillBlock, setDrillBlock] = useState<number | null>(null); // block within the selected form

  useEffect(() => {
    if (!user) return;
    getAttemptsWithQuestions(user.id).then(setAttempts).catch((e) => setError(e?.message ?? "Failed to load analytics."));
  }, [user]);

  // Changing the form resets the block drill.
  useEffect(() => { setDrillBlock(null); }, [formFilter]);

  // Level 4/3 drill — blocks within the selected form, questions within a block.
  const drillBlocks = useMemo(
    () => (attempts && formFilter != null ? blocksForForm(attempts, formFilter) : []),
    [attempts, formFilter]
  );
  const drillQuestions = useMemo(
    () => (attempts && formFilter != null && drillBlock != null ? questionsForBlock(attempts, formFilter, drillBlock) : []),
    [attempts, formFilter, drillBlock]
  );

  // Per-form scores are computed over ALL attempts (the whole point is not to pool).
  const formScores = useMemo(() => (attempts ? scoresByForm(attempts) : []), [attempts]);

  // The breadcrumb scopes the ENTIRE page. `scoped` is the single source of truth
  // every per-scope section reads from — narrowed by BOTH the selected form and the
  // selected block, discretely (all forms → one form → one block). Never blended.
  const scoped = useMemo(() => {
    if (!attempts) return null;
    let rows = formFilter == null ? attempts : attempts.filter((a) => a.nbmeForm === formFilter);
    if (formFilter != null && drillBlock != null) rows = rows.filter((a) => a.blockNumber === drillBlock);
    return rows;
  }, [attempts, formFilter, drillBlock]);

  // Human label for the active scope, shown on every scoped section header.
  // Derived purely from the selection — no form is ever named in code.
  const scopeLabel = formFilter == null
    ? "All forms"
    : drillBlock == null
      ? `NBME ${formFilter}`
      : `NBME ${formFilter} · Block ${drillBlock}`;
  const atBlock = formFilter != null && drillBlock != null;

  const fi = useMemo(() => (scoped ? firstInstinct(scoped) : null), [scoped]);
  const byDiscipline = useMemo(
    () => (scoped ? errorTypeDistribution(scoped, (a) => a.discipline) : null),
    [scoped]
  );
  const pacing = useMemo(() => (scoped ? pacingByPosition(scoped) : []), [scoped]);
  const stamina = useMemo(() => (scoped ? staminaByBlock(scoped, true) : []), [scoped]);

  // Strong & weak by tag (scoped to the selected form), three cuts, worst-first.
  const swDiscipline = useMemo(() => (scoped ? accuracyByTag(scoped, (a) => a.discipline) : []), [scoped]);
  const swSystem = useMemo(() => (scoped ? accuracyByTag(scoped, (a) => a.system) : []), [scoped]);
  const swType = useMemo(() => (scoped ? accuracyByTag(scoped, (a) => a.questionType) : []), [scoped]);

  // Practice-vs-exam split (scoped to the selection): a big gap = pressure/retrieval, not content.
  const modeSplit = useMemo(() => {
    if (!scoped) return null;
    const cut = (pred: (a: AnalyticsAttempt) => boolean) => {
      const pool = scoped.filter(pred);
      const answered = pool.filter((a) => a.finalLetter != null);
      const correct = answered.filter((a) => a.finalLetter === a.correctLetter).length;
      return { total: answered.length, correct, accuracy: answered.length ? correct / answered.length : 0 };
    };
    return {
      practice: cut((a) => a.mode === "practice" || a.mode === "custom"),
      exam: cut((a) => a.mode === "block" || a.mode === "full_exam"),
    };
  }, [scoped]);

  // Cross-form trend — over ALL attempts, since the point is comparing forms.
  const trend = useMemo(() => (attempts ? tagTrendByForm(attempts, (a) => a.discipline) : null), [attempts]);

  // Wrong-answer filter — every question currently gotten wrong WITHIN the active scope.
  const allWrong = useMemo(() => (scoped ? wrongAnswers(scoped) : []), [scoped]);
  const [fSystem, setFSystem] = useState("");
  const [fDiscipline, setFDiscipline] = useState("");
  const [fType, setFType] = useState("");
  const [fErrorTag, setFErrorTag] = useState("");
  const wrongFiltered = useMemo(
    () => allWrong.filter((r) =>
      (!fSystem || r.system === fSystem) &&
      (!fDiscipline || r.discipline === fDiscipline) &&
      (!fType || r.questionType === fType) &&
      (!fErrorTag || (fErrorTag === "__untagged" ? r.errorTag == null : r.errorTag === fErrorTag))),
    [allWrong, fSystem, fDiscipline, fType, fErrorTag]
  );
  const distinct = (pick: (r: WrongRow) => string) => [...new Set(allWrong.map(pick))].filter(Boolean).sort();

  // Open the filtered wrong set as a review queue, focused on `focusId`.
  const openQueue = (focusId: string) =>
    navigate("/review/queue", {
      state: { questionIds: wrongFiltered.map((r) => r.questionId), focusId, title: "Wrong-answer review" },
    });

  // Drill terminal: open one question in review.
  const openOneInReview = (questionId: string) =>
    navigate("/review/queue", { state: { questionIds: [questionId], focusId: questionId, title: "Question review" } });

  // Anki export / cold re-attempt — her incorrect + flagged set WITHIN the active scope.
  const deckRows = useMemo(() => (scoped ? reviewDeckRows(scoped) : []), [scoped]);
  const [exporting, setExporting] = useState(false);
  async function exportAnki() {
    if (!user || deckRows.length === 0) return;
    setExporting(true);
    try {
      const { questions } = await getReviewQueue(user.id, deckRows.map((r) => r.questionId));
      const payload = {
        exported_at: new Date().toISOString(),
        source: "nbme-practice-app · incorrect + flagged",
        questions: questions.map((q) => ({
          q_number: q.q_number,
          nbme_form: q.nbme_form,
          block_number: q.block_number,
          system_tag: q.system_tag,
          discipline_tag: q.discipline_tag,
          question_type: q.question_type,
          answer: q.options.find((o) => o.letter === q.correct_letter)?.text ?? "",
          hook: q.enriched_explanation?.hook ?? "",
        })),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nbme-anki-selection-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

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

        {/* ── 0. Scores by form (never pooled) + form filter ───────────────── */}
        {attempts && attempts.length > 0 && formScores.length > 0 && (
          <section>
            <SectionHead icon={FileText} title="Scores by form" scope="All forms · comparison"
              sub="Each form scored on its own — a pooled average across forms doesn't predict a pass. Tap a form to scope the page." />
            <div className="grid gap-3 sm:grid-cols-3">
              {formScores.map((f) => {
                const w = Math.round(f.accuracy * 100);
                const tone = w >= 70 ? "text-correct" : w >= 55 ? "text-amber-600" : "text-incorrect";
                const on = formFilter === f.form;
                return (
                  <button key={f.form} onClick={() => setFormFilter(on ? null : f.form)}
                    className={cn(
                      "rounded-lg border p-4 text-left transition-colors",
                      on ? "border-primary bg-accent ring-1 ring-primary" : "border-border bg-card hover:bg-accent"
                    )}>
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">NBME {f.form}</div>
                    <div className={cn("mt-1 text-3xl font-bold tabular-nums", tone)}>{w}%</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{f.correct}/{f.total} correct{on ? " · filtering ▾" : ""}</div>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <span>Showing:</span>
              <button onClick={() => setFormFilter(null)}
                className={cn("rounded-full border px-3 py-1", formFilter == null ? "border-primary bg-accent text-primary" : "border-border hover:bg-accent")}>
                All forms
              </button>
              {formScores.map((f) => (
                <button key={f.form} onClick={() => setFormFilter(f.form)}
                  className={cn("rounded-full border px-3 py-1", formFilter === f.form ? "border-primary bg-accent text-primary" : "border-border hover:bg-accent")}>
                  NBME {f.form}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Drill: form → block → question (each level discrete) ─────────── */}
        {attempts && attempts.length > 0 && (
          <section>
            <SectionHead icon={FolderTree} title="Drill down — form → block → question"
              sub="This breadcrumb scopes the whole page below it. Every level stays separate — never collapsed into one blended number." />
            <div className="mb-3 flex flex-wrap items-center gap-1.5 text-sm">
              <button onClick={() => setFormFilter(null)} className={cn("rounded px-2 py-1", formFilter == null ? "font-semibold text-slate-800" : "text-primary hover:underline")}>All forms</button>
              {formFilter != null && (<>
                <span className="text-slate-400">›</span>
                <button onClick={() => setDrillBlock(null)} className={cn("rounded px-2 py-1", drillBlock == null ? "font-semibold text-slate-800" : "text-primary hover:underline")}>NBME {formFilter}</button>
              </>)}
              {drillBlock != null && (<>
                <span className="text-slate-400">›</span>
                <span className="rounded px-2 py-1 font-semibold text-slate-800">Block {drillBlock}</span>
              </>)}
            </div>

            {formFilter == null ? (
              <Card><CardContent className="p-6 text-sm text-muted-foreground">
                Pick a form in <strong>Scores by form</strong> above to drill into its blocks, then a block, then a question.
              </CardContent></Card>
            ) : drillBlock == null ? (
              drillBlocks.length === 0 ? (
                <Card><CardContent className="p-6 text-sm text-muted-foreground">No attempts on NBME {formFilter} yet.</CardContent></Card>
              ) : (
                <Card><CardContent className="p-0">
                  <div className="overflow-x-auto"><table className="w-full text-sm">
                    <thead><tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Block</th>
                      <th className="px-4 py-2 font-medium">Timed</th>
                      <th className="px-4 py-2 font-medium">Practice</th>
                      <th className="px-4 py-2 font-medium">Avg time (timed)</th>
                      <th className="px-4 py-2"></th>
                    </tr></thead>
                    <tbody>
                      {drillBlocks.map((b) => (
                        <tr key={b.block} className="cursor-pointer border-t hover:bg-accent" onClick={() => setDrillBlock(b.block)}>
                          <td className="px-4 py-2.5 font-medium text-slate-800">
                            Block {b.block}
                            {b.interrupted && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">interrupted</span>}
                          </td>
                          <td className="px-4 py-2.5 tabular-nums">{acc(b.timed)}</td>
                          <td className="px-4 py-2.5 tabular-nums">{acc(b.practice)}</td>
                          <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{b.avgTimedSeconds != null ? `${b.avgTimedSeconds}s/q` : "—"}</td>
                          <td className="px-4 py-2.5 text-right"><ChevronRight className="inline size-4 text-slate-400" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                </CardContent></Card>
              )
            ) : (
              <Card><CardContent className="p-0">
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Q</th>
                    <th className="px-4 py-2 font-medium">Result</th>
                    <th className="px-4 py-2 font-medium">You · Correct</th>
                    <th className="px-4 py-2 font-medium">Time</th>
                    <th className="px-4 py-2 font-medium">First-instinct</th>
                    <th className="px-4 py-2 font-medium">Error</th>
                    <th className="px-4 py-2"></th>
                  </tr></thead>
                  <tbody>
                    {drillQuestions.map((r) => (
                      <tr key={r.questionId} className="cursor-pointer border-t hover:bg-accent" onClick={() => openOneInReview(r.questionId)}>
                        <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{((r.qNumber - 1) % 20) + 1}</td>
                        <td className="px-4 py-2.5">{r.correct
                          ? <span className="font-semibold text-correct">✓</span>
                          : <span className="font-semibold text-incorrect">✗</span>}</td>
                        <td className="px-4 py-2.5 tabular-nums">
                          <span className={r.correct ? "text-slate-600" : "text-incorrect"}>{r.finalLetter ?? "—"}</span>
                          <span className="mx-1 text-slate-400">·</span>
                          <span className="text-correct">{r.correctLetter}</span>
                        </td>
                        <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                          {r.secondsSpent != null ? `${r.secondsSpent}s` : "—"}
                          {r.firstAnswerSeconds != null && <span className="text-slate-400"> · 1st {r.firstAnswerSeconds}s</span>}
                        </td>
                        <td className="px-4 py-2.5">{outcomeBadge(r.outcome)}</td>
                        <td className="px-4 py-2.5 text-xs text-amber-700">{r.errorTag ? ERROR_TAG_META[r.errorTag].label : ""}</td>
                        <td className="px-4 py-2.5 text-right"><ChevronRight className="inline size-4 text-slate-400" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </CardContent></Card>
            )}
          </section>
        )}

        {attempts && attempts.length > 0 && fi && byDiscipline && (
          <>
            {/* ── Strong & weak by tag (scoped) + practice-vs-exam ──────────── */}
            <section>
              <SectionHead icon={Layers} title="Strong & weak by tag" scope={scopeLabel}
                sub="Accuracy per tag, weakest first. Raw counts, no percentiles." />
              <div className="grid gap-4 md:grid-cols-3">
                <TagCard heading="By discipline" rows={swDiscipline} />
                <TagCard heading="By system" rows={swSystem} />
                <TagCard heading="By question type" rows={swType} />
              </div>

              {modeSplit && (modeSplit.practice.total > 0 || modeSplit.exam.total > 0) && (
                <Card className="mt-4"><CardContent className="p-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Practice vs exam</div>
                  <p className="mb-3 text-xs text-muted-foreground">
                    A big gap (exam below practice) points to pressure/retrieval under timing — not a content hole.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ModeStat label="Practice" s={modeSplit.practice} />
                    <ModeStat label="Timed / exam" s={modeSplit.exam} />
                  </div>
                </CardContent></Card>
              )}
            </section>

            {/* ── 1. First instinct ─────────────────────────────────────────── */}
            <section>
              <SectionHead icon={Repeat} title="First-instinct tracker" scope={scopeLabel}
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
              <SectionHead icon={Tags} title="Error-type breakdown" scope={scopeLabel}
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
              <SectionHead icon={Gauge} title="Pacing — accuracy by position in block" scope={scopeLabel}
                sub="A late-question dropoff means rushing the tail; an early one means a slow start." />
              <AccuracyBars buckets={pacing} />
            </section>

            {/* ── 4. Stamina ────────────────────────────────────────────────── */}
            <section>
              <SectionHead icon={TrendingDown} title="Stamina — accuracy by block (full exams)" scope={scopeLabel}
                sub="A steady decline across blocks is fatigue, not content." />
              {atBlock ? (
                <Card><CardContent className="p-6 text-sm text-muted-foreground">
                  Stamina compares blocks against each other, so it doesn't apply to a single block. Clear the block in the
                  breadcrumb (pick a whole form, or All forms) to see block-to-block fatigue.
                </CardContent></Card>
              ) : stamina.length === 0 ? (
                <Card><CardContent className="p-6 text-sm text-muted-foreground">
                  No full-exam sittings yet. Run a full exam and block-to-block stamina shows here.
                </CardContent></Card>
              ) : (
                <AccuracyBars buckets={stamina} />
              )}
            </section>

            {/* ── 5. Cross-form trend (all forms) ───────────────────────────── */}
            {trend && trend.rows.length > 0 && (
              <section>
                <SectionHead icon={LineChart} title="Trend by discipline — across forms" scope="All forms · comparison"
                  sub="Is the gap actually closing? Accuracy per discipline, one column per form. Weakest first." />
                {trend.forms.length < 2 && (
                  <p className="mb-3 text-xs text-muted-foreground">
                    Only one form so far — the trend fills in as you sit NBME {trend.forms.join(", ")} and the next forms.
                  </p>
                )}
                <Card><CardContent className="p-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground">
                          <th className="py-1 pr-4 font-medium">Discipline</th>
                          {trend.forms.map((f) => (
                            <th key={f} className="py-1 pr-4 text-right font-medium">NBME {f}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {trend.rows.map((row) => (
                          <tr key={row.label} className="border-t">
                            <td className="py-1.5 pr-4 font-medium text-slate-700">{row.label}</td>
                            {trend.forms.map((f) => {
                              const b = row.perForm[f];
                              const w = Math.round(b.accuracy * 100);
                              const tone = b.total === 0 ? "text-slate-300" : w >= 70 ? "text-correct" : w >= 50 ? "text-amber-600" : "text-incorrect";
                              return (
                                <td key={f} className={cn("py-1.5 pr-4 text-right tabular-nums", tone)}>
                                  {b.total ? `${w}% · ${b.correct}/${b.total}` : "—"}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent></Card>
              </section>
            )}

            {/* ── 6. Wrong-answer filter (all sittings) ─────────────────────── */}
            <section>
              <div className="mb-3 flex items-start justify-between gap-3">
                <SectionHead icon={ListChecks} title={`Wrong-answer review (${wrongFiltered.length})`} scope={scopeLabel}
                  sub="Every question you currently get wrong in this scope. Filter, then walk them as a queue." />
                {deckRows.length > 0 && (
                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" onClick={() => navigate("/review/deck")}
                      title="Re-attempt your incorrect + flagged questions COLD — answer blind, reveal after. Kept out of your scores.">
                      <Repeat className="size-4" /> Re-attempt {deckRows.length} cold
                    </Button>
                    <Button variant="outline" size="sm" disabled={exporting} onClick={exportAnki}
                      title="Download your incorrect + flagged set as JSON, then run scripts/anki_export.py to build the .apkg">
                      <Download className="size-4" /> {exporting ? "Exporting…" : `Export ${deckRows.length} to Anki`}
                    </Button>
                  </div>
                )}
              </div>
              <Card><CardContent className="p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <FilterSelect label="System" value={fSystem} onChange={setFSystem} options={distinct((r) => r.system)} />
                  <FilterSelect label="Discipline" value={fDiscipline} onChange={setFDiscipline} options={distinct((r) => r.discipline)} />
                  <FilterSelect label="Type" value={fType} onChange={setFType} options={distinct((r) => r.questionType)} />
                  <ErrorTagSelect value={fErrorTag} onChange={setFErrorTag} />
                  {(fSystem || fDiscipline || fType || fErrorTag) && (
                    <button className="rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent"
                      onClick={() => { setFSystem(""); setFDiscipline(""); setFType(""); setFErrorTag(""); }}>
                      Clear filters
                    </button>
                  )}
                  {wrongFiltered.length > 0 && (
                    <Button size="sm" className="ml-auto" onClick={() => openQueue(wrongFiltered[0].questionId)}>
                      Review {wrongFiltered.length} in a queue <ChevronRight className="size-4" />
                    </Button>
                  )}
                </div>
                {wrongFiltered.length === 0 ? (
                  <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                    {allWrong.length === 0 ? "Nothing wrong yet — sit a block and misses land here." : "No misses match these filters."}
                  </p>
                ) : (
                  <ul className="divide-y">
                    {wrongFiltered.map((r) => (
                      <li key={r.questionId}>
                        <button onClick={() => openQueue(r.questionId)}
                          className="flex w-full items-center gap-3 px-1 py-2.5 text-left transition-colors hover:bg-accent">
                          <span className="w-28 shrink-0 text-xs tabular-nums text-muted-foreground">NBME {r.nbmeForm} · B{r.blockNumber} · Q{r.qNumber}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-800">{r.discipline} · {r.system}</span>
                            <span className="block text-xs text-muted-foreground">
                              {r.questionType}
                              {r.errorTag ? <> · <span className="text-amber-700">{ERROR_TAG_META[r.errorTag].label}</span></> : <> · <span className="text-slate-400">untagged</span></>}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            You <span className="font-semibold text-incorrect">{r.finalLetter ?? "—"}</span>
                            <span className="mx-1">·</span>
                            Correct <span className="font-semibold text-correct">{r.correctLetter}</span>
                          </span>
                          <ChevronRight className="size-4 shrink-0 text-slate-400" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent></Card>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function TagCard({ heading, rows }: { heading: string; rows: Bucket[] }) {
  return (
    <Card><CardContent className="p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{heading}</div>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : (
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

function ModeStat({ label, s }: { label: string; s: { total: number; correct: number; accuracy: number } }) {
  const w = Math.round(s.accuracy * 100);
  const tone = s.total === 0 ? "text-slate-400" : w >= 70 ? "text-correct" : w >= 55 ? "text-amber-600" : "text-incorrect";
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-bold tabular-nums", tone)}>{s.total ? `${w}%` : "—"}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{s.total ? `${s.correct}/${s.total} correct` : "no sittings"}</div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-slate-700">
      <option value="">{label}: all</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function ErrorTagSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-slate-700">
      <option value="">Error type: all</option>
      {ERROR_TAGS.map((t) => <option key={t} value={t}>{ERROR_TAG_META[t as ErrorTag].label}</option>)}
      <option value="__untagged">Untagged</option>
    </select>
  );
}

// ── small presentational pieces ───────────────────────────────────────────────
function SectionHead({ icon: Icon, title, sub, scope }: { icon: typeof Repeat; title: string; sub: string; scope?: string }) {
  return (
    <div className="mb-3 flex items-start gap-2.5">
      <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
          {scope && (
            <span className="rounded-full border border-primary/30 bg-accent px-2 py-0.5 text-xs font-medium text-primary">
              {scope}
            </span>
          )}
        </div>
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

const acc = (b: Bucket) => (b.total ? `${Math.round(b.accuracy * 100)}% · ${b.correct}/${b.total}` : "—");

function outcomeBadge(o: QDrillRow["outcome"]) {
  if (o == null) return <span className="text-slate-400">—</span>;
  const map: Record<string, { label: string; cls: string }> = {
    unchanged: { label: "kept", cls: "text-slate-500" },
    incorrect_to_correct: { label: "→ fixed", cls: "text-correct" },
    wrong_to_wrong: { label: "→ still wrong", cls: "text-amber-600" },
    correct_to_incorrect: { label: "→ broke it", cls: "text-incorrect font-semibold" },
  };
  const m = map[o] ?? { label: o, cls: "text-slate-500" };
  return <span className={cn("text-xs", m.cls)}>{m.label}</span>;
}
