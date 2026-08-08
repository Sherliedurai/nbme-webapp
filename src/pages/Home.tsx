import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getAttemptsWithQuestions, getCompletedBlocks, getForms, getResumableSessions, type FormSummary } from "@/lib/queries";
import type { BlockSession } from "@/lib/types";
import { blocksForForm, canonicalizeAttempts, modeClass, type AnalyticsAttempt, type BlockSummary } from "@/lib/analytics";
import { useFormModes } from "@/hooks/useFormModes";
import {
  ALL_FORM_MODES, FORM_MODE_LABELS, HOME_MODE_TO_FORM_MODE, allowsMode, formInfo, isAdjudicable, isExamReserved,
  type FormMode, type FormModeInfo,
} from "@/lib/formModes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, BookOpen, CheckCircle2, LogOut, PlayCircle, Timer, Layers, FileText, SlidersHorizontal, RotateCcw, Lock, ShieldAlert } from "lucide-react";

type Mode = "practice" | "block" | "full_exam";

const MODES: { id: Mode; label: string; icon: typeof BookOpen; blurb: string }[] = [
  { id: "practice", label: "Practice", icon: BookOpen, blurb: "Untimed. See the answer + explanation right after each question." },
  { id: "block", label: "Timed block", icon: Timer, blurb: "20 questions, 30:00 countdown. Explanations after you submit." },
  { id: "full_exam", label: "Full exam", icon: Layers, blurb: "All blocks of this form back-to-back, 30:00 each, breaks between. Review at the end." },
];

export default function Home() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [forms, setForms] = useState<FormSummary[] | null>(null);
  const [form, setForm] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("practice");
  const [error, setError] = useState<string | null>(null);
  const [resumables, setResumables] = useState<BlockSession[]>([]);
  const [completed, setCompleted] = useState<{ mode: string; form: number | null; block: number | null }[]>([]);
  const [attempts, setAttempts] = useState<AnalyticsAttempt[]>([]);
  const modes = useFormModes(); // per-form gating from form_modes (null until loaded)

  useEffect(() => {
    getForms()
      .then((fs) => {
        setForms(fs);
        if (fs.length === 1) setForm(fs[0].form); // single form → skip the pick
      })
      .catch((e) => setError(e.message ?? "Failed to load forms"));
  }, []);

  // Fail-open forms (in the bank but absent from form_modes) default to all modes —
  // warn once each so a missing curation row is visible, never silent.
  const warnedRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!forms || !modes) return;
    for (const f of forms)
      if (!modes.has(f.form) && !warnedRef.current.has(f.form)) {
        warnedRef.current.add(f.form);
        console.warn(`[nbme] form ${f.form} has no form_modes row — defaulting to all modes allowed (fail-open).`);
      }
  }, [forms, modes]);

  useEffect(() => {
    if (!user) return;
    getResumableSessions(user.id).then(setResumables).catch(() => {});
    getCompletedBlocks(user.id).then(setCompleted).catch(() => {});
    // Canonical (one attempt per question per mode-class) so a completed block's
    // score reads 18/20, never an inflated 36/40 from a reopened sitting.
    getAttemptsWithQuestions(user.id).then((raw) => setAttempts(canonicalizeAttempts(raw))).catch(() => {});
  }, [user]);

  const selected = forms?.find((f) => f.form === form) ?? null;

  // ── Per-form mode gating (all derived from form_modes; no hardcoded forms) ──
  const selectedInfo = selected ? formInfo(modes, selected.form) : null;
  const allowedHomeModes = useMemo(
    () => (selectedInfo ? MODES.filter((m) => allowsMode(selectedInfo, HOME_MODE_TO_FORM_MODE[m.id])) : []),
    [selectedInfo]
  );
  const examReserved = !!selectedInfo && isExamReserved(selectedInfo);
  // A form with no Home mode (practice/timed/exam) but 'custom' — steer to the builder.
  const customOnly = !!selectedInfo && allowedHomeModes.length === 0 && allowsMode(selectedInfo, "custom");

  // What actually renders: the user's mode if the form permits it, else its first
  // allowed one — so an exam-reserved form never flashes a practice grid before the
  // snap-to-allowed effect fires.
  const effectiveMode: Mode =
    selectedInfo && !allowsMode(selectedInfo, HOME_MODE_TO_FORM_MODE[mode]) ? (allowedHomeModes[0]?.id ?? mode) : mode;
  const active = MODES.find((m) => m.id === effectiveMode)!;
  const gridClass = effectiveMode === "practice" ? "practice" : "timed"; // grid modes: practice | block

  // Persist the snap so downstream state (and a later re-select) stays consistent.
  useEffect(() => {
    if (selectedInfo && effectiveMode !== mode) setMode(effectiveMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, modes]);

  // Which (form, block) are finished in the CURRENT grid's mode-class. A full_exam
  // sitting finishes every block of its form, so it marks them all timed-complete.
  const completedBlocks = useMemo(() => {
    const s = new Set<number>();
    if (!selected) return s;
    for (const c of completed) {
      if (c.form !== selected.form) continue;
      if (modeClass(c.mode) !== gridClass) continue;
      if (c.mode === "full_exam") { for (let b = 1; b <= selected.blockCount; b++) s.add(b); }
      else if (c.block != null) s.add(c.block);
    }
    return s;
  }, [completed, selected, gridClass]);

  // Per-block score for the current form, split timed vs practice (from analytics).
  const blockScores = useMemo(() => {
    const m = new Map<number, BlockSummary>();
    if (selected) for (const b of blocksForForm(attempts, selected.form)) m.set(b.block, b);
    return m;
  }, [attempts, selected]);

  // Per-form progress for the form-selection cards: DISTINCT blocks finished in ANY
  // mode (a full_exam covers every block of its form). Derived from DB is_complete.
  const formProgress = useMemo(() => {
    const m = new Map<number, Set<number>>();
    for (const c of completed) {
      if (c.form == null) continue;
      const bc = forms?.find((f) => f.form === c.form)?.blockCount ?? 0;
      let set = m.get(c.form);
      if (!set) { set = new Set(); m.set(c.form, set); }
      if (c.mode === "full_exam") { for (let b = 1; b <= bc; b++) set.add(b); }
      else if (c.block != null) set.add(c.block);
    }
    return m;
  }, [completed, forms]);

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between bg-navy px-6 py-3 text-navy-foreground">
        <div className="text-sm font-semibold uppercase tracking-widest">NBME Practice</div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-navy-foreground/70">{user?.email}</span>
          <Button variant="navy" size="sm" onClick={() => navigate("/custom")}><SlidersHorizontal className="size-4" /> Custom block</Button>
          <Button variant="navy" size="sm" onClick={() => navigate("/analytics")}><BarChart3 className="size-4" /> Progress</Button>
          <Button variant="navy" size="sm" onClick={() => signOut()}><LogOut className="size-4" /> Sign out</Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        {error && <p className="mb-6 rounded-md bg-incorrect-soft px-4 py-3 text-sm text-incorrect">{error}</p>}

        {/* ── Resume where you left off (timed + practice) ────────────────── */}
        {resumables.filter((r) => r.nbme_form != null && r.block_number != null).length > 0 && (
          <div className="mb-6 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <RotateCcw className="size-4 text-primary" /> Resume where you left off
            </div>
            {resumables.filter((r) => r.nbme_form != null && r.block_number != null).map((r) => {
              const timed = r.mode === "block";
              const label = timed ? "Timed block" : "Practice";
              const to = timed ? `/exam/${r.nbme_form}/${r.block_number}` : `/practice/${r.nbme_form}/${r.block_number}`;
              return (
                <div key={r.id} className="flex items-center justify-between gap-4 rounded-lg border border-primary/40 bg-accent px-5 py-3">
                  <div className="text-sm text-slate-700">
                    <span className={cn("mr-2 rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                      timed ? "bg-navy/10 text-navy" : "bg-primary/10 text-primary")}>{label}</span>
                    NBME {r.nbme_form} · Block {r.block_number}
                    {timed && r.paused && <span className="ml-2 text-xs text-amber-700">· interrupted</span>}
                  </div>
                  <Button size="sm" onClick={() => navigate(to)}><PlayCircle className="size-4" /> Resume</Button>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Step 1: pick a form ─────────────────────────────────────────── */}
        <h1 className="text-2xl font-semibold text-slate-800">Choose a form</h1>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">
          Each NBME form is scored on its own — pooling across forms hides the real signal.
        </p>

        {forms === null && !error && <p className="text-sm text-muted-foreground">Loading forms…</p>}
        {forms && forms.length === 0 && (
          <p className="text-sm text-muted-foreground">No forms loaded yet.</p>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          {(forms ?? []).map((f) => {
            const done = formProgress.get(f.form)?.size ?? 0;
            const allDone = done > 0 && done >= f.blockCount;
            const pct = f.blockCount ? Math.round((done / f.blockCount) * 100) : 0;
            const info = formInfo(modes, f.form);
            const reserved = isExamReserved(info);
            return (
              <button
                key={f.form}
                onClick={() => setForm(f.form)}
                className={cn(
                  "flex flex-col items-start gap-1.5 rounded-lg border p-4 text-left transition-colors",
                  form === f.form ? "border-primary bg-accent ring-1 ring-primary" : "border-border bg-card hover:bg-accent",
                  allDone && form !== f.form && "bg-muted/40"
                )}
              >
                <div className="flex w-full items-start justify-between">
                  <FileText className={cn("size-5", form === f.form ? "text-primary" : "text-slate-500")} />
                  {allDone && <CheckCircle2 className="size-5 text-correct" />}
                </div>
                <div className="font-semibold text-slate-800">NBME {f.form}</div>
                <div className="text-xs text-muted-foreground">{f.blockCount} block{f.blockCount === 1 ? "" : "s"} · {f.questionCount} Q</div>
                <ModeBadges info={info} />
                {reserved && (
                  <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
                    <Lock className="size-3" /> Reserved for diagnostic — kept unseen
                  </div>
                )}
                {isAdjudicable(info) && (
                  <div className="flex items-center gap-1 text-[11px] font-medium text-amber-700">
                    <ShieldAlert className="size-3" /> Answer key pending physician validation
                  </div>
                )}
                {done > 0 && (
                  <div className="mt-1 w-full">
                    <div className="flex items-center justify-between text-[11px] font-medium text-slate-600">
                      <span>{allDone ? "Complete" : "In progress"}</span>
                      <span className="tabular-nums">{done}/{f.blockCount} blocks done</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                      <div className={cn("h-full rounded-full", allDone ? "bg-correct" : "bg-primary")} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Step 2: pick a mode (only after a form is chosen) ────────────── */}
        {selected && selectedInfo && (
          <>
            <div className="mt-10">
              <h2 className="text-2xl font-semibold text-slate-800">
                NBME {selected.form} · <span className="text-slate-500">start studying</span>
              </h2>
              {examReserved && (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                  <Lock className="size-4" /> Reserved for the diagnostic sitting — kept unseen. Its only entry is a full exam.
                </p>
              )}
              {isAdjudicable(selectedInfo) && (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-amber-700">
                  <ShieldAlert className="size-4" /> Answer key pending physician validation.
                </p>
              )}
            </div>

            {customOnly ? (
              // No practice/timed/exam entry — this form is for custom drills only.
              <Card className="mt-5 max-w-md">
                <CardContent className="flex flex-col items-start gap-3 p-5">
                  <div className="text-sm text-slate-700">
                    {selectedInfo.note || "This form is reserved for custom blocks — build a targeted set from your weak areas."}
                  </div>
                  <Button onClick={() => navigate("/custom")}>
                    <SlidersHorizontal className="size-4" /> Build a custom block
                  </Button>
                </CardContent>
              </Card>
            ) : (
            <>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {MODES.map((m) => {
                const allowed = allowsMode(selectedInfo, HOME_MODE_TO_FORM_MODE[m.id]);
                return (
                  <button
                    key={m.id}
                    onClick={() => allowed && setMode(m.id)}
                    disabled={!allowed}
                    title={allowed ? undefined : selectedInfo.note || `Not available for NBME ${selected.form}.`}
                    className={cn(
                      "flex flex-col items-start gap-1.5 rounded-lg border p-4 text-left transition-colors",
                      !allowed
                        ? "cursor-not-allowed border-dashed border-border bg-muted/30 opacity-60"
                        : effectiveMode === m.id ? "border-primary bg-accent ring-1 ring-primary" : "border-border bg-card hover:bg-accent"
                    )}
                  >
                    <m.icon className={cn("size-5", !allowed ? "text-slate-400" : effectiveMode === m.id ? "text-primary" : "text-slate-500")} />
                    <div className={cn("font-semibold", allowed ? "text-slate-800" : "text-slate-500")}>{m.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {allowed ? m.blurb : (selectedInfo.note || "Not available for this form.")}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* ── Step 3: block picker / full-exam launcher ─────────────────── */}
            <div className="mt-8">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{active.label}</h3>
              <p className="mb-4 mt-1 text-sm text-muted-foreground">{active.blurb}</p>

              {effectiveMode === "full_exam" ? (
                <Card className="max-w-md">
                  <CardContent className="flex flex-col items-start gap-3 p-5">
                    <div className="text-sm text-slate-700">
                      {selected.blockCount} block{selected.blockCount === 1 ? "" : "s"} × 20 questions · 30:00 each · break between blocks.
                      No explanations until the whole exam is submitted.
                    </div>
                    <Button onClick={() => navigate(`/exam-full/${selected.form}`)}>
                      <PlayCircle className="size-4" /> Start full exam
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                  {Array.from({ length: selected.blockCount }, (_, i) => i + 1).map((n) => {
                    const done = completedBlocks.has(n);
                    const b = blockScores.get(n);
                    const score = done ? (gridClass === "practice" ? b?.practice : b?.timed) : undefined;
                    const to = `/${effectiveMode === "practice" ? "practice" : "exam"}/${selected.form}/${n}`;
                    return (
                      <Card key={n} className={cn("transition-shadow hover:shadow-md", done && "bg-muted/40 border-dashed")}>
                        <CardContent className="flex flex-col items-start gap-3 p-4">
                          <div className="flex w-full items-start justify-between">
                            <div>
                              <div className="text-xs uppercase tracking-wide text-muted-foreground">Block</div>
                              <div className={cn("text-2xl font-semibold", done ? "text-slate-500" : "text-slate-800")}>{n}</div>
                            </div>
                            {done && <CheckCircle2 className="size-5 shrink-0 text-correct" />}
                          </div>
                          {done && score && score.total > 0 && (
                            <div className="text-xs font-medium text-slate-600">
                              {score.correct}/{score.total} · {Math.round(score.accuracy * 100)}%
                            </div>
                          )}
                          <Button size="sm" variant={done ? "outline" : "default"} className="w-full"
                            onClick={() => navigate(to)}>
                            {done ? <><BookOpen className="size-4" /> Review</> : <><PlayCircle className="size-4" /> Start</>}
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
            </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

/** Small pills showing which modes a form permits (from form_modes). */
function ModeBadges({ info }: { info: FormModeInfo }) {
  const allowed = ALL_FORM_MODES.filter((m) => info.allowedModes.includes(m));
  if (allowed.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {allowed.map((m: FormMode) => (
        <span key={m} className="rounded border border-border bg-muted/60 px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wide text-slate-600">
          {FORM_MODE_LABELS[m]}
        </span>
      ))}
    </div>
  );
}
