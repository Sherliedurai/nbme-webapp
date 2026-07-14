import { chromium } from "playwright";
const b=await chromium.launch({channel:"chrome",headless:true});
const p=await b.newPage({viewport:{width:412,height:915},deviceScaleFactor:2});
const errs=[]; p.on("pageerror",e=>errs.push(e.message));
await p.goto("file:///Users/sherlie/Desktop/nbme-app/enrichment_review_blocks2-10.html",{waitUntil:"load"});
await p.evaluate(()=>localStorage.clear()); await p.reload({waitUntil:"load"}); await p.waitForTimeout(300);
const build=await p.locator("header h1 span").innerText();
const progress=await p.locator("#progress").innerText();
const chips=await p.locator(".banner .chip").count();
const secs=await p.locator(".blocksec").count();
// approve one, export
await p.locator('#q170 .verdicts button[data-v="wrong"]').click();
await p.locator("#export").click(); await p.waitForTimeout(150);
const ex=JSON.parse(await p.locator("#exportOut").inputValue());
console.log("pageerrors:", errs.length?errs:"none");
console.log("build stamp:", build, "| progress:", progress, "| flag chips:", chips, "| block sections:", secs);
console.log("export blocks:", ex.blocks, "| total:", ex.total, "| version:", ex.enrichment_version, "| q170 verdict:", ex.reviews.find(r=>r.q_number===170).verdict);
await b.close();
