import { type ReactNode } from "react";
import type { FullQuestion } from "@/lib/types";
import { cn, formatDuration } from "@/lib/utils";
import { CheckCircle2, XCircle } from "lucide-react";
import ExplanationFeedback from "./ExplanationFeedback";

/** Render **bold** key words in enrichment text. */
function bold(text: string): ReactNode[] {
  return (text || "").split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>
  );
}

function SourceChip({ source }: { source: string }) {
  const model = !source || source === "model";
  return (
    <span
      className={cn(
        "ml-1 inline-block rounded-full border px-2 py-[1px] align-baseline text-[0.68rem] font-semibold",
        model ? "border-flagged/40 bg-flagged-soft text-flagged" : "border-correct/30 bg-correct-soft text-correct"
      )}
    >
      {model ? "model-generated" : source}
    </span>
  );
}

function Section({ label, color, tinted, children }: { label: string; color: string; tinted?: boolean; children: ReactNode }) {
  return (
    <div className={cn(tinted && "rounded-lg border border-[#e5ddff] bg-[#f7f5ff] px-4 py-3")}>
      <h3 className={cn("mb-1 text-[0.7rem] font-extrabold uppercase tracking-wider", color)}>{label}</h3>
      {children}
    </div>
  );
}

interface Props {
  question: FullQuestion;
  selectedLetter: string | null;
  secondsSpent?: number | null;
}

export default function ExplanationPanel({ question, selectedLetter, secondsSpent }: Props) {
  const e = question.enriched_explanation;
  const correct = selectedLetter != null && selectedLetter === question.correct_letter;

  return (
    <div className="flex h-full flex-col bg-card">
      {/* Status header */}
      <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
        {selectedLetter == null ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">
            Unanswered — Answer: {question.correct_letter}
          </span>
        ) : correct ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-correct-soft px-3 py-1 text-sm font-semibold text-correct">
            <CheckCircle2 className="size-4" /> Correct
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-incorrect-soft px-3 py-1 text-sm font-semibold text-incorrect">
            <XCircle className="size-4" /> Incorrect — Answer: {question.correct_letter}
          </span>
        )}
        {secondsSpent != null && (
          <span className="text-xs text-muted-foreground">Time: {formatDuration(secondsSpent)}</span>
        )}
        <ExplanationFeedback questionId={question.id} />
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-[0.95rem] leading-relaxed text-slate-800">
        {!e ? (
          <p className="text-sm text-muted-foreground">No enrichment for this question yet.</p>
        ) : (
          <>
            <Section label="Bottom line" color="text-[#1d4ed8]">
              <p>{bold(e.answer_lock)}</p>
            </Section>
            <Section label="Remember it as" color="text-[#7c3aed]" tinted>
              <p className="italic text-[#4c1d95]">{bold(e.hook)}</p>
            </Section>
            <Section label="Watch out for" color="text-[#b45309]">
              <ul className="list-disc space-y-1.5 pl-5">
                {e.knockdowns.map((k, i) => (
                  <li key={i}><strong>{k.option}</strong> — {bold(k.reason)}</li>
                ))}
              </ul>
            </Section>
            <Section label="High yield" color="text-[#0f766e]">
              <ul className="list-disc space-y-2 pl-5">
                {e.high_yield.map((h, i) => (
                  <li key={i}>{bold(h.fact)} <SourceChip source={h.source} /></li>
                ))}
              </ul>
            </Section>
            <Section label="How they test it" color="text-[#9d174d]">
              <ul className="list-disc space-y-2 pl-5">
                {e.how_they_test.map((t, i) => (
                  <li key={i}>
                    <span className="text-slate-600">{bold(t.scenario)}</span> → <strong>{bold(t.answer)}</strong>{" "}
                    <SourceChip source={t.source} />
                  </li>
                ))}
              </ul>
            </Section>
          </>
        )}

        <details className="rounded-lg border bg-muted/30">
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-navy">
            Full NBME explanation
          </summary>
          <div className="whitespace-pre-wrap px-4 py-3 font-serif text-[0.95rem] leading-relaxed text-slate-700">
            {question.source_explanation}
          </div>
        </details>
      </div>
    </div>
  );
}
