import { chromium } from "playwright";
const OUT=process.env.SHOT_DIR;
const b=await chromium.launch({channel:"chrome",headless:true});
const p=await b.newPage({viewport:{width:1440,height:960},deviceScaleFactor:2});
await p.goto("http://localhost:5174/exam/1",{waitUntil:"networkidle"});
await p.waitForSelector(".vignette-prose"); await p.waitForTimeout(300);
// answer Q1 (A = correct), Next, Q2 wrong (A), then answer a few more
await p.locator('[data-option="A"]').click();
for (let k=0;k<4;k++){ await p.getByRole("button",{name:"Next"}).click(); await p.waitForTimeout(120); await p.locator('[data-option="A"]').first().click(); }
// End Block -> submit-review modal -> Submit
await p.getByRole("button",{name:"End Block"}).click(); await p.waitForTimeout(200);
await p.getByRole("button",{name:"Submit block"}).click(); await p.waitForTimeout(400);
// done phase -> Review answers
await p.getByRole("button",{name:"Review answers"}).click();
await p.waitForSelector(".vignette-prose"); await p.waitForTimeout(500);
console.log("review nav cells:", await p.locator("aside button").count());
await p.screenshot({path:`${OUT}/review-mode.png`});
await b.close(); console.log("done");
