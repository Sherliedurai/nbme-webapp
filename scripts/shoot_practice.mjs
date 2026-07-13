import { chromium } from "playwright";
const OUT=process.env.SHOT_DIR;
const b=await chromium.launch({channel:"chrome",headless:true});

// DESKTOP: answer -> reveal split
const dp=await b.newPage({viewport:{width:1440,height:960},deviceScaleFactor:2});
await dp.goto("http://localhost:5173/practice/1",{waitUntil:"networkidle"});
await dp.waitForSelector(".vignette-prose"); await dp.waitForTimeout(300);
await dp.locator('[data-option="C"]').click();               // pick a (wrong) answer
await dp.getByRole("button",{name:"Check answer"}).click();  // reveal
await dp.waitForTimeout(400);
await dp.screenshot({path:`${OUT}/practice-desktop.png`});
console.log("desktop reveal: explanation present =", await dp.locator("text=Bottom line").count()>0);

// MOBILE: reveal stacks below
const mp=await b.newPage({viewport:{width:412,height:915},deviceScaleFactor:2});
await mp.goto("http://localhost:5173/practice/1",{waitUntil:"networkidle"});
await mp.waitForSelector(".vignette-prose"); await mp.waitForTimeout(300);
await mp.locator('[data-option="A"]').click();
await mp.getByRole("button",{name:"Check answer"}).click();
await mp.waitForTimeout(600);
await mp.screenshot({path:`${OUT}/practice-mobile.png`, fullPage:true});
await b.close(); console.log("done");
