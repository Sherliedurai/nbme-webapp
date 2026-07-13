import { chromium } from "playwright";
const b=await chromium.launch({channel:"chrome",headless:true});
const p=await b.newPage();
const F="file:///Users/sherlie/Desktop/nbme-app/enrichment_review_block1.html";
// seed a LEGACY key + a stale build key with fake verdicts, as if from a prior version
await p.goto(F,{waitUntil:"load"});
await p.evaluate(()=>{
  localStorage.setItem('nbme-enrich-review-block1', JSON.stringify({1:{verdict:'approve'}}));
  localStorage.setItem('nbme-enrich-review-blk1-deadbeef', JSON.stringify({2:{verdict:'wrong'}}));
});
await p.reload({waitUntil:"load"});
await p.waitForTimeout(200);
const r=await p.evaluate(()=>{
  const keys=Object.keys(localStorage).filter(k=>k.startsWith('nbme-enrich-review'));
  return {keys, progress:document.getElementById('progress').textContent};
});
console.log("localStorage keys after load:", r.keys);
console.log("progress (should be 0):", r.progress);
// mark one verdict, export, check version stamp
await p.locator('#q1 .verdicts button[data-v="approve"]').click();
await p.locator('#export').click(); await p.waitForTimeout(150);
const ex=JSON.parse(await p.locator('#exportOut').inputValue());
console.log("export.enrichment_version:", ex.enrichment_version, "| block:", ex.block, "| reviewed:", ex.reviewed);
await b.close();
