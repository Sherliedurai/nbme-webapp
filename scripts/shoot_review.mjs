import { chromium } from "playwright";
const OUT = process.env.SHOT_DIR || ".";
const FILE = "file:///Users/sherlie/Desktop/nbme-app/enrichment_review_block1.html";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
await page.goto(FILE, { waitUntil: "load" });
await page.waitForTimeout(200);

// clear any prior state for a clean shot
await page.evaluate(() => localStorage.removeItem("nbme-enrich-review-block1"));
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(200);

// top (header + banners + Q1)
await page.screenshot({ path: `${OUT}/review-top.png` });

// interact: approve Q1, needs-edit Q2 + comment
await page.locator('#q1 .verdicts button[data-v="approve"]').click();
await page.locator('#q2 .verdicts button[data-v="edit"]').click();
await page.locator('#q2 .comment').fill("Prefer 'antiproliferative' over 'antimitotic' — check.");
await page.waitForTimeout(150);
const progress = await page.locator("#progress").textContent();

// expand Q1 vignette + source to prove collapsibles
await page.locator("#q1 details.vignette > summary").click();
await page.locator("#q1 details.source > summary").click();
await page.waitForTimeout(150);
await page.locator("#q1").scrollIntoViewIfNeeded();
await page.screenshot({ path: `${OUT}/review-card.png` });

// flagged Q5 card
await page.locator("#q5").scrollIntoViewIfNeeded();
await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}/review-flagged.png` });

// new grounded sections (Q16 — green Mehlman chips + one model)
await page.locator("#q16 .layer.hy").scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/review-sections.png` });

// export -> read JSON + confirm persistence
await page.locator("#export").click();
await page.waitForTimeout(150);
const exported = await page.locator("#exportOut").inputValue();
const parsed = JSON.parse(exported);
const persisted = await page.evaluate(() => localStorage.getItem("nbme-enrich-review-block1"));

console.log("progress:", progress);
console.log("export.reviewed:", parsed.reviewed, "total:", parsed.total);
console.log("Q1:", JSON.stringify(parsed.reviews[0]));
console.log("Q2:", JSON.stringify(parsed.reviews[1]));
console.log("localStorage persisted:", persisted ? "yes" : "no");
await browser.close();
console.log("done");
