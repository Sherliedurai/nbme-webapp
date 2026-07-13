import { chromium } from "playwright";

const OUT = process.env.SHOT_DIR || ".";
const BASE = "http://localhost:5173";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 980 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

async function gotoBlock() {
  await page.goto(`${BASE}/exam/1`, { waitUntil: "networkidle" });
  await page.waitForSelector(".vignette-prose");
  await page.waitForTimeout(400);
}

await gotoBlock();

// ── Shot A: clean Q1 ────────────────────────────────────────────────────────
await page.screenshot({ path: `${OUT}/exam-A-clean.png` });
console.log("shot A: clean Q1");

// ── Build interaction states on Q1 ──────────────────────────────────────────
await page.locator('[data-option="C"]').click(); // select an answer
// highlight the first phrase of the vignette
await page.evaluate(() => {
  const prose = document.querySelector(".vignette-prose");
  const node = prose?.firstChild;
  if (!node) return;
  const range = document.createRange();
  range.setStart(node, 0);
  range.setEnd(node, Math.min(58, node.textContent.length));
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  const btn = [...document.querySelectorAll("button")].find((b) =>
    b.textContent.trim().startsWith("Highlight")
  );
  btn?.click();
});
await page.getByRole("button", { name: "Flag" }).click(); // flag it
// strike option E via strike mode
await page.getByRole("button", { name: "Strikethrough" }).click();
await page.locator('[data-option="E"]').click();
await page.getByRole("button", { name: "Strikethrough" }).click();

// answer a few more so the navigator shows progress
for (let i = 0; i < 4; i++) {
  await page.getByRole("button", { name: "Next" }).click();
  await page.waitForTimeout(150);
  await page.locator('[data-option="B"]').first().click();
}
// jump back to Q1
await page.getByRole("button", { name: "1", exact: true }).click();
await page.waitForTimeout(300);

// ── Shot B: interaction states ──────────────────────────────────────────────
await page.screenshot({ path: `${OUT}/exam-B-states.png` });
console.log("shot B: states (selected + struck + flagged + highlight + navigator)");

// ── Shot C: Q16 clinical image ──────────────────────────────────────────────
await page.getByRole("button", { name: "16", exact: true }).click();
await page.waitForSelector(".vignette-prose");
await page.waitForTimeout(600);
// wait for the figure to actually load
await page.waitForFunction(() => {
  const img = document.querySelector("figure img");
  return img && img.naturalWidth > 0;
}, { timeout: 5000 }).catch(() => console.log("(image not confirmed loaded)"));
await page.screenshot({ path: `${OUT}/exam-C-image.png` });
console.log("shot C: Q16 clinical image");

await browser.close();
console.log("done");
