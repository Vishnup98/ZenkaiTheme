import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('/Users/vishnup/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=path.resolve('output/plush-design-review');
const routes=JSON.parse(await fs.readFile(path.join(out,'routes.json'),'utf8')).filter(r=>process.env.ZENKAI_ALL_ROUTES||r.family!=='evolution-creative');
await fs.mkdir(path.join(out,'live'),{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Users/vishnup/Library/Caches/ms-playwright/chromium-1229/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});
const results=[],failures=[];
try{
for(const width of [390,1440]){
 const page=await browser.newPage({viewport:{width,height:844},reducedMotion:'reduce'});
 for(const route of routes){
  const response=await page.goto(route.url,{waitUntil:'domcontentloaded',timeout:45000});
  const original=route.family==='evolution-companions';
  const root=original?'[data-evo-plush-page]':'[data-ec-page]';
  await page.locator(root).waitFor();
  await page.evaluate(async selector=>{await document.fonts.ready;const images=[...document.querySelectorAll(selector+' img[src]')];images.forEach(i=>i.loading='eager');await Promise.all(images.map(i=>i.decode().catch(()=>{})));},root);
  const metrics=await page.evaluate(({root,original})=>{
   const scope=document.querySelector(root),form=scope.querySelector('form[action*="/cart/add"]'),cta=scope.querySelector(original?'[data-add-to-cart]':'[data-ec-main-cta]'),rail=scope.querySelector('.ec-portraits'),sticky=scope.querySelector(original?'[data-evo-plush-sticky]':'[data-ec-sticky]');
   const rect=cta.getBoundingClientRect();
   return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,pageHeight:document.documentElement.scrollHeight,title:scope.querySelector('h1').textContent.trim(),form:form?Object.fromEntries(new FormData(form)):null,ctaTop:rect.top,ctaBottom:rect.bottom,ctaHeight:rect.height,ctaColor:getComputedStyle(cta).backgroundColor,initialSticky:sticky&&!sticky.hidden&&getComputedStyle(sticky).visibility!=='hidden'&&getComputedStyle(sticky).opacity!=='0',galleryHeight:rail?.clientHeight,slides:rail?.children.length,duplicateThumbnails:scope.querySelectorAll('[data-ec-thumb]').length,brokenImages:[...scope.querySelectorAll('img[src]')].filter(i=>!i.naturalWidth).map(i=>i.currentSrc),badCopy:/supplier|direct.shipped|aliexpress|mimikyu|eevee|espeon|pok[eé]mon/i.test(scope.textContent),sourceCss:[...document.querySelectorAll('link[rel=stylesheet]')].map(l=>l.href),bodyCopy:scope.innerText};
  },{root,original});
  const check=(ok,message)=>{if(!ok)failures.push(route.suffix+' '+width+': '+message);};
  check(response.status()===200,'HTTP '+response.status());check(metrics.documentWidth<=width,'horizontal overflow');check(!metrics.brokenImages.length,'broken images');check(!metrics.badCopy,'unwanted copy');check(metrics.form?.id===route.variant&&metrics.form?.quantity==='1','native product form mismatch');check(metrics.ctaHeight>=44,'CTA too small');check(metrics.duplicateThumbnails===(route.family==='mimikyu-collection'?10:0),'thumbnail navigation count');
  if(!original){check(metrics.form?.return_to==='/checkout','checkout destination');check(metrics.galleryHeight<=(width<900&&route.family!=='mimikyu-collection'?300:340),'oversized gallery');}
  check(metrics.bodyCopy.includes(route.family==='mimikyu-collection'?'7-10 business days':'5–7 business days'),'delivery wording');
  if(width===390)check(metrics.ctaBottom<=844||metrics.initialSticky,'no initial reachable purchase control');
  await page.screenshot({path:path.join(out,'live',route.suffix+'-'+width+'-top.png')});
  await page.screenshot({path:path.join(out,'live',route.suffix+'-'+width+'-full.png'),fullPage:true});
  if(!original){const rail=page.locator('.ec-portraits');await rail.focus();await page.keyboard.press('End');await page.waitForFunction(()=>{const el=document.querySelector('.ec-portraits');return Math.abs(el.scrollLeft-(el.scrollWidth-el.clientWidth))<3;});check(await rail.evaluate(el=>el.clientHeight)===metrics.galleryHeight,'gallery jumps at end');}
  delete metrics.bodyCopy;results.push({route:route.suffix,url:route.url,...metrics});console.log(route.suffix,width,metrics.ctaBottom.toFixed(0)+'px CTA bottom');
 }
 await page.close();
}
}finally{await browser.close();}
await fs.writeFile(path.join(out,'live',process.env.ZENKAI_ALL_ROUTES?'all-routes-report.json':'owned-report.json'),JSON.stringify({at:new Date().toISOString(),results,failures},null,2)+'\n');
console.log(JSON.stringify({pages:results.length,failures},null,2));if(failures.length)process.exitCode=1;
