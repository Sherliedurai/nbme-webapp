// Pure analytics: classify attempts and roll them up for the dashboard.
// No I/O here — takes normalized rows, returns numbers. Keeps the diagnostic
// logic (which drives real study decisions) in one place, away from React.

export const ERROR_TAGS = [
  "knowledge_gap",
  "discriminator_miss",
  "primary_secondary",
  "process_error",
] as const;
export type ErrorTag = (typeof ERROR_TAGS)[number];

export const ERROR_TAG_META: Record<ErrorTag, { label: string; blurb: string; kind: "content" | "process" }> = {
  knowledge_gap: { label: "Knowledge gap", blurb: "I didn't know the content. Unlimited time wouldn't have helped.", kind: "content" },
  discriminator_miss: { label: "Discriminator miss", blurb: "I knew the content but missed the finding that separates the options.", kind: "process" },
  primary_secondary: { label: "Primary–secondary", blurb: "I anchored on a downstream/compensatory finding instead of the lesion.", kind: "content" },
  process_error: { label: "Process error", blurb: "Didn't kill a contradicted hypothesis, misread the stem, ran out of time, or changed a correct answer.", kind: "process" },
};

/** One attempt joined to the facts needed to classify it. */
export interface AnalyticsAttempt {
  questionId: string;
  attemptId: string | null;
  createdAt: string; // ISO — for "latest attempt per question" + time ordering
  firstLetter: string | null;
  finalLetter: string | null; // = attempts.selected_letter
  correctLetter: string;
  changed: boolean;
  errorTag: ErrorTag | null;
  flagged: boolean;
  qNumber: number; // position in the original form (1..N)
  nbmeForm: number; // which NBME form (e.g. 31)
  blockNumber: number; // block within the form (1..10)
  discipline: string;
  system: string;
  questionType: string;
  mode: string | null; // owning session mode: block | full_exam | practice
  secondsSpent: number | null;
}

export interface FormScore {
  form: number;
  correct: number;
  total: number;
  accuracy: number; // 0..1
}

/**
 * Accuracy per NBME form. Pooling accuracy across forms is meaningless for
 * predicting a pass, so the dashboard always reports "NBME 31: 78%" per form.
 */
export function scoresByForm(attempts: AnalyticsAttempt[]): FormScore[] {
  const byForm = new Map<number, { correct: number; total: number }>();
  for (const a of attempts) {
    if (a.finalLetter == null) continue; // scored questions only
    let f = byForm.get(a.nbmeForm);
    if (!f) { f = { correct: 0, total: 0 }; byForm.set(a.nbmeForm, f); }
    f.total++;
    if (a.finalLetter === a.correctLetter) f.correct++;
  }
  return [...byForm.entries()]
    .map(([form, v]) => ({ form, correct: v.correct, total: v.total, accuracy: v.total ? v.correct / v.total : 0 }))
    .sort((a, b) => a.form - b.form);
}

export type ChangeOutcome =
  | "unchanged"
  | "correct_to_incorrect" // the killer
  | "incorrect_to_correct"
  | "wrong_to_wrong";

/** Classify a single attempt's first-instinct behavior. Null = never answered. */
export function changeOutcome(a: AnalyticsAttempt): ChangeOutcome | null {
  if (a.firstLetter == null) return null; // never committed to anything
  const firstCorrect = a.firstLetter === a.correctLetter;
  const finalCorrect = a.finalLetter != null && a.finalLetter === a.correctLetter;
  if (!a.changed && a.firstLetter === a.finalLetter) return "unchanged";
  if (a.firstLetter === a.finalLetter) return "unchanged";
  if (firstCorrect && !finalCorrect) return "correct_to_incorrect";
  if (!firstCorrect && finalCorrect) return "incorrect_to_correct";
  return "wrong_to_wrong";
}

export interface FirstInstinctStats {
  answered: number;
  changedCount: number;
  changedPct: number;
  unchanged: number;
  correctToIncorrect: number;
  incorrectToCorrect: number;
  wrongToWrong: number;
  /** correct→incorrect as a share of all answered — the near-free score leak. */
  costlyChangePct: number;
  /** true when the leak crosses the ~15% action threshold. */
  overThreshold: boolean;
}

export const COSTLY_CHANGE_THRESHOLD = 0.15;

export function firstInstinct(attempts: AnalyticsAttempt[]): FirstInstinctStats {
  let answered = 0, changedCount = 0, unchanged = 0;
  let c2i = 0, i2c = 0, w2w = 0;
  for (const a of attempts) {
    const o = changeOutcome(a);
    if (o == null) continue;
    answered++;
    if (o === "unchanged") { unchanged++; continue; }
    changedCount++;
    if (o === "correct_to_incorrect") c2i++;
    else if (o === "incorrect_to_correct") i2c++;
    else w2w++;
  }
  const costlyChangePct = answered ? c2i / answered : 0;
  return {
    answered,
    changedCount,
    changedPct: answered ? changedCount / answered : 0,
    unchanged,
    correctToIncorrect: c2i,
    incorrectToCorrect: i2c,
    wrongToWrong: w2w,
    costlyChangePct,
    overThreshold: costlyChangePct > COSTLY_CHANGE_THRESHOLD,
  };
}

export interface TagCount {
  key: string;
  total: number;
  byTag: Record<ErrorTag, number>;
  untagged: number;
}

const emptyTagRecord = (): Record<ErrorTag, number> =>
  ({ knowledge_gap: 0, discriminator_miss: 0, primary_secondary: 0, process_error: 0 });

/** Error-type distribution over the MISSED attempts, overall and grouped. */
export function errorTypeDistribution(
  attempts: AnalyticsAttempt[],
  groupBy: (a: AnalyticsAttempt) => string
): { overall: Record<ErrorTag, number>; untaggedMisses: number; groups: TagCount[] } {
  const missed = attempts.filter((a) => a.finalLetter !== a.correctLetter);
  const overall = emptyTagRecord();
  let untaggedMisses = 0;
  const groupMap = new Map<string, TagCount>();
  for (const a of missed) {
    const key = groupBy(a) || "—";
    let g = groupMap.get(key);
    if (!g) { g = { key, total: 0, byTag: emptyTagRecord(), untagged: 0 }; groupMap.set(key, g); }
    g.total++;
    if (a.errorTag) { overall[a.errorTag]++; g.byTag[a.errorTag]++; }
    else { untaggedMisses++; g.untagged++; }
  }
  const groups = [...groupMap.values()].sort((x, y) => y.total - x.total);
  return { overall, untaggedMisses, groups };
}

export interface Bucket {
  label: string;
  correct: number;
  total: number;
  accuracy: number; // 0..1; NaN-safe → 0 when total 0
}

/**
 * Accuracy per tag value (system / discipline / question_type), over whatever
 * attempts you pass — one block, one form, or everything. Only tags that
 * actually appear are returned; sorted WORST-FIRST so the weakest surfaces on
 * top. Unanswered counts against accuracy (she didn't get it). No percentiles:
 * we have no norming population, so raw accuracy + counts only.
 */
export function accuracyByTag(
  attempts: AnalyticsAttempt[],
  sel: (a: AnalyticsAttempt) => string
): Bucket[] {
  const m = new Map<string, { correct: number; total: number }>();
  for (const a of attempts) {
    const key = sel(a) || "—";
    let g = m.get(key);
    if (!g) { g = { correct: 0, total: 0 }; m.set(key, g); }
    g.total++;
    if (a.finalLetter != null && a.finalLetter === a.correctLetter) g.correct++;
  }
  return [...m.entries()]
    .map(([label, v]) => ({ label, correct: v.correct, total: v.total, accuracy: v.total ? v.correct / v.total : 0 }))
    .sort((x, y) => x.accuracy - y.accuracy || y.total - x.total || x.label.localeCompare(y.label));
}

/** Accuracy by position within a block (1..20), bucketed into fifths for signal. */
export function pacingByPosition(attempts: AnalyticsAttempt[]): Bucket[] {
  const ranges: [string, number, number][] = [
    ["Q1–5", 1, 5], ["Q6–10", 6, 10], ["Q11–15", 11, 15], ["Q16–20", 16, 20],
  ];
  return ranges.map(([label, lo, hi]) => {
    let correct = 0, total = 0;
    for (const a of attempts) {
      const pos = ((a.qNumber - 1) % 20) + 1;
      if (pos < lo || pos > hi) continue;
      if (a.finalLetter == null) { total++; continue; }
      total++;
      if (a.finalLetter === a.correctLetter) correct++;
    }
    return { label, correct, total, accuracy: total ? correct / total : 0 };
  });
}

// ── Wrong-answer filter ──────────────────────────────────────────────────────

export interface WrongRow {
  questionId: string;
  attemptId: string | null;
  createdAt: string;
  nbmeForm: number;
  blockNumber: number;
  qNumber: number;
  discipline: string;
  system: string;
  questionType: string;
  finalLetter: string | null;
  correctLetter: string;
  errorTag: ErrorTag | null;
}

function latestPerQuestion(attempts: AnalyticsAttempt[]): AnalyticsAttempt[] {
  const latest = new Map<string, AnalyticsAttempt>();
  for (const a of attempts) {
    const prev = latest.get(a.questionId);
    if (!prev || a.createdAt > prev.createdAt) latest.set(a.questionId, a);
  }
  return [...latest.values()];
}

const toRow = (a: AnalyticsAttempt): WrongRow => ({
  questionId: a.questionId, attemptId: a.attemptId, createdAt: a.createdAt,
  nbmeForm: a.nbmeForm, blockNumber: a.blockNumber, qNumber: a.qNumber,
  discipline: a.discipline, system: a.system, questionType: a.questionType,
  finalLetter: a.finalLetter, correctLetter: a.correctLetter, errorTag: a.errorTag,
});

/**
 * Distinct questions whose MOST RECENT attempt was incorrect — "questions I
 * still get wrong." A question re-done and now correct drops off; a repeated
 * miss keeps its latest tag. Newest first.
 */
export function wrongAnswers(attempts: AnalyticsAttempt[]): WrongRow[] {
  return latestPerQuestion(attempts)
    .filter((a) => !(a.finalLetter != null && a.finalLetter === a.correctLetter))
    .map(toRow)
    .sort((x, y) => y.createdAt.localeCompare(x.createdAt));
}

/**
 * The review deck for Anki export: distinct questions whose latest attempt was
 * incorrect OR flagged — the ones worth drilling. Newest first.
 */
export function reviewDeckRows(attempts: AnalyticsAttempt[]): WrongRow[] {
  return latestPerQuestion(attempts)
    .filter((a) => a.flagged || !(a.finalLetter != null && a.finalLetter === a.correctLetter))
    .map(toRow)
    .sort((x, y) => y.createdAt.localeCompare(x.createdAt));
}

// ── Cross-form trend ─────────────────────────────────────────────────────────

export interface TagTrendRow {
  label: string;
  overall: Bucket;
  perForm: Record<number, Bucket>; // form → accuracy that form
}
export interface TagTrend {
  forms: number[]; // ascending — the time axis of the retake
  rows: TagTrendRow[]; // worst overall first
}

/**
 * Accuracy per tag value, broken out by NBME form — the "is renal physiology
 * actually improving?" cut. Forms ascend as the time axis (she sits them in
 * order across the retake). Worst overall first; a form with no data for a tag
 * shows as an empty cell, not 0%.
 */
export function tagTrendByForm(
  attempts: AnalyticsAttempt[],
  sel: (a: AnalyticsAttempt) => string
): TagTrend {
  const forms = [...new Set(attempts.map((a) => a.nbmeForm))].sort((a, b) => a - b);
  const map = new Map<string, Map<number, { correct: number; total: number }>>();
  for (const a of attempts) {
    const label = sel(a) || "—";
    let byForm = map.get(label);
    if (!byForm) { byForm = new Map(); map.set(label, byForm); }
    let g = byForm.get(a.nbmeForm);
    if (!g) { g = { correct: 0, total: 0 }; byForm.set(a.nbmeForm, g); }
    g.total++;
    if (a.finalLetter != null && a.finalLetter === a.correctLetter) g.correct++;
  }
  const rows: TagTrendRow[] = [...map.entries()].map(([label, byForm]) => {
    let c = 0, t = 0;
    const perForm: Record<number, Bucket> = {};
    for (const f of forms) {
      const g = byForm.get(f);
      const cc = g?.correct ?? 0, tt = g?.total ?? 0;
      perForm[f] = { label: `NBME ${f}`, correct: cc, total: tt, accuracy: tt ? cc / tt : 0 };
      c += cc; t += tt;
    }
    return { label, overall: { label, correct: c, total: t, accuracy: t ? c / t : 0 }, perForm };
  });
  rows.sort((x, y) => x.overall.accuracy - y.overall.accuracy || y.overall.total - x.overall.total);
  return { forms, rows };
}

/** Accuracy by block number — stamina. Restrict to full-exam sittings when asked. */
export function staminaByBlock(attempts: AnalyticsAttempt[], fullExamOnly = true): Bucket[] {
  const pool = fullExamOnly ? attempts.filter((a) => a.mode === "full_exam") : attempts;
  const byBlock = new Map<number, { correct: number; total: number }>();
  for (const a of pool) {
    let b = byBlock.get(a.blockNumber);
    if (!b) { b = { correct: 0, total: 0 }; byBlock.set(a.blockNumber, b); }
    b.total++;
    if (a.finalLetter != null && a.finalLetter === a.correctLetter) b.correct++;
  }
  return [...byBlock.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([block, v]) => ({ label: `Block ${block}`, correct: v.correct, total: v.total, accuracy: v.total ? v.correct / v.total : 0 }));
}
