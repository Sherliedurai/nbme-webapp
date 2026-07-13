import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getBlockCount } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, LogOut, PlayCircle, Timer, Layers } from "lucide-react";

type Mode = "practice" | "block" | "full_exam";

const MODES: { id: Mode; label: string; icon: typeof BookOpen; blurb: string }[] = [
  { id: "practice", label: "Practice", icon: BookOpen, blurb: "Untimed. See the answer + explanation right after each question." },
  { id: "block", label: "Timed block", icon: Timer, blurb: "20 questions, 30:00 countdown. Explanations after you submit." },
  { id: "full_exam", label: "Full exam", icon: Layers, blurb: "All blocks back-to-back, 30:00 each, breaks between. Review at the end." },
];

export default function Home() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("practice");
  const [blockCount, setBlockCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBlockCount().then(setBlockCount).catch((e) => setError(e.message ?? "Failed to load blocks"));
  }, []);

  const active = MODES.find((m) => m.id === mode)!;

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between bg-navy px-6 py-3 text-navy-foreground">
        <div className="text-sm font-semibold uppercase tracking-widest">NBME Practice</div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-navy-foreground/70">{user?.email}</span>
          <Button variant="navy" size="sm" onClick={() => signOut()}><LogOut className="size-4" /> Sign out</Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-semibold text-slate-800">Start studying</h1>

        {/* Mode selector */}
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

        {error && <p className="mt-6 rounded-md bg-incorrect-soft px-4 py-3 text-sm text-incorrect">{error}</p>}

        {/* Block picker (practice / block) or full-exam launcher */}
        <div className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{active.label}</h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">{active.blurb}</p>

          {mode === "full_exam" ? (
            <Card className="max-w-md">
              <CardContent className="flex flex-col items-start gap-3 p-5">
                <div className="text-sm text-slate-700">
                  {blockCount ?? "…"} block{blockCount === 1 ? "" : "s"} × 20 questions · 30:00 each · break between blocks.
                  No explanations until the whole exam is submitted.
                </div>
                <Button onClick={() => navigate("/exam-full")}><PlayCircle className="size-4" /> Start full exam</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {blockCount === null && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
              {blockCount !== null &&
                Array.from({ length: blockCount }, (_, i) => i + 1).map((n) => (
                  <Card key={n} className="transition-shadow hover:shadow-md">
                    <CardContent className="flex flex-col items-start gap-3 p-4">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Block</div>
                        <div className="text-2xl font-semibold text-slate-800">{n}</div>
                      </div>
                      <Button size="sm" className="w-full" onClick={() => navigate(`/${mode === "practice" ? "practice" : "exam"}/${n}`)}>
                        <PlayCircle className="size-4" /> Start
                      </Button>
                    </CardContent>
                  </Card>
                ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
