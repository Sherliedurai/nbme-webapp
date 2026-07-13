import { chromium } from "playwright";
const OUT=process.env.SHOT_DIR;
const b=await chromium.launch({channel:"chrome",headless:true});
const p=await b.newPage({viewport:{width:460,height:1100},deviceScaleFactor:2});
await p.goto("file:///Users/sherlie/Desktop/nbme-app/enrichment_review_block1.html",{waitUntil:"load"});
await p.evaluate(()=>localStorage.clear()); await p.reload({waitUntil:"load"});
for (const q of [5,17]) {
  await p.locator(`#q${q} .head`).scrollIntoViewIfNeeded();
  await p.waitForTimeout(200);
  await p.screenshot({path:`${OUT}/fmt-q${q}.png`});
}
await b.close(); console.log("done");
