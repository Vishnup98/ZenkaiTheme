import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require('/Users/vishnup/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'/Users/vishnup/Library/Caches/ms-playwright/chromium-1229/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});
try {
for(const width of [390,1440]) for(const slug of ['all-eight','good-shelf','little-faces','whole-gift','desk-company','everything-included']) {
 const page=await browser.newPage({viewport:{width,height:844}});
 await page.goto(`file://${process.cwd()}/output/evolution-companions-campaign-2026-09-04/pages/${slug}.html`);
 await page.locator('.ec-portraits').scrollIntoViewIfNeeded();
 assert.equal(await page.locator('.ec-portraits figure').count(),9);
 assert.equal(await page.locator('[data-ec-thumb]').count(),9);
 await page.evaluate(async()=>{const imgs=[...document.querySelectorAll('.ec-portraits img,.ec-portrait-thumbs img,.ec-detail-photo img')];imgs.forEach(i=>i.loading='eager');await Promise.all(imgs.map(i=>i.decode().catch(()=>{throw Error(i.src)})));});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('[data-ec-thumb="8"]').click();
 await page.waitForTimeout(1500);
 assert.equal(await page.locator('[data-ec-thumb="8"]').getAttribute('aria-pressed'),'true');
 await page.locator('[data-ec-thumb="0"]').click();
 await page.waitForTimeout(1500);
 assert.equal(await page.locator('[data-ec-thumb="0"]').getAttribute('aria-pressed'),'true');
 await page.locator('.ec-portraits').screenshot({path:`output/evolution-companions-campaign-2026-09-04/qa/portraits-${slug}-${width}.png`});
 console.log('PASS',slug,width,'9 slides, images decoded, thumbnails, no overflow');
 await page.close();
}
} finally {await browser.close();}
