const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});const errs=[];
 const p=await b.newPage({viewport:{width:1366,height:900}});p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
 await p.goto('http://localhost:3000/');await p.screenshot({path:'screenshots/landing-hero.png'});await p.screenshot({path:'screenshots/landing-full.png',fullPage:true});
 await p.goto('http://localhost:3000/check');await p.click('button[data-id=invoice]');await p.waitForSelector('.verdict');await p.screenshot({path:'screenshots/checker-scam-result.png',fullPage:true});
 await p.click('button[data-id=legit]');await p.waitForFunction(()=>document.querySelector('.pill')?.textContent.includes('Safe'));await p.screenshot({path:'screenshots/checker-safe-result.png',fullPage:true});
 const m=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true});await m.goto('http://localhost:3000/');await m.screenshot({path:'screenshots/landing-mobile.png'});
 await m.goto('http://localhost:3000/check');await m.click('button[data-id=giftcard]');await m.waitForSelector('.verdict');await m.screenshot({path:'screenshots/checker-mobile.png',fullPage:true});
 console.log('errors:',errs);await b.close();})();
