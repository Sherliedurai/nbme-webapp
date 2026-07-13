import { chromium } from "playwright";
const OUT=process.env.SHOT_DIR;
const b=await chromium.launch({channel:"chrome",headless:true});
const p=await b.newPage({viewport:{width:1440,height:960},deviceScaleFactor:2});
await p.goto("http://localhost:5173/exam/1",{waitUntil:"networkidle"});
await p.waitForSelector(".vignette-prose"); await p.waitForTimeout(300);

// REAL drag-select across the first line of the vignette, then click Highlight
const box=await p.locator(".vignette-prose").boundingBox();
await p.mouse.move(box.x+16, box.y+12);
await p.mouse.down();
await p.mouse.move(box.x+360, box.y+12, {steps:12});
await p.mouse.up();
await p.getByRole("button",{name:"Highlight"}).click();
await p.waitForTimeout(150);
const hlCount=await p.locator(".vignette-prose .hl").count();

// Strike option E via its always-visible ✗ button; select C; flag the question
await p.locator('[data-option="E"] button').click();
const eStruck=await p.locator('[data-option="E"]').evaluate(el=>el.className.includes("opacity-55"));
await p.locator('[data-option="C"]').click();
await p.getByRole("button",{name:/Flag/}).click();
await p.waitForTimeout(150);
await p.screenshot({path:`${OUT}/exA-tools.png`});

// End Block -> submit-review modal
await p.getByRole("button",{name:"End Block"}).click();
await p.waitForTimeout(300);
await p.screenshot({path:`${OUT}/exA-submitreview.png`});

console.log("highlight spans:", hlCount, "| option E struck:", eStruck);
await b.close();
