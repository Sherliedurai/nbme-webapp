import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getForms, getUnfinishedBlock, type FormSummary } from "@/lib/queries";
import type { BlockSession } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, BookOpen, LogOut, PlayCircle, Timer, Layers, FileText, SlidersHorizontal, RotateCcw } from "lucide-react";

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
  const [resume, setResume] = useState<BlockSession | null>(null);

  useEffect(() => {
    getForms()
      .then((fs) => {
        setForms(fs);
        if (fs.length === 1) setForm(fs[0].form); // single form → skip the pick
      })
      .catch((e) => setError(e.message ?? "Failed to load forms"));
  }, []);

  useEffect(() => {
    if (!user) return;
    getUnfinishedBlock(user.id).then(setResume).catch(() => {});
  }, [user]);

  const active = MODES.find((m) => m.id === mode)!;
  const selected = forms?.find((f) => f.form === form) ?? null;

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

        {/* ── Resume where you left off ───────────────────────────────────── */}
        {resume && resume.nbme_form != null && resume.block_number != null && (
          <div className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-primary/40 bg-accent px-5 py-4">
            <div className="flex items-center gap-3">
              <RotateCcw className="size-5 shrink-0 text-primary" />
              <div>
                <div className="text-sm font-semibold text-slate-800">Resume where you left off</div>
                <div className="text-xs text-muted-foreground">
                  NBME {resume.nbme_form} · Block {resume.block_number} — timed block in progress{resume.paused ? " · interrupted" : ""}.
                </div>
              </div>
            </div>
            <Button size="sm" onClick={() => navigate(`/exam/${resume.nbme_form}/${resume.block_number}`)}>
              <PlayCircle className="size-4" /> Resume
            </Button>
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
          {(forms ?? []).map((f) => (
            <button
              key={f.form}
              onClick={() => setForm(f.form)}
              className={cn(
                "flex flex-col items-start gap-1.5 rounded-lg border p-4 text-left transition-colors",
                form === f.form ? "border-primary bg-accent ring-1 ring-primary" : "border-border bg-card hover:bg-accent"
              )}
            >
              <FileText className={cn("size-5", form === f.form ? "text-primary" : "text-slate-500")} />
              <div className="font-semibold text-slate-800">NBME {f.form}</div>
              <div className="text-xs text-muted-foreground">{f.blockCount} block{f.blockCount === 1 ? "" : "s"} · {f.questionCount} Q</div>
            </button>
          ))}
        </div>

        {/* ── Step 2: pick a mode (only after a form is chosen) ────────────── */}
        {selected && (
          <>
            <div className="mt-10">
              <h2 className="text-2xl font-semibold text-slate-800">
                NBME {selected.form} · <span className="text-slate-500">start studying</span>
              </h2>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={cn(
                    "flex flex-col items-start gap-1.5 rounded-lg border p-4 text-left transition-colors",
                    mode === m.id ? "border-primary bg-accent ring-1 ring-primary" : "border-border bg-card hover:bg-accent"
                  )}
                >
                  <m.icon className={cn("size-5", mode === m.id ? "text-primary" : "text-slate-500")} />
                  <div className="font-semibold text-slate-800">{m.label}</div>
                  <div className="text-xs text-muted-foreground">{m.blurb}</div>
                </button>
              ))}
            </div>

            {/* ── Step 3: block picker / full-exam launcher ─────────────────── */}
            <div className="mt-8">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{active.label}</h3>
              <p className="mb-4 mt-1 text-sm text-muted-foreground">{active.blurb}</p>

              {mode === "full_exam" ? (
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
                  {Array.from({ length: selected.blockCount }, (_, i) => i + 1).map((n) => (
                    <Card key={n} className="transition-shadow hover:shadow-md">
                      <CardContent className="flex flex-col items-start gap-3 p-4">
                        <div>
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">Block</div>
                          <div className="text-2xl font-semibold text-slate-800">{n}</div>
                        </div>
                        <Button size="sm" className="w-full"
                          onClick={() => navigate(`/${mode === "practice" ? "practice" : "exam"}/${selected.form}/${n}`)}>
                          <PlayCircle className="size-4" /> Start
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
