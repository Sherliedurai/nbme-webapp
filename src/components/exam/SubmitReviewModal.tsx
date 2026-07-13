import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Flag, X } from "lucide-react";

export interface SubmitCell {
  answered: boolean;
  flagged: boolean;
}

interface Props {
  open: boolean;
  cells: SubmitCell[];
  onJump: (index: number) => void;
  onSubmit: () => void;
  onClose: () => void;
  submitLabel?: string;
}

export default function SubmitReviewModal({
  open,
  cells,
  onJump,
  onSubmit,
  onClose,
  submitLabel = "Submit block",
}: Props) {
  if (!open) return null;
  const answered = cells.filter((c) => c.answered).length;
  const flagged = cells.filter((c) => c.flagged).length;
  const unanswered = cells.length - answered;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-xl border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-base font-semibold text-slate-800">Review before submitting</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="size-4" /></Button>
        </div>

        <div className="px-5 py-4">
          <div className="mb-4 flex flex-wrap gap-2 text-sm">
            <span className="rounded-md bg-primary/10 px-3 py-1 font-medium text-primary">Answered {answered}/{cells.length}</span>
            <span className={cn("rounded-md px-3 py-1 font-medium",
              unanswered ? "bg-slate-100 text-slate-600" : "bg-correct-soft text-correct")}>
              Unanswered {unanswered}
            </span>
            <span className={cn("flex items-center gap-1 rounded-md px-3 py-1 font-medium",
              flagged ? "bg-flagged-soft text-flagged" : "bg-slate-100 text-slate-500")}>
              <Flag className={cn("size-3.5", flagged && "fill-flagged")} /> Flagged {flagged}
            </span>
          </div>

          <p className="mb-3 text-xs text-muted-foreground">
            Tap a question to jump back. Unanswered are outlined; flagged carry a marker.
          </p>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
            {cells.map((c, i) => (
              <button
                key={i}
                onClick={() => onJump(i)}
                className={cn(
                  "relative grid h-9 place-items-center rounded-md border text-sm font-medium transition-colors",
                  c.answered
                    ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
                    : "border-dashed border-slate-300 bg-card text-slate-500 hover:bg-accent"
                )}
              >
                {i + 1}
                {c.flagged && <Flag className="absolute -right-1 -top-1 size-3 fill-flagged text-flagged" />}
              </button>
            ))}
          </div>

          {unanswered > 0 && (
            <p className="mt-3 rounded-md bg-flagged-soft px-3 py-2 text-xs text-flagged">
              {unanswered} unanswered question{unanswered > 1 ? "s" : ""} will be scored as incorrect.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <Button variant="outline" onClick={onClose}>Keep working</Button>
          <Button onClick={onSubmit}>{submitLabel}</Button>
        </div>
      </div>
    </div>
  );
}
