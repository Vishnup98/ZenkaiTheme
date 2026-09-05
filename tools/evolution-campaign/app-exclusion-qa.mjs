// Read-only storefront checks. --staged injects only the proposed snippet
// into this browser's document response; default checks the published theme.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const modules = process.env.ZENKAI_BUILD_MODULES || '/Users/vishnup/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { chromium } = require(path.join(modules, 'playwright'));
const staged = process.argv.includes('--staged');
const slugs = ['all-eight', 'good-shelf', 'little-faces', 'whole-gift', 'desk-company', 'everything-included'];
const base = 'https://zenkaiclothing.com/products/evolution-companions-complete-8-plush-collector-set';
const guard = await fs.readFile('snippets/evolution-campaign-app-exclusions.liquid', 'utf8');
const output = 'output/evolution-companions-campaign-2026-09-04';
const browser = await chromium.launch({ headless: true, executablePath: process.env.ZENKAI_CHROMIUM || '/Users/vishnup/Library/Caches/ms-playwright/chromium-1229/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' });
const cases = slugs.map(slug => ({ slug, width: 390, excluded: true, url: `${base}?variant=47968551764073&view=evo-${slug}` }));
cases.push({ ...cases[0], width: 1440 });
cases.push({ slug: 'original-product', width: 390, excluded: false, url: base });
cases.push({ slug: 'cart', width: 390, excluded: false, url: 'https://zenkaiclothing.com/cart' });
const results = [];
const failures = [];
try {
  for (const test of cases) {
    const page = await browser.newPage({ viewport: { width: test.width, height: 844 } });
    const requests = new Map(), completed = [], errors = [], submissions = [];
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    cdp.on('Network.requestWillBeSent', event => requests.set(event.requestId, event.request.url));
    cdp.on('Network.loadingFinished', event => completed.push({ url: requests.get(event.requestId), bytes: event.encodedDataLength }));
    page.on('pageerror', error => errors.push(String(error)));
    await page.route('**/*', async route => {
      const req = route.request();
      if (req.method() === 'POST' && new URL(req.url()).pathname === '/cart/add') {
        const body = req.postData() || '';
        const field = key => req.headers()['content-type']?.includes('multipart/form-data')
          ? body.split(`name="${key}"`)[1]?.split('\r\n\r\n')[1]?.split('\r\n')[0]
          : new URLSearchParams(body).get(key);
        submissions.push({ navigation: req.isNavigationRequest(), id: field('id'), quantity: field('quantity'), returnTo: field('return_to'), landing: field('properties[_zk_landing_view]') });
        // HTTP 204 leaves this test document in place. No cart is mutated.
        return route.fulfill({ status: 204, body: '' });
      }
      if (req.method() !== 'GET' && /\/cart\/(add|change|update|clear)|\/checkout/.test(req.url())) return route.abort();
      if (staged && test.excluded && req.isNavigationRequest() && req.url() === test.url) {
        const response = await route.fetch();
        return route.fulfill({ response, body: (await response.text()).replace('<head>', '<head>' + guard) });
      }
      return route.continue();
    });
    const response = await page.goto(test.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);
    const details = await page.evaluate(() => ({
      guardActive: window.zenkaiEvolutionAppExclusions === true,
      upcart: typeof window.upcartOpenCart,
      candyBootstrap: window.CANDYRACK_BOOTSTRAP || null,
      candyVeto: typeof window.CANDYRACK_CAN_ATC === 'function' && window.CANDYRACK_CAN_ATC(document.querySelector('[data-ec-main-cta]')) === false,
      smartsizeType: document.getElementById('smartsizeScript')?.type,
      smartsizeSrc: document.getElementById('smartsizeScript')?.getAttribute('src'),
      forms: [...document.querySelectorAll('.ec-product-form')].map(form => ({ action: form.action, method: form.method, fields: Object.fromEntries(new FormData(form)) })),
      paymentHostHeight: document.querySelector('.shopify-payment-button')?.getBoundingClientRect().height,
      cartLink: document.querySelector('.ec-cart')?.getAttribute('href'),
      overflow: document.documentElement.scrollWidth > innerWidth
    }));
    const ax = await cdp.send('Accessibility.getFullAXTree');
    const paymentControls = ax.nodes.filter(node => node.role?.value === 'button' && /shop pay|buy with shop|more payment options/i.test(node.name?.value || '')).map(node => node.name.value);
    const vendorResources = completed.filter(item => /upcart|smartsize|sizefox|fitting-rooms|candyrack/i.test(item.url || ''));
    if (response.status() !== 200 || details.guardActive !== test.excluded) failures.push(`${test.slug}/${test.width}: status or exclusion scope`);
    if (test.excluded) {
      if (details.upcart !== 'undefined' || details.smartsizeType !== 'application/json' || details.smartsizeSrc) failures.push(`${test.slug}/${test.width}: an app initialized`);
      if (!details.candyVeto || details.candyBootstrap || vendorResources.some(item => /candyrack-popup-(?:app|chunk|vendor)|candyrack-slider-cart\.js/.test(item.url))) failures.push(`${test.slug}/${test.width}: Candy Rack initialized`);
      if (vendorResources.some(item => /smartsize-script|sizefox-script|upcart_|cart\.js\?upcart|api\/show_script_entry_data/.test(item.url))) failures.push(`${test.slug}/${test.width}: downstream app assets loaded`);
      if (!details.forms.length || details.forms.some(form => form.method !== 'post' || !form.action.endsWith('/cart/add') || form.fields.id !== '47968551764073' || form.fields.quantity !== '1' || form.fields.return_to !== '/checkout')) failures.push(`${test.slug}/${test.width}: native product form changed`);
      if (details.paymentHostHeight < 44 || !paymentControls.length) failures.push(`${test.slug}/${test.width}: express payment control missing`);
      if (details.cartLink !== '/cart' || details.overflow) failures.push(`${test.slug}/${test.width}: cart link or overflow`);
      if (errors.length) failures.push(`${test.slug}/${test.width}: ${errors.join('; ')}`);
      for (const selector of ['[data-ec-main-cta]', '[data-ec-inline-cta]', '[data-ec-sticky] button']) {
        // Simulate returning from a completed native navigation so each of the
        // three buttons can be tested without reloading or a real cart write.
        await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow')));
        if (selector.includes('sticky')) {
          await page.locator('.ec-size').scrollIntoViewIfNeeded();
          await page.waitForFunction(() => !document.querySelector('[data-ec-sticky]').hidden);
        } else {
          await page.locator(selector).evaluate(el => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - innerHeight / 2));
          await page.waitForFunction(() => document.querySelector('[data-ec-sticky]').hidden);
        }
        const pending = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/cart/add', { timeout: 10000 });
        await page.locator(selector).click();
        await pending;
        if (await page.locator(selector).textContent() !== 'Opening checkout…' || await page.locator(selector).getAttribute('aria-busy') !== 'true') failures.push(`${test.slug}/${selector}: checkout feedback missing`);
        const submitted = submissions.at(-1);
        if (!submitted?.navigation || submitted.id !== '47968551764073' || submitted.quantity !== '1' || submitted.returnTo !== '/checkout' || submitted.landing !== `evo-${test.slug}`) failures.push(`${test.slug}/${test.width}/${selector}: native direct-checkout submit failed`);
        if (await page.locator('#candyrack-frame:visible,#candyrack-slider-cart:visible').count()) failures.push(`${test.slug}: Candy Rack popup appeared`);
      }
      if (submissions.length !== 3) failures.push(`${test.slug}/${test.width}: duplicate or missing add-to-cart submission`);
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
      if (await page.locator('.ec-cta[aria-busy]').count() || await page.locator('.ec-cta').allTextContents().then(texts => texts.some(text => text.includes('Opening checkout')))) failures.push(`${test.slug}: checkout feedback not restored on Back`);
    } else if (details.upcart !== 'function' || details.candyVeto) failures.push(`${test.slug}: regular-store app behavior changed`);
    const result = { ...test, status: response.status(), ...details, paymentControls, vendorResources, errors, submissions };
    results.push(result);
    console.log(JSON.stringify(result));
    if (test.slug === 'all-eight') {
      await page.locator('.shopify-payment-button').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/qa/app-exclusion-${staged ? 'staged' : 'live'}-${test.width}.png` });
    }
    await page.close();
  }
  await fs.writeFile(`${output}/app-exclusions-${staged ? 'staged' : 'live'}.json`, JSON.stringify({ results, failures }, null, 2));
  console.log(JSON.stringify({ cases: results.length, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
} finally { await browser.close(); }
