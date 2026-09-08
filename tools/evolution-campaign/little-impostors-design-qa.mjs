import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('/Users/vishnup/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=process.cwd(),out=path.join(root,'output/little-impostors-personality',process.env.ZENKAI_LIVE?'live':'local');
await fs.mkdir(out,{recursive:true});
const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+'/'))throw Error();const data=await fs.readFile(file);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp'})[path.extname(file)]||'application/octet-stream');res.end(data);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=process.env.ZENKAI_LIVE?'https://zenkaiclothing.com/products/little-impostors-complete-9-plush-collector-set':'http://127.0.0.1:'+server.address().port+'/output/plush-design-review/pages/mimikyu-collection.html';
const browser=await chromium.launch({headless:true,executablePath:'/Users/vishnup/Library/Caches/ms-playwright/chromium-1229/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});
const results=[],failures=[],edgeCases=[];
const sizes=process.env.ZENKAI_QUICK?[[390,844],[768,1024],[1440,1000]]:[[320,740],[375,667],[390,844],[430,932],[768,1024],[1024,768],[1440,1000]];
try{
 for(const [width,height] of sizes){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});page.setDefaultTimeout(7000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'load',timeout:45000});
  await page.locator('.ec-portrait-thumbs:not([hidden])').waitFor();
  await page.evaluate(async()=>{await document.fonts.ready;const images=[...document.querySelectorAll('.mc-page img[src]')];images.forEach(i=>i.loading='eager');await Promise.all(images.map(i=>i.decode().catch(()=>{})));});
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const check=(ok,msg)=>{if(!ok)failures.push(width+'x'+height+': '+msg);};
  const metrics=await page.evaluate(()=>{const root=document.querySelector('.mc-page'),cta=root.querySelector('[data-ec-main-cta]'),r=cta.getBoundingClientRect(),sticky=root.querySelector('[data-ec-sticky]');return {width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,pageHeight:document.documentElement.scrollHeight,cta:{top:r.top,bottom:r.bottom,height:r.height},initialPurchaseVisible:(r.top>=0&&r.bottom<=innerHeight)||!sticky.hidden,heroPolicy:root.querySelector('.ec-hero').innerText.match(/Secure checkout with Shopify|Delivery & returns/g),galleryIntro:root.querySelector('.mc-gallery-intro').innerText,heroZoom:!!root.querySelector('.mc-hero-zoom[data-ec-zoom]'),faqIconsCentered:[...root.querySelectorAll('.ec-faq summary')].every(e=>{const p=getComputedStyle(e,'::after'),m=new DOMMatrixReadOnly(p.transform);return Math.abs(parseFloat(p.top)+m.m42+parseFloat(p.height)/2-e.clientHeight/2)<1;}),headings:[...root.querySelectorAll('h1,h2')].map(e=>({text:e.innerText,font:getComputedStyle(e).fontFamily,size:getComputedStyle(e).fontSize})),loadedFonts:[...document.fonts].map(f=>({family:f.family,status:f.status})),thumbs:root.querySelectorAll('[data-ec-thumb]').length,customerPhotos:root.querySelectorAll('.mc-customer-grid img').length,quotes:[...root.querySelectorAll('blockquote')].map(e=>e.innerText),broken:[...root.querySelectorAll('img[src]')].filter(i=>!i.naturalWidth).map(i=>i.src),badCopy:/supplier|aliexpress|mimikyu|eevee|espeon|pok[eé]mon/i.test(root.textContent),photoCaptions:root.querySelectorAll('.ec-gallery figcaption').length,form:Object.fromEntries(new FormData(root.querySelector('form'))),horizontalOffenders:[...document.querySelectorAll('main section,header,footer')].filter(e=>{const r=e.getBoundingClientRect();return r.left<-1||r.right>innerWidth+1;}).map(e=>e.className)};});
  check(metrics.documentWidth===width&&!metrics.horizontalOffenders.length,'horizontal overflow');check(metrics.initialPurchaseVisible,'no initial purchase control');check(!metrics.heroPolicy,'removed hero policy remains');check(metrics.galleryIntro==='Every one included.','gallery copy');check(metrics.heroZoom,'hero photo cannot enlarge');check(metrics.faqIconsCentered,'FAQ icon alignment');check(metrics.headings[0].text.replace(/\s+/g,' ')==='Little faces.Big mischief.'||metrics.headings[0].text.replace(/\s+/g,' ')==='Little faces. Big mischief.','headline');check(metrics.loadedFonts.filter(f=>/Little/.test(f.family)&&f.status==='loaded').length===2,'fonts failed');check(metrics.thumbs===10&&metrics.customerPhotos===5&&metrics.quotes.length===3,'missing collection or customer content');check(!metrics.broken.length&&!metrics.badCopy&&!metrics.photoCaptions,'image or copy issue');check(metrics.form.id==='48008090976361'&&metrics.form.quantity==='1'&&metrics.form.return_to==='/checkout','purchase form');
  await page.screenshot({path:path.join(out,width+'-hero.png')});await page.screenshot({path:path.join(out,width+'-full.png'),fullPage:true});
  if([390,768,1440].includes(width))for(const [name,selector] of Object.entries({gallery:'.ec-included',story:'.ec-story',details:'.mc-details-grid',community:'.mc-community',faq:'.ec-faq',final:'.ec-final',footer:'.ec-footer'}))await page.locator(selector).screenshot({path:path.join(out,width+'-'+name+'.png')});
  // The hero shares the photo viewer, without moving the page behind it.
  const heroPhoto=page.locator('.mc-hero-zoom');await heroPhoto.focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('[data-ec-lightbox]').open);
  const modalOrigin=await page.evaluate(()=>scrollY);
  await page.locator('.ec-lightbox-toolbar').hover();await page.mouse.wheel(0,500);await page.waitForTimeout(220);
  check(await page.evaluate(()=>scrollY)===modalOrigin,'page scrolls behind photo viewer');
  await page.locator('[data-ec-zoom-toggle]').click();await page.locator('.ec-lightbox-viewport').hover();await page.mouse.wheel(180,240);await page.waitForTimeout(220);
  check(await page.locator('.ec-lightbox-viewport').evaluate(e=>e.scrollTop>0||e.scrollLeft>0),'enlarged photo cannot pan');check(await page.evaluate(()=>scrollY)===modalOrigin,'zoom scroll reaches page');
  await page.keyboard.press('Escape');check(await heroPhoto.evaluate(e=>e===document.activeElement),'hero photo focus not restored');check(await page.evaluate(()=>scrollY)===modalOrigin,'photo close changes page position');
  await page.evaluate(()=>document.activeElement.blur());
  // A sticky purchase control must not count itself as an inline CTA.
  for(const selector of ['.ec-included','.mc-details-grid','.mc-community','.ec-faq']){
   await page.locator(selector).scrollIntoViewIfNeeded();
   for(let frame=0;frame<3;frame++){
    await page.evaluate(()=>{dispatchEvent(new Event('resize'));return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
    const state=await page.evaluate(()=>{const sticky=document.querySelector('[data-ec-sticky]'),s=sticky.getBoundingClientRect(),button=sticky.querySelector('button'),b=button.getBoundingClientRect(),inline=[...document.querySelectorAll('[data-ec-main-cta],[data-ec-inline-cta],.shopify-payment-button shopify-accelerated-checkout,.shopify-payment-button button,.shopify-payment-button iframe')].filter(e=>!e.closest('[data-ec-sticky]')).some(e=>{const r=e.getBoundingClientRect();return !e.disabled&&r.width>=80&&r.height>=40&&r.top>=0&&r.bottom<=innerHeight&&getComputedStyle(e).visibility!=='hidden'});return {inline,hidden:sticky.hidden,fits:s.left>=0&&s.right<=innerWidth&&s.bottom<=innerHeight+1&&b.left>=s.left&&b.right<=s.right&&b.height>=44,buttonLines:b.height};});
    if(!state.inline){check(!state.hidden,'sticky disappears at '+selector);check(state.fits,'sticky button geometry at '+selector);}
   }
  }
  await page.locator('.mc-community').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,width+'-scroll.png')});
  for(const index of [0,3,9,8,0]){
   const thumb=page.locator('[data-ec-thumb]').nth(index);await thumb.click();
   await page.waitForFunction(i=>{const el=document.querySelector('.ec-portraits'),slides=[...el.children],target=Math.min(el.scrollWidth-el.clientWidth,slides[i].getBoundingClientRect().left-slides[0].getBoundingClientRect().left);return Math.abs(el.scrollLeft-target)<3&&document.querySelector('[data-ec-thumb="'+i+'"]').getAttribute('aria-pressed')==='true';},index);
  }
  await page.locator('.ec-portraits').focus();await page.keyboard.press('End');await page.waitForFunction(()=>document.querySelector('[data-ec-thumb="9"]').getAttribute('aria-pressed')==='true');
  await page.locator('.ec-portraits button').last().click();await page.waitForFunction(()=>document.querySelector('[data-ec-lightbox]').open);await page.locator('[data-ec-sticky]').waitFor({state:'hidden'});await page.locator('[data-ec-zoom-toggle]').click();check(await page.locator('[data-ec-lightbox]').evaluate(e=>e.classList.contains('is-zoomed')),'zoom toggle');await page.keyboard.press('Escape');check(!await page.locator('[data-ec-lightbox]').evaluate(e=>e.open),'lightbox remains open');
  for(const d of await page.locator('.ec-faq details').all()){await d.locator('summary').click();check(await d.evaluate(e=>e.open),'FAQ did not open');const fit=await d.evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;});check(fit,'open FAQ overflow');await d.locator('summary').click();}
  check(errors.length===0,'runtime errors '+errors.join('; '));results.push({...metrics,errors});await page.close();console.log(width+'x'+height+' checked');
 }
// Resize and no-JavaScript behavior use real browser layout and form ownership.
 const edge=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference',hasTouch:true});
 await edge.goto(url,{waitUntil:'load'});await edge.locator('[data-ec-thumb]').last().tap();
 await edge.waitForFunction(()=>{const r=document.querySelector('.ec-portraits');return Math.abs(r.scrollLeft-r.scrollWidth+r.clientWidth)<3;});
 for(const width of [390,768,1440,320]){
  await edge.setViewportSize({width,height:844});await edge.waitForTimeout(350);
  const state=await edge.evaluate(()=>{const t=document.querySelector('[data-ec-thumb][aria-pressed="true"]'),r=t.getBoundingClientRect(),s=t.parentElement.getBoundingClientRect();return {width:innerWidth,selected:t.dataset.ecThumb,visible:r.left>=s.left-1&&r.right<=s.right+1};});
  edgeCases.push({type:'resize',...state});if(!state.visible)failures.push(width+': active thumbnail lost after resize');
 }
 const formOwners=await edge.evaluate(()=>{const form=document.querySelector('.ec-product-form');return [...document.querySelectorAll('.ec-cta')].every(b=>b.form===form&&!b.disabled);});
 edgeCases.push({type:'native-form-ownership',pass:formOwners});if(!formOwners)failures.push('CTA form ownership');
 await edge.close();
 const nojs=await browser.newPage({viewport:{width:390,height:844},javaScriptEnabled:false});await nojs.goto(url,{waitUntil:'load'});
 const fallback=await nojs.evaluate(()=>({buy:!!document.querySelector('.ec-product-form button:not(:disabled)'),form:document.querySelector('.ec-product-form').getAttribute('action'),gallery:getComputedStyle(document.querySelector('.ec-portraits')).overflowX,hiddenThumbs:document.querySelector('.ec-portrait-thumbs').hidden}));
 edgeCases.push({type:'no-javascript',...fallback});if(!fallback.buy||!fallback.form.includes('/cart/add')||fallback.gallery!=='auto'||!fallback.hiddenThumbs)failures.push('native no-JavaScript fallback');await nojs.close();
}finally{await browser.close();server.close();}
await fs.writeFile(path.join(out,'report.json'),JSON.stringify({url,at:new Date().toISOString(),results,edgeCases,failures},null,2)+'\n');console.log(JSON.stringify({checks:results.length,failures},null,2));if(failures.length)process.exitCode=1;
