// Per-form mode restrictions, mirrored from the `public.form_modes` table.
//
// The table is the single source of truth: which study modes a form permits, how
// much its answer key can be trusted, and a human note. NOTHING here hardcodes a
// form number — a new form just works by appearing (or not) in form_modes. A form
// ABSENT from the table fails OPEN (every mode allowed), so future forms are usable
// the moment their questions land, before anyone curates their row.

/** The four study modes a form can be gated to (the form_modes vocabulary). */
export type FormMode = "exam" | "timed" | "practice" | "custom";

export const ALL_FORM_MODES: readonly FormMode[] = ["exam", "timed", "practice", "custom"];

/** One form's restrictions (shape returned by getFormModes). */
export interface FormModeInfo {
  allowedModes: string[];
  keyTrust: string; // 'authoritative' | 'adjudicable'
  note: string;
}

export type FormModesMap = Map<number, FormModeInfo>;

/**
 * Fail-open default for a form with no form_modes row: every mode allowed, key
 * trusted, no note. Future forms are studyable before their row is curated.
 */
export const DEFAULT_FORM_MODE_INFO: FormModeInfo = {
  allowedModes: [...ALL_FORM_MODES],
  keyTrust: "authoritative",
  note: "",
};

/** Restrictions for `form`, falling back to the fail-open default when absent. */
export function formInfo(map: FormModesMap | null | undefined, form: number): FormModeInfo {
  return map?.get(form) ?? DEFAULT_FORM_MODE_INFO;
}

export function allowsMode(info: FormModeInfo, mode: FormMode): boolean {
  return info.allowedModes.includes(mode);
}

/**
 * A form reserved for the diagnostic sitting: exam permitted and NOTHING else.
 * These render visible-but-gated on Home — kept unseen so the diagnostic stays clean.
 */
export function isExamReserved(info: FormModeInfo): boolean {
  return info.allowedModes.includes("exam") && info.allowedModes.every((m) => m === "exam");
}

/** Answer key not yet physician-validated — surfaced as a warning on cards + review. */
export function isAdjudicable(info: FormModeInfo): boolean {
  return info.keyTrust === "adjudicable";
}

/**
 * Forms that EXPLICITLY disallow `mode` — i.e. present in form_modes with `mode`
 * missing from allowed_modes. Fail-open forms (absent from the map) are NOT listed,
 * so they remain eligible. Used to build a DB-level exclusion for custom queries:
 * the guard excludes the known-forbidden forms rather than allow-listing, so a new
 * form's questions are custom-eligible by default.
 */
export function formsDisallowing(map: FormModesMap, mode: FormMode): number[] {
  const out: number[] = [];
  for (const [form, info] of map) if (!info.allowedModes.includes(mode)) out.push(form);
  return out;
}

// ── UI helpers ───────────────────────────────────────────────────────────────

/** Home's mode ids map onto the form_modes vocabulary. */
export type HomeMode = "practice" | "block" | "full_exam";
export const HOME_MODE_TO_FORM_MODE: Record<HomeMode, FormMode> = {
  practice: "practice",
  block: "timed",
  full_exam: "exam",
};

/** Short human labels for the badges on a form card, in display order. */
export const FORM_MODE_LABELS: Record<FormMode, string> = {
  exam: "Exam",
  timed: "Timed",
  practice: "Practice",
  custom: "Custom",
};
