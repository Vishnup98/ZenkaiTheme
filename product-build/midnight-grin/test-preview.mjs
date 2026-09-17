import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { JSDOM } = require(process.env.JSDOM_PATH || 'jsdom');
const html = await fs.readFile('product-build/midnight-grin/page-preview.html', 'utf8');
const source = await fs.readFile('assets/midnight-grin.js', 'utf8');
function setup({ preview = true, soldout = false, variant = '' } = {}) {
  const dom = new JSDOM(html, { url: 'https://example.test/products/cap' + (variant ? '?variant=' + variant : ''), runScripts: 'outside-only' });
  const { window } = dom;
  window.matchMedia = () => ({ matches: true });
  window.HTMLElement.prototype.scrollIntoView = () => {};
  const observations = [];
  window.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; observations.push(this); }
    observe() {}
    disconnect() {}
  };
  const root = window.document.querySelector('[data-mg-product]');
  root.dataset.preview = String(preview);
  if (soldout) {
    const node = root.querySelector('[data-mg-data]');
    const data = JSON.parse(node.textContent);
    data.variants[1].available = false;
    node.textContent = JSON.stringify(data);
  }
  window.eval(source);
  return { window, document: window.document, observations };
}
let checks = 0;
function check(condition, message) { assert.ok(condition, message); checks++; }
const { window, document, observations } = setup();
const variants = JSON.parse(document.querySelector('[data-mg-data]').textContent).variants;
check(variants.length === 4, 'four current variants');
check(!document.querySelector('.mg-bonus'), 'unconfirmed bonus is not displayed');
check(document.querySelector('.mg-swatches').hidden === false, 'progressive swatches enabled');
check(document.querySelector('[data-mg-variant]').hidden, 'native select hidden only with JS');
const sticky = document.querySelector('[data-mg-sticky]');
observations[0].callback([{ isIntersecting: false, boundingClientRect: { bottom: 1200 } }]);
check(sticky.hidden, 'sticky hidden while main CTA is still below viewport');
observations[0].callback([{ isIntersecting: false, boundingClientRect: { bottom: -1 } }]);
check(!sticky.hidden, 'sticky appears after main CTA scrolls past');
observations[0].callback([{ isIntersecting: true, boundingClientRect: { bottom: 500 } }]);
check(sticky.hidden, 'sticky hides when primary CTA returns');
for (const v of variants) {
  document.querySelector(`[data-mg-select="${v.id}"]`).click();
  check(document.querySelector('[name=id]').value === String(v.id), `${v.title} form variant`);
  check(document.querySelector('[data-mg-color]').textContent === v.title, `${v.title} label`);
  check(document.querySelector('.mg-hero-image').src === v.image, `${v.title} image`);
  const candidates = document.querySelector('.mg-hero-image').srcset.split(', ');
  check(candidates.length === 5, `${v.title} responsive image candidates`);
  check(candidates.every(candidate => new URL(candidate.split(' ')[0]).pathname === new URL(v.image).pathname), `${v.title} all responsive candidates match selected color`);
  check(document.querySelector('[data-mg-add]').textContent.includes(v.title), `${v.title} CTA`);
  check(document.querySelectorAll('[data-mg-select][aria-pressed=true]').length === 1, 'one pressed swatch');
  check(new URL(window.location.href).searchParams.get('variant') === String(v.id), `${v.title} URL`);
  const activeCard = document.querySelector(`[data-mg-color-link="${v.id}"]`);
  check(activeCard.getAttribute('aria-current') === 'true', `${v.title} card current state`);
  check(activeCard.querySelector('[data-mg-card-state]').textContent === 'Selected', `${v.title} visible card selection`);
  check(document.querySelectorAll('[data-mg-color-link][aria-current=true]').length === 1, 'exactly one current color card');
}
const submit = () => new window.Event('submit', { bubbles: true, cancelable: true });
const previewEvent = submit();
document.querySelector('form').dispatchEvent(previewEvent);
check(previewEvent.defaultPrevented, 'preview never posts cart');
check(!document.querySelector('[data-mg-add]').disabled, 'preview remains interactive');
document.querySelector(`[data-mg-color-link="${variants[0].id}"]`).click();
check(document.querySelector('[name=id]').value === String(variants[0].id), 'lower color grid updates selection');
const sold = setup({ soldout: true });
sold.document.querySelector(`[data-mg-select="${variants[1].id}"]`).click();
check(sold.document.querySelector('[data-mg-add]').disabled, 'sold-out main button disabled');
check(sold.document.querySelector('[data-mg-sticky-add]').disabled, 'sold-out sticky disabled');
check(sold.document.querySelector(`[data-mg-color-link="${variants[1].id}"] [data-mg-card-state]`).textContent === 'Sold out', 'sold-out color card state');
const live = setup({ preview: false });
const first = new live.window.Event('submit', { bubbles: true, cancelable: true });
live.document.querySelector('form').dispatchEvent(first);
check(!first.defaultPrevented, 'production uses native Shopify form submission');
const second = new live.window.Event('submit', { bubbles: true, cancelable: true });
live.document.querySelector('form').dispatchEvent(second);
check(second.defaultPrevented, 'duplicate submission prevented');
live.window.dispatchEvent(new live.window.Event('pageshow'));
check(!live.document.querySelector('[data-mg-add]').disabled, 'back navigation restores button');
const quantity = document.querySelector('[data-mg-quantity]');
check(quantity.name === 'quantity' && quantity.value === '1', 'quantity defaults to one and submits natively');
check(document.querySelector('[data-mg-quantity-minus]').disabled, 'quantity cannot decrement below one');
document.querySelector('[data-mg-quantity-plus]').click();
check(quantity.value === '2', 'quantity increases');
document.querySelector('[data-mg-quantity-minus]').click();
check(quantity.value === '1', 'quantity decreases');
for (const invalid of ['0', '-1', '1.5', '', '100']) {
  const input = live.document.querySelector('[data-mg-quantity]');
  input.value = invalid;
  input.dispatchEvent(new live.window.Event('input'));
  const invalidSubmit = new live.window.Event('submit', { bubbles: true, cancelable: true });
  live.document.querySelector('form').dispatchEvent(invalidSubmit);
  check(invalidSubmit.defaultPrevented, `invalid quantity ${JSON.stringify(invalid)} rejected`);
}
const liveQuantity = live.document.querySelector('[data-mg-quantity]');
liveQuantity.value = '3';
liveQuantity.dispatchEvent(new live.window.Event('input'));
check(new live.window.FormData(live.document.querySelector('form')).get('quantity') === '3', 'native cart payload preserves chosen quantity');
check(!document.body.textContent.includes('One cap in your chosen color.'), 'removed requested redundant purchase copy');
const hero = document.querySelector('.mg-hero-image');
hero.srcset = 'https://example.test/stale.jpg 540w';
document.querySelector(`[data-mg-select="${variants[0].id}"]`).click();
check(!hero.srcset.includes('stale.jpg'), 'reselecting current color repairs stale responsive sources');
check(!html.includes('midnight-grin-lifestyle'), 'no missing lifestyle asset');
check(html.includes('midnight-grin-detail.webp'), 'installed detail image enabled');
check(!source.includes('fetch('), 'no hidden AJAX cart or gift writes');
const noScript = new JSDOM(html, { url: 'https://example.test/products/cap' }).window.document;
const fallbackLinks = [...noScript.querySelectorAll('.mg-noscript-colors a')];
check(fallbackLinks.length === variants.length, 'no-JavaScript color reload links exist');
for (const v of variants) {
  check(fallbackLinks.some(link => new URL(link.href).searchParams.get('variant') === String(v.id) && link.textContent.includes(v.title)), `${v.title} no-JavaScript variant link`);
}
check(noScript.querySelectorAll('.mg-noscript-colors [aria-current=true]').length === 1, 'fallback identifies current variant');
check(document.querySelector('meta[property="og:title"]').content.includes('Midnight Grin'), 'product sharing title');
check(new URL(document.querySelector('meta[property="og:image"]').content).protocol === 'https:', 'absolute secure sharing image');
check(document.querySelector('meta[name="twitter:card"]').content === 'summary_large_image', 'large-image sharing card');
check(!document.body.textContent.includes('Shipping calculated at checkout'), 'no stale paid-shipping claim');
check(document.querySelector('.mg-shipping').textContent.includes('Free shipping'), 'confirmed shipping offer beside CTA');
check(document.querySelector('[data-mg-sticky-label]').textContent.includes('Ships free'), 'sticky shipping reassurance');
check(document.querySelectorAll('.mg-grin-mark').length === 2, 'decorative grin motif in product detail and closing section');
check(document.querySelector('.mg-store-header .mg-store-logo img'), 'Zenkai image logo in header');
check(document.querySelector('.mg-store-footer .mg-store-logo img'), 'Zenkai image logo in footer');
check(document.querySelector('.mg-store-menu summary').getAttribute('aria-label') === 'Menu', 'responsive menu has accessible name');
check([...document.querySelectorAll('.mg-grin-mark')].every(mark => mark.getAttribute('aria-hidden') === 'true'), 'decorative marks hidden from assistive technology');
const modifiedLink = document.querySelector(`[data-mg-color-link="${variants[1].id}"]`);
modifiedLink.href = '#native-navigation';
const modifiedClick = new window.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, button: 0 });
modifiedLink.dispatchEvent(modifiedClick);
check(!modifiedClick.defaultPrevented, 'modified clicks retain native link behavior');
const deepLinked = setup({ variant: String(variants[1].id) });
check(deepLinked.document.querySelector('[name=id]').value === String(variants[1].id), 'variant deep link survives initialization');
check(deepLinked.document.querySelector('[data-mg-color]').textContent === variants[1].title, 'deep link hero selection matches');
const invalidLinked = setup({ variant: 'not-a-variant' });
check(invalidLinked.document.querySelector('[name=id]').value === String(variants[0].id), 'unknown variant uses server-selected fallback');
console.log(`PASS: ${checks} assertions; variants, preview safety, availability, native submit, duplicate guard.`);
