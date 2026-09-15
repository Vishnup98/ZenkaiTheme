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
  const check = i => { const box=w.document.querySelectorAll('.ls-upsell__choose input')[i]; box.checked=true; box.dispatchEvent(new w.Event('change')); };
  return {w,calls,navigations,find,select,check,dom};
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
  t.check(0); t.find('[data-ls-upsell-checkout]').click(); await tick();
  assert.equal(t.calls.length,1,'missing size cannot add');
  t.select('Trifecta Tee Color','Solid Black'); t.select('Trifecta Tee Size','M');
  t.select('The Birds Tee Size','L'); t.check(1);
  t.find('[data-ls-upsell-checkout]').click(); t.find('[data-ls-upsell-checkout]').click(); await tick();
  assert.equal(t.calls.length,2,'one batch for both tees');
  assert.equal(t.calls[1].body.items.length,2);
  assert.equal(t.calls[1].body.items[0].id,42280123072617);
  assert.deepEqual(t.navigations,['/checkout']); t.dom.window.close();

  t=setup(); t.find('[data-ls-main-cta]').click(); await tick();
  t.find('[data-ls-upsell-close]').click(); t.find('[data-ls-main-cta]').click(); await tick();
  assert.equal(t.calls.length,1,'close/reopen does not duplicate plush');
  t.find('[data-ls-upsell-skip]').click(); await tick();
  assert.deepEqual(t.navigations,['/checkout']); assert.equal(t.calls.length,1); t.dom.window.close();

  t=setup(()=>({ok:false,json:async()=>({description:'Sold out'})}));
  t.find('[data-ls-main-cta]').click(); await tick();
  assert.equal(t.find('[data-ls-upsell]').open,false);
  assert.match(t.find('[data-ls-cart-error]').textContent,/Sold out/); t.dom.window.close();

  t=setup(()=>{throw new Error('Network interrupted');});
  t.find('[data-ls-main-cta]').click(); await tick(); t.find('[data-ls-main-cta]').click(); await tick();
  assert.equal(t.calls.length,1,'uncertain main add cannot be replayed'); t.dom.window.close();

  t=setup(n=>({ok:n===1,json:async()=>n===1?{items:[]}:{description:'Size sold out'}}));
  t.find('[data-ls-main-cta]').click(); await tick(); t.select('Trifecta Tee Size','M'); t.check(0);
  t.find('[data-ls-upsell-checkout]').click(); await tick();
  t.find('[data-ls-upsell-checkout]').click(); await tick();
  assert.equal(t.calls.length,2,'failed batch never replayed'); assert.deepEqual(t.navigations,['/cart']); t.dom.window.close();

  t=setup(null,true); t.find('[data-ls-main-cta]').click(); await tick();
  t.find('[data-ls-upsell-skip]').click(); await tick();
  assert.equal(t.calls.length,0); assert.equal(t.navigations.length,0); t.dom.window.close();
  console.log('PASS: bypass, double clicks, exact variants, front/back prints, size validation, both tees, skip, close/reopen, sold-out and uncertain errors, safe preview.');
})().catch(error=>{ console.error(error); process.exitCode=1; });
