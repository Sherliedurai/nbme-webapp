import { cn } from "@/lib/utils";
import { Ban, Check, X } from "lucide-react";
import type { QuestionOption } from "@/lib/types";

interface Props {
  option: QuestionOption;
  selected: boolean;
  struck: boolean;
  onClick: () => void;
  onToggleStrike: () => void;
  /** True while the strikethrough pen is armed — the whole card strikes. */
  strikeMode?: boolean;
  /** Review/practice reveal: mark the correct option green, a wrong pick red. */
  reveal?: "correct" | "wrong" | null;
  /** Locked once revealed — no selecting/striking. */
  disabled?: boolean;
}

export default function OptionCard({
  option,
  selected,
  struck,
  onClick,
  onToggleStrike,
  strikeMode = false,
  reveal = null,
  disabled = false,
}: Props) {
  const interactive = !disabled;
  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-lg border bg-card px-4 py-3 transition-all",
        !disabled && "cursor-pointer",
        !disabled && !struck && !strikeMode && "hover:border-primary/50 hover:bg-accent",
        !disabled && strikeMode && "hover:border-flagged/60 hover:bg-flagged-soft",
        struck && "opacity-55",
        selected && !struck && !reveal && "border-primary bg-accent ring-1 ring-primary",
        reveal === "correct" && "border-correct bg-correct-soft ring-1 ring-correct",
        reveal === "wrong" && "border-incorrect bg-incorrect-soft ring-1 ring-incorrect"
      )}
      onClick={() => interactive && onClick()}
      role="button"
      aria-pressed={selected}
      data-option={option.letter}
    >
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full border text-sm font-semibold",
          reveal === "correct"
            ? "border-correct bg-correct text-correct-foreground"
            : reveal === "wrong"
              ? "border-incorrect bg-incorrect text-incorrect-foreground"
              : selected && !struck
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-secondary text-slate-600"
        )}
      >
        {reveal === "correct" ? <Check className="size-4" /> : reveal === "wrong" ? <X className="size-4" /> : option.letter}
      </span>

      <span
        className={cn(
          "flex-1 text-[0.975rem] leading-snug text-slate-800",
          struck && "text-slate-400 line-through"
        )}
      >
        {option.text || <em className="text-slate-400">(see image above)</em>}
      </span>

      {reveal && (
        <span
          className={cn(
            "shrink-0 text-xs font-semibold",
            reveal === "correct" ? "text-correct" : "text-incorrect"
          )}
        >
          {reveal === "correct" ? "Correct" : "Your answer"}
        </span>
      )}

      {interactive && !strikeMode && (
        <button
          type="button"
          title={struck ? "Un-strike" : "Strike out (eliminate)"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleStrike();
          }}
          // Always visible (works on touch), just subtle until hover/struck.
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-md text-slate-400 transition-colors hover:bg-secondary hover:text-slate-700",
            struck ? "text-slate-500" : "opacity-60 group-hover:opacity-100"
          )}
        >
          <Ban className="size-4" />
        </button>
      )}
    </div>
  );
}
