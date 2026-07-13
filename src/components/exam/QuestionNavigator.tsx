import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Flag } from "lucide-react";

export type NavState = "unvisited" | "answered" | "correct" | "incorrect";

export interface NavCell {
  state: NavState;
  flagged: boolean;
}

interface Props {
  cells: NavCell[];
  currentIndex: number;
  onJump: (index: number) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** "exam" hides correctness; "review" shows correct/incorrect. */
  mode: "exam" | "review";
}

function cellClasses(cell: NavCell, isCurrent: boolean): string {
  const base =
    "relative grid h-9 w-9 place-items-center rounded-md border text-sm font-medium transition-colors";
  const byState: Record<NavState, string> = {
    unvisited: "border-border bg-card text-slate-500 hover:bg-accent",
    answered: "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20",
    correct: "border-correct/40 bg-correct-soft text-correct hover:bg-correct/20",
    incorrect: "border-incorrect/40 bg-incorrect-soft text-incorrect hover:bg-incorrect/20",
  };
  return cn(base, byState[cell.state], isCurrent && "ring-2 ring-primary ring-offset-1");
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("size-3.5 rounded-[4px] border", className)} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export default function QuestionNavigator({
  cells,
  currentIndex,
  onJump,
  collapsed,
  onToggleCollapse,
  mode,
}: Props) {
  if (collapsed) {
    return (
      <div className="flex flex-col items-center border-r bg-card py-3">
        <Button variant="ghost" size="icon" onClick={onToggleCollapse} title="Show navigator">
          <ChevronRight className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-semibold text-slate-700">Navigator</span>
        <Button variant="ghost" size="icon" onClick={onToggleCollapse} title="Collapse">
          <ChevronLeft className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-5 gap-2 p-4">
        {cells.map((cell, i) => (
          <button key={i} className={cellClasses(cell, i === currentIndex)} onClick={() => onJump(i)}>
            {i + 1}
            {cell.flagged && (
              <Flag className="absolute -right-1 -top-1 size-3 fill-flagged text-flagged" />
            )}
          </button>
        ))}
      </div>

      <div className="mt-auto space-y-2 border-t px-4 py-4">
        <LegendDot className="border-border bg-card" label="Unvisited" />
        {mode === "exam" ? (
          <LegendDot className="border-primary/30 bg-primary/10" label="Answered" />
        ) : (
          <>
            <LegendDot className="border-correct/40 bg-correct-soft" label="Correct" />
            <LegendDot className="border-incorrect/40 bg-incorrect-soft" label="Incorrect" />
          </>
        )}
        <LegendDot className="border-primary bg-card ring-2 ring-primary" label="Current" />
        <div className="flex items-center gap-2">
          <Flag className="size-3.5 fill-flagged text-flagged" />
          <span className="text-xs text-muted-foreground">Flagged</span>
        </div>
      </div>
    </aside>
  );
}
