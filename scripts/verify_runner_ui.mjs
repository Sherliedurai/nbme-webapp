// Preview UI smoke for the exam/practice runner fixes. Requires the dev server
// with VITE_PREVIEW=1. Proves: practice read-only revisit (no re-answer path),
// navigator jump, keyboard arrows, and the timed flag/submit-review gate.
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:5199";
const b = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));

let fails = 0;
const check = (name, cond, detail = "") => { console.log(`${cond ? "✓" : "✗ FAIL"}  ${name}${detail ? "  — " + detail : ""}`); if (!cond) fails++; };
const visible = (sel) => page.locator(sel).first().isVisible().catch(() => false);
const hasText = (t) => page.getByText(t, { exact: false }).first().isVisible().catch(() => false);

// ─────────────────────────── PRACTICE ───────────────────────────
console.log("\n=== Practice: read-only revisit + navigator + keyboard ===");
await page.goto(`${BASE}/practice/20/1`, { waitUntil: "networkidle" });
await page.waitForSelector('[data-option="A"]', { timeout: 15000 });
check("Q1 loads editable (Check answer present)", await hasText("Check answer"));
check("Q1 vignette shown", await hasText("Preview vignette 1"));

// answer Q1 → check → committed/revealed
await page.locator('[data-option="A"]').first().click();
await page.getByText("Check answer", { exact: false }).first().click();
await page.waitForTimeout(300);
check("After Check: explanation reveals (Bottom line)", await hasText("Bottom line"));
check("After Check: 'Check answer' is gone (locked)", !(await hasText("Check answer")));
check("After Check: 'answered' lock indicator shown", await hasText("answered"));
// navigator cell 1 marked answered (primary tint) — the numbered grid cell, not the collapse toggle
const cell1cls = await page.locator("aside .grid button", { hasText: /^1$/ }).first().getAttribute("class");
check("Navigator cell 1 = answered state", (cell1cls || "").includes("bg-primary/10"), (cell1cls || "").slice(0, 40));

// Next → Q2 editable
await page.getByText("Next question", { exact: false }).first().click();
await page.waitForTimeout(200);
check("Q2 is editable (Check answer present)", await hasText("Check answer"));
check("Q2 vignette shown", await hasText("Preview vignette 2"));

// keyboard ArrowLeft → back to Q1 (committed → READ-ONLY)
await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(250);
check("ArrowLeft returns to Q1", await hasText("Preview vignette 1"));
check("Revisited Q1 is READ-ONLY: no 'Check answer'", !(await hasText("Check answer")));
check("Revisited Q1 still shows its explanation", await hasText("Bottom line"));
// attempt to re-answer a committed question → must not re-open Check
await page.locator('[data-option="B"]').first().click().catch(() => {});
await page.waitForTimeout(150);
check("Clicking an option on a locked question does NOT re-enable Check (no re-record)", !(await hasText("Check answer")));

// navigator jump to Q5
await page.locator("aside button", { hasText: /^5$/ }).first().click();
await page.waitForTimeout(200);
check("Navigator jump → Q5", await hasText("Preview vignette 5"));
check("Q5 (unanswered) is editable", await hasText("Check answer"));
// keyboard ArrowRight → Q6
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(200);
check("ArrowRight → Q6", await hasText("Preview vignette 6"));

// keyboard must NOT hijack when typing in a field: focus the highlight? use the
// header has no input; instead verify arrows ignored while a text input is focused
// (the calculator modal has an input).
await page.getByText("Calculator", { exact: false }).first().click().catch(() => {});
await page.waitForTimeout(150);
const inputCount = await page.locator("input").count();
if (inputCount > 0) {
  await page.locator("input").first().focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(150);
  check("Arrows ignored while an input is focused (still Q6)", await hasText("Preview vignette 6"));
  await page.keyboard.press("Escape").catch(() => {});
} else {
  console.log("  (no input to test focus-guard; skipped)");
}

// ─────────────────────────── TIMED ───────────────────────────
console.log("\n=== Timed block: flag chip + submit-review gate ===");
await page.goto(`${BASE}/exam/20/1`, { waitUntil: "networkidle" });
await page.waitForSelector('[data-option="A"]', { timeout: 15000 });
// answer Q1, flag it
await page.locator('[data-option="A"]').first().click();
await page.getByRole("button", { name: /^Flag$/ }).first().click();
await page.waitForTimeout(200);
check("Timed: flag chip appears in top bar", await hasText("1 flagged"));
// go to Q2 via keyboard, leave unanswered
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(150);
check("Timed: keyboard arrow navigates (Q2)", await hasText("Preview vignette 2"));
// open the submit-review gate
await page.getByText("Review & End Block", { exact: false }).first().click();
await page.waitForTimeout(250);
check("Submit-review modal opens (Review before submitting)", await hasText("Review before submitting"));
check("Modal lists 'Flagged — jump to'", await hasText("Flagged — jump to"));
check("Modal lists 'Unanswered — jump to'", await hasText("Unanswered — jump to"));
check("Modal warns unanswered scored incorrect", await hasText("scored as incorrect"));

check("No runtime page errors", errs.length === 0, errs.join(" | "));
console.log(`\n${fails === 0 ? "RUNNER UI SMOKE PASSED ✓" : fails + " CHECK(S) FAILED ✗"}\n`);
await b.close();
process.exit(fails === 0 ? 0 : 1);
