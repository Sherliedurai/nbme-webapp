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
  highlightMode: boolean;
  strikeMode: boolean;
  flagged: boolean;
  onToggleHighlightMode: () => void;
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
    highlightMode,
    strikeMode,
    flagged,
    onToggleHighlightMode,
    onToggleStrikeMode,
    onToggleFlag,
    onSelect,
    onToggleStrike,
    onChangeHighlight,
    revealed = false,
    correctLetter = null,
  } = props;

  const proseRef = useRef<HTMLDivElement>(null);

  // Armed highlighter: whatever you select gets highlighted the moment you
  // release the mouse. No confirm click — the pen is already in your hand.
  function highlightSelection() {
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
      // Selection crosses element boundaries (e.g. an existing highlight) —
      // extract and re-wrap instead.
      const frag = range.extractContents();
      span.appendChild(frag);
      range.insertNode(span);
    }
    sel.removeAllRanges();
    onChangeHighlight(container.innerHTML);
  }

  // Fires on mouse-release inside the vignette. Only acts while the pen is armed.
  function onProseMouseUp() {
    if (revealed || !highlightMode) return;
    // Let the selection settle before we read it.
    requestAnimationFrame(highlightSelection);
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

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      {!revealed && (
        <div className="mb-4 flex items-center gap-2">
          <Button variant={highlightMode ? "default" : "outline"} size="sm" onClick={onToggleHighlightMode}
            title="Highlighter — arm it, then select any vignette text to highlight it. Click again to put the pen down.">
            <Highlighter className="size-4" /> {highlightMode ? "Highlighting" : "Highlight"}
          </Button>
          {highlightHtml && (
            <Button variant="ghost" size="sm" onClick={() => onChangeHighlight(null)} title="Clear highlights">
              <Eraser className="size-4" /> Clear
            </Button>
          )}
          <Button variant={strikeMode ? "default" : "outline"} size="sm" onClick={onToggleStrikeMode}
            title="Strikethrough — arm it, then click any option to cross it out. Click again to put the pen down.">
            <Strikethrough className="size-4" /> {strikeMode ? "Striking" : "Strikethrough"}
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
        <div ref={proseRef} onMouseUp={onProseMouseUp}
          className={cn("vignette-prose", highlightMode && !revealed && "cursor-text selection:bg-yellow-200")}
          dangerouslySetInnerHTML={{ __html: highlightHtml }} />
      ) : (
        <div ref={proseRef} onMouseUp={onProseMouseUp}
          className={cn("vignette-prose", highlightMode && !revealed && "cursor-text selection:bg-yellow-200")}>
          {question.vignette_text}
        </div>
      )}

      {question.clinical_image_url && <ClinicalImage objectPath={question.clinical_image_url} />}

      <div className="mt-6 space-y-2.5">
        {question.options.map((opt) => (
          <OptionCard
            key={opt.letter}
            option={opt}
            selected={selectedLetter === opt.letter}
            struck={struckLetters.includes(opt.letter)}
            strikeMode={strikeMode && !revealed}
            reveal={revealFor(opt.letter)}
            disabled={revealed}
            onClick={() => onCardClick(opt.letter)}
            onToggleStrike={() => onToggleStrike(opt.letter)}
          />
        ))}
      </div>

      {highlightMode && !revealed && (
        <p className="mt-3 text-xs text-primary">
          Highlighter armed — select any vignette text to highlight it. Click <strong>Highlighting</strong> again to put the pen down.
        </p>
      )}
      {strikeMode && !revealed && (
        <p className="mt-3 text-xs text-flagged">
          Strikethrough armed — click an option to cross it out. Click <strong>Striking</strong> again to put the pen down.
        </p>
      )}
    </div>
  );
}
