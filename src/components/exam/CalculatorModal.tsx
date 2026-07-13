import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

const KEYS = ["7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", "0", ".", "=", "+"];

export default function CalculatorModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [expr, setExpr] = useState("");
  const [result, setResult] = useState("");

  function press(k: string) {
    if (k === "=") {
      try {
        // Restricted to digits and the four operators entered via the keypad.
        if (/^[0-9+\-*/.() ]+$/.test(expr)) {
          // eslint-disable-next-line no-eval
          const val = Function(`"use strict"; return (${expr})`)();
          setResult(String(val));
        }
      } catch {
        setResult("Error");
      }
      return;
    }
    setResult("");
    setExpr((e) => e + k);
  }

  return (
    <Modal open={open} title="Calculator" onClose={onClose} className="max-w-xs">
      <div className="mb-3 rounded-md border bg-muted/40 px-3 py-2 text-right font-mono">
        <div className="min-h-5 text-xs text-muted-foreground">{expr || "0"}</div>
        <div className="text-xl tabular-nums text-slate-800">{result || " "}</div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <button
          onClick={() => {
            setExpr("");
            setResult("");
          }}
          className="col-span-2 rounded-md border bg-secondary py-2 text-sm font-medium hover:bg-secondary/80"
        >
          Clear
        </button>
        <button
          onClick={() => setExpr((e) => e.slice(0, -1))}
          className="col-span-2 rounded-md border bg-secondary py-2 text-sm font-medium hover:bg-secondary/80"
        >
          ⌫
        </button>
        {KEYS.map((k) => (
          <button
            key={k}
            onClick={() => press(k)}
            className={cn(
              "rounded-md border py-2.5 text-sm font-medium hover:bg-accent",
              "=+-*/".includes(k) ? "bg-secondary" : "bg-card"
            )}
          >
            {k}
          </button>
        ))}
      </div>
    </Modal>
  );
}
