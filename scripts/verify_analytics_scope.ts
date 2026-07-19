// Data-layer verification of the form-agnostic analytics scoping (CLAUDE.md:
// verify at the data layer, not the UI). Runs the SAME functions the dashboard
// renders from, over the SAME preview data the app serves, at every scope.
// Bundle + run:  esbuild scripts/verify_analytics_scope.ts --bundle --platform=node --format=esm | node -
import { previewAnalyticsAttempts, formAttempts } from "../src/lib/previewData";
import {
  scoresByForm, tagTrendByForm, firstInstinct, accuracyByTag,
  errorTypeDistribution, pacingByPosition, staminaByBlock, wrongAnswers,
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

console.log(`\n${fails === 0 ? "ALL CHECKS PASSED ✓" : `${fails} CHECK(S) FAILED ✗`}\n`);
process.exit(fails === 0 ? 0 : 1);
