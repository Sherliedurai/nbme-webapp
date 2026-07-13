import { chromium } from "playwright";
const OUT=process.env.SHOT_DIR;
const b=await chromium.launch({channel:"chrome",headless:true});
const p=await b.newPage({viewport:{width:1440,height:960},deviceScaleFactor:2});
await p.goto("http://localhost:5174/exam-full",{waitUntil:"networkidle"});
await p.waitForSelector(".vignette-prose",{timeout:8000}); await p.waitForTimeout(300);
// active full-exam screen (top bar shows Block 1 of 1, timer, no reveal)
await p.locator('[data-option="A"]').click();
await p.screenshot({path:`${OUT}/fullexam-active.png`});
const topbar = await p.locator("header").first().innerText();
// End Block -> submit modal (label 'Submit exam' since only block) -> submit -> review
await p.getByRole("button",{name:"End Block"}).click(); await p.waitForTimeout(200);
const btnText = await p.locator(".fixed button").last().innerText();
await p.getByRole("button",{name:/Submit exam|End block/}).click();
await p.waitForTimeout(800);
await p.waitForSelector("text=Full exam review",{timeout:8000}).catch(()=>{});
await p.screenshot({path:`${OUT}/fullexam-review.png`});
console.log("topbar:", topbar.replace(/\n/g," "));
console.log("submit modal button:", btnText);
console.log("reached full exam review:", (await p.locator("text=Full exam review").count())>0);
await b.close();
