import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('/Users/vishnup/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=process.cwd(),out=path.join(root,'output/plush-design-review');
await fs.mkdir(path.join(out,'qa'),{recursive:true});
const routes=JSON.parse(await fs.readFile(path.join(out,'routes.json'),'utf8')).filter(r=>!process.env.ZENKAI_OWNED_ONLY||r.family!=='evolution-creative');
const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+'/'))throw Error();const data=await fs.readFile(file);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.png':'image/png','.webp':'image/webp','.avif':'image/avif'})[path.extname(file)]||'application/octet-stream');res.end(data);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:'/Users/vishnup/Library/Caches/ms-playwright/chromium-1229/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});
const failures=[],results=[];
try{
for(const width of [320,390,768,1440]){
 const page=await browser.newPage({viewport:{width,height:width===320?740:900},reducedMotion:'reduce'});
 page.setDefaultTimeout(6000);
 for(const route of routes){
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/output/plush-design-review/'+route.file,{waitUntil:'load'});
  await page.evaluate(async()=>{await document.fonts.ready;const images=[...document.querySelectorAll('main img[src]')];images.forEach(i=>i.loading='eager');await Promise.all(images.map(i=>i.decode().catch(()=>{})));});
  if(route.family==='evolution-companions'){
   const metrics=await page.evaluate(()=>({documentWidth:document.documentElement.scrollWidth,pageHeight:document.documentElement.scrollHeight,form:Object.fromEntries(new FormData(document.querySelector('.evo-plush-form'))),brokenImages:[...document.querySelectorAll('main img[src]')].filter(i=>!i.naturalWidth).map(i=>i.src),badCopy:/supplier|direct.shipped|aliexpress|mimikyu|eevee|espeon|pok[eé]mon/i.test(document.querySelector('main').textContent),photoFits:[...document.querySelectorAll('.evo-plush-page img')].map(i=>getComputedStyle(i).objectFit)}));
   if(metrics.documentWidth>width||metrics.brokenImages.length||metrics.badCopy||metrics.form.id!==route.variant||metrics.form.quantity!=='1'||!metrics.photoFits.every(v=>v==='contain'))failures.push(route.suffix+' '+width+': original layout check '+JSON.stringify(metrics));
   if(width===390||width===1440){await page.screenshot({path:path.join(out,'qa',route.suffix+'-'+width+'-top.png')});await page.screenshot({path:path.join(out,'qa',route.suffix+'-'+width+'-full.png'),fullPage:true});}
   results.push({route:route.suffix,width,...metrics,errors});console.log(route.suffix,width,'original');continue;
  }
  const metrics=await page.evaluate(()=>{const rail=document.querySelector('.ec-portraits'),first=rail.firstElementChild,cta=document.querySelector('[data-ec-main-cta]');return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,pageHeight:document.documentElement.scrollHeight,h1:document.querySelector('h1').textContent.trim(),h1Font:getComputedStyle(document.querySelector('h1')).fontSize,ctaBottom:cta.getBoundingClientRect().bottom,ctaHeight:cta.getBoundingClientRect().height,railHeight:rail.clientHeight,slideWidth:first.getBoundingClientRect().width,railWidth:rail.clientWidth,slides:rail.children.length,thumbs:document.querySelectorAll('[data-ec-thumb]').length,mobileArrowsVisible:[...document.querySelectorAll('[data-ec-gallery-controls] button')].some(b=>getComputedStyle(b).display!=='none'),brokenImages:[...document.querySelectorAll('main img[src]')].filter(i=>!i.naturalWidth).map(i=>i.src),imageFits:[...document.querySelectorAll('.ec-gallery img')].map(i=>getComputedStyle(i).objectFit),form:Object.fromEntries(new FormData(document.querySelector('.ec-product-form'))),badCopy:/supplier|direct.shipped|aliexpress|mimikyu|eevee|espeon|pok[eé]mon/i.test(document.querySelector('main').textContent),photoCaptions:document.querySelectorAll('.ec-gallery figcaption').length};});
  const check=(ok,message)=>{if(!ok)failures.push(`${route.suffix} ${width}: ${message}`);};
  check(metrics.documentWidth<=width,'document overflow');check(metrics.brokenImages.length===0,'broken images '+metrics.brokenImages);check(!metrics.badCopy,'unwanted customer copy');check(metrics.thumbs===0,'duplicate thumbnail navigation');check(metrics.photoCaptions===0,'photo captions');check(metrics.imageFits.every(f=>f==='contain'),'cropped photo');check(metrics.form.id===route.variant&&metrics.form.quantity==='1'&&metrics.form.return_to==='/checkout','purchase form identity');check(metrics.ctaHeight>=44,'purchase target too small');
  if(width<900){check(!metrics.mobileArrowsVisible,'mobile arrows visible');check(metrics.slideWidth<metrics.railWidth-25,'next card not visible');check(metrics.railHeight<=300,'oversized mobile rail');}
  if(width===390)check(metrics.ctaBottom<=844,'first CTA below common mobile viewport');
  const rail=page.locator('.ec-portraits');
  await rail.focus();await page.keyboard.press('End');
  await page.waitForFunction(()=>{const el=document.querySelector('.ec-portraits');return Math.abs(el.scrollLeft-(el.scrollWidth-el.clientWidth))<3;});
  check(await rail.evaluate(el=>el.clientHeight)===metrics.railHeight,'gallery layout jumps');
  await page.keyboard.press('Home');
  await page.waitForFunction(()=>document.querySelector('.ec-portraits').scrollLeft<3);
  if(width===390||width===1440){
   await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});await page.screenshot({path:path.join(out,'qa',route.suffix+'-'+width+'-top.png')});
   await page.screenshot({path:path.join(out,'qa',route.suffix+'-'+width+'-full.png'),fullPage:true});
   await page.locator('.ec-included').screenshot({path:path.join(out,'qa',route.suffix+'-'+width+'-gallery.png')});
  }
  if(['mimikyu-collection','evo-all-eight','evo-all-mine'].includes(route.suffix)&&[390,1440].includes(width)){
   await rail.locator('button').first().click();await page.waitForFunction(()=>document.querySelector('dialog').open);
   check(await page.locator('[data-ec-sticky]').isHidden(),'sticky overlaps lightbox');
   await page.locator('[data-ec-zoom-toggle]').click();check(await page.locator('[data-ec-lightbox]').evaluate(el=>el.classList.contains('is-zoomed')),'lightbox zoom');
   await page.keyboard.press('Escape');check(await page.locator('dialog').evaluate(el=>!el.open),'lightbox close');
   await page.locator('.ec-faq summary').first().click();check(await page.locator('.ec-faq details').first().evaluate(el=>el.open),'FAQ toggle');
  }
  check(errors.length===0,'runtime errors '+errors.join(';'));results.push({route:route.suffix,width,...metrics,errors});
  console.log(route.suffix,width,metrics.railHeight+'px rail',metrics.pageHeight+'px page');
 }
 await page.close();
}
}finally{await browser.close();server.close();}
await fs.writeFile(path.join(out,process.env.ZENKAI_OWNED_ONLY?'qa/owned-report.json':'qa/report.json'),JSON.stringify({at:new Date().toISOString(),results,failures},null,2)+'\n');
console.log(JSON.stringify({checks:results.length,failures},null,2));if(failures.length)process.exitCode=1;
