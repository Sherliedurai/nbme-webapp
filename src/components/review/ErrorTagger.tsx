import { useState } from "react";
import { ERROR_TAGS, ERROR_TAG_META, type ErrorTag } from "@/lib/analytics";
import { cn } from "@/lib/utils";

interface Props {
  value: ErrorTag | null;
  /** Persist the tap. Resolves when written; rejects to let us roll back. */
  onTag: (tag: ErrorTag | null) => Promise<void>;
  disabled?: boolean; // e.g. no attempt id (soft-failed write) — show read-only
}

/**
 * One-tap classifier shown on a MISSED question in review. Tapping the active
 * tag again clears it. Optimistic: updates instantly, rolls back on write error.
 */
export default function ErrorTagger({ value, onTag, disabled }: Props) {
  const [current, setCurrent] = useState<ErrorTag | null>(value);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(false);

  async function tap(tag: ErrorTag) {
    if (disabled || saving) return;
    const next = current === tag ? null : tag;
    const prev = current;
    setCurrent(next);
    setSaving(true);
    setErr(false);
    try {
      await onTag(next);
    } catch {
      setCurrent(prev); // roll back
      setErr(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-amber-300/70 bg-amber-50/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-amber-900">Why did you miss this?</span>
        {current && <span className="text-[11px] text-amber-700">tap again to clear</span>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {ERROR_TAGS.map((t) => {
          const meta = ERROR_TAG_META[t as ErrorTag];
          const on = current === t;
          return (
            <button
              key={t}
              type="button"
              disabled={disabled || saving}
              onClick={() => tap(t as ErrorTag)}
              className={cn(
                "flex flex-col items-start rounded-md border px-2.5 py-1.5 text-left transition-colors disabled:opacity-60",
                on
                  ? "border-amber-500 bg-amber-500 text-white"
                  : "border-amber-300 bg-white text-slate-700 hover:bg-amber-100"
              )}
            >
              <span className="text-[13px] font-semibold leading-tight">{meta.label}</span>
              <span className={cn("text-[11px] leading-tight", on ? "text-amber-50" : "text-muted-foreground")}>
                {meta.blurb}
              </span>
            </button>
          );
        })}
      </div>
      {disabled && <p className="mt-2 text-[11px] text-muted-foreground">Not saved for this attempt — tagging unavailable.</p>}
      {err && <p className="mt-2 text-[11px] text-incorrect">Couldn't save — tap again.</p>}
    </div>
  );
}
