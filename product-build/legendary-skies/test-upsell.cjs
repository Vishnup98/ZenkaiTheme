// Run with JSDOM_PATH pointing to a local jsdom installation.
const {JSDOM} = require(process.env.JSDOM_PATH || 'jsdom');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const html = fs.readFileSync('product-build/legendary-skies/page-preview.html','utf8');
const source = fs.readFileSync('assets/legendary-skies-upsell.js','utf8');
const guard = fs.readFileSync('snippets/legendary-skies-cart-guard.liquid','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(responder, preview = false) {
  const dom = new JSDOM(html, {url:'https://example.com/',runScripts:'outside-only'});
  const w = dom.window, calls = [], navigations = [];
  w.document.querySelector('[data-ls-page]').dataset.preview = String(preview);
  w.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  w.HTMLDialogElement.prototype.close = function() { this.open = false; this.dispatchEvent(new w.Event('close')); };
  w.fetch = async (url, options) => { calls.push({url,body:JSON.parse(options.body)}); return responder ? responder(calls.length) : {ok:true,json:async()=>({items:[]})}; };
  w.eval(guard);
  // A simulated later app wrapper must not receive custom requests.
  w.fetch = () => { throw new Error('Vendor wrapper must be bypassed'); };
  w.__navigate = url => navigations.push(url);
  w.eval(source.replaceAll('window.location.assign(', 'window.__navigate('));
  const find = selector => w.document.querySelector(selector);
  const select = (label,value) => { const el=find('select[aria-label="'+label+'"]'); el.value=value; el.dispatchEvent(new w.Event('change')); };
  const add = i => w.document.querySelectorAll('[data-ls-tee-add]')[i].click();
  return {w,calls,navigations,find,select,add,dom};
}
(async () => {
  let t = setup();
  let vendorClicks=0;
  t.w.addEventListener('click',()=>vendorClicks++,true);
  t.find('[data-ls-main-cta]').click(); t.find('[data-ls-main-cta]').click(); await tick();
  assert.equal(t.calls.length,1,'double click adds plush once');
  assert.equal(vendorClicks,0,'early capture excludes vendor click handlers');
  assert.equal(t.find('[data-ls-upsell]').open,true);
  assert.equal(t.calls[0].body.items[0].id,48063213797481);
  assert.equal(t.find('img[alt="The Birds Tee front print detail"]').src.includes('birdsFront_macro'),true);
  assert.equal(t.find('img[alt="The Birds Tee back print detail"]').src.includes('birdsBack_macro'),true);
  assert.equal(t.find('input[type="checkbox"]'),null,'no checkbox selection');
  t.add(0); await tick();
  assert.equal(t.calls.length,1,'missing size cannot add');
  t.select('Trifecta Tee Color','Solid Black'); t.select('Trifecta Tee Size','M');
  t.add(0); t.add(0); await tick();
  assert.equal(t.calls.length,2,'individual add sends one immediate request');
  assert.equal(t.calls[1].body.items.length,1);
  assert.equal(t.calls[1].body.items[0].id,42280123072617);
  assert.equal(t.navigations.length,0,'add stays in offer');
  assert.equal(t.find('[data-ls-tee-add]').textContent,'✓ Added to cart');
  t.add(0); await tick(); assert.equal(t.calls.length,2,'added card cannot duplicate');
  t.select('The Birds Tee Size','L'); t.add(1); await tick();
  assert.equal(t.calls.length,3,'second tee added independently');
  assert.equal(t.navigations.length,0);
  t.find('[data-ls-upsell-checkout]').click(); await tick();
  assert.equal(t.calls.length,3,'continue never adds anything');
  assert.deepEqual(t.navigations,['/checkout']); t.dom.window.close();

  t=setup(); t.find('[data-ls-main-cta]').click(); await tick();
  t.find('[data-ls-upsell-close]').click(); t.find('[data-ls-main-cta]').click(); await tick();
  assert.equal(t.calls.length,1,'close/reopen does not duplicate plush');
  t.find('[data-ls-upsell-checkout]').click(); await tick();
  assert.deepEqual(t.navigations,['/checkout']); assert.equal(t.calls.length,1); t.dom.window.close();

  t=setup(()=>({ok:false,json:async()=>({description:'Sold out'})}));
  t.find('[data-ls-main-cta]').click(); await tick();
  assert.equal(t.find('[data-ls-upsell]').open,false);
  assert.match(t.find('[data-ls-cart-error]').textContent,/Sold out/); t.dom.window.close();

  t=setup(()=>{throw new Error('Network interrupted');});
  t.find('[data-ls-main-cta]').click(); await tick(); t.find('[data-ls-main-cta]').click(); await tick();
  assert.equal(t.calls.length,1,'uncertain main add cannot be replayed'); t.dom.window.close();

  t=setup(n=>{ if(n>1) throw new Error('Network interrupted'); return {ok:true,json:async()=>({items:[]})}; });
  t.find('[data-ls-main-cta]').click(); await tick(); t.select('Trifecta Tee Size','M');
  t.add(0); await tick(); t.add(0); await tick();
  t.find('[data-ls-upsell-checkout]').click(); await tick();
  assert.equal(t.calls.length,2,'uncertain tee request never replayed'); assert.deepEqual(t.navigations,['/cart']); t.dom.window.close();

  t=setup(null,true); t.find('[data-ls-main-cta]').click(); await tick();
  t.select('Trifecta Tee Size','M'); t.add(0); await tick();
  t.find('[data-ls-upsell-checkout]').click(); await tick();
  assert.equal(t.calls.length,0); assert.equal(t.navigations.length,0); t.dom.window.close();
  console.log('PASS: independent immediate adds, no auto-redirect on add, continue-only checkout, no checkboxes, duplicate protection, variants, front/back prints, validation, errors, preview.');
})().catch(error=>{ console.error(error); process.exitCode=1; });
