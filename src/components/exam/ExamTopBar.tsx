import { Button } from "@/components/ui/button";
import { cn, formatClock } from "@/lib/utils";
import { Clock, Flag } from "lucide-react";

interface Props {
  blockNumber: number;
  blockCount: number;
  currentIndex: number;
  total: number;
  answeredCount: number;
  flaggedCount?: number;
  secondsRemaining: number;
  onEndBlock: () => void;
  onEndExam: () => void;
}

export default function ExamTopBar({
  blockNumber,
  blockCount,
  currentIndex,
  total,
  answeredCount,
  flaggedCount = 0,
  secondsRemaining,
  onEndBlock,
  onEndExam,
}: Props) {
  const low = secondsRemaining <= 60; // last minute → red pulse
  return (
    <header className="flex items-center justify-between gap-4 bg-navy px-4 py-2.5 text-navy-foreground">
      <div className="flex items-center gap-5 text-sm">
        <span className="font-semibold uppercase tracking-widest">NBME</span>
        <span className="text-navy-foreground/80">
          Block <strong className="text-navy-foreground">{blockNumber}</strong> of {blockCount}
        </span>
        <span className="text-navy-foreground/80">
          Q <strong className="text-navy-foreground">{currentIndex + 1}</strong> of {total}
        </span>
      </div>

      <div
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-1 font-mono text-base tabular-nums",
          low ? "animate-pulse bg-incorrect text-incorrect-foreground" : "bg-white/10"
        )}
        title="Time remaining — auto-submits at 0:00"
      >
        <Clock className="size-4" />
        {formatClock(secondsRemaining)}
      </div>

      <div className="flex items-center gap-3">
        <span className="rounded-md bg-white/10 px-2.5 py-1 text-xs tabular-nums" title="Questions answered (correctness hidden until submit)">
          Answered {answeredCount}/{total}
        </span>
        {flaggedCount > 0 && (
          <button onClick={onEndBlock}
            className="inline-flex items-center gap-1 rounded-md bg-flagged-soft px-2.5 py-1 text-xs font-medium tabular-nums text-flagged hover:opacity-90"
            title="Flagged for review — click to review & submit">
            <Flag className="size-3.5 fill-flagged" /> {flaggedCount} flagged
          </button>
        )}
        <Button variant="secondary" size="sm" onClick={onEndBlock}>
          Review &amp; End Block
        </Button>
        <Button variant="destructive" size="sm" onClick={onEndExam}>
          End Exam
        </Button>
      </div>
    </header>
  );
}
