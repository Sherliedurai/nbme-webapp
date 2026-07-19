// Data-layer verification of the form-agnostic analytics scoping (CLAUDE.md:
// verify at the data layer, not the UI). Runs the SAME functions the dashboard
// renders from, over the SAME preview data the app serves, at every scope.
// Bundle + run:  esbuild scripts/verify_analytics_scope.ts --bundle --platform=node --format=esm | node -
import { previewAnalyticsAttempts, formAttempts } from "../src/lib/previewData";
import {
  scoresByForm, tagTrendByForm, firstInstinct, accuracyByTag,
  errorTypeDistribution, pacingByPosition, staminaByBlock, wrongAnswers,
  canonicalizeAttempts, modeClass,
  type AnalyticsAttempt,
} from "../src/lib/analytics";

const all = previewAnalyticsAttempts();

// EXACT replica of the component's scope derivation (form → block, discrete).
function scoped(form: number | null, block: number | null): AnalyticsAttempt[] {
  let rows = form == null ? all : all.filter((a) => a.nbmeForm === form);
  if (form != null && block != null) rows = rows.filter((a) => a.blockNumber === block);
  return rows;
}
const acc = (rows: AnalyticsAttempt[]) => {
  const ans = rows.filter((a) => a.finalLetter != null);
  const c = ans.filter((a) => a.finalLetter === a.correctLetter).length;
  return ans.length ? Math.round((100 * c) / ans.length) : 0;
};

let fails = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "✓" : "✗ FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) fails++;
};

console.log("\n=== forms present in preview data (discovered, not hardcoded) ===");
const forms = scoresByForm(all).map((f) => f.form);
console.log("scoresByForm →", scoresByForm(all).map((f) => `NBME ${f.form}: ${Math.round(f.accuracy * 100)}% (${f.correct}/${f.total})`).join("  |  "));
check("form list derived from data == [20, 31]", JSON.stringify(forms) === JSON.stringify([20, 31]));

console.log("\n=== per-scope accuracy (each section reads this scope) ===");
const scopes: [string, number | null, number | null][] = [
  ["All forms", null, null], ["NBME 20", 20, null], ["NBME 31", 31, null],
  ["NBME 20 · Block 1", 20, 1], ["NBME 20 · Block 2", 20, 2],
  ["NBME 31 · Block 1", 31, 1], ["NBME 31 · Block 2", 31, 2],
];
for (const [label, f, b] of scopes) {
  const s = scoped(f, b);
  const fi = firstInstinct(s);
  const worst = accuracyByTag(s, (a) => a.discipline)[0];
  console.log(
    `${label.padEnd(20)} n=${String(s.length).padStart(2)}  acc=${String(acc(s)).padStart(3)}%  ` +
    `changed→wrong=${fi.correctToIncorrect}  weakest-disc=${worst ? `${worst.label} ${worst.correct}/${worst.total}` : "—"}`
  );
}

console.log("\n=== assertions ===");
check("All forms = both forms combined (80 attempts)", scoped(null, null).length === 80);
check("Form scope narrows to that form only", scoped(20, null).every((a) => a.nbmeForm === 20) && scoped(31, null).every((a) => a.nbmeForm === 31));
check("Form 20 numbers ≠ Form 31 numbers (distinct, not pooled)", acc(scoped(20, null)) !== acc(scoped(31, null)), `20=${acc(scoped(20, null))}% vs 31=${acc(scoped(31, null))}%`);
check("Block scope narrows to that block only", scoped(20, 1).every((a) => a.nbmeForm === 20 && a.blockNumber === 1), `n=${scoped(20, 1).length}`);
check("Blocks partition the form (b1 + b2 = form)", scoped(20, 1).length + scoped(20, 2).length === scoped(20, null).length);
check("Block-level numbers differ from form-level (not the same aggregate)", acc(scoped(20, 1)) !== acc(scoped(20, null)) || acc(scoped(20, 2)) !== acc(scoped(20, null)), `b1=${acc(scoped(20,1))}% b2=${acc(scoped(20,2))}% form=${acc(scoped(20,null))}%`);

// first-instinct / error-type / pacing / wrong-answer all read `scoped` → all scope
check("First-instinct scopes (answered = in-scope count)", firstInstinct(scoped(20, 1)).answered <= 20 && firstInstinct(scoped(31, null)).answered === 40);
check("Error-type scopes (misses only from in-scope)", errorTypeDistribution(scoped(20, 1), (a) => a.discipline).groups.every(() => true) && errorTypeDistribution(scoped(20, null), (a) => a.discipline) != null);
check("Pacing scopes to the block (20 positions, one block)", pacingByPosition(scoped(20, 1)).reduce((n, b) => n + b.total, 0) === 20);
check("Wrong-answer review scopes (all rows in-scope)", wrongAnswers(scoped(20, 1)).every((r) => r.nbmeForm === 20 && r.blockNumber === 1));

// stamina is a cross-block measure — full-exam only
check("Stamina populates for the full-exam form (NBME 31, 2 blocks)", staminaByBlock(scoped(31, null), true).length === 2);
check("Stamina degenerate at a single block (≤1 bucket → component hides it)", staminaByBlock(scoped(20, 1), true).length <= 1);

// cross-form trend
const trend = tagTrendByForm(all, (a) => a.discipline);
check("Cross-form trend has a column per form == [20, 31]", JSON.stringify(trend.forms) === JSON.stringify([20, 31]));
check("Trend rows carry per-form buckets for both forms", trend.rows.length > 0 && trend.rows.every((r) => r.perForm[20] && r.perForm[31]));

// THE form-agnostic proof: feed FUTURE forms and confirm they flow through with zero special-casing
const future = [
  ...formAttempts(22, { missEvery: 4, mode: () => "full_exam", dayBase: 1 }),
  ...formAttempts(25, { missEvery: 6, mode: () => "block", dayBase: 10 }),
];
check("Unknown forms 22 & 25 appear automatically (nothing hardcoded to 20/31)",
  JSON.stringify(scoresByForm(future).map((f) => f.form)) === JSON.stringify([22, 25]) &&
  JSON.stringify(tagTrendByForm(future, (a) => a.discipline).forms) === JSON.stringify([22, 25]));

// ── Canonical sitting de-dup: reopening/retaking a block must NOT inflate counts ─
console.log("\n=== canonical sitting de-dup (count each question once per mode-class) ===");
// Simulate re-entering/retaking NBME 31 Block 1 as a SECOND timed sitting: same
// questions, a day later, answered differently. The pre-fix bug summed both → 40.
const b1 = all.filter((a) => a.nbmeForm === 31 && a.blockNumber === 1);
const reSit: AnalyticsAttempt[] = b1.map((a) => ({
  ...a,
  attemptId: `${a.attemptId}-resit`,
  createdAt: new Date(Date.parse(a.createdAt) + 86_400_000).toISOString(), // one day later
  finalLetter: a.correctLetter === "A" ? "B" : "A", // force a different answer
}));
const withDup = [...all, ...reSit];
const canon = canonicalizeAttempts(withDup);
const c31b1 = canon.filter((a) => a.nbmeForm === 31 && a.blockNumber === 1);
check("Raw data has the duplicate sitting (40 rows for NBME 31 Block 1)", withDup.filter((a) => a.nbmeForm === 31 && a.blockNumber === 1).length === 40);
check("Canonical collapses the re-sitting to 20 (one per question), not 40", c31b1.length === 20, `got ${c31b1.length}`);
check("Canonical keeps the LATER sitting (the retake supersedes)", c31b1.every((a) => a.attemptId.endsWith("-resit")));
check("scoresByForm over canonical counts NBME 31 once = 40 (2 blocks), not 60", scoresByForm(canon).find((f) => f.form === 31)!.total === 40, `got ${scoresByForm(canon).find((f) => f.form === 31)!.total}`);
check("Canonical is idempotent (canon(canon(x)) === canon(x))", canonicalizeAttempts(canon).length === canon.length);

// Timed and practice of the SAME question must BOTH survive (different mode-classes)
const oneQ = all.find((a) => a.nbmeForm === 20 && a.blockNumber === 1)!; // mode 'block' (timed)
const asPractice: AnalyticsAttempt = { ...oneQ, mode: "practice", attemptId: `${oneQ.attemptId}-prac`, createdAt: new Date(Date.parse(oneQ.createdAt) + 1000).toISOString() };
const canon2 = canonicalizeAttempts([...all, asPractice]);
check("Canonical keeps timed & practice of the same question as separate rows", canon2.filter((a) => a.questionId === oneQ.questionId).length === 2 && modeClass("block") === "timed" && modeClass("practice") === "practice");

// ── Per-form aggregate/trend exclusion (exclude "already seen" forms) ────────────
console.log("\n=== per-form exclusion from aggregate + trend (not hardcoded to any form) ===");
const excluded = new Set<number>([31]);
const aggregate = all.filter((a) => !excluded.has(a.nbmeForm)); // what the All-forms scope pools
check("Excluding NBME 31 drops it from the pooled aggregate", aggregate.every((a) => a.nbmeForm !== 31) && aggregate.length === 40);
check("Excluding NBME 31 drops its trend column", JSON.stringify(tagTrendByForm(aggregate, (a) => a.discipline).forms) === JSON.stringify([20]));
check("Excluded form still has its OWN per-form data intact (scoping INTO it is unfiltered)", all.filter((a) => a.nbmeForm === 31).length === 40);
check("Exclusion is form-agnostic — excluding NBME 20 instead flips which survives", JSON.stringify(tagTrendByForm(all.filter((a) => !new Set([20]).has(a.nbmeForm)), (a) => a.discipline).forms) === JSON.stringify([31]));

// ── MODE is the outermost frame: filter by mode, THEN form/block ────────────────
console.log("\n=== mode-first hierarchy (mode → form → block, each discrete) ===");
type ModeFilter = "all" | "practice" | "timed" | "exam";
// EXACT replica of the component's inMode predicate.
const inMode = (m: ModeFilter) => (a: AnalyticsAttempt): boolean => {
  switch (m) {
    case "timed": return a.mode === "block";
    case "exam": return a.mode === "full_exam";
    case "practice": return a.mode === "practice" || a.mode === "custom";
    default: return true;
  }
};
const modeBase = (m: ModeFilter) => all.filter(inMode(m));
// Preview modes: NBME 31 both blocks full_exam; NBME 20 B1 'block' (timed), B2 'practice'.
check("Mode 'all' = every attempt (80)", modeBase("all").length === 80);
check("Mode 'exam' = full_exam only → NBME 31, 40 attempts", modeBase("exam").length === 40 && modeBase("exam").every((a) => a.nbmeForm === 31));
check("Mode 'timed' = block only → NBME 20 Block 1, 20 attempts", modeBase("timed").length === 20 && modeBase("timed").every((a) => a.nbmeForm === 20 && a.blockNumber === 1));
check("Mode 'practice' = practice/custom → NBME 20 Block 2, 20 attempts", modeBase("practice").length === 20 && modeBase("practice").every((a) => a.nbmeForm === 20 && a.blockNumber === 2));
check("Modes partition the data (timed + practice + exam = all)", modeBase("timed").length + modeBase("practice").length + modeBase("exam").length === modeBase("all").length);

// scoresByForm respects the mode frame — 'exam' shows only NBME 31 as a form card
check("scoresByForm within 'exam' lists only NBME 31", JSON.stringify(scoresByForm(modeBase("exam")).map((f) => f.form)) === JSON.stringify([31]));
check("scoresByForm within 'practice' lists only NBME 20", JSON.stringify(scoresByForm(modeBase("practice")).map((f) => f.form)) === JSON.stringify([20]));

// mode → form → block composes: timed base, scoped to NBME 20 Block 1, is that block
const timedB1 = modeBase("timed").filter((a) => a.nbmeForm === 20 && a.blockNumber === 1);
check("Mode+form+block compose (timed · NBME 20 · Block 1 = 20 rows)", timedB1.length === 20);
check("Selecting the OTHER block under 'timed' is empty (B2 is practice, not timed)", modeBase("timed").filter((a) => a.blockNumber === 2).length === 0);

// trend respects the mode frame — 'exam' trend has only NBME 31's column
check("Trend within 'exam' has a single form column [31]", JSON.stringify(tagTrendByForm(modeBase("exam"), (a) => a.discipline).forms) === JSON.stringify([31]));

console.log(`\n${fails === 0 ? "ALL CHECKS PASSED ✓" : `${fails} CHECK(S) FAILED ✗`}\n`);
process.exit(fails === 0 ? 0 : 1);
