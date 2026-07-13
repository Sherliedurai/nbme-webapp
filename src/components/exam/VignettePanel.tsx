import { useRef } from "react";
import type { ExamQuestion } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import OptionCard from "./OptionCard";
import ClinicalImage from "./ClinicalImage";
import { Eraser, Flag, Highlighter, Strikethrough } from "lucide-react";

interface Props {
  question: ExamQuestion;
  selectedLetter: string | null;
  struckLetters: string[];
  highlightHtml: string | null;
  strikeMode: boolean;
  flagged: boolean;
  onToggleStrikeMode: () => void;
  onToggleFlag: () => void;
  onSelect: (letter: string) => void;
  onToggleStrike: (letter: string) => void;
  onChangeHighlight: (html: string | null) => void;
  /** Reveal mode (practice / review): show correct/wrong, lock the options, hide tools. */
  revealed?: boolean;
  correctLetter?: string | null;
}

export default function VignettePanel(props: Props) {
  const {
    question,
    selectedLetter,
    struckLetters,
    highlightHtml,
    strikeMode,
    flagged,
    onToggleStrikeMode,
    onToggleFlag,
    onSelect,
    onToggleStrike,
    onChangeHighlight,
    revealed = false,
    correctLetter = null,
  } = props;

  const proseRef = useRef<HTMLDivElement>(null);

  function applyHighlight() {
    const container = proseRef.current;
    const sel = window.getSelection();
    if (!container || !sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;
    const span = document.createElement("span");
    span.className = "hl";
    try {
      range.surroundContents(span);
    } catch {
      const frag = range.extractContents();
      span.appendChild(frag);
      range.insertNode(span);
    }
    sel.removeAllRanges();
    onChangeHighlight(container.innerHTML);
  }

  // Parent-controlled option click: strike-mode toggles strike; a struck option
  // un-strikes; otherwise select. Locked once revealed.
  function onCardClick(letter: string) {
    if (revealed) return;
    if (strikeMode) return onToggleStrike(letter);
    if (struckLetters.includes(letter)) return onToggleStrike(letter);
    onSelect(letter);
  }

  function revealFor(letter: string): "correct" | "wrong" | null {
    if (!revealed || !correctLetter) return null;
    if (letter === correctLetter) return "correct";
    if (letter === selectedLetter && selectedLetter !== correctLetter) return "wrong";
    return null;
  }

  // Keep the mouse selection alive: a plain button's mousedown clears the
  // selection before onClick runs — preventDefault stops that.
  const keepSelection = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      {!revealed && (
        <div className="mb-4 flex items-center gap-2">
          <Button variant="outline" size="sm" onMouseDown={keepSelection} onClick={applyHighlight}
            title="Select vignette text, then click Highlight">
            <Highlighter className="size-4" /> Highlight
          </Button>
          {highlightHtml && (
            <Button variant="ghost" size="sm" onMouseDown={keepSelection}
              onClick={() => onChangeHighlight(null)} title="Clear highlights">
              <Eraser className="size-4" /> Clear
            </Button>
          )}
          <Button variant={strikeMode ? "default" : "outline"} size="sm" onClick={onToggleStrikeMode}
            title="Strike mode — click options to cross them out. (The ✗ on each option always works too.)">
            <Strikethrough className="size-4" /> Strikethrough
          </Button>
          <div className="ml-auto">
            <Button variant={flagged ? "default" : "outline"} size="sm" onClick={onToggleFlag}
              className={cn(flagged && "bg-flagged text-flagged-foreground hover:bg-flagged/90")}
              title="Flag for review">
              <Flag className={cn("size-4", flagged && "fill-current")} /> {flagged ? "Flagged" : "Flag"}
            </Button>
          </div>
        </div>
      )}

      {highlightHtml ? (
        <div ref={proseRef} className="vignette-prose" dangerouslySetInnerHTML={{ __html: highlightHtml }} />
      ) : (
        <div ref={proseRef} className="vignette-prose">{question.vignette_text}</div>
      )}

      {question.clinical_image_url && <ClinicalImage objectPath={question.clinical_image_url} />}

      <div className="mt-6 space-y-2.5">
        {question.options.map((opt) => (
          <OptionCard
            key={opt.letter}
            option={opt}
            selected={selectedLetter === opt.letter}
            struck={struckLetters.includes(opt.letter)}
            reveal={revealFor(opt.letter)}
            disabled={revealed}
            onClick={() => onCardClick(opt.letter)}
            onToggleStrike={() => onToggleStrike(opt.letter)}
          />
        ))}
      </div>

      {strikeMode && !revealed && (
        <p className="mt-3 text-xs text-flagged">
          Strike mode on — clicking an option crosses it out. Toggle it off to select answers.
        </p>
      )}
    </div>
  );
}
