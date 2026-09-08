import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(import.meta.url);
const {Liquid}=require(path.join(root,'tmp/evolution-campaign-tooling/node_modules/liquidjs'));
const engine=new Liquid({root:path.join(root,'snippets'),extname:'.liquid',strictFilters:true});
engine.registerFilter('asset_url',s=>'/assets/'+s);
engine.registerFilter('money',s=>'$'+(Number(s)/100).toFixed(2));
engine.registerFilter('money_without_trailing_zeros',s=>'$'+Number(s)/100);
engine.registerFilter('payment_button',()=>'<button type="button">Buy with Shop</button>');

const files=fs.readdirSync(path.join(root,'templates')).filter(f=>/^product\.evo-.*\.json$/.test(f));
for(const file of files){
  const template=JSON.parse(fs.readFileSync(path.join(root,'templates',file),'utf8'));
  const main=template.sections.main;
  if(!['evolution-campaign','evolution-creative'].includes(main.type))continue;
  test(file+' retains the offer, adds store proof and restores nine linked thumbnails',async()=>{
    const raw=fs.readFileSync(path.join(root,'sections',main.type+'.liquid'),'utf8');
    const source=raw.replace(/{% schema %}[\s\S]*?{% endschema %}/,'')
      .replace(/{%- form 'product',[\s\S]*?-%}/,'<form>').replace(/{%- endform -%}/,'</form>');
    const html=await engine.parseAndRender(source,{section:{id:'test-section',settings:main.settings},template:{suffix:file.slice(8,-5)},product:{selected_or_first_available_variant:{id:'47968551764073',price:16000,available:true}},form:{}});
    assert.equal((html.match(/data-ec-thumb\b/g)||[]).length,9);
    assert.equal((html.match(/aria-controls="ec-portraits-test-section"/g)||[]).length,9);
    assert.equal((html.match(/aria-label="Zenkai store ratings and shipped orders"/g)||[]).length,2);
    assert.equal((html.match(/95 Shop reviews/g)||[]).length,2);
    assert.equal((html.match(/2,900\+/g)||[]).length,2);
    assert(html.includes('4.8/5'));
    assert(!html.includes('ec-offer-policy'));
    assert(html.includes('name="return_to" value="/checkout"'));
    assert(html.includes('name="id" value="47968551764073"'));
    assert(html.includes('Buy with Shop'));
    assert(html.indexOf('data-ec-main-cta')<html.indexOf('class="evo-purchase-proof"'));
    for(const name of ['group','espeon','jolteon','flareon','glaceon','sylveon','vaporeon','leafeon','umbreon'])assert(fs.existsSync(path.join(root,'assets',`evo-portrait-${name}-120.webp`)));
  });
}
test('all fifteen variations and shared styles remain wired',()=>{
  assert.equal(files.length,15);
  for(const name of ['evolution-creative','evolution-campaign'])assert(fs.readFileSync(path.join(root,'layout',name+'.liquid'),'utf8').includes('evolution-purchase-details.css'));
  const base=fs.readFileSync(path.join(root,'sections/evolution-companions.liquid'),'utf8');
  assert(base.includes("render 'evolution-purchase-proof'"));
  assert(base.includes('evo-plush-gallery__thumbs'));
  assert(!base.includes('class="evo-plush-policy"'));
});
