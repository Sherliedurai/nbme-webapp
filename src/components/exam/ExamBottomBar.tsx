import { Button } from "@/components/ui/button";
import { Calculator, ChevronLeft, ChevronRight, FlaskConical, PauseCircle } from "lucide-react";

interface Props {
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSuspend: () => void;
  onLabValues: () => void;
  onCalculator: () => void;
}

export default function ExamBottomBar({
  canPrev,
  canNext,
  onPrev,
  onNext,
  onSuspend,
  onLabValues,
  onCalculator,
}: Props) {
  return (
    <footer className="flex items-center justify-between border-t bg-card px-4 py-2.5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onSuspend} title="Suspend — save & exit">
          <PauseCircle className="size-4" /> Suspend
        </Button>
        <Button variant="ghost" size="sm" onClick={onLabValues}>
          <FlaskConical className="size-4" /> Lab Values
        </Button>
        <Button variant="ghost" size="sm" onClick={onCalculator}>
          <Calculator className="size-4" /> Calculator
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onPrev} disabled={!canPrev}>
          <ChevronLeft className="size-4" /> Previous
        </Button>
        <Button size="sm" onClick={onNext} disabled={!canNext}>
          Next <ChevronRight className="size-4" />
        </Button>
      </div>
    </footer>
  );
}
