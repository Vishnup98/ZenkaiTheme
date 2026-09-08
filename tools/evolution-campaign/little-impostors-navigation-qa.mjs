import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('/Users/vishnup/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=process.cwd(),out=path.join(root,'output/plush-design-review',process.env.ZENKAI_LIVE?'navigation-live':'navigation-local');
await fs.mkdir(out,{recursive:true});
const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+'/'))throw Error();const data=await fs.readFile(file);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.png':'image/png','.webp':'image/webp'})[path.extname(file)]||'application/octet-stream');res.end(data);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=process.env.ZENKAI_LIVE?'https://zenkaiclothing.com/products/little-impostors-complete-9-plush-collector-set':'http://127.0.0.1:'+server.address().port+'/output/plush-design-review/pages/mimikyu-collection.html';
const browser=await chromium.launch({headless:true,executablePath:'/Users/vishnup/Library/Caches/ms-playwright/chromium-1229/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});
const results=[],failures=[];
try{
 for(const width of [320,390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:844},reducedMotion:width===390?'no-preference':'reduce'});
  page.setDefaultTimeout(7000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'load',timeout:45000});
  await page.locator('.ec-portrait-thumbs:not([hidden])').waitFor();
  await page.evaluate(async()=>{await document.fonts.ready;const images=[...document.querySelectorAll('.mc-page img[src]')];images.forEach(i=>i.loading='eager');await Promise.all(images.map(i=>i.decode().catch(()=>{})));});
  const check=(ok,msg)=>{if(!ok)failures.push(width+': '+msg);};
  const metrics=await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,ctaBottom:document.querySelector('[data-ec-main-cta]').getBoundingClientRect().bottom,proof:document.querySelector('.mc-hero-trust').innerText,thumbCount:document.querySelectorAll('[data-ec-thumb]').length,thumbSizes:[...document.querySelectorAll('[data-ec-thumb]')].map(e=>({width:e.offsetWidth,height:e.offsetHeight})),railHeight:document.querySelector('.ec-portraits').clientHeight,brokenImages:[...document.querySelectorAll('.mc-page img[src]')].filter(i=>!i.naturalWidth).map(i=>i.src),form:Object.fromEntries(new FormData(document.querySelector('.ec-product-form'))),captions:document.querySelectorAll('.ec-portraits figcaption,.ec-portrait-thumbs figcaption').length,badCopy:/supplier|aliexpress|mimikyu|eevee|espeon|pok[eé]mon/i.test(document.querySelector('.mc-page').textContent)}));
  check(metrics.documentWidth===width,'page overflow');check(metrics.thumbCount===10,'expected ten thumbnails');check(metrics.thumbSizes.every(s=>s.width>=44&&s.height>=44),'thumbnail touch target');check(metrics.proof.includes('4.8/5')&&metrics.proof.includes('95 Shop ratings')&&metrics.proof.includes('2,900+')&&metrics.proof.includes('Zenkai orders shipped'),'store proof');check(metrics.brokenImages.length===0,'broken image');check(!metrics.badCopy&&metrics.captions===0,'unwanted copy or captions');check(metrics.form.id==='48008090976361'&&metrics.form.quantity==='1'&&metrics.form.return_to==='/checkout','purchase form');if(width===390)check(metrics.ctaBottom<=844,'mobile CTA below viewport');
  await page.screenshot({path:path.join(out,width+'-hero.png')});
  const rail=page.locator('.ec-portraits'),thumbs=page.locator('[data-ec-thumb]');
  await page.locator('.ec-included').scrollIntoViewIfNeeded();
  for(const index of [0,1,2,3,4,5,6,7,8,9,6,0,9]){
   await thumbs.nth(index).scrollIntoViewIfNeeded();
   const before=await page.evaluate(()=>scrollY);
   await thumbs.nth(index).click();
   await page.waitForFunction(i=>{const rail=document.querySelector('.ec-portraits'),slides=[...rail.children],target=Math.min(rail.scrollWidth-rail.clientWidth,slides[i].getBoundingClientRect().left-slides[0].getBoundingClientRect().left);return Math.abs(rail.scrollLeft-target)<3&&document.querySelector('[data-ec-thumb="'+i+'"]').getAttribute('aria-pressed')==='true';},index);
   await page.waitForTimeout(250);
   const state=await page.evaluate(i=>{const thumb=document.querySelector('[data-ec-thumb="'+i+'"]'),r=thumb.getBoundingClientRect(),s=thumb.parentElement.getBoundingClientRect();return {selected:thumb.getAttribute('aria-pressed'),visible:r.left>=s.left-1&&r.right<=s.right+1,scrollY,active:document.querySelectorAll('[data-ec-thumb][aria-pressed="true"]').length,height:document.querySelector('.ec-portraits').clientHeight};},index);
   check(state.selected==='true'&&state.active===1,'selected thumbnail '+index);check(state.visible,'active thumbnail offscreen '+index);check(state.height===metrics.railHeight,'carousel height shift');check(Math.abs(state.scrollY-before)<3,'thumbnail changed page scroll '+index);
  }
  // Real horizontal wheel input releases an explicit selection and updates the strip.
  await rail.hover();await page.mouse.wheel(-900,0);
  await page.waitForFunction(()=>document.querySelector('[data-ec-thumb="9"]').getAttribute('aria-pressed')==='false');
  await rail.focus();await page.keyboard.press('Home');await page.waitForFunction(()=>document.querySelector('[data-ec-thumb="0"]').getAttribute('aria-pressed')==='true'&&document.querySelector('.ec-portraits').scrollLeft<3);
  await page.keyboard.press('End');await page.waitForFunction(()=>document.querySelector('[data-ec-thumb="9"]').getAttribute('aria-pressed')==='true');
  await page.waitForTimeout(400);check(await thumbs.nth(9).getAttribute('aria-pressed')==='true','last thumbnail lost at shared desktop scroll limit');
  await page.keyboard.press('Home');await page.waitForFunction(()=>document.querySelector('.ec-portraits').scrollLeft<3);await page.waitForTimeout(250);
  await page.locator('.ec-included').screenshot({path:path.join(out,width+'-gallery.png')});
  // Thumbnail keyboard activation and the original enlarged-photo interaction.
  await thumbs.nth(3).focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('[data-ec-thumb="3"]').getAttribute('aria-pressed')==='true');
  await page.waitForTimeout(700);await rail.locator('button').nth(3).click();await page.waitForFunction(()=>document.querySelector('[data-ec-lightbox]').open);await page.keyboard.press('Escape');check(!await page.locator('[data-ec-lightbox]').evaluate(e=>e.open),'lightbox did not close');
  check(errors.length===0,'runtime errors '+errors.join('; '));results.push({...metrics,errors});await page.close();console.log(width+'px hero and thumbnail interactions checked');
 }
}finally{await browser.close();server.close();}
await fs.writeFile(path.join(out,'report.json'),JSON.stringify({url,at:new Date().toISOString(),results,failures},null,2)+'\n');
console.log(JSON.stringify({checks:results.length,failures},null,2));if(failures.length)process.exitCode=1;
