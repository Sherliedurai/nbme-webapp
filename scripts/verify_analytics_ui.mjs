// Preview UI smoke: drives the REAL Analytics component in PREVIEW mode (both
// forms) and confirms the breadcrumb scopes the whole page. Requires the dev
// server running with VITE_PREVIEW=1 on :5173.
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:5173";
const b = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await b.newContext({ viewport: { width: 1440, height: 2200 } })).newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

let fails = 0;
const check = (name, cond, detail = "") => { console.log(`${cond ? "✓" : "✗ FAIL"}  ${name}${detail ? "  — " + detail : ""}`); if (!cond) fails++; };

// scope chip rendered next to a section's <h2>
async function scopeOf(title) {
  const chip = page.locator(`h2:has-text("${title}")`).first().locator("xpath=following-sibling::span[1]");
  return (await chip.count()) ? (await chip.first().innerText()).trim() : "(none)";
}
// the First-instinct "Answers changed" percentage — a number that must move with scope
async function changedPct() {
  const el = page.locator('div:has(> div:text-is("Answers changed")) .text-3xl').first();
  return (await el.count()) ? (await el.first().innerText()).trim() : "?";
}
// wrong-answer count from the section header "Wrong-answer review (N)" — a count
// that must SHRINK when scoping to a subset (block ⊂ form).
async function wrongCount() {
  const t = await page.locator('h2:has-text("Wrong-answer review")').first().innerText();
  const m = t.match(/\((\d+)\)/);
  return m ? Number(m[1]) : NaN;
}

await page.goto(`${BASE}/analytics`, { waitUntil: "networkidle" });
await page.waitForSelector('h2:has-text("Scores by form")', { timeout: 15000 });

// both forms discovered from data
check("Scores-by-form shows NBME 20 card", await page.locator('button:has-text("NBME 20")').first().count() > 0);
check("Scores-by-form shows NBME 31 card", await page.locator('button:has-text("NBME 31")').first().count() > 0);

// ── All forms ──
check("All-forms: First-instinct scope chip = 'All forms'", await scopeOf("First-instinct tracker") === "All forms", await scopeOf("First-instinct tracker"));
const allChanged = await changedPct();
check("All-forms: cross-form trend section present", await page.locator('h2:has-text("Trend by discipline")').count() > 0);

// ── Select NBME 20 ── (click the form card)
await page.locator('div.grid button:has-text("NBME 20")').first().click();
await page.waitForTimeout(250);
check("NBME 20: First-instinct scope chip = 'NBME 20'", await scopeOf("First-instinct tracker") === "NBME 20", await scopeOf("First-instinct tracker"));
check("NBME 20: Strong&weak scope chip = 'NBME 20'", await scopeOf("Strong & weak by tag") === "NBME 20", await scopeOf("Strong & weak by tag"));
const f20Changed = await changedPct();

// ── Select NBME 31 ──
await page.locator('div.grid button:has-text("NBME 31")').first().click();
await page.waitForTimeout(250);
check("NBME 31: scope chip = 'NBME 31'", await scopeOf("First-instinct tracker") === "NBME 31", await scopeOf("First-instinct tracker"));
const f31Changed = await changedPct();
const f31Wrong = await wrongCount();
check("Form scoping changes the numbers (20 vs 31 first-instinct differ)", f20Changed !== f31Changed, `NBME20 changed=${f20Changed} · NBME31 changed=${f31Changed}`);

// ── Drill into a block of NBME 31 ──
await page.locator('td:has-text("Block 2")').first().click();
await page.waitForTimeout(250);
check("Block: scope chip = 'NBME 31 · Block 2'", await scopeOf("First-instinct tracker") === "NBME 31 · Block 2", await scopeOf("First-instinct tracker"));
check("Block: pacing scope chip = 'NBME 31 · Block 2'", await scopeOf("Pacing — accuracy by position in block") === "NBME 31 · Block 2", await scopeOf("Pacing — accuracy by position in block"));
const blockWrong = await wrongCount();
check("Block scoping narrows the wrong-answer set (block ⊂ form)", blockWrong < f31Wrong, `form wrong=${f31Wrong} · block wrong=${blockWrong}`);
// stamina hidden / messaged at single block
const staminaMsg = await page.locator('text=Stamina compares blocks against each other').count();
check("Block: stamina shows the 'single block' message (cross-block measure)", staminaMsg > 0);

// ── Back to all forms ──
await page.locator('.mb-3 button:has-text("All forms")').first().click();
await page.waitForTimeout(250);
check("Reset: scope chip back to 'All forms'", await scopeOf("First-instinct tracker") === "All forms", await scopeOf("First-instinct tracker"));

check("No runtime page errors", pageErrors.length === 0, pageErrors.join(" | "));

console.log(`\nfirst-instinct changed%: All=${allChanged}  NBME20=${f20Changed}  NBME31=${f31Changed}  |  wrong-set: NBME31=${f31Wrong} → Block2=${blockWrong}`);
console.log(`${fails === 0 ? "UI SMOKE PASSED ✓" : fails + " UI CHECK(S) FAILED ✗"}\n`);
await b.close();
process.exit(fails === 0 ? 0 : 1);
