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
  knowledge_gap: { label: "Knowledge gap", blurb: "Didn't know the fact/mechanism", kind: "content" },
  discriminator_miss: { label: "Discriminator miss", blurb: "Knew it, missed the deciding detail", kind: "process" },
  primary_secondary: { label: "Primary–secondary", blurb: "Confused cause with effect / 1° vs 2°", kind: "content" },
  process_error: { label: "Process error", blurb: "Misread, mis-clicked, ran out of time", kind: "process" },
};

/** One attempt joined to the facts needed to classify it. */
export interface AnalyticsAttempt {
  firstLetter: string | null;
  finalLetter: string | null; // = attempts.selected_letter
  correctLetter: string;
  changed: boolean;
  errorTag: ErrorTag | null;
  qNumber: number; // position in the original form (1..N)
  blockNumber: number; // ceil(q_number / 20)
  discipline: string;
  system: string;
  mode: string | null; // owning session mode: block | full_exam | practice
  secondsSpent: number | null;
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

/** Accuracy by position within a block (1..20), bucketed into fifths for signal. */
export function pacingByPosition(attempts: AnalyticsAttempt[]): Bucket[] {
  const ranges: [string, number, number][] = [
    ["Q1–4", 1, 4], ["Q5–8", 5, 8], ["Q9–12", 9, 12], ["Q13–16", 13, 16], ["Q17–20", 17, 20],
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
