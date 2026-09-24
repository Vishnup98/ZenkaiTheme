import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { JSDOM } = require(process.env.JSDOM_PATH || 'jsdom');
const html = await fs.readFile('product-build/midnight-grin/page-preview.html', 'utf8');
const script = await fs.readFile('assets/midnight-grin.js', 'utf8');

function setup({ preview = true, soldout = false, variant = '' } = {}) {
  const dom = new JSDOM(html, { url: 'https://example.test/products/cap' + (variant ? '?variant=' + variant : ''), runScripts: 'outside-only' });
  const { window } = dom;
  window.matchMedia = () => ({ matches: true });
  window.HTMLElement.prototype.scrollIntoView = () => {};
  const observations = [];
  window.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; observations.push(this); }
    observe() {}
  };
  const root = window.document.querySelector('[data-mg-product]');
  root.dataset.preview = String(preview);
  if (soldout) {
    const node = root.querySelector('[data-mg-data]');
    const data = JSON.parse(node.textContent);
    data.variants[1].available = false;
    node.textContent = JSON.stringify(data);
    root.querySelectorAll('[data-mg-slot] option').forEach(option => { if (option.value === String(data.variants[1].id)) option.disabled = true; });
  }
  window.eval(script);
  return { window, document: window.document, root, observations };
}
const variants = JSON.parse(new JSDOM(html).window.document.querySelector('[data-mg-data]').textContent).variants;
assert.equal(variants.length, 4);
assert.deepEqual(variants.map(v => v.priceCents), [3000, 3000, 3000, 3000]);
const noScript = new JSDOM(html).window.document;
assert.equal(noScript.querySelector('[data-mg-bundle]').hidden, true);
assert.equal(noScript.querySelector('[data-mg-native]').hidden, false);
assert.equal(noScript.querySelectorAll('.mg-noscript-colors a').length, 4);
assert.equal(noScript.querySelector('[data-mg-quantity]').value, '1');
assert.equal(noScript.querySelector('[data-mg-estimate]').textContent.trim(), '$30.00');
assert.deepEqual([...noScript.querySelectorAll('[data-mg-estimate]')].map(el => el.textContent.trim()), ['$30.00', '$55.00', '$80.00', '$100.00']);
assert.equal(noScript.querySelectorAll('.mg-bundle__slot-image img').length, 10);
assert.equal(noScript.querySelector('.mg-bundle__terms'), null);

const app = setup();
const { document, window, observations } = app;
assert.equal(document.querySelector('[data-mg-native]').hidden, true);
assert.equal(document.querySelector('[data-mg-bundle]').hidden, false);
assert.equal(document.querySelector('[data-mg-tier-details]').hidden, false);
assert.equal(document.querySelector('[data-mg-bundle-add]').textContent.trim().startsWith('Add 1 cap'), true);
const sticky = document.querySelector('[data-mg-sticky]');
observations[0].callback([{ isIntersecting: false, boundingClientRect: { bottom: -1 } }]);
assert.equal(sticky.hidden, false);
observations[0].callback([{ isIntersecting: true, boundingClientRect: { bottom: 500 } }]);
assert.equal(sticky.hidden, true);

for (const count of [1, 2, 3, 4]) {
  const tier = document.querySelector(`[data-mg-tier][value="${count}"]`);
  tier.checked = true;
  tier.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(document.querySelectorAll('[data-mg-tier-details]:not([hidden])').length, 1);
  assert.equal(document.querySelectorAll('[data-mg-slot]:not([disabled])').length, count);
  assert(document.querySelector('[data-mg-bundle-add]').textContent.includes(`Add ${count} ${count === 1 ? 'cap' : 'caps'}`));
  assert(document.querySelector('[data-mg-sticky-add]').textContent.includes(`Add ${count} ${count === 1 ? 'cap' : 'caps'}`));
}
const four = document.querySelector('[data-mg-tier-card="4"]');
const slots = [...four.querySelectorAll('[data-mg-slot]')];
assert.equal(new Set(slots.map(slot => slot.value)).size, 4, 'four-cap tier starts with the complete color lineup');
slots[1].value = String(variants[1].id);
slots[1].dispatchEvent(new window.Event('change', { bubbles: true }));
slots[2].value = String(variants[1].id);
slots[2].dispatchEvent(new window.Event('change', { bubbles: true }));
slots[3].value = String(variants[2].id);
slots[3].dispatchEvent(new window.Event('change', { bubbles: true }));
assert.equal(four.querySelector('[data-mg-estimate]').textContent, '$100.00');
slots[0].value = String(variants[3].id);
slots[0].dispatchEvent(new window.Event('change', { bubbles: true }));
assert.equal(document.querySelector('.mg-hero-image').src, variants[3].image);
assert.equal(document.querySelector('[name=id]').value, String(variants[3].id));
assert.equal(new URL(window.location.href).searchParams.get('variant'), String(variants[3].id));
assert.equal(document.querySelector('[data-mg-color]').textContent, variants[3].title);
assert.equal(slots[1].value, String(variants[1].id));
assert.equal(new URL(slots[1].closest('.mg-bundle__slot').querySelector('img').src).pathname, new URL(variants[1].image).pathname);
const hero = document.querySelector('.mg-hero-image');
hero.srcset = 'https://example.test/stale.jpg 540w';
document.querySelector(`[data-mg-select="${variants[0].id}"]`).click();
assert(!hero.srcset.includes('stale.jpg'));
assert.equal(slots[0].value, String(variants[0].id));

const previewSubmit = new window.Event('submit', { bubbles: true, cancelable: true });
document.querySelector('form').dispatchEvent(previewSubmit);
assert.equal(previewSubmit.defaultPrevented, true);
assert.equal(document.querySelector('[data-mg-bundle-add]').disabled, false);

const sold = setup({ soldout: true });
const soldOption = sold.document.querySelector(`[data-mg-tier-card="4"] [data-mg-slot] option[value="${variants[1].id}"]`);
assert.equal(soldOption.disabled, true);
sold.document.querySelector(`[data-mg-select="${variants[1].id}"]`).click();
assert.equal(sold.document.querySelector('[data-mg-bundle-add]').disabled, true);
assert.equal(sold.document.querySelector('[data-mg-sticky-add]').disabled, true);
assert.equal(sold.document.querySelector(`[data-mg-color-link="${variants[1].id}"] [data-mg-card-state]`).textContent, 'Sold out');
const linked = setup({ variant: String(variants[2].id) });
assert.equal(linked.document.querySelector('[data-mg-tier-card="1"] [data-mg-slot]').value, String(variants[2].id));
assert.equal(linked.document.querySelector('.mg-hero-image').src, variants[2].image);

const live = setup({ preview: false });
const liveDoc = live.document;
const liveWindow = live.window;
const liveTier = liveDoc.querySelector('[data-mg-tier][value="4"]');
liveTier.checked = true;
liveTier.dispatchEvent(new liveWindow.Event('change', { bubbles: true }));
const liveSlots = [...liveDoc.querySelectorAll('[data-mg-tier-card="4"] [data-mg-slot]')];
liveSlots[1].value = String(variants[1].id);
liveSlots[1].dispatchEvent(new liveWindow.Event('change', { bubbles: true }));
liveSlots[2].value = String(variants[1].id);
liveSlots[2].dispatchEvent(new liveWindow.Event('change', { bubbles: true }));
liveSlots[3].value = String(variants[2].id);
liveSlots[3].dispatchEvent(new liveWindow.Event('change', { bubbles: true }));
let calls = [];
let finish;
liveWindow.fetch = (url, options) => { calls.push({ url, options }); return new Promise(resolve => { finish = resolve; }); };
const first = new liveWindow.Event('submit', { bubbles: true, cancelable: true });
liveDoc.querySelector('form').dispatchEvent(first);
liveDoc.querySelector('form').dispatchEvent(new liveWindow.Event('submit', { bubbles: true, cancelable: true }));
assert.equal(first.defaultPrevented, true);
assert.equal(calls.length, 1, 'duplicate submit is ignored');
assert.equal(liveDoc.querySelector('[data-mg-bundle-add]').disabled, true);
assert.equal(calls[0].url, '/cart/add.js');
assert.deepEqual(JSON.parse(calls[0].options.body).items, [
  { id: variants[0].id, quantity: 1 },
  { id: variants[1].id, quantity: 2 },
  { id: variants[2].id, quantity: 1 }
]);
finish({ ok: false });
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(liveDoc.querySelector('[data-mg-bundle-add]').disabled, false);
assert.equal(liveDoc.querySelector('[data-mg-error]').hidden, false);
liveWindow.dispatchEvent(new liveWindow.Event('pageshow'));
assert.equal(liveDoc.querySelector('[data-mg-bundle-add]').disabled, false);
console.log('PASS: Midnight Grin tier prices, mixed colors, fallback, sync, availability, and cart payload.');
